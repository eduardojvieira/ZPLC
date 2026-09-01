import { describe, expect, it } from 'bun:test';

import { classifyWorkspaceTestBuildLink, isWorkspaceManifestRegistrationCurrent, isWorkspaceTestRunCurrent, presentCandidateChangeSetReview, presentRecordedConveyorPlant, presentRecordedMotorPlant, presentRecordedPedestrianCrossing, presentRecordedTankLevel, presentWorkspaceCompileResult, presentRecordedMotorOutput, presentWorkspaceTestResult, resolveWorkspaceCompileRoute, workspaceTestAvailability, workspaceTestRunFallbackState } from './workspaceTestPresentation';

const sha = 'a'.repeat(64);
const validEvidence = {
  schemaVersion: 1,
  operation: 'test',
  outcome: 'passed',
  diagnostics: [],
  artifacts: [
    { kind: 'zplc', sha256: sha, byteLength: 12 },
    { kind: 'trace', sha256: 'b'.repeat(64), byteLength: 34 },
  ],
};

describe('workspace manifest registration admission', () => {
  it('rejects late registration publication after its project session is replaced', () => {
    expect(isWorkspaceManifestRegistrationCurrent(12, 12)).toBe(true);
    expect(isWorkspaceManifestRegistrationCurrent(13, 12)).toBe(false);
  });
});

