#!/usr/bin/env bun
/**
 * Owner-launched run of the Assistant (`createAiProvider`) over the fixed task set (AIX-009, JRN-007). Never automatic and
 * never called by CI: the owner passes the endpoint and the model, and a key only by naming the environment variable that
 * holds it (`--key-env`); a loopback endpoint needs none. The run works on a disposable copy under the temp directory.
 *
 *   bun tools/ai-eval/run-assistant-eval.ts --endpoint <url> --model <name> --out <evidence.json>
 *     [--tasks a,b|all] [--key-env NAME] [--dry-run]
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { parseArgs } from 'node:util';

import { createAiProvider, type AiRequest } from '../../packages/zplc-ide/electron/aiProvider';
import {
  buildEvidence,
  consoleIo,
  failureContext,
  gradeBuild,
  gradeExplanation,
  loadTasks,
  selectTasks,
  stageTask,
  today,
  validateTasks,
  writeEvidence,
  type EvalTask,
  type Evidence,
  type Io,
  type TaskResult,
} from './lib';

export interface AssistantLike {
  request(root: string, request: AiRequest, signal: AbortSignal): Promise<unknown>;
}
type Reply = { ok: true; answer: string; changes?: Array<{ path: string; content: string }> } | { ok: false; code: string };

const CLIENT = 'zplc-assistant (createAiProvider)';
const modeOf = (task: EvalTask): AiRequest['mode'] => (task.type === 'explain' ? 'ask' : 'edit');

export async function runAssistantEval(input: {
  tasks: readonly EvalTask[];
  provider: AssistantLike;
  model: string;
  scratch: string;
  date: string;
  timeoutMs?: number;
}): Promise<Evidence> {
  const results: TaskResult[] = [];
  for (const task of input.tasks) {
    const root = await stageTask(task, input.scratch);
    const context = task.type === 'write' ? {} : await failureContext(task, root);
    const request: AiRequest = {
      workspaceId: randomUUID(),
      mode: modeOf(task),
      prompt: task.prompt,
      activeFile: { fileId: `file:${task.program}`, path: task.program },
      ...context,
    };
    const started = performance.now();
    let reply: Reply;
    try {
      reply = (await input.provider.request(root, request, AbortSignal.timeout(input.timeoutMs ?? 120_000))) as Reply;
    } catch (error) {
      reply = { ok: false, code: error instanceof Error ? error.name : 'ERROR' };
    }
    const latencyMs = Math.round(performance.now() - started);
    const responseBytes = Buffer.byteLength(JSON.stringify(reply));
    const base = { id: task.id, language: task.language, type: task.type, latencyMs, responseBytes };
    if (!reply.ok) {
      results.push({ ...base, pass: false, detail: reply.code });
    } else if (task.type === 'explain') {
      const graded = gradeExplanation(reply.answer, task.rubric!);
      results.push({ ...base, pass: graded.pass, ...(graded.pass ? {} : { detail: `rubric missing: ${graded.missing.join(', ')}` }) });
    } else {
      const applied = await applyChanges(root, reply.changes ?? []);
      const graded = applied ? await gradeBuild(task, root) : { pass: false, check: false };
      results.push({
        ...base,
        pass: graded.pass,
        ...(graded.pass
          ? {}
          : {
              detail: applied
                ? 'compilerCheck or scenarioRun failed'
                : reply.changes?.length
                  ? 'a change path left the project'
                  : 'no proposed change',
            }),
      });
    }
  }
  return buildEvidence({ runner: 'run-assistant-eval', client: CLIENT, model: input.model, date: input.date, results });
}

/** A proposed change set applied to the disposable copy; false when there is none or a path leaves the project. */
async function applyChanges(root: string, changes: Array<{ path: string; content: string }>): Promise<boolean> {
  if (changes.length === 0) return false;
  for (const { path } of changes) if (isAbsolute(path) || normalize(path).startsWith('..')) return false;
  for (const { path, content } of changes) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return true;
}

function parse(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options: {
        endpoint: { type: 'string' },
        model: { type: 'string' },
        tasks: { type: 'string' },
        out: { type: 'string' },
        'key-env': { type: 'string' },
        'timeout-ms': { type: 'string' },
        'dry-run': { type: 'boolean' },
      },
      strict: true,
    }).values;
  } catch (error) {
    return String(error instanceof Error ? error.message : error);
  }
}

export async function main(argv: string[], io: Io = consoleIo): Promise<number> {
  const parsed = parse(argv);
  if (typeof parsed === 'string') {
    io.stderr(parsed);
    return 2;
  }
  const values = parsed;
  const dry = values['dry-run'] === true;
  if (!values.endpoint || !values.model || (!dry && !values.out)) {
    io.stderr(
      'usage: run-assistant-eval.ts --endpoint <url> --model <name> --out <evidence.json> [--tasks a,b|all] [--key-env NAME] [--dry-run]',
    );
    return 2;
  }
  const all = loadTasks();
  const selected = selectTasks(all, values.tasks);
  if ('unknown' in selected) {
    io.stderr(`unknown task ids: ${selected.unknown.join(', ')}`);
    return 2;
  }
  const problems = validateTasks(all);
  if (dry) {
    io.stdout(
      JSON.stringify(
        {
          dryRun: true,
          runner: 'run-assistant-eval',
          client: CLIENT,
          endpoint: values.endpoint,
          model: values.model,
          out: values.out ?? null,
          keyFrom: values['key-env'] ? `environment variable ${values['key-env']}` : 'none',
          problems,
          tasks: selected.tasks.map((task) => ({
            id: task.id,
            language: task.language,
            type: task.type,
            mode: modeOf(task),
            grading: task.grading,
          })),
        },
        null,
        2,
      ),
    );
    return problems.length ? 1 : 0;
  }
  if (problems.length) {
    io.stderr(problems.join('\n'));
    return 1;
  }
  const scratch = await mkdtemp(join(tmpdir(), 'zplc-ai-eval-assistant-'));
  try {
    const userDataPath = join(scratch, 'user-data');
    // an ephemeral store inside the disposable folder: the key lives only for this run
    const vault = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString(),
    };
    const provider = createAiProvider({ userDataPath, vault });
    if (!(await provider.saveConfig({ enabled: true, endpoint: values.endpoint, model: values.model })).ok) {
      io.stderr('the endpoint or the model was refused by the Assistant configuration');
      return 2;
    }
    const keyName = values['key-env'];
    if (keyName) {
      const key = process.env[keyName];
      if (!key || !(await provider.storeKey(key)).ok) {
        io.stderr(`the environment variable ${keyName} is empty or holds an unusable key`);
        return 2;
      }
    }
    const evidence = await runAssistantEval({
      tasks: selected.tasks,
      provider,
      model: values.model,
      scratch: join(scratch, 'tasks'),
      date: today(),
      ...(values['timeout-ms'] ? { timeoutMs: Number(values['timeout-ms']) } : {}),
    });
    for (const result of evidence.results)
      io.stdout(
        `${result.pass ? 'PASS' : 'FAIL'} ${result.id} ${result.latencyMs} ms ${result.responseBytes} bytes` +
          (result.detail ? ` (${result.detail})` : ''),
      );
    await writeEvidence(values.out!, evidence);
    io.stdout(`${evidence.summary.passed}/${evidence.summary.total} passed; evidence written to ${values.out}`);
    return 0;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
