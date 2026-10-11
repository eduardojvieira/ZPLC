import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { fork } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import boardManifest from '../../../../firmware/app/boards/supported-boards.v1.5.0.json';
import { createToolWorkerHost, type ToolWorkerSpawner } from '../../electron/toolWorkerHost';
import { createMcpDispatcher, openMcpWorkspace } from '../mcp/server';
import { main } from './index';
import { compilerCompile } from './toolApi';

// CMP-045: Studio, the CLI, the MCP tools and the tests compile through one entry point with one set of limits. The four
// are run on the same project, for every board of the board manifest (the one place the limits are written): a program
// that is too large for some boards and fits others, so that a limit that any surface kept for itself shows as a result
// that differs from the other three.
const toolWorker = join(import.meta.dir, '../../electron/toolWorker.ts');
const boards = (boardManifest as Array<{ ide_id: string; memory: { code_size_max: number } }>).map((board) => ({ id: board.ide_id, codeSizeMax: board.memory.code_size_max }));

/** A program whose code is larger than the code memory of the small boards and smaller than that of the large ones. */
function bigProgram(statements: number): string {
  const body = Array.from({ length: statements }, (_, index) => `  x := x + ${index % 100};`).join('\n');
  return `PROGRAM Main\nVAR\n  x : DINT;\n  out AT %QD0 : DINT;\nEND_VAR\n${body}\n  out := x;\nEND_PROGRAM\n`;
}

async function project(root: string, board: string, source: string): Promise<string> {
  const directory = join(root, board);
  await mkdir(join(directory, 'src'), { recursive: true });
  await writeFile(join(directory, 'zplc.json'), JSON.stringify({
    schemaVersion: 2, name: 'Limits', version: '1.0.0', target: { board },
    tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
  }));
  await writeFile(join(directory, 'src', 'Main.st'), source);
  return directory;
}

/** What each surface answers, reduced to what the others must agree on. */
interface Outcome { ok: boolean; messages: string[]; artifacts: Array<{ kind: string; sha256: string; byteLength: number }> }
interface Evidenced { ok: boolean; evidence: { diagnostics: Array<{ message: string }>; artifacts: Outcome['artifacts'] } }
const outcomeOf = ({ ok, evidence }: Evidenced): Outcome => ({ ok, messages: evidence.diagnostics.map((diagnostic) => diagnostic.message), artifacts: evidence.artifacts });

const spawn: ToolWorkerSpawner = () => {
  const child = fork(toolWorker, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced', env: process.env });
  return {
    pid: child.pid,
    postMessage: (message) => { child.send(message as never); },
    onMessage: (listener) => { child.on('message', listener); },
    onExit: (listener) => { child.on('exit', (code) => listener(code)); },
    kill: () => { child.kill('SIGKILL'); },
  };
};

const surfaces: Record<string, (root: string) => Promise<Outcome>> = {
  // the conformance runner, the scenario runner and every test of this repository call this function
  tests: async (root) => outcomeOf(await compilerCompile(root)),
  // zplc-cli compile <workspace> --json
  cli: async (root) => {
    const lines: string[] = [];
    await main(['compile', root, '--json'], { log: (line: string) => lines.push(line), error: (line: string) => lines.push(line) });
    return outcomeOf(JSON.parse(lines[0] ?? '{}') as Evidenced);
  },
  // the compiler_compile tool of the MCP server
  mcp: async (root) => {
    const workspace = await openMcpWorkspace(root);
    expect(workspace).toBeDefined();
    const answer = await createMcpDispatcher(workspace!)('compiler_compile', {}, new AbortController().signal);
    return outcomeOf(answer.structuredContent as unknown as Evidenced);
  },
  // Studio's Build: the main process asks the tool worker, which runs the same function in a process of its own
  studio: async (root) => outcomeOf(await createToolWorkerHost({ spawn }).run({ operation: 'compile', root }, new AbortController().signal) as Evidenced),
};

describe('one compile entry point with one set of limits (CMP-045)', () => {
  let root: string;
  beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'zplc-compile-entry-')); });
  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  it('CMP-045 Studio, the CLI, the MCP tools and the tests give one result for every board of the manifest', async () => {
    const source = bigProgram(2200);
    const results = new Map<string, Record<string, Outcome>>();
    for (const board of boards) {
      const directory = await project(root, board.id, source);
      const answers: Record<string, Outcome> = {};
      for (const [name, surface] of Object.entries(surfaces)) answers[name] = await surface(directory);
      results.set(board.id, answers);
    }

    // the size of the code does not depend on the board, so one build that fits says what every board has to decide
    const fitting = [...results.values()].map((answers) => answers.tests!).find((outcome) => outcome.ok);
    expect(fitting).toBeDefined();
    const bytecodeSize = fitting!.artifacts[0]!.byteLength;

    for (const board of boards) {
      const answers = results.get(board.id)!;
      for (const name of Object.keys(surfaces)) {
        expect({ board: board.id, surface: name, outcome: answers[name] }).toEqual({ board: board.id, surface: name, outcome: answers.tests! });
      }
      // and the limit is the one the manifest records: the program builds exactly where its code fits
      expect({ board: board.id, ok: answers.tests!.ok }).toEqual({ board: board.id, ok: bytecodeSize <= board.codeSizeMax });
    }
    // the program is large enough to fail somewhere and small enough to build somewhere, so that the comparison says something
    const verdicts = new Set([...results.values()].map((answers) => answers.tests!.ok));
    expect([...verdicts].sort()).toEqual([false, true]);
  }, 120_000);

  it('CMP-045 the single-file build of the CLI refuses a program for the same limit as the project build', async () => {
    const directory = await project(root, 'default-target', bigProgram(6000));
    const file = join(directory, 'src', 'Main.st');
    const lines: string[] = [];
    const code = await main(['compile', file, '--json'], { log: (line: string) => lines.push(line), error: (line: string) => lines.push(line) });
    const single = outcomeOf(JSON.parse(lines[0] ?? '{}') as Evidenced);
    const built = await surfaces.tests!(directory);
    expect(code).not.toBe(0);
    expect(single.ok).toBe(false);
    expect(single.messages).toEqual(built.messages);
  }, 60_000);
});