describe('presentCandidateChangeSetReview', () => {
  const before = 'c'.repeat(64);
  const after = 'd'.repeat(64);
  const input = { path: 'src/Motor.st', beforeSha256: before, afterSha256: after };
  const accepted = () => ({
    schemaVersion: 1,
    accepted: true,
    evidenceScope: 'native-posix-host',
    changeSet: { sha256: 'e'.repeat(64), changes: [{ path: input.path, kind: 'modify', before: { sha256: before, byteLength: 10 }, after: { sha256: after, byteLength: 11 } }] },
    evidence: { schemaVersion: 1, operation: 'test', outcome: 'passed', diagnostics: [], artifacts: [{ kind: 'zplc', sha256: sha, byteLength: 12 }, { kind: 'trace', sha256: 'b'.repeat(64), byteLength: 34 }] },
    savedTestInputIdentity: { schemaVersion: 1, sha256: 'f'.repeat(64), fileCount: 3 },
  });

  it('accepts only one bound saved ST modification with passed host evidence', () => {
    expect(presentCandidateChangeSetReview(accepted(), input)).toMatchObject({ kind: 'accepted', artifacts: [{ kind: 'zplc' }, { kind: 'trace' }], savedTestInputIdentity: { fileCount: 3 } });
  });

  it('fails closed for a hash/path mismatch, missing artifact, identity, or contradictory outcome', () => {
    for (const value of [
      { ...accepted(), changeSet: { ...accepted().changeSet, changes: [{ ...accepted().changeSet.changes[0], before: { sha256: sha, byteLength: 10 } }] } },
      { ...accepted(), changeSet: { ...accepted().changeSet, changes: [{ ...accepted().changeSet.changes[0], path: 'src/Other.st' }] } },
      { ...accepted(), evidence: { ...accepted().evidence, artifacts: [accepted().evidence.artifacts[0]] } },
      { ...accepted(), savedTestInputIdentity: undefined },
      { ...accepted(), evidence: { ...accepted().evidence, outcome: 'failed' } },
    ]) expect(presentCandidateChangeSetReview(value, input).kind).toBe('invalid');
  });

  it('keeps rejected top-level and evidence diagnostics to safe codes only', () => {
    const presentation = presentCandidateChangeSetReview({ ...accepted(), accepted: false, evidence: { ...accepted().evidence, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED' }] }, diagnostics: [{ code: 'CHANGESET_BASE_INVALID' }] }, input);
    expect(presentation).toMatchObject({ kind: 'rejected', diagnostics: [{ code: 'CHANGESET_BASE_INVALID' }, { code: 'SCENARIO_ASSERTION_FAILED' }] });
    expect(JSON.stringify(presentation)).not.toContain('/private/secret');
  });

  it('rejects an evidence envelope whose raw artifacts are not exactly zplc plus trace', () => {
    const result = accepted();
    result.evidence.artifacts.push({ kind: 'other', sha256: sha, byteLength: 1 });
    expect(presentCandidateChangeSetReview(result, input).kind).toBe('invalid');
  });

  it('fails closed on sparse, getter, and proxy payloads', () => {
    const sparse = [accepted()]; sparse.length = 2;
    const getter = Object.defineProperty({}, 'schemaVersion', { enumerable: true, get: () => { throw new Error('secret'); } });
    const proxy = Proxy.revocable({}, {}); proxy.revoke();
    for (const value of [sparse, getter, proxy.proxy]) expect(() => presentCandidateChangeSetReview(value, input)).not.toThrow();
    for (const value of [sparse, getter, proxy.proxy]) expect(presentCandidateChangeSetReview(value, input).kind).toBe('invalid');
  });
});

describe('presentWorkspaceTestResult', () => {
  it('presents a validated native POSIX pass without making hardware claims', () => {
    const presentation = presentWorkspaceTestResult({
      ok: true,
      summary: {
        backend: 'native-posix',
        mode: 'logical-cyclic-task-set-scan',
        scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }],
      },
      evidence: validEvidence,
    });

    expect(presentation).toMatchObject({ kind: 'passed', message: 'Host POSIX scenarios passed.', scenarioCount: 1, hasEvidence: true });
    expect(presentation.artifacts).toEqual(validEvidence.artifacts);
    expect(presentation.message).not.toMatch(/hardware|HIL/i);
  });

  it('accepts the same verified evidence shape for a single scenario rerun', () => {
    const presentation = presentWorkspaceTestResult({
      ok: true,
      summary: {
        backend: 'native-posix', mode: 'logical-cyclic-task-set-scan',
        scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }],
      },
      evidence: { ...validEvidence, operation: 'scenario-run' },
    });

    expect(presentation).toMatchObject({ kind: 'passed', message: 'Host POSIX scenario passed.', scenarioCount: 1, hasEvidence: true });
    expect(presentation.operation).toBe('scenario-run');
  });

  it('accepts only a bounded aggregate identity attached to recorded trace evidence', () => {
    const identity = { schemaVersion: 1, sha256: 'c'.repeat(64), fileCount: 3 };
    const presentation = presentWorkspaceTestResult({
      ok: true,
      summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] },
      savedTestInputIdentity: identity,
      evidence: validEvidence,
    });
    expect(presentation.savedTestInputIdentity).toEqual(identity);

    for (const malformed of [
      { ...identity, schemaVersion: 2 },
      { ...identity, sha256: 'C'.repeat(64) },
      { ...identity, fileCount: 2 },
      { ...identity, fileCount: 1 + 128 + 64 + 1 },
      { ...identity, root: '/private/workspace' },
    ]) {
      expect(presentWorkspaceTestResult({
        ok: true,
        summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] },
        savedTestInputIdentity: malformed,
        evidence: validEvidence,
      }).savedTestInputIdentity).toBeUndefined();
    }
    expect(presentWorkspaceTestResult({
      ok: false,
      savedTestInputIdentity: identity,
      evidence: { ...validEvidence, outcome: 'failed', artifacts: [validEvidence.artifacts[0]], diagnostics: [{ code: 'SIMULATOR_UNAVAILABLE', message: 'unavailable' }] },
    }).savedTestInputIdentity).toBeUndefined();
  });

  it('keeps assertion failures distinct from invalid test results', () => {
    const presentation = presentWorkspaceTestResult({
      ok: false,
      evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'Test execution failed', path: 'tests/motor.scenario.json' }] },
    });

    expect(presentation).toMatchObject({ kind: 'assertion-failed', message: 'One or more scenario assertions failed.', hasEvidence: true });
  });

  it.each(['SIMULATOR_UNAVAILABLE', 'RUNTIME_FAILED'])('classifies %s as unavailable infrastructure', (code) => {
    expect(presentWorkspaceTestResult({
      ok: false,
      evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code, message: 'Test execution failed' }] },
    })).toMatchObject({ kind: 'infrastructure-unavailable', message: 'Host POSIX simulation is unavailable.', hasEvidence: true });
  });

  it.each(['COMPILATION_FAILED', 'TEST_SCENARIO_INVALID', 'TEST_BUDGET_EXCEEDED'])('classifies %s as an invalid run', (code) => {
    expect(presentWorkspaceTestResult({
      ok: false,
      evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code, message: 'Test execution failed' }] },
    })).toMatchObject({ kind: 'invalid', message: 'Host scenarios could not run.', hasEvidence: true });
  });

  it.each([
    ['TEST_CANCELLED', 'cancelled', 'Host scenario run was cancelled.'],
    ['TEST_TIMEOUT', 'timeout', 'Host scenario run exceeded its deadline.'],
  ])('keeps %s as non-evidence', (code, kind, message) => {
    const presentation = presentWorkspaceTestResult({
      ok: false,
      evidence: { ...validEvidence, outcome: 'failed', artifacts: [validEvidence.artifacts[0]], diagnostics: [{ code, message: 'Test execution failed' }] },
    });
    expect(presentation).toMatchObject({ kind, message, hasEvidence: false, artifacts: [] });
    expect(presentation.artifacts).toEqual([]);
  });

  it('treats malformed results as unavailable infrastructure', () => {
    expect(presentWorkspaceTestResult({ ok: true, summary: {}, evidence: validEvidence }))
      .toMatchObject({ kind: 'infrastructure-unavailable', message: 'Host POSIX simulation is unavailable.', hasEvidence: false });
  });

  it('does not accept contradictory success or failure evidence', () => {
    expect(presentWorkspaceTestResult({ ok: false, evidence: validEvidence }))
      .toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
  });

  it('requires trace evidence for success and assertion claims', () => {
    const noTrace = { ...validEvidence, artifacts: [validEvidence.artifacts[0]] };
    expect(presentWorkspaceTestResult({
      ok: true,
      summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] },
      evidence: noTrace,
    })).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
    expect(presentWorkspaceTestResult({
      ok: false,
      evidence: { ...noTrace, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'Test execution failed' }] },
    })).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
  });

  it.each([
    { scenarios: [] },
    { scenarios: [{ id: '', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] },
  ])('rejects a successful result without a real scenario', ({ scenarios }) => {
    expect(presentWorkspaceTestResult({
      ok: true,
      summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios },
      evidence: validEvidence,
    })).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
  });

  it('does not label pre-scan failures as evidence and lets runtime failure dominate assertions', () => {
    for (const artifacts of [[], [validEvidence.artifacts[0]]]) {
      expect(presentWorkspaceTestResult({
        ok: false,
        evidence: { ...validEvidence, outcome: 'failed', artifacts, diagnostics: [{ code: 'SIMULATOR_UNAVAILABLE', message: 'Test execution failed' }] },
      })).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
      expect(presentWorkspaceTestResult({
        ok: false,
        evidence: { ...validEvidence, outcome: 'failed', artifacts, diagnostics: [{ code: 'COMPILATION_FAILED', message: 'Compilation failed' }] },
      })).toMatchObject({ kind: 'invalid', hasEvidence: false });
    }
    expect(presentWorkspaceTestResult({
      ok: false,
      evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'Test execution failed' }, { code: 'RUNTIME_FAILED', message: 'Test execution failed' }] },
    })).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: true });
  });

  it('treats failures without diagnostics as malformed', () => {
    expect(presentWorkspaceTestResult({ ok: false, evidence: { ...validEvidence, outcome: 'failed', diagnostics: [] } }))
      .toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
  });

  it('keeps only safe logical paths and complete artifact evidence', () => {
    const presentation = presentWorkspaceTestResult({
      ok: false,
      evidence: {
        ...validEvidence,
        outcome: 'failed',
        diagnostics: [
          { code: 'TEST_SCENARIO_INVALID', message: 'Safe', path: 'tests/a.scenario.json' },
          { code: 'TEST_SCENARIO_INVALID', message: 'Absolute', path: '/private/project' },
          { code: 'TEST_SCENARIO_INVALID', message: 'Drive', path: 'C:\\private' },
          { code: 'TEST_SCENARIO_INVALID', message: 'UNC', path: '\\\\server\\share' },
          { code: 'TEST_SCENARIO_INVALID', message: 'Parent', path: 'tests/../secret' },
          { code: 'TEST_SCENARIO_INVALID', message: 'Nul\0path', path: 'tests/\0secret' },
        ],
        artifacts: [
          ...validEvidence.artifacts,
          { kind: 'trace', sha256: 'A'.repeat(64), byteLength: 1 },
          { kind: 'bytecode', sha256: sha, byteLength: 1 },
          { kind: 'zplc', sha256: sha, byteLength: -1 },
        ],
      },
    });

    expect(presentation.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      'tests/a.scenario.json', undefined, undefined, undefined, undefined, undefined,
    ]);
    expect(presentation.artifacts).toEqual(validEvidence.artifacts);
  });

  it('never renders untrusted diagnostic codes or messages', () => {
    const secret = '/private/root token=workspace-secret';
    const presentation = presentWorkspaceTestResult({
      ok: false,
      evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code: `TOKEN_${secret}`, message: secret, path: secret }, { code: '__proto__', message: secret }] },
    });

    expect(presentation.diagnostics).toEqual([{ code: 'TEST_RESULT_INVALID', message: 'Test result was invalid.' }, { code: 'TEST_RESULT_INVALID', message: 'Test result was invalid.' }]);
    expect(JSON.stringify(presentation)).not.toContain(secret);
  });

  it('renders only a bounded preview tied to the aggregate trace artifact', () => {
    const preview = {
      schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', traceEvidenceSha256: 'b'.repeat(64), totalScenarioCount: 1,
      scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: false, totalSamples: 2, totalSignals: 1, totalAssertions: 1, truncated: false,
        assertions: [{ kind: 'AT', passed: false, atMs: 10 }], samples: [{ atMs: 0, outputs: { 'Motor.Forward': false } }, { atMs: 10, outputs: { 'Motor.Forward': true } }], }],
    };
    const presentation = presentWorkspaceTestResult({ ok: false, preview, evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored', path: 'tests/motor.scenario.json' }] } });
    expect(presentation.preview).toMatchObject({ traceEvidenceSha256: preview.traceEvidenceSha256, totalScenarioCount: 1, scenarios: preview.scenarios });
  });

  it('fails closed on untrusted object accessors, prototypes, symbols, and throwing proxies', () => {
    let accessed = false;
    const root = Object.defineProperty({}, 'ok', { enumerable: true, get: () => { accessed = true; throw new Error('secret'); } });
    expect(presentWorkspaceTestResult(root)).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
    expect(accessed).toBe(false);

    const nestedGetter = validPreview();
    Object.defineProperty(nestedGetter, 'backend', { enumerable: true, get: () => { accessed = true; return 'native-posix'; } });
    const exotic = Object.create({ inherited: true }); Object.assign(exotic, validPreview());
    const symbol = Object.assign(validPreview(), { [Symbol('secret')]: true });
    const throwingProxy = new Proxy({}, { getPrototypeOf: () => { throw new Error('secret'); } });
    for (const preview of [nestedGetter, exotic, symbol]) expect(presentWorkspaceTestResult({ ...validSuccess(), preview }).preview).toBeUndefined();
    expect(presentWorkspaceTestResult(throwingProxy)).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
    expect(accessed).toBe(false);
  });

  it('fails closed for revoked proxies at the root and in an untrusted array position', () => {
    const root = Proxy.revocable({}, {}); root.revoke();
    expect(() => presentWorkspaceTestResult(root.proxy)).not.toThrow();
    expect(presentWorkspaceTestResult(root.proxy)).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
    const nested = Proxy.revocable([], {}); nested.revoke();
    expect(() => presentWorkspaceTestResult({ ...validSuccess(), preview: { ...validPreview(), scenarios: nested.proxy } })).not.toThrow();
    expect(presentWorkspaceTestResult({ ...validSuccess(), preview: { ...validPreview(), scenarios: nested.proxy } }).preview).toBeUndefined();
  });

  it('binds success previews to every passed summary scenario and failure previews to a failed diagnostic', () => {
    const basePreview = { schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', traceEvidenceSha256: 'b'.repeat(64), totalScenarioCount: 1, scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, totalSamples: 1, totalSignals: 1, totalAssertions: 1, truncated: false, assertions: [{ kind: 'AT', passed: true, atMs: 0 }], samples: [{ atMs: 0, outputs: { 'Motor.Forward': true } }] }] };
    const success = { ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] }, evidence: validEvidence };
    expect(presentWorkspaceTestResult({ ...success, preview: basePreview }).preview).toBeDefined();
    expect(presentWorkspaceTestResult({ ...success, preview: { ...basePreview, totalScenarioCount: 2 } }).preview).toBeUndefined();
    expect(presentWorkspaceTestResult({ ...success, preview: { ...basePreview, scenarios: [{ ...basePreview.scenarios[0], passed: false }] } }).preview).toBeUndefined();
    const failurePreview = { ...basePreview, scenarios: [{ ...basePreview.scenarios[0], passed: false, assertions: [{ kind: 'AT', passed: false, atMs: 0 }] }] };
    const failure = { ok: false, evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored', path: 'tests/motor.scenario.json' }] } };
    expect(presentWorkspaceTestResult({ ...failure, preview: failurePreview }).preview).toBeDefined();
    expect(presentWorkspaceTestResult({ ...failure, preview: basePreview }).preview).toBeUndefined();
    expect(presentWorkspaceTestResult({ ...failure, preview: { ...failurePreview, scenarios: [{ ...failurePreview.scenarios[0], path: 'tests/other.scenario.json' }] } }).preview).toBeUndefined();
  });

  it('accepts the closed temporal v1 assertion kinds in bounded previews', () => {
    const preview = validPreview();
    preview.scenarios[0]!.assertions = [
      { kind: 'UNTIL', passed: true, atMs: 10 },
      { kind: 'FOR', passed: true, atMs: 20 },
      { kind: 'EVENTUALLY', passed: true, atMs: 10 },
      { kind: 'RISING', passed: true, atMs: 10 },
      { kind: 'FALLING', passed: true, atMs: 20 },
    ];
    preview.scenarios[0]!.totalAssertions = 5;
    expect(presentWorkspaceTestResult({ ...validSuccess(), preview }).preview?.scenarios[0]?.assertions.map((assertion) => assertion.kind)).toEqual(['UNTIL', 'FOR', 'EVENTUALLY', 'RISING', 'FALLING']);
  });

  it('rejects ragged preview samples and evidence that exceeds its caps', () => {
    const preview = { schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', traceEvidenceSha256: 'b'.repeat(64), totalScenarioCount: 1, scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: false, totalSamples: 2, totalSignals: 1, totalAssertions: 1, truncated: false, assertions: [{ kind: 'AT', passed: false, atMs: 10 }], samples: [{ atMs: 0, outputs: { 'Motor.Forward': true } }, { atMs: 10, outputs: {} }] }] };
    const result = presentWorkspaceTestResult({ ok: false, preview, evidence: { ...validEvidence, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored', path: 'tests/motor.scenario.json' }] } });
    expect(result).toMatchObject({ kind: 'assertion-failed', hasEvidence: true });
    expect(result.preview).toBeUndefined();
    const diagnostics = Array.from({ length: 128 }, () => ({ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored' })).concat({ code: 'RUNTIME_FAILED', message: 'ignored' });
    expect(presentWorkspaceTestResult({ ok: false, evidence: { ...validEvidence, outcome: 'failed', diagnostics } })).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
    expect(presentWorkspaceTestResult({ ok: false, evidence: { ...validEvidence, outcome: 'failed', artifacts: Array.from({ length: 17 }, () => validEvidence.artifacts[0]), diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored' }] } })).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
  });

  const validSuccess = () => ({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] }, evidence: validEvidence });
  const validPreview = () => ({ schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', traceEvidenceSha256: 'b'.repeat(64), totalScenarioCount: 1, scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, totalSamples: 2, totalSignals: 1, totalAssertions: 1, truncated: false, assertions: [{ kind: 'AT', passed: true, atMs: 0 }], samples: [{ atMs: 0, outputs: { 'Motor.Forward': true } }, { atMs: 10, outputs: { 'Motor.Forward': false } }] }] });
  const validMotorPlantPreview = () => {
    const preview = validPreview();
    const scenario = preview.scenarios[0]!;
    return {
      ...preview,
      scenarios: [{
        ...scenario,
        totalSignals: 3,
        samples: [
          { atMs: 0, outputs: { 'MotorPlant.Command': false, 'MotorPlant.Running': false, 'Other.Safe': true }, plant: { kind: 'motor-v1', atSpeedInput: false, speedPermilleAfterTick: 0 } },
          { atMs: 10, outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': false, 'Other.Safe': true }, plant: { kind: 'motor-v1', atSpeedInput: false, speedPermilleAfterTick: 500 } },
        ],
      }],
    };
  };

  it('preserves exact legacy samples and admits only a complete motor-v1 preview', () => {
    expect(presentWorkspaceTestResult({ ...validSuccess(), preview: validPreview() }).preview?.scenarios[0]?.samples).toEqual(validPreview().scenarios[0]!.samples);
    expect(presentWorkspaceTestResult({ ...validSuccess(), preview: validMotorPlantPreview() }).preview?.scenarios[0]?.samples[1]).toEqual({
      atMs: 10,
      outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': false, 'Other.Safe': true },
      plant: { kind: 'motor-v1', atSpeedInput: false, speedPermilleAfterTick: 500 },
    });
  });

  it.each([
    ['complete', (plant: Record<string, unknown>) => plant, true],
    ['extra key', (plant: Record<string, unknown>) => ({ ...plant, extra: true }), false],
    ['wrong seed', (plant: Record<string, unknown>) => ({ ...plant, seed: 1 }), false],
    ['nonboolean sensor', (plant: Record<string, unknown>) => ({ ...plant, jamDetectedInput: 'yes' }), false],
    ['negative count', (plant: Record<string, unknown>) => ({ ...plant, classifiedCountAfterTick: -1 }), false],
    ['count above one', (plant: Record<string, unknown>) => ({ ...plant, classifiedCountAfterTick: 2 }), false],
    ['fractional count', (plant: Record<string, unknown>) => ({ ...plant, classifiedCountAfterTick: 0.5 }), false],
    ['nonboolean classifier sensor', (plant: Record<string, unknown>) => ({ ...plant, partAtClassifierInput: 'yes' }), false],
  ])('handles conveyor preview %s fail-closed', (_name, mutate, accepted) => {
    const base = validPreview();
    const plant = mutate({ kind: 'conveyor-v1', seed: 0, partAtClassifierInput: false, metalDetectedInput: false, partAtDiverterInput: false, jamDetectedInput: false, classifiedCountAfterTick: 0 });
    const preview = { ...base, scenarios: [{ ...base.scenarios[0], samples: base.scenarios[0]!.samples.map((sample) => ({ ...sample, plant })) }] };
    const result = presentWorkspaceTestResult({ ...validSuccess(), preview });
    expect(Boolean(result.preview)).toBe(accepted);
  });

  it('drops a conveyor preview for mixed plant kinds or a partial plant sequence', () => {
    const base = validPreview();
    const conveyorPlant = { kind: 'conveyor-v1' as const, seed: 0 as const, partAtClassifierInput: false, metalDetectedInput: false, partAtDiverterInput: false, jamDetectedInput: false, classifiedCountAfterTick: 0 };
    const samples = base.scenarios[0]!.samples;
    const mixed = { ...base, scenarios: [{ ...base.scenarios[0], samples: [{ ...samples[0], plant: conveyorPlant }, { ...samples[1], plant: { kind: 'motor-v1' as const, atSpeedInput: false, speedPermilleAfterTick: 0 } }] }] };
    const partial = { ...base, scenarios: [{ ...base.scenarios[0], samples: [{ ...samples[0], plant: conveyorPlant }, samples[1]] }] };
    expect(presentWorkspaceTestResult({ ...validSuccess(), preview: mixed }).preview).toBeUndefined();
    expect(presentWorkspaceTestResult({ ...validSuccess(), preview: partial }).preview).toBeUndefined();
  });

  it.each([
    ['complete', (plant: Record<string, unknown>) => plant, true],
    ['extra key', (plant: Record<string, unknown>) => ({ ...plant, extra: true }), false],
    ['missing level sensor', (plant: Record<string, unknown>) => { const copy = { ...plant }; delete copy.levelLowInput; return copy; }, false],
    ['nonboolean sensor', (plant: Record<string, unknown>) => ({ ...plant, levelHighInput: 'yes' }), false],
    ['negative level', (plant: Record<string, unknown>) => ({ ...plant, levelPermilleAfterTick: -1 }), false],
    ['level above range', (plant: Record<string, unknown>) => ({ ...plant, levelPermilleAfterTick: 1001 }), false],
    ['fractional level', (plant: Record<string, unknown>) => ({ ...plant, levelPermilleAfterTick: 1.5 }), false],
  ])('handles tank preview %s fail-closed', (_name, mutate, accepted) => {
    const base = validPreview();
    const plant = mutate({ kind: 'tank-v1', levelLowInput: true, levelHighInput: false, levelPermilleAfterTick: 280 });
    const preview = { ...base, scenarios: [{ ...base.scenarios[0], samples: base.scenarios[0]!.samples.map((sample) => ({ ...sample, plant })) }] };
    expect(Boolean(presentWorkspaceTestResult({ ...validSuccess(), preview }).preview)).toBe(accepted);
  });

  it('drops a tank preview with mixed plant kinds', () => {
    const base = validPreview();
    const samples = base.scenarios[0]!.samples;
    const tank = { kind: 'tank-v1' as const, levelLowInput: true, levelHighInput: false, levelPermilleAfterTick: 280 };
    const preview = { ...base, scenarios: [{ ...base.scenarios[0], samples: [{ ...samples[0], plant: tank }, { ...samples[1], plant: { kind: 'motor-v1' as const, atSpeedInput: false, speedPermilleAfterTick: 0 } }] }] };
    expect(presentWorkspaceTestResult({ ...validSuccess(), preview }).preview).toBeUndefined();
  });

  it.each([
    ['plant extra key', (preview: ReturnType<typeof validMotorPlantPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ ...preview.scenarios[0]!.samples[0], plant: { ...preview.scenarios[0]!.samples[0]!.plant!, secret: true } }, preview.scenarios[0]!.samples[1]!] }] })],
    ['unknown plant kind', (preview: ReturnType<typeof validMotorPlantPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ ...preview.scenarios[0]!.samples[0], plant: { ...preview.scenarios[0]!.samples[0]!.plant!, kind: 'motor-v2' } }, preview.scenarios[0]!.samples[1]!] }] })],
    ['negative speed', (preview: ReturnType<typeof validMotorPlantPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ ...preview.scenarios[0]!.samples[0], plant: { ...preview.scenarios[0]!.samples[0]!.plant!, speedPermilleAfterTick: -1 } }, preview.scenarios[0]!.samples[1]!] }] })],
    ['speed above range', (preview: ReturnType<typeof validMotorPlantPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ ...preview.scenarios[0]!.samples[0], plant: { ...preview.scenarios[0]!.samples[0]!.plant!, speedPermilleAfterTick: 1001 } }, preview.scenarios[0]!.samples[1]!] }] })],
    ['fractional speed', (preview: ReturnType<typeof validMotorPlantPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ ...preview.scenarios[0]!.samples[0], plant: { ...preview.scenarios[0]!.samples[0]!.plant!, speedPermilleAfterTick: 1.5 } }, preview.scenarios[0]!.samples[1]!] }] })],
    ['non boolean at speed', (preview: ReturnType<typeof validMotorPlantPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ ...preview.scenarios[0]!.samples[0], plant: { ...preview.scenarios[0]!.samples[0]!.plant!, atSpeedInput: 'yes' } }, preview.scenarios[0]!.samples[1]!] }] })],
    ['partial plant', (preview: ReturnType<typeof validMotorPlantPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ atMs: 0, outputs: preview.scenarios[0]!.samples[0]!.outputs }, preview.scenarios[0]!.samples[1]!] }] })],
  ])('drops the complete preview for %s', (_name, mutate) => {
    const presentation = presentWorkspaceTestResult({ ...validSuccess(), preview: mutate(validMotorPlantPreview()) });
    expect(presentation).toMatchObject({ kind: 'passed', hasEvidence: true });
    expect(presentation.preview).toBeUndefined();
  });

  it('rejects zero-byte program or trace artifacts before presenting evidence or previews', () => {
    const zeroProgram = { ...validEvidence, artifacts: [{ ...validEvidence.artifacts[0], byteLength: 0 }, validEvidence.artifacts[1]] };
    const zeroProgramPresentation = presentWorkspaceTestResult({ ...validSuccess(), preview: validPreview(), evidence: zeroProgram });
    expect(zeroProgramPresentation).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
    expect(zeroProgramPresentation.preview).toBeUndefined();
    const zeroTrace = { ...validEvidence, artifacts: [validEvidence.artifacts[0], { ...validEvidence.artifacts[1], byteLength: 0 }] };
    const failedPreview = { ...validPreview(), scenarios: [{ ...validPreview().scenarios[0], passed: false, assertions: [{ kind: 'AT', passed: false, atMs: 0 }] }] };
    const zeroTracePresentation = presentWorkspaceTestResult({ ok: false, preview: failedPreview, evidence: { ...zeroTrace, outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored', path: 'tests/motor.scenario.json' }] } });
    expect(zeroTracePresentation).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
    expect(zeroTracePresentation.preview).toBeUndefined();
  });

  it.each([
    ['unlinked hash', (preview: ReturnType<typeof validPreview>) => ({ ...preview, traceEvidenceSha256: 'c'.repeat(64) })],
    ['control id', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], id: 'bad\nname' }] })],
    ['absolute path', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], path: '/private/root' }] })],
    ['traversal path', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], path: 'tests/../secret' }] })],
    ['too many scenarios', (preview: ReturnType<typeof validPreview>) => ({ ...preview, totalScenarioCount: 9, scenarios: Array.from({ length: 9 }, (_, index) => ({ ...preview.scenarios[0], id: `motor${index}` })) })],
    ['zero totals', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], totalSamples: 0 }] })],
    ['invalid assertion kind', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], assertions: [{ ...preview.scenarios[0]!.assertions[0], kind: 'OPEN_EVENTUALLY' }] }] })],
    ['invalid assertion time', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], assertions: [{ ...preview.scenarios[0]!.assertions[0], atMs: -1 }] }] })],
    ['non boolean output', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ atMs: 0, outputs: { 'Motor.Forward': 'secret' } }, preview.scenarios[0]!.samples[1]! ] }] })],
    ['invalid signal', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [{ atMs: 0, outputs: { secret: true } }, preview.scenarios[0]!.samples[1]! ] }] })],
    ['unordered samples', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [preview.scenarios[0]!.samples[1]!, preview.scenarios[0]!.samples[0]!] }] })],
    ['counts below arrays', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], totalSamples: 1 }] })],
    ['inconsistent truncation', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], truncated: true }] })],
    ['ragged outputs', (preview: ReturnType<typeof validPreview>) => ({ ...preview, scenarios: [{ ...preview.scenarios[0], samples: [preview.scenarios[0]!.samples[0]!, { atMs: 10, outputs: { 'Motor.Other': false } }] }] })],
    ['duplicate identity', (preview: ReturnType<typeof validPreview>) => ({ ...preview, totalScenarioCount: 2, scenarios: [preview.scenarios[0]!, preview.scenarios[0]!] })],
  ])('drops isolated malformed preview (%s) while retaining valid base evidence', (_name, mutate) => {
    const presentation = presentWorkspaceTestResult({ ...validSuccess(), preview: mutate(validPreview()) });
    expect(presentation).toMatchObject({ kind: 'passed', hasEvidence: true });
    expect(presentation.preview).toBeUndefined();
  });

  it('drops an unknown preview key without exposing its secret', () => {
    const secret = '/private/root token=preview-secret';
    const presentation = presentWorkspaceTestResult({ ...validSuccess(), preview: { ...validPreview(), raw: secret } });
    expect(presentation.preview).toBeUndefined();
    expect(JSON.stringify(presentation)).not.toContain(secret);
  });

  it('rejects duplicate case-insensitive passed summary identities', () => {
    const result = presentWorkspaceTestResult({ ...validSuccess(), summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }, { id: 'MOTOR', path: 'tests/other.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] } });
    expect(result).toMatchObject({ kind: 'infrastructure-unavailable', hasEvidence: false });
  });
});

