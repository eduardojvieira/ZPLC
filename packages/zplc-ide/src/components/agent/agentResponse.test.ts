import { describe, expect, it } from 'bun:test';
import { presentAgentResponse } from './agentResponse';

const sha = 'a'.repeat(64);
const expected = { workspaceId: 'workspace-1', fileId: 'file:src/Main.st', path: 'src/Main.st', baselineSha256: sha };
const identity = { workspaceId: 'workspace-1', fileId: 'file:src/Main.st', path: 'src/Main.st', baselineSha256: sha };
const modify = (path: string, content = 'PROGRAM A\nEND_PROGRAM\n') => ({ path, kind: 'modify' as const, content, baselineSha256: sha });
const create = (path: string, content = 'PROGRAM A\nEND_PROGRAM\n') => ({ path, kind: 'create' as const, content });

describe("what the host answers is shown as the assistant's answer and a change set, or not at all (IDE-030)", () => {
  it('takes a plain answer with or without the identity of the program that was sent', () => {
    expect(presentAgentResponse({ ok: true, answer: 'Words' })).toEqual({ kind: 'answer', answer: 'Words' });
    expect(presentAgentResponse({ ok: true, answer: 'Words' }, expected)).toEqual({ kind: 'answer', answer: 'Words' });
    expect(presentAgentResponse({ ok: true, answer: 'Words', ...identity }, expected)).toEqual({ kind: 'answer', answer: 'Words' });
    expect(presentAgentResponse({ ok: false, code: 'AI_TIMEOUT' })).toEqual({ kind: 'error', code: 'AI_TIMEOUT' });
  });

  it('takes a change set of up to four files bound to the program that was sent, and keeps what each replaces', () => {
    const changes = [modify('src/Main.st', 'PROGRAM Main\nEND_PROGRAM\n// y\n'), create('src/Lamp.st'), create('src/Lamp2.il', 'LD 1\n')];
    const presented = presentAgentResponse({ ok: true, answer: 'Done', ...identity, changes }, expected);
    expect(presented).toEqual({ kind: 'answer', answer: 'Done', changes });
  });

  it('normalizes a ladder, FBD or SFC file and shows the violations of one that does not load, as a refusal', () => {
    const refused = presentAgentResponse(
      { ok: true, answer: 'Here is a ladder', ...identity, changes: [create('src/Seal.ld.json', '{ nope')] },
      expected,
    );
    expect(refused).toMatchObject({ kind: 'refused', answer: 'Here is a ladder', path: 'src/Seal.ld.json', reason: 'invalid-file' });
    if (refused.kind === 'refused') expect(refused.violations.length).toBeGreaterThan(0);
    const password = JSON.stringify({
      name: 'P',
      version: '1.0.0',
      tasks: [{ name: 'M', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
      network: { wifi: { password: 'hunter2' } },
    });
    const sensitive = presentAgentResponse({ ok: true, answer: 'x', ...identity, changes: [modify('zplc.json', password)] }, expected);
    expect(sensitive).toMatchObject({ kind: 'refused', reason: 'sensitive-field', path: 'zplc.json' });
    expect(JSON.stringify(sensitive)).not.toContain('hunter2');
  });

  it('fails closed for a stale, malformed, extra or accessor-backed response and for a set that is not one', () => {
    const accessor = Object.defineProperty({}, 'ok', {
      enumerable: true,
      get: () => {
        throw new Error('secret');
      },
    });
    const proxy = Proxy.revocable({ ok: true, answer: 'x' }, {});
    proxy.revoke();
    const ok = { ok: true, answer: 'x', ...identity };
    for (const value of [
      accessor,
      proxy.proxy,
      { ...ok, extra: true },
      { ...ok, baselineSha256: 'b'.repeat(64) },
      { ...ok, path: 'src/Other.st' },
      { ok: true, answer: 'x', workspaceId: 'workspace-1' },
      { ok: false, code: 'UNKNOWN_SECRET' },
      { ...ok, replacement: { path: 'src/Main.st', content: 'x' } },
      { ...ok, changes: [] },
      { ...ok, changes: [modify('src/A.st'), modify('src/B.st'), modify('src/C.st'), modify('src/D.st'), modify('src/E.st')] },
      { ...ok, changes: [modify('src/A.st'), modify('src/A.st')] },
      { ...ok, changes: [modify('tests/a.scenario.json')] },
      { ...ok, changes: [modify('src/sub/A.st')] },
      { ...ok, changes: [{ ...modify('src/A.st'), baselineSha256: 'nope' }] },
      { ...ok, changes: [{ path: 'src/A.st', kind: 'modify', content: 'x' }] },
      { ...ok, changes: [{ ...create('src/A.st'), baselineSha256: sha }] },
      { ...ok, changes: [{ ...modify('src/A.st'), extra: 1 }] },
      { ...ok, changes: [{ ...modify('src/A.st'), kind: 'delete' }] },
      { ...ok, changes: [modify('src/A.st', '')] },
      { ...ok, changes: [modify('src/A.st', 'x'.repeat(256 * 1024 + 1))] },
    ])
      expect(presentAgentResponse(value, expected).kind).toBe('invalid');
    // a change set belongs to a request that sent a program, and to nothing else
    expect(presentAgentResponse({ ok: true, answer: 'x', ...identity, changes: [modify('src/A.st')] }).kind).toBe('invalid');
    expect(presentAgentResponse({ ok: true, answer: 'x', changes: [modify('src/A.st')] }, expected).kind).toBe('invalid');
  });

  it('does not ask a request that did not need a baseline to match one', () => {
    const open = { workspaceId: 'workspace-1', fileId: 'file:src/Main.st', path: 'src/Main.st' };
    expect(presentAgentResponse({ ok: true, answer: 'x', ...open, baselineSha256: 'c'.repeat(64) }, open)).toEqual({
      kind: 'answer',
      answer: 'x',
    });
    expect(presentAgentResponse({ ok: true, answer: 'x', ...open, baselineSha256: 'nope' }, open).kind).toBe('invalid');
  });
});
