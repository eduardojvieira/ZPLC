import { describe, expect, it } from 'bun:test';
import { presentWorkspaceSafetyCheck } from './workspaceSafetyPresentation';

const pair = { outputs: ['Motor.Forward', 'Motor.Reverse'] };
const evidence = { schemaVersion: 1, operation: 'safety-check', outcome: 'passed', diagnostics: [], artifacts: [] };

describe('presentWorkspaceSafetyCheck', () => {
  it('presents declared coverage without safety or hardware claims', () => {
    expect(presentWorkspaceSafetyCheck({ ok: true, summary: { configured: true, declared: [pair], covered: [pair], uncovered: [] }, evidence }))
      .toEqual({ kind: 'covered', declared: [pair], diagnostics: [] });
    expect(presentWorkspaceSafetyCheck({ ok: true, summary: { configured: false, declared: [], covered: [], uncovered: [] }, evidence }))
      .toEqual({ kind: 'not-configured', declared: [], diagnostics: [] });
    expect(presentWorkspaceSafetyCheck({ ok: false, summary: { configured: true, declared: [pair], covered: [], uncovered: [pair] }, evidence: { ...evidence, outcome: 'failed', diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED' }] } }))
      .toMatchObject({ kind: 'uncovered', uncovered: [pair] });
  });

  it('fails closed for malformed, hostile, or unknown diagnostic payloads', () => {
    const base = { ok: true, summary: { configured: true, declared: [pair], covered: [pair], uncovered: [] }, evidence };
    const getter = Object.defineProperty({}, 'ok', { enumerable: true, get: () => { throw new Error('secret'); } });
    const proxy = Proxy.revocable(base, {}); proxy.revoke();
    for (const value of [getter, proxy.proxy, { ...base, evidence: { ...evidence, diagnostics: [{ code: 'UNKNOWN_SECRET' }] } }, { ...base, summary: { ...base.summary, covered: [], uncovered: [] } }]) {
      expect(() => presentWorkspaceSafetyCheck(value)).not.toThrow();
      expect(presentWorkspaceSafetyCheck(value).kind).toBe('invalid');
    }
  });

  it('fails closed for nested hostile arrays and contradictory logical summaries', () => {
    const base = { ok: true, summary: { configured: true, declared: [pair], covered: [pair], uncovered: [] }, evidence };
    const sparse = new Array(1); const artifactGetter = Object.defineProperty([], '0', { enumerable: true, get: () => { throw new Error('secret'); } }); artifactGetter.length = 1;
    const revoked = Proxy.revocable([], {}); revoked.revoke();
    for (const value of [
      { ...base, evidence: { ...evidence, artifacts: sparse } },
      { ...base, evidence: { ...evidence, artifacts: artifactGetter } },
      { ...base, evidence: { ...evidence, artifacts: revoked.proxy } },
      { ...base, summary: { configured: true, declared: [], covered: [], uncovered: [] } },
      { ok: false, summary: { configured: true, declared: [pair], covered: [], uncovered: [pair] }, evidence: { ...evidence, outcome: 'failed', diagnostics: [{ code: 'SAFETY_SCENARIO_INVALID' }] } },
      { ok: false, summary: { configured: true, declared: [pair], covered: [], uncovered: [pair] }, evidence: { ...evidence, outcome: 'failed', diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED', path: 'tests/motor.scenario.json' }] } },
    ]) expect(presentWorkspaceSafetyCheck(value).kind).toBe('invalid');
  });

  it('keeps bounded authored-loop locations visible while ignoring optional execution metadata', () => {
    const loops = [{ code: 'SAFETY_UNBOUNDED_WHILE', path: 'src/Main.st', line: 12, column: 3 }];
    expect(presentWorkspaceSafetyCheck({ ok: false, evidence: { ...evidence, outcome: 'failed', diagnostics: loops }, execution: { opaque: true } }))
      .toEqual({ kind: 'invalid', diagnostics: loops });
    for (const location of [
      { code: 'SAFETY_UNBOUNDED_REPEAT', path: '/outside.st', line: 1 },
      { code: 'SAFETY_UNBOUNDED_REPEAT', path: 'src/Main.st', line: 0 },
      { code: 'SAFETY_UNBOUNDED_REPEAT', path: 'src/Main.st', line: 1, extra: true },
    ]) expect(presentWorkspaceSafetyCheck({ ok: false, evidence: { ...evidence, outcome: 'failed', diagnostics: [location] } }).kind).toBe('invalid');
  });
});