describe('presentRecordedMotorOutput', () => {
  const completeMotorScenario = {
    id: 'motor', path: 'tests/motor.scenario.json', passed: true, totalSamples: 2, totalSignals: 2, totalAssertions: 1, truncated: false,
    assertions: [{ kind: 'AT' as const, passed: true, atMs: 0 }],
    samples: [
      { atMs: 10, outputs: { 'Motor.Forward': false, 'Motor.Reverse': true } },
      { atMs: 25, outputs: { 'Motor.Forward': true, 'Motor.Reverse': false } },
    ],
  };

  it('projects exact motor keys in Forward/Reverse order without changing recorded samples', () => {
    expect(presentRecordedMotorOutput(completeMotorScenario)).toEqual({
      signals: ['Motor.Forward', 'Motor.Reverse'],
      samples: [
        { atMs: 10, outputs: { 'Motor.Forward': false, 'Motor.Reverse': true } },
        { atMs: 25, outputs: { 'Motor.Forward': true, 'Motor.Reverse': false } },
      ],
    });
  });

  it('projects one exact motor signal but hides unrelated or truncated scenarios', () => {
    expect(presentRecordedMotorOutput({ ...completeMotorScenario, totalSignals: 1, samples: completeMotorScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { 'Motor.Reverse': outputs['Motor.Reverse'] } })) })).toEqual({
      signals: ['Motor.Reverse'],
      samples: [{ atMs: 10, outputs: { 'Motor.Reverse': true } }, { atMs: 25, outputs: { 'Motor.Reverse': false } }],
    });
    expect(presentRecordedMotorOutput({ ...completeMotorScenario, samples: completeMotorScenario.samples.map(({ atMs }) => ({ atMs, outputs: { 'Motor.Output': false, 'Conveyor.Run': true } })) })).toBeUndefined();
    expect(presentRecordedMotorOutput({ ...completeMotorScenario, samples: completeMotorScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { 'Motor.Forward': outputs['Motor.Forward'], 'Conveyor.Run': true } })) })).toBeUndefined();
    expect(presentRecordedMotorOutput({ ...completeMotorScenario, samples: [completeMotorScenario.samples[0], { atMs: 25, outputs: { 'Motor.Forward': true } }] })).toBeUndefined();
    expect(presentRecordedMotorOutput({ ...completeMotorScenario, truncated: true })).toBeUndefined();
    expect(presentRecordedMotorOutput({ ...completeMotorScenario, totalSamples: 0, samples: [] })).toBeUndefined();
  });
});

