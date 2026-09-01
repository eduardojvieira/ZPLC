import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { isToolExecutionEnvelope } from '../src/cli/toolApi';
import { createToolExecutionAudit } from './toolExecutionAudit';

const roots: string[] = [];
const auditPath = (root: string) => path.join(root, 'tool-execution-audit.v1.json');
const makeRoot = async (): Promise<string> => { const root = await mkdtemp(path.join(tmpdir(), 'zplc-audit-')); roots.push(root); return root; };
const envelope = (jobId: string) => ({
  schemaVersion: 1 as const, jobId, actor: 'human-studio' as const, permission: 'compiler:check', operation: 'compile',
  outcome: 'passed' as const, startedAt: '2026-08-31T00:00:00.000Z', finishedAt: '2026-08-31T00:00:01.000Z',
});
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('tool execution audit', () => {
  it('persists metadata only across a restart and returns defensive copies', async () => {
    const root = await makeRoot();
    const first = createToolExecutionAudit(); await first.open(root, isToolExecutionEnvelope); await first.add(envelope(id(1)));
    const second = createToolExecutionAudit(); await second.open(root, isToolExecutionEnvelope);
    expect(second.list().executions).toEqual([envelope(id(1))]);
    const result = second.list(); result.executions[0]!.operation = 'test';
    expect(second.list().executions[0]!.operation).toBe('compile');
    const serialized = await readFile(auditPath(root), 'utf8');
    expect(serialized).not.toMatch(/path|root|secret|prompt|source|log|value|endpoint|api.?key|trace|artifact/i);
    expect((await lstat(auditPath(root))).isFile()).toBe(true);
    if (process.platform !== 'win32') {
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(auditPath(root))).mode & 0o777).toBe(0o600);
    }
  });

  it('keeps exactly the latest 100 entries while concurrent adds are serialized', async () => {
    const root = await makeRoot(); const audit = createToolExecutionAudit(); await audit.open(root, isToolExecutionEnvelope);
    await Promise.all(Array.from({ length: 101 }, (_, index) => audit.add(envelope(id(index)))));
    const result = audit.list();
    expect(result.executions).toHaveLength(100); expect(result.executions[0]!.jobId).toBe(id(1)); expect(result.executions.at(-1)!.jobId).toBe(id(100));
  });

  it('fails closed for symlinks, non-files, corrupt, oversized, and non-canonical evidence', async () => {
    const cases: Array<(root: string) => Promise<void>> = [
      async (root) => { await writeFile(path.join(root, 'target'), 'x'); await symlink(path.join(root, 'target'), auditPath(root)); },
      async (root) => { await mkdir(auditPath(root)); },
      async (root) => { await writeFile(auditPath(root), '{bad'); },
      async (root) => { await writeFile(auditPath(root), 'x'.repeat(64 * 1024 + 1)); },
      async (root) => { await writeFile(auditPath(root), JSON.stringify({ schemaVersion: 1, executions: [], extra: true })); },
      async (root) => { await writeFile(auditPath(root), JSON.stringify({ schemaVersion: 1, executions: [{ ...envelope(id(1)), prompt: 'secret' }] })); },
    ];
    for (const prepare of cases) {
      const root = await makeRoot(); await prepare(root);
      const audit = createToolExecutionAudit(); await audit.open(root, isToolExecutionEnvelope);
      expect(audit.list().executions).toEqual([]);
      await expect(audit.add(envelope(id(2)))).rejects.toThrow('Tool execution audit unavailable');
    }
  });

  it('fails closed when the audit root itself is a symlink', async () => {
    const root = await makeRoot(); const target = await makeRoot();
    if (process.platform !== 'win32') await chmod(target, 0o750);
    await rm(root, { recursive: true, force: true });
    try { await symlink(target, root); } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    const audit = createToolExecutionAudit(); await audit.open(root, isToolExecutionEnvelope);
    expect(audit.list().executions).toEqual([]);
    await expect(audit.add(envelope(id(1)))).rejects.toThrow('Tool execution audit unavailable');
    if (process.platform !== 'win32') expect((await stat(target)).mode & 0o777).toBe(0o750);
  });

  it('rejects forbidden fields without writing and reports only a generic persistence error', async () => {
    const root = await makeRoot(); const audit = createToolExecutionAudit(); await audit.open(root, isToolExecutionEnvelope);
    await expect(audit.add({ ...envelope(id(1)), source: 'PROGRAM secret' })).rejects.toThrow('Tool execution audit unavailable');
    expect(audit.list().executions).toEqual([]); await expect(lstat(auditPath(root))).rejects.toThrow();
  });

  it('rejects non-enumerable canonical fields before a spread can turn them into an empty persisted object', async () => {
    const root = await makeRoot(); const audit = createToolExecutionAudit(); await audit.open(root, isToolExecutionEnvelope);
    const hidden = envelope(id(1)); Object.defineProperty(hidden, 'operation', { value: 'compile', enumerable: false });
    expect(isToolExecutionEnvelope(hidden)).toBe(false);
    await expect(audit.add(hidden)).rejects.toThrow('Tool execution audit unavailable');
    expect(audit.list().executions).toEqual([]); await expect(lstat(auditPath(root))).rejects.toThrow();
  });

  it('does not publish an in-memory entry when durable storage fails', async () => {
    if (process.platform === 'win32') return;
    const root = await makeRoot(); const audit = createToolExecutionAudit(); await audit.open(root, isToolExecutionEnvelope);
    await chmod(root, 0o500);
    await expect(audit.add(envelope(id(1)))).rejects.toThrow('Tool execution audit unavailable');
    expect(audit.list().executions).toEqual([]);
    await chmod(root, 0o700);
    await expect(audit.add(envelope(id(2)))).rejects.toThrow('Tool execution audit unavailable');
    expect(audit.list().executions).toEqual([]);
    await expect(lstat(auditPath(root))).rejects.toThrow();
  });

  it('is initialized once and cannot switch roots after evidence has been opened', async () => {
    const firstRoot = await makeRoot(); const secondRoot = await makeRoot();
    const audit = createToolExecutionAudit(); await audit.open(firstRoot, isToolExecutionEnvelope); await audit.add(envelope(id(1)));
    await expect(audit.open(secondRoot, isToolExecutionEnvelope)).rejects.toThrow('Tool execution audit unavailable');
    expect(audit.list().executions).toEqual([envelope(id(1))]);
  });
});
