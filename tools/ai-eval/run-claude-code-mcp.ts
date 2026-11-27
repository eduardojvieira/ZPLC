#!/usr/bin/env bun
/**
 * Owner-launched run of Claude Code, the reference client, over `zplc-mcp` on the fixed task set (AIX-009, JRN-007). Never
 * automatic and never called by CI. The script reads no credential: the owner's own `claude` command signs in as it
 * always does. Each task runs on a disposable copy under the temp directory, with the MCP server limited to that copy.
 *
 *   bun tools/ai-eval/run-claude-code-mcp.ts --client <claude command> --model <name> --out <evidence.json> [--tasks a,b|all] [--dry-run]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildEvidence,
  consoleIo,
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

export interface ClaudeClient {
  run(input: { prompt: string; workspace: string; mcpConfigPath: string; model: string; timeoutMs?: number }): Promise<{ text: string }>;
}
const MCP_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '../../packages/zplc-ide/src/mcp/index.ts');

export async function runClaudeCodeEval(input: {
  tasks: readonly EvalTask[];
  client: ClaudeClient;
  clientLabel: string;
  model: string;
  scratch: string;
  date: string;
  timeoutMs?: number;
}): Promise<Evidence> {
  const results: TaskResult[] = [];
  for (const task of input.tasks) {
    const workspace = await stageTask(task, input.scratch);
    const mcpConfigPath = join(input.scratch, `${task.id}.mcp.json`);
    await writeFile(
      mcpConfigPath,
      JSON.stringify({ mcpServers: { zplc: { command: process.execPath, args: [MCP_ENTRY, '--workspace', workspace] } } }),
    );
    const started = performance.now();
    let text = '';
    let failure: string | undefined;
    try {
      text = (
        await input.client.run({
          prompt: task.prompt,
          workspace,
          mcpConfigPath,
          model: input.model,
          ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
        })
      ).text;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const latencyMs = Math.round(performance.now() - started);
    const base = { id: task.id, language: task.language, type: task.type, latencyMs, responseBytes: Buffer.byteLength(text) };
    if (failure !== undefined) results.push({ ...base, pass: false, detail: `client failed: ${failure}` });
    else if (task.type === 'explain') {
      const graded = gradeExplanation(text, task.rubric!);
      results.push({ ...base, pass: graded.pass, ...(graded.pass ? {} : { detail: `rubric missing: ${graded.missing.join(', ')}` }) });
    } else {
      const graded = await gradeBuild(task, workspace);
      results.push({ ...base, pass: graded.pass, ...(graded.pass ? {} : { detail: 'compilerCheck or scenarioRun failed' }) });
    }
  }
  return buildEvidence({ runner: 'run-claude-code-mcp', client: input.clientLabel, model: input.model, date: input.date, results });
}

/** The owner's `claude` command, run non-interactively with only this task's MCP server allowed. */
export function spawnClaude(command: string, cwd: string): ClaudeClient {
  return {
    run: ({ prompt, mcpConfigPath, model, timeoutMs }) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          command,
          ['-p', prompt, '--model', model, '--mcp-config', mcpConfigPath, '--strict-mcp-config', '--allowedTools', 'mcp__zplc'],
          {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            signal: AbortSignal.timeout(timeoutMs ?? 600_000),
          },
        );
        const out: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolve({ text: Buffer.concat(out).toString('utf8') }) : reject(new Error(`exit code ${code}`)),
        );
      }),
  };
}

function parse(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options: {
        client: { type: 'string' },
        'client-label': { type: 'string' },
        model: { type: 'string' },
        tasks: { type: 'string' },
        out: { type: 'string' },
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
  if (!values.client || !values.model || (!dry && !values.out)) {
    io.stderr('usage: run-claude-code-mcp.ts --client <claude command> --model <name> --out <evidence.json> [--tasks a,b|all] [--dry-run]');
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
          runner: 'run-claude-code-mcp',
          client: values.client,
          model: values.model,
          out: values.out ?? null,
          problems,
          tasks: selected.tasks.map((task) => ({ id: task.id, language: task.language, type: task.type, grading: task.grading })),
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
  const scratch = await mkdtemp(join(tmpdir(), 'zplc-ai-eval-claude-'));
  try {
    await mkdir(join(scratch, 'client-cwd'));
    const evidence = await runClaudeCodeEval({
      tasks: selected.tasks,
      client: spawnClaude(values.client, join(scratch, 'client-cwd')),
      clientLabel: values['client-label'] ?? values.client,
      model: values.model,
      scratch: join(scratch, 'tasks'),
      date: today(),
      ...(values['timeout-ms'] ? { timeoutMs: Number(values['timeout-ms']) } : {}),
    });
    for (const result of evidence.results)
      io.stdout(
        `${result.pass ? 'PASS' : 'FAIL'} ${result.id} ${result.latencyMs} ms ${result.responseBytes} bytes${result.detail ? ` (${result.detail})` : ''}`,
      );
    await writeEvidence(values.out!, evidence);
    io.stdout(`${evidence.summary.passed}/${evidence.summary.total} passed; evidence written to ${values.out}`);
    return 0;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