describe('presentRecordedMotorPlant', () => {
  const completePlantScenario = {
    id: 'motor-plant', path: 'tests/motor-plant.scenario.json', passed: true, totalSamples: 2, totalSignals: 3, totalAssertions: 1, truncated: false,
    assertions: [{ kind: 'AT' as const, passed: true, atMs: 0 }],
    samples: [
      { atMs: 0, outputs: { 'MotorPlant.Command': false, 'MotorPlant.Running': false, 'Other.Safe': true }, plant: { kind: 'motor-v1' as const, atSpeedInput: false, speedPermilleAfterTick: 0 } },
      { atMs: 10, outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': false, 'Other.Safe': true }, plant: { kind: 'motor-v1' as const, atSpeedInput: false, speedPermilleAfterTick: 500 } },
    ],
  };

  it('projects only complete recorded motor-v1 evidence and keeps required command values explicit', () => {
    expect(presentRecordedMotorPlant(completePlantScenario)).toEqual({
      kind: 'motor-v1',
      samples: [
        { atMs: 0, command: false, running: false, atSpeed: false, speedPermilleAfterTick: 0 },
        { atMs: 10, command: true, running: false, atSpeed: false, speedPermilleAfterTick: 500 },
      ],
    });
  });

  it.each([
    ['truncated', { ...completePlantScenario, truncated: true }],
    ['missing plant', { ...completePlantScenario, samples: completePlantScenario.samples.map((sample) => ({ atMs: sample.atMs, outputs: sample.outputs })) }],
    ['partial plant', { ...completePlantScenario, samples: [completePlantScenario.samples[0], { ...completePlantScenario.samples[1], plant: undefined }] }],
    ['missing command', { ...completePlantScenario, samples: completePlantScenario.samples.map(({ atMs, plant }) => ({ atMs, outputs: { 'MotorPlant.Running': false }, plant })) }],
    ['missing running', { ...completePlantScenario, samples: completePlantScenario.samples.map(({ atMs, plant }) => ({ atMs, outputs: { 'MotorPlant.Command': false }, plant })) }],
  ])('hides %s motor-plant evidence', (_name, scenario) => {
    expect(presentRecordedMotorPlant(scenario)).toBeUndefined();
  });
});

describe('presentRecordedConveyorPlant', () => {
  const completeConveyorScenario = {
    id: 'Conveyor01', path: 'tests/conveyor-01.scenario.json', passed: true, totalSamples: 2, totalSignals: 3, totalAssertions: 1, truncated: false,
    assertions: [{ kind: 'AT' as const, passed: true, atMs: 0 }],
    samples: [
      { atMs: 0, outputs: { 'Conveyor.BeltCommand': false, 'Conveyor.DiverterCommand': false, 'Conveyor.FaultLamp': false }, plant: { kind: 'conveyor-v1' as const, seed: 0 as const, partAtClassifierInput: false, metalDetectedInput: false, partAtDiverterInput: false, jamDetectedInput: false, classifiedCountAfterTick: 0 } },
      { atMs: 10, outputs: { 'Conveyor.BeltCommand': true, 'Conveyor.DiverterCommand': true, 'Conveyor.FaultLamp': false }, plant: { kind: 'conveyor-v1' as const, seed: 0 as const, partAtClassifierInput: true, metalDetectedInput: true, partAtDiverterInput: false, jamDetectedInput: false, classifiedCountAfterTick: 1 } },
    ],
  };

  it('projects the exact complete conveyor-v1 timeline', () => {
    expect(presentRecordedConveyorPlant(completeConveyorScenario)).toEqual({
      kind: 'conveyor-v1',
      samples: [
        { atMs: 0, beltCommand: false, diverterCommand: false, faultLamp: false, partAtClassifierInput: false, metalDetectedInput: false, partAtDiverterInput: false, jamDetectedInput: false, classifiedCountAfterTick: 0 },
        { atMs: 10, beltCommand: true, diverterCommand: true, faultLamp: false, partAtClassifierInput: true, metalDetectedInput: true, partAtDiverterInput: false, jamDetectedInput: false, classifiedCountAfterTick: 1 },
      ],
    });
  });

  it.each([
    ['truncated', { ...completeConveyorScenario, truncated: true }],
    ['missing plant', { ...completeConveyorScenario, samples: completeConveyorScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs })) }],
    ['wrong plant kind', { ...completeConveyorScenario, samples: completeConveyorScenario.samples.map((sample) => ({ ...sample, plant: { kind: 'motor-v1' as const, atSpeedInput: false, speedPermilleAfterTick: 0 } })) }],
    ['missing belt command', { ...completeConveyorScenario, samples: completeConveyorScenario.samples.map(({ atMs, plant, outputs }) => ({ atMs, plant, outputs: { 'Conveyor.DiverterCommand': outputs['Conveyor.DiverterCommand'], 'Conveyor.FaultLamp': outputs['Conveyor.FaultLamp'] } })) }],
    ['missing diverter command', { ...completeConveyorScenario, samples: completeConveyorScenario.samples.map(({ atMs, plant, outputs }) => ({ atMs, plant, outputs: { 'Conveyor.BeltCommand': outputs['Conveyor.BeltCommand'], 'Conveyor.FaultLamp': outputs['Conveyor.FaultLamp'] } })) }],
    ['missing fault lamp', { ...completeConveyorScenario, samples: completeConveyorScenario.samples.map(({ atMs, plant, outputs }) => ({ atMs, plant, outputs: { 'Conveyor.BeltCommand': outputs['Conveyor.BeltCommand'], 'Conveyor.DiverterCommand': outputs['Conveyor.DiverterCommand'] } })) }],
  ])('hides %s conveyor evidence', (_name, scenario) => {
    expect(presentRecordedConveyorPlant(scenario)).toBeUndefined();
  });
});

