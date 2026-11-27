/**
 * AIX-009 / JRN-007: the owner-launched run scripts. CI never calls a model: a fake provider and a fake client stand in,
 * and the dry run only validates the task set and prints the plan.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadTasks, type EvalTask } from './lib';
import { main as assistantMain, runAssistantEval } from './run-assistant-eval';
import { main as claudeMain, runClaudeCodeEval } from './run-claude-code-mcp';
import { nativeRuntimeBinary } from '../../packages/zplc-ide/src/cli/nativeRuntimeGuard';

process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
const scratch = mkdtempSync(join(tmpdir(), 'zplc-ai-eval-run-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const tasks = loadTasks();
const byId = (id: string): EvalTask => tasks.find((task) => task.id === id)!;
const FIELDS = ['schemaVersion', 'evidenceLevel', 'runner', 'client', 'model', 'date', 'summary', 'results'];

function sink() {
  const lines: string[] = [];
  return { lines, io: { stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) } };
}

describe('--dry-run', () => {
  it('prints the plan of the assistant run without a provider and writes nothing', async () => {
    const out = join(scratch, 'dry-assistant.json');
    const { lines, io } = sink();
    const code = await assistantMain(['--dry-run', '--endpoint', 'http://127.0.0.1:9', '--model', 'm', '--tasks', 'st-write,sfc-explain', '--out', out], io);
    expect(code).toBe(0);
    const plan = JSON.parse(lines.join('\n'));
    expect(plan.dryRun).toBe(true);
    expect(plan.tasks.map((task: { id: string }) => task.id)).toEqual(['st-write', 'sfc-explain']);
    expect(await Bun.file(out).exists()).toBe(false);
  });

  it('prints the plan of the Claude Code run without starting a client', async () => {
    const { lines, io } = sink();
    const code = await claudeMain(['--dry-run', '--client', '/nonexistent/claude', '--model', 'm', '--out', join(scratch, 'dry-claude.json')], io);
    expect(code).toBe(0);
    const plan = JSON.parse(lines.join('\n'));
    expect(plan.tasks.length).toBe(15);
    expect(plan.client).toBe('/nonexistent/claude');
  });

  it('refuses an unknown task filter and a missing model', async () => {
    expect(await assistantMain(['--dry-run', '--endpoint', 'http://127.0.0.1:9', '--model', 'm', '--tasks', 'nope'], sink().io)).toBe(2);
    expect(await claudeMain(['--dry-run', '--client', 'claude'], sink().io)).toBe(2);
  });
});

describe('the assistant run with a fake provider', () => {
  it('grades by outcome and records the evidence fields', async () => {
    const write = byId('st-write');
    const reference = readFileSync(join(write.dir, 'reference', write.program!), 'utf8');
    const explain = byId('il-explain');
    const provider = {
      async request(_root: string, request: { mode: string; prompt: string }) {
        if (request.prompt === write.prompt)
          return { ok: true, answer: 'done', changes: [{ path: write.program, kind: 'modify', content: reference }] };
        if (request.prompt === explain.prompt) return { ok: true, answer: explain.referenceExplanation };
        return { ok: false, code: 'AI_TIMEOUT' };
      },
    };
    const evidence = await runAssistantEval({
      tasks: [write, explain, byId('ld-explain')],
      provider,
      model: 'fake-model',
      scratch,
      date: '2026-11-27',
    });
    expect(Object.keys(evidence).sort()).toEqual([...FIELDS].sort());
    expect(evidence).toMatchObject({ evidenceLevel: 'manual-model-run', model: 'fake-model', date: '2026-11-27', runner: 'run-assistant-eval' });
    expect(evidence.results.map((result) => [result.id, result.pass])).toEqual([
      ['st-write', true],
      ['il-explain', true],
      ['ld-explain', false],
    ]);
    for (const result of evidence.results) {
      expect(typeof result.latencyMs).toBe('number');
      expect(typeof result.responseBytes).toBe('number');
    }
    expect(evidence.results[0]!.responseBytes).toBeGreaterThan(0);
    expect(evidence.summary).toEqual({ passed: 2, total: 3 });
  }, 60_000);
});

describe('the Claude Code run with a fake client', () => {
  it('lets the client write into the disposable copy, grades it, and never touches the task set', async () => {
    const write = byId('st-write');
    const seen: string[] = [];
    const client = {
      async run({ prompt, workspace, mcpConfigPath }: { prompt: string; workspace: string; mcpConfigPath: string; model: string }) {
        seen.push(workspace, mcpConfigPath);
        if (prompt === write.prompt) await cp(join(write.dir, 'reference', 'src'), join(workspace, 'src'), { recursive: true });
        return { text: 'finished' };
      },
    };
    const before = readFileSync(join(write.dir, 'project', write.program!), 'utf8');
    const evidence = await runClaudeCodeEval({ tasks: [write, byId('st-repair')], client, clientLabel: 'fake-claude', model: 'fake-model', scratch, date: '2026-11-27' });
    expect(Object.keys(evidence).sort()).toEqual([...FIELDS].sort());
    expect(evidence).toMatchObject({ evidenceLevel: 'manual-model-run', client: 'fake-claude', runner: 'run-claude-code-mcp' });
    expect(evidence.results.map((result) => [result.id, result.pass])).toEqual([
      ['st-write', true],
      ['st-repair', false],
    ]);
    expect(evidence.results[0]!.responseBytes).toBe(Buffer.byteLength('finished'));
    expect(seen.every((path) => path.startsWith(scratch))).toBe(true);
    expect(readFileSync(join(write.dir, 'project', write.program!), 'utf8')).toBe(before);
  }, 60_000);
});