describe('presentRecordedPedestrianCrossing', () => {
  const completePedestrianScenario = {
    id: 'PedestrianCrossing', path: 'tests/pedestrian-crossing.scenario.json', passed: true, totalSamples: 3, totalSignals: 5, totalAssertions: 1, truncated: false,
    assertions: [{ kind: 'AT' as const, passed: true, atMs: 0 }],
    samples: [
      { atMs: 0, outputs: { 'PedestrianCrossing.VehicleRed': false, 'PedestrianCrossing.VehicleYellow': false, 'PedestrianCrossing.VehicleGreen': true, 'PedestrianCrossing.PedWalk': false, 'PedestrianCrossing.PedStop': true }, plant: { kind: 'pedestrian-v1' as const, requestInput: false, phaseAfterTick: 'approaching' as const } },
      { atMs: 60, outputs: { 'PedestrianCrossing.VehicleRed': true, 'PedestrianCrossing.VehicleYellow': false, 'PedestrianCrossing.VehicleGreen': false, 'PedestrianCrossing.PedWalk': true, 'PedestrianCrossing.PedStop': false }, plant: { kind: 'pedestrian-v1' as const, requestInput: true, phaseAfterTick: 'crossing' as const } },
      { atMs: 110, outputs: { 'PedestrianCrossing.VehicleRed': true, 'PedestrianCrossing.VehicleYellow': false, 'PedestrianCrossing.VehicleGreen': false, 'PedestrianCrossing.PedWalk': false, 'PedestrianCrossing.PedStop': true }, plant: { kind: 'pedestrian-v1' as const, requestInput: false, phaseAfterTick: 'cleared' as const } },
    ],
  };

  it('projects only the exact complete pedestrian-crossing evidence into semantic states', () => {
    expect(presentRecordedPedestrianCrossing(completePedestrianScenario)).toEqual({ kind: 'pedestrian-v1',
      samples: [
        { atMs: 0, vehicle: 'GREEN', pedestrian: 'STOP', request: 'CLEAR', phase: 'APPROACHING' },
        { atMs: 60, vehicle: 'RED', pedestrian: 'WALK', request: 'ACTIVE', phase: 'CROSSING' },
        { atMs: 110, vehicle: 'RED', pedestrian: 'STOP', request: 'CLEAR', phase: 'CLEARED' },
      ],
    });
  });

  it('keeps an all-dark vehicle state explicit as CLEAR', () => {
    expect(presentRecordedPedestrianCrossing({
      ...completePedestrianScenario,
      samples: [{ atMs: 120, outputs: { 'PedestrianCrossing.VehicleRed': false, 'PedestrianCrossing.VehicleYellow': false, 'PedestrianCrossing.VehicleGreen': false, 'PedestrianCrossing.PedWalk': false, 'PedestrianCrossing.PedStop': true }, plant: { kind: 'pedestrian-v1' as const, requestInput: false, phaseAfterTick: 'cleared' as const } }],
    })).toEqual({ kind: 'pedestrian-v1', samples: [{ atMs: 120, vehicle: 'CLEAR', pedestrian: 'STOP', request: 'CLEAR', phase: 'CLEARED' }] });
  });

  it.each([
    ['truncated evidence', { ...completePedestrianScenario, truncated: true }],
    ['wrong scenario id', { ...completePedestrianScenario, id: 'OtherScenario' }],
    ['wrong scenario path', { ...completePedestrianScenario, path: 'tests/other.scenario.json' }],
    ['missing required signal', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { ...outputs, 'PedestrianCrossing.PedWalk': undefined } })) }],
    ['unexpected output', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { ...outputs, 'Unexpected.Output': false } })) }],
    ['missing plant evidence', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs })) }],
    ['wrong plant evidence', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs, plant: { kind: 'motor-v1' as const, atSpeedInput: false, speedPermilleAfterTick: 0 } })) }],
    ['invalid plant phase', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map((sample) => ({ ...sample, plant: { ...sample.plant, phaseAfterTick: 'bad' } })) }],
    ['incompatible vehicle lights', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { ...outputs, 'PedestrianCrossing.VehicleRed': true, 'PedestrianCrossing.VehicleGreen': true } })) }],
    ['walk without an all-red vehicle state', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map((sample) => ({ ...sample, outputs: { ...sample.outputs, 'PedestrianCrossing.VehicleRed': false, 'PedestrianCrossing.VehicleGreen': true, 'PedestrianCrossing.PedWalk': true, 'PedestrianCrossing.PedStop': false } })) }],
    ['incompatible pedestrian signals', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { ...outputs, 'PedestrianCrossing.PedWalk': true, 'PedestrianCrossing.PedStop': true } })) }],
    ['inactive pedestrian signals', { ...completePedestrianScenario, samples: completePedestrianScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { ...outputs, 'PedestrianCrossing.PedWalk': false, 'PedestrianCrossing.PedStop': false } })) }],
  ])('hides %s pedestrian evidence', (_name, scenario) => {
    expect(presentRecordedPedestrianCrossing(scenario)).toBeUndefined();
  });
});

describe('presentRecordedTankLevel', () => {
  const completeTankScenario = {
    id: 'TankLevel', path: 'tests/tank-level.scenario.json', passed: true, totalSamples: 2, totalSignals: 2, totalAssertions: 1, truncated: false,
    assertions: [{ kind: 'AT' as const, passed: true, atMs: 0 }],
    samples: [
      { atMs: 10, outputs: { 'TankLevel.Pump': true, 'TankLevel.Alarm': false }, plant: { kind: 'tank-v1' as const, levelLowInput: true, levelHighInput: false, levelPermilleAfterTick: 280 } },
      { atMs: 60, outputs: { 'TankLevel.Pump': false, 'TankLevel.Alarm': true }, plant: { kind: 'tank-v1' as const, levelLowInput: false, levelHighInput: true, levelPermilleAfterTick: 760 } },
    ],
  };

  it('projects only the exact complete TankLevel timeline into named output states', () => {
    expect(presentRecordedTankLevel(completeTankScenario)).toEqual({
      kind: 'tank-v1',
      samples: [
        { atMs: 10, pump: 'RUNNING', alarm: 'NORMAL', levelLowInput: true, levelHighInput: false, levelPermilleAfterTick: 280 },
        { atMs: 60, pump: 'STOPPED', alarm: 'ALARM', levelLowInput: false, levelHighInput: true, levelPermilleAfterTick: 760 },
      ],
    });
  });

  it.each([
    ['truncated evidence', { ...completeTankScenario, truncated: true }],
    ['wrong scenario id', { ...completeTankScenario, id: 'OtherScenario' }],
    ['wrong scenario path', { ...completeTankScenario, path: 'tests/other.scenario.json' }],
    ['missing required signal', { ...completeTankScenario, samples: completeTankScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { 'TankLevel.Pump': outputs['TankLevel.Pump'] } })) }],
    ['unexpected output', { ...completeTankScenario, samples: completeTankScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { ...outputs, 'Unexpected.Output': false } })) }],
    ['wrong plant evidence', { ...completeTankScenario, samples: completeTankScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs, plant: { kind: 'motor-v1' as const, atSpeedInput: false, speedPermilleAfterTick: 0 } })) }],
    ['invalid level', { ...completeTankScenario, samples: completeTankScenario.samples.map(({ atMs, outputs, plant }) => ({ atMs, outputs, plant: { ...plant, levelPermilleAfterTick: 1001 } })) }],
    ['incompatible pump and alarm', { ...completeTankScenario, samples: completeTankScenario.samples.map(({ atMs, outputs }) => ({ atMs, outputs: { ...outputs, 'TankLevel.Pump': true, 'TankLevel.Alarm': true } })) }],
  ])('hides %s tank evidence', (_name, scenario) => {
    expect(presentRecordedTankLevel(scenario)).toBeUndefined();
  });
});

describe('workspaceTestAvailability', () => {
  const ready = { desktopAvailable: true, isProjectOpen: true, hasCurrentLink: true, hasUnsavedChanges: false };

  it('keeps the blocking cause explicit and prioritizes trust boundaries', () => {
    expect(workspaceTestAvailability({ ...ready, desktopAvailable: false })).toBe('desktop-unavailable');
    expect(workspaceTestAvailability({ ...ready, isProjectOpen: false })).toBe('project-required');
    expect(workspaceTestAvailability({ ...ready, hasCurrentLink: false })).toBe('link-required');
    expect(workspaceTestAvailability({ ...ready, hasUnsavedChanges: true })).toBe('unsaved');
    expect(workspaceTestAvailability(ready)).toBe('ready');
  });
});

describe('isWorkspaceTestRunCurrent', () => {
  const expected = { projectSession: 7, compilerRunId: 11, workspaceId: 'opaque-token' };

  it('rejects a deferred result after source/config revision, project, or link changes', () => {
    const current = { projectSession: 7, compilerRunId: 11, workspaceScenarioLink: { workspaceId: 'opaque-token', projectSession: 7 } };
    expect(isWorkspaceTestRunCurrent(current, expected)).toBe(true);
    expect(isWorkspaceTestRunCurrent({ ...current, compilerRunId: 12 }, expected)).toBe(false);
    expect(isWorkspaceTestRunCurrent({ ...current, projectSession: 8 }, expected)).toBe(false);
    expect(isWorkspaceTestRunCurrent({ ...current, workspaceScenarioLink: { workspaceId: 'replacement-token', projectSession: 7 } }, expected)).toBe(false);
  });
});

describe('saved workspace compilation presentation', () => {
  const ready = { isElectronHost: true, canonicalCompileAvailable: true, isProjectOpen: true, hasCurrentLink: true, hasUnsavedChanges: false };

  it('routes every physical desktop project through the saved workspace compiler', () => {
    expect(resolveWorkspaceCompileRoute(ready)).toBe('canonical');
    expect(resolveWorkspaceCompileRoute({ ...ready, hasCurrentLink: false })).toBe('link-required');
    expect(resolveWorkspaceCompileRoute({ ...ready, hasUnsavedChanges: true })).toBe('save-required');
    expect(resolveWorkspaceCompileRoute({ ...ready, isElectronHost: false })).toBe('renderer');
    expect(resolveWorkspaceCompileRoute({ ...ready, canonicalCompileAvailable: false })).toBe('canonical-unavailable');
  });

  it('accepts only a complete canonical artifact envelope', () => {
    const accepted = presentWorkspaceCompileResult({
      ok: true,
      summary: { name: 'Motor', taskCount: 1, codeSize: 4 },
      artifact: {
        zplcFile: new Uint8Array([1]), bytecode: new Uint8Array([2]), assembly: '; program',
        debugMap: { pou: {}, memoryLayout: {} },
      },
      zplcEvidence: { sha256: sha, byteLength: 1 },
    });
    expect(accepted).toMatchObject({ ok: true, summary: { name: 'Motor', taskCount: 1, codeSize: 4 } });
    expect(presentWorkspaceCompileResult({ ok: true, summary: { name: 'Motor', taskCount: 1, codeSize: 4 }, artifact: { zplcFile: [], bytecode: new Uint8Array([2]), assembly: ';', debugMap: { pou: {}, memoryLayout: {} } }, zplcEvidence: { sha256: sha, byteLength: 0 } })).toEqual({ ok: false, diagnostics: [] });
    expect(presentWorkspaceCompileResult({ ok: true, summary: { name: 'Motor', taskCount: 1, codeSize: 4 }, artifact: { zplcFile: new Uint8Array([1]), bytecode: new Uint8Array([2]), assembly: ';', debugMap: { pou: {}, memoryLayout: {} } }, zplcEvidence: { sha256: sha, byteLength: 2 } })).toEqual({ ok: false, diagnostics: [] });
    expect(presentWorkspaceCompileResult({ ok: false, evidence: { outcome: 'failed', diagnostics: [{ code: 'COMPILATION_FAILED', path: '/private/root.st', line: 2, column: 1 }] } })).toEqual({ ok: false, diagnostics: [{ code: 'COMPILATION_FAILED', message: 'Compilation failed.', line: 2, column: 1 }] });
  });
});

describe('canonical saved build linkage', () => {
  const current = { projectSession: 7, compilerRunId: 11, workspaceScenarioLink: { workspaceId: 'opaque-token', projectSession: 7 } };
  const build = { projectSession: 7, compilerRunId: 11, workspaceId: 'opaque-token', zplc: { kind: 'zplc' as const, sha256: sha, byteLength: 12 } };
  const test = { projectSession: 7, compilerRunId: 11, workspaceId: 'opaque-token', presentation: presentWorkspaceTestResult({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'motor', path: 'tests/motor.scenario.json', passed: true, traceSha256: sha, traceByteLength: 1 }] }, evidence: validEvidence }) };

  it('links only one matching zplc and trace artifact for the current saved build', () => {
    expect(classifyWorkspaceTestBuildLink(current, build, test)).toMatchObject({ kind: 'verified', zplc: build.zplc, trace: validEvidence.artifacts[1] });
  });

  it('keeps mismatched, missing, duplicate, and stale test evidence explicitly unlinked', () => {
    const mismatch = { ...test, presentation: { ...test.presentation, artifacts: [{ ...validEvidence.artifacts[0], sha256: 'c'.repeat(64) }, validEvidence.artifacts[1]] } };
    const missing = { ...test, presentation: { ...test.presentation, artifacts: [validEvidence.artifacts[0]] } };
    const duplicate = { ...test, presentation: { ...test.presentation, artifacts: [...validEvidence.artifacts, validEvidence.artifacts[1]] } };
    expect(classifyWorkspaceTestBuildLink(current, build, mismatch)).toEqual({ kind: 'not-linked' });
    expect(classifyWorkspaceTestBuildLink(current, build, missing)).toEqual({ kind: 'not-linked' });
    expect(classifyWorkspaceTestBuildLink(current, build, duplicate)).toEqual({ kind: 'not-linked' });
    expect(classifyWorkspaceTestBuildLink({ ...current, compilerRunId: 12 }, build, test)).toEqual({ kind: 'not-linked' });
    expect(classifyWorkspaceTestBuildLink(current, null, test)).toEqual({ kind: 'not-linked' });
  });
});

describe('workspaceTestRunFallbackState', () => {
  it('settles discarded async runs without inventing evidence', () => {
    expect(workspaceTestRunFallbackState({ isProjectOpen: true, projectSession: 7, workspaceScenarioLink: { workspaceId: 'replacement-token', projectSession: 7 } })).toBe('selected');
    expect(workspaceTestRunFallbackState({ isProjectOpen: true, projectSession: 8, workspaceScenarioLink: null })).toBe('idle');
  });
});
