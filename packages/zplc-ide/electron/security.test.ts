import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_DEVELOPMENT_RENDERER_PORT,
  createContentSecurityPolicy,
  isAllowedNativeSimulationRequest,
  isAllowedWorkspaceTestRequest,
  isAllowedWorkspaceTestRunRequest,
  isAllowedFirmwareBuildRequest,
  isAllowedCandidateChangeSetReviewRequest,
  isAllowedAiProviderConfig,
  isAllowedAiProviderKey,
  isAllowedAiProviderRequest,
  sanitizeToolExecution,
  sanitizeCandidateChangeSetReview,
  sanitizeWorkspaceSafetyCheck,
  isExpectedRendererDocument,
  isTrustedRenderer,
  parseTrustedDevelopmentRendererPort,
  trustedDevelopmentRendererUrl,
} from './security';

const trustedSender = { mainFrame: { url: 'http://localhost:3000/' } };
const trustedWindow = { webContents: trustedSender };
const trustedEvent = { sender: trustedSender, senderFrame: trustedSender.mainFrame };

describe('Electron security boundary', () => {
  it('accepts only the exact main renderer frame and document URL', () => {
    expect(isTrustedRenderer(trustedEvent, trustedWindow, 'http://localhost:3000/')).toBe(true);
    expect(isTrustedRenderer({ ...trustedEvent, senderFrame: {} }, trustedWindow, 'http://localhost:3000/')).toBe(false);
    expect(isTrustedRenderer({ ...trustedEvent, sender: {} }, trustedWindow, 'http://localhost:3000/')).toBe(false);
    expect(isTrustedRenderer(trustedEvent, null, 'http://localhost:3000/')).toBe(false);
    expect(isTrustedRenderer(trustedEvent, trustedWindow, 'http://localhost:3000/other')).toBe(false);
    expect(isTrustedRenderer(trustedEvent, trustedWindow, 'http://localhost:3000/?query=ignored#hash')).toBe(true);
  });

  it('compares renderer documents fail-closed while ignoring search and hash', () => {
    expect(isExpectedRendererDocument('http://localhost:3000/?query=1#section', 'http://localhost:3000/')).toBe(true);
    expect(isExpectedRendererDocument('http://localhost:3000/other', 'http://localhost:3000/')).toBe(false);
    expect(isExpectedRendererDocument('https://localhost:3000/', 'http://localhost:3000/')).toBe(false);
    expect(isExpectedRendererDocument('not a url', 'http://localhost:3000/')).toBe(false);
    expect(isExpectedRendererDocument('http://localhost:43127/', 'http://localhost:3000/')).toBe(false);
  });

  it('admits only a canonical loopback development port', () => {
    expect(DEFAULT_DEVELOPMENT_RENDERER_PORT).toBe(3000);
    expect(parseTrustedDevelopmentRendererPort('43127')).toBe(43127);
    for (const value of ['', '0', '1', '1023', '65536', '-43127', '43127.0', ' 43127', '43127 ', '0xa877', 'localhost:43127', 'http://localhost:43127/']) {
      expect(parseTrustedDevelopmentRendererPort(value)).toBeNull();
    }
    expect(trustedDevelopmentRendererUrl(43127)).toBe('http://localhost:43127/');
    expect(() => trustedDevelopmentRendererUrl(1)).toThrow();
  });

  it('accepts only the exact native simulation request envelope and method allowlist', () => {
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method: 'status.get', params: {} })).toBe(true);
    expect(isAllowedNativeSimulationRequest({ id: '', type: 'request', method: 'status.get', params: {} })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'bad id', type: 'request', method: 'status.get', params: {} })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'a'.repeat(64), type: 'request', method: 'status.get', params: {} })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'event', method: 'status.get', params: {} })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method: 'session.shutdown', params: {} })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method: 'shell.exec', params: {} })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method: 'flash', params: {} })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method: 'status.get', params: [] })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method: 'status.get', params: null })).toBe(false);
    expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method: 'status.get', params: {}, extra: true })).toBe(false);
  });

  it('accepts only a canonical opaque workspace test token envelope', () => {
    const valid = { workspaceId: '0f2ce877-e0d6-43ca-89a7-df17a4927f51' };
    expect(isAllowedWorkspaceTestRequest(valid)).toBe(true);
    expect(isAllowedWorkspaceTestRequest({ workspaceId: valid.workspaceId, extra: true })).toBe(false);
    expect(isAllowedWorkspaceTestRequest({ workspaceId: valid.workspaceId.toUpperCase() })).toBe(false);
    expect(isAllowedWorkspaceTestRequest({ workspaceId: '0f2ce877-e0d6-53ca-89a7-df17a4927f51' })).toBe(false);
    expect(isAllowedWorkspaceTestRequest({ workspaceId: 'not-a-token' })).toBe(false);
    expect(isAllowedWorkspaceTestRequest([])).toBe(false);
    expect(isAllowedWorkspaceTestRequest(Object.create(null))).toBe(false);
  });

  it('admits an optional bounded ASCII scenario selector only for scenario runs', () => {
    const workspaceId = '0f2ce877-e0d6-43ca-89a7-df17a4927f51';
    expect(isAllowedWorkspaceTestRunRequest({ workspaceId })).toBe(true);
    expect(isAllowedWorkspaceTestRunRequest({ workspaceId, scenarioId: 'MotorStartStop' })).toBe(true);
    expect(isAllowedWorkspaceTestRunRequest({ workspaceId, scenarioId: 'motor-v1:restart_2' })).toBe(true);

    for (const value of [
      { workspaceId, scenarioId: '' },
      { workspaceId, scenarioId: 'x'.repeat(129) },
      { workspaceId, scenarioId: 'motor\nrestart' },
      { workspaceId, scenarioId: 'motor\0restart' },
      { workspaceId, scenarioId: 'motor-é' },
      { workspaceId, scenarioId: 'motor restart' },
      { workspaceId, scenarioId: '../motor' },
      { workspaceId, extra: true },
      { workspaceId, scenarioId: 'motor', extra: true },
      { workspaceId: workspaceId.toUpperCase(), scenarioId: 'motor' },
      Object.create(null),
    ]) expect(isAllowedWorkspaceTestRunRequest(value)).toBe(false);

    expect(isAllowedWorkspaceTestRequest({ workspaceId, scenarioId: 'motor' })).toBe(false);
  });

  it('projects only exact metadata-only execution envelopes', () => {
    const execution = { schemaVersion: 1, jobId: '0f2ce877-e0d6-43ca-89a7-df17a4927f51', actor: 'human-studio', permission: 'compiler:check', operation: 'compile', outcome: 'passed', startedAt: '2026-08-31T00:00:00.000Z', finishedAt: '2026-08-31T00:00:01.000Z' };
    expect(sanitizeToolExecution(execution)).toEqual(execution);
    expect(sanitizeToolExecution({ ...execution, root: '/private' })).toBeNull();
    expect(sanitizeToolExecution({ ...execution, finishedAt: execution.startedAt })).toEqual({ ...execution, finishedAt: execution.startedAt });
    expect(sanitizeToolExecution({ ...execution, finishedAt: '2026-08-30T00:00:00.000Z' })).toBeNull();
    expect(sanitizeToolExecution({ ...execution, actor: 'unknown' })).toBeNull();
    expect(sanitizeToolExecution({ ...execution, permission: 'firmware:flash' })).toBeNull();
    expect(sanitizeToolExecution({ ...execution, operation: 'firmware-flash' })).toBeNull();
    expect(sanitizeToolExecution({ ...execution, permission: 'tests:run' })).toBeNull();
    const review = { ...execution, actor: 'agent', permission: 'tests:run', operation: 'change-set-review' };
    expect(sanitizeToolExecution(review)).toEqual(review);
    Object.defineProperty(review, 'operation', { value: 'change-set-review', enumerable: false });
    expect(sanitizeToolExecution(review)).toBeNull();
  });

  it('projects only bounded declared interlock coverage and fails closed for hostile safety results', () => {
    const pair = { outputs: ['Motor.Forward', 'Motor.Reverse'] };
    const covered = {
      ok: true,
      summary: { configured: true, declared: [pair], covered: [pair], uncovered: [] },
      evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'passed', diagnostics: [], artifacts: [] },
    };
    expect(sanitizeWorkspaceSafetyCheck(covered)).toEqual(covered);
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, root: '/private/workspace' })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, summary: { ...covered.summary, covered: [], uncovered: [] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, summary: { ...covered.summary, uncovered: [pair] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, summary: { configured: true, declared: [], covered: [], uncovered: [] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, summary: { ...covered.summary, declared: [pair, { outputs: ['Motor.Reverse', 'Motor.Forward'] }], covered: [pair, { outputs: ['Motor.Reverse', 'Motor.Forward'] }] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, evidence: { ...covered.evidence, artifacts: [{ kind: 'trace' }] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, evidence: { ...covered.evidence, diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED', path: '/private/workspace' }] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, evidence: { ...covered.evidence, diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED', message: 'secret' }] } })).toBeNull();
    const uncovered = { ok: false, summary: { configured: true, declared: [pair], covered: [], uncovered: [pair] }, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED' }], artifacts: [] } };
    expect(sanitizeWorkspaceSafetyCheck(uncovered)).toEqual(uncovered);
    expect(sanitizeWorkspaceSafetyCheck({ ...uncovered, evidence: { ...uncovered.evidence, diagnostics: [{ code: 'SAFETY_SCENARIO_INVALID' }] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...uncovered, evidence: { ...uncovered.evidence, diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED' }, { code: 'SAFETY_INTERLOCK_UNCOVERED' }] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...uncovered, evidence: { ...uncovered.evidence, diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED', path: 'tests/motor.scenario.json' }] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ...covered, summary: { configured: true, declared: [{ outputs: [`${'A'.repeat(64)}.${'B'.repeat(64)}`, 'Motor.Reverse'] }], covered: [{ outputs: [`${'A'.repeat(64)}.${'B'.repeat(64)}`, 'Motor.Reverse'] }], uncovered: [] } })).toBeNull();
    expect(sanitizeWorkspaceSafetyCheck({ ok: false, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: [{ code: 'SAFETY_SCENARIO_INVALID', path: 'tests/motor.scenario.json' }], artifacts: [] } })).toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: [{ code: 'SAFETY_SCENARIO_INVALID', path: 'tests/motor.scenario.json' }], artifacts: [] } });
    expect(sanitizeWorkspaceSafetyCheck({ ok: false, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: [{ code: 'SAFETY_UNBOUNDED_WHILE', path: 'src/Main.st', line: 3, message: 'ignored', phase: 'analysis' }], artifacts: [] } })).toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: [{ code: 'SAFETY_UNBOUNDED_WHILE', path: 'src/Main.st', line: 3 }], artifacts: [] } });
    expect(sanitizeWorkspaceSafetyCheck({ ok: false, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: [{ code: 'SAFETY_UNBOUNDED_REPEAT', path: '/escape', line: 0 }], artifacts: [] } })).toBeNull();
    const getter = Object.defineProperty({}, 'ok', { enumerable: true, get: () => { throw new Error('must not read'); } });
    const revoked = Proxy.revocable(covered, {}); revoked.revoke();
    for (const value of [getter, revoked.proxy]) {
      expect(() => sanitizeWorkspaceSafetyCheck(value)).not.toThrow();
      expect(sanitizeWorkspaceSafetyCheck(value)).toBeNull();
    }
  });

  it('accepts only the exact, canonical root-free firmware build request', () => {
    expect(isAllowedFirmwareBuildRequest({ ideId: 'nucleo_h743zi' })).toBe(true);
    for (const value of [
      {}, { ideId: '' }, { ideId: 'Nucleo_h743zi' }, { ideId: '../nucleo_h743zi' },
      { ideId: 'nucleo-h743zi' }, { ideId: 'nucleo_h743zi', root: '/tmp' },
      { ideId: 'a'.repeat(65) }, Object.create(null),
    ]) expect(isAllowedFirmwareBuildRequest(value)).toBe(false);
  });

  it('admits one bounded existing-shaped ST candidate edit and fails closed for hostile inputs', () => {
    const workspaceId = '0f2ce877-e0d6-43ca-89a7-df17a4927f51';
    const valid = { workspaceId, edit: { path: 'src/Motor.st', content: 'PROGRAM Motor\nEND_PROGRAM' } };
    expect(isAllowedCandidateChangeSetReviewRequest(valid)).toBe(true);
    for (const value of [
      {}, { workspaceId }, { workspaceId, edit: {} }, { workspaceId, edit: { path: 'src/Motor.st' } },
      { workspaceId, edit: { path: 'src/Motor.st', content: 'x', extra: true } }, { workspaceId, edit: { path: 'src/Motor.st', content: 'x' }, extra: true },
      { workspaceId, edit: { path: '../Motor.st', content: 'x' } }, { workspaceId, edit: { path: '/src/Motor.st', content: 'x' } },
      { workspaceId, edit: { path: 'src\\Motor.st', content: 'x' } }, { workspaceId, edit: { path: 'src/nested/Motor.st', content: 'x' } },
      { workspaceId, edit: { path: 'src/Motor.ld', content: 'x' } }, { workspaceId, edit: { path: 'src/Motor.st\0', content: 'x' } },
      { workspaceId, edit: { path: 'src/Motor.st\n', content: 'x' } }, { workspaceId, edit: { path: `src/${'x'.repeat(506)}.st`, content: 'x' } },
      { workspaceId, edit: { path: 'src/Motor.st', content: 'x'.repeat(256 * 1024 + 1) } }, { workspaceId: workspaceId.toUpperCase(), edit: valid.edit },
      Object.create(null), [],
    ]) expect(isAllowedCandidateChangeSetReviewRequest(value)).toBe(false);
    const accessor = { workspaceId, edit: valid.edit }; Object.defineProperty(accessor, 'workspaceId', { enumerable: true, get: () => { throw new Error('must not read'); } });
    const hiddenExtra = { ...valid }; Object.defineProperty(hiddenExtra, 'extra', { value: true });
    const revoked = Proxy.revocable(valid, {}); revoked.revoke();
    expect(() => isAllowedCandidateChangeSetReviewRequest(accessor)).not.toThrow();
    expect(isAllowedCandidateChangeSetReviewRequest(accessor)).toBe(false);
    expect(isAllowedCandidateChangeSetReviewRequest(hiddenExtra)).toBe(false);
    expect(() => isAllowedCandidateChangeSetReviewRequest(revoked.proxy)).not.toThrow();
    expect(isAllowedCandidateChangeSetReviewRequest(revoked.proxy)).toBe(false);
  });

  it('admits only bounded inert AI context and rejects renderer-controlled provider or physical fields', () => {
    const workspaceId = '0f2ce877-e0d6-43ca-89a7-df17a4927f51';
    expect(isAllowedAiProviderRequest({ workspaceId, mode: 'ask', prompt: 'Explain this' })).toBe(true);
    expect(isAllowedAiProviderRequest({ workspaceId, mode: 'edit', prompt: 'Fix', activeFile: { fileId: 'file:src/Main.st', path: 'src/Main.st' } })).toBe(true);
    expect(isAllowedAiProviderRequest({ workspaceId, mode: 'debug', prompt: 'Why?', diagnostics: [{ code: 'E_TEST', path: 'src/Main.st', line: 1 }], trace: [{ atMs: 1, signal: 'Q.Motor', value: true }] })).toBe(true);
    for (const value of [
      { workspaceId, mode: 'ask', prompt: 'x', endpoint: 'https://evil.test' },
      { workspaceId, mode: 'edit', prompt: 'x', activeFile: { fileId: 'x', path: 'src/Main.st' }, source: 'secret' },
      { workspaceId, mode: 'edit', prompt: 'x', activeFile: { fileId: 'file:src/Other.st', path: 'src/Main.st' } },
      { workspaceId, mode: 'ask', prompt: 'x'.repeat(4097) },
      { workspaceId, mode: 'plan', prompt: 'x', diagnostics: [] },
      { workspaceId, mode: 'debug', prompt: 'x', terminal: 'serial' },
      { workspaceId, mode: 'debug', prompt: 'x', diagnostics: Array(33).fill({ code: 'E' }) },
    ]) expect(isAllowedAiProviderRequest(value)).toBe(false);
    expect(isAllowedAiProviderConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test' })).toBe(true);
    expect(isAllowedAiProviderConfig({ enabled: true, endpoint: 'https://api.example.test', model: 'gpt-test', key: 'secret' })).toBe(false);
    expect(isAllowedAiProviderKey('x'.repeat(16 * 1024))).toBe(true);
    expect(isAllowedAiProviderKey('bad key')).toBe(false);
    expect(isAllowedAiProviderKey('x'.repeat(16 * 1024 + 1))).toBe(false);
  });

  it('projects only verified candidate evidence and never serializes private values', () => {
    const sha = 'a'.repeat(64); const path = 'src/Motor.st';
    const source = {
      schemaVersion: 1, accepted: true, evidenceScope: 'native-posix-host',
      changeSet: { sha256: sha, changes: [{ path, kind: 'modify', before: { sha256: sha, byteLength: 1 }, after: { sha256: sha, byteLength: 2 } }] },
      evidence: { schemaVersion: 1, operation: 'test', outcome: 'passed', diagnostics: [{ code: 'SAFE', path, line: 1, column: 2, message: 'secret' }], artifacts: [{ kind: 'zplc', sha256: sha, byteLength: 3 }, { kind: 'trace', sha256: sha, byteLength: 4, traceFile: '/tmp/secret' }] },
      savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 2 }, preview: { root: '/tmp/secret', content: 'secret' }, root: '/tmp/secret',
    };
    const safe = sanitizeCandidateChangeSetReview(source, path);
    expect(safe).toMatchObject({ accepted: true, evidenceScope: 'native-posix-host', changeSet: { changes: [{ path }] }, evidence: { outcome: 'passed', artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] } });
    const serialized = JSON.stringify(safe);
    for (const forbidden of ['secret', '/tmp', 'preview', 'traceFile', 'message', 'root', 'content']) expect(serialized).not.toContain(forbidden);
    expect(sanitizeCandidateChangeSetReview({ ...source, evidence: { ...source.evidence, artifacts: [{ kind: 'zplc', sha256: sha, byteLength: 3 }] } }, path)).toBeNull();
    expect(sanitizeCandidateChangeSetReview({ ...source, changeSet: { ...source.changeSet, changes: [{ ...source.changeSet.changes[0], before: { sha256: 'x'.repeat(64), byteLength: 1 } }] } }, path)).toBeNull();
    expect(sanitizeCandidateChangeSetReview({ ...source, changeSet: { ...source.changeSet, changes: [{ ...source.changeSet.changes[0], after: { sha256: sha } }] } }, path)).toBeNull();
    const sparseZplc = new Array(2); sparseZplc[1] = { kind: 'zplc', sha256: sha, byteLength: 3 };
    const sparseTrace = new Array(2); sparseTrace[0] = { kind: 'trace', sha256: sha, byteLength: 4 };
    expect(sanitizeCandidateChangeSetReview({ ...source, evidence: { ...source.evidence, artifacts: sparseZplc } }, path)).toBeNull();
    expect(sanitizeCandidateChangeSetReview({ ...source, evidence: { ...source.evidence, artifacts: sparseTrace } }, path)).toBeNull();
    const sparseDiagnostics = new Array(1);
    expect(sanitizeCandidateChangeSetReview({ ...source, evidence: { ...source.evidence, diagnostics: sparseDiagnostics } }, path)).toBeNull();
    const hostileDiagnostics = [{ code: 'SAFE' }]; Object.defineProperty(hostileDiagnostics, '0', { enumerable: true, get: () => { throw new Error('must not read'); } });
    expect(sanitizeCandidateChangeSetReview({ ...source, evidence: { ...source.evidence, diagnostics: hostileDiagnostics } }, path)).toBeNull();
    expect(sanitizeCandidateChangeSetReview({ ...source, accepted: false, evidence: { ...source.evidence, outcome: 'failed' } }, path)).toMatchObject({ accepted: false });
    const malicious = new Proxy(source, { getOwnPropertyDescriptor: () => { throw new Error('must not read'); } });
    expect(() => sanitizeCandidateChangeSetReview(malicious, path)).not.toThrow();
    expect(sanitizeCandidateChangeSetReview(malicious, path)).toBeNull();
  });

  it('validates exact params for every native simulation method', () => {
    for (const method of [
      'execution.start', 'execution.stop', 'execution.pause', 'execution.resume',
      'execution.step', 'execution.reset', 'status.get', 'breakpoint.clear',
      'breakpoint.list', 'force.clear_all', 'force.list',
    ]) {
      expect(isAllowedNativeSimulationRequest({ id: 'req-1', type: 'request', method, params: {} })).toBe(true);
    }

    for (const input_id of ['motor.start', 'motor.stop', 'motor.estop']) {
      expect(isAllowedNativeSimulationRequest({
        id: 'req-1', type: 'request', method: 'simulation.input.set',
        params: { input_id, active: true, program_generation: 1 },
      })).toBe(true);
    }

    expect(isAllowedNativeSimulationRequest({
      id: 'req-1', type: 'request', method: 'program.load', params: { bytecode_hex: '00ff' },
    })).toBe(true);
    expect(isAllowedNativeSimulationRequest({
      id: 'req-1', type: 'request', method: 'memory.read', params: { address: 65535, length: 1 },
    })).toBe(true);
    expect(isAllowedNativeSimulationRequest({
      id: 'req-1', type: 'request', method: 'memory.write', params: { address: 65472, bytes_hex: 'AA'.repeat(64) },
    })).toBe(true);
    expect(isAllowedNativeSimulationRequest({
      id: 'req-1', type: 'request', method: 'force.set', params: { address: 65520, bytes_hex: 'aa'.repeat(16) },
    })).toBe(true);
    expect(isAllowedNativeSimulationRequest({
      id: 'req-1', type: 'request', method: 'force.clear', params: { address: 0 },
    })).toBe(true);
    expect(isAllowedNativeSimulationRequest({
      id: 'req-1', type: 'request', method: 'breakpoint.add', params: { pc: 65535 },
    })).toBe(true);
    expect(isAllowedNativeSimulationRequest({
      id: 'req-1', type: 'request', method: 'breakpoint.remove', params: { pc: 0 },
    })).toBe(true);
  });

  it('rejects malformed, oversized, and out-of-range native simulation params', () => {
    const request = (method: string, params: Record<string, unknown>) => ({
      id: 'req-1', type: 'request', method, params,
    });

    expect(isAllowedNativeSimulationRequest(request('status.get', { extra: true }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.read', { address: 0 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.read', { address: 65535, length: 2 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.read', { address: -1, length: 1 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.read', { address: 1.5, length: 1 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.read', { address: '0', length: 1 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.read', { address: 0, length: 0 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.read', { address: 0, length: 65 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.write', { address: 0, bytes_hex: '' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.write', { address: 0, bytes_hex: '0' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.write', { address: 0, bytes_hex: '0G' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.write', { address: 65535, bytes_hex: '0000' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('memory.write', { address: 0, bytes_hex: 'AA'.repeat(65) }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('force.set', { address: 0, bytes_hex: 'AA'.repeat(17) }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('force.set', { address: 65535, bytes_hex: '0000' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('force.clear', { address: 65536 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('breakpoint.add', { pc: -1 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('breakpoint.remove', { pc: 1.5 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('program.load', { bytecode_hex: '' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('program.load', {}))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('program.load', { bytecode_hex: '00', extra: true }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('program.load', { bytecode_hex: '00g0' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('program.load', { bytecode_hex: '0' }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('program.load', { bytecode_hex: 'AA'.repeat(4100) }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('simulation.input.set', { input_id: 'motor.overload', active: true, program_generation: 1 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('simulation.input.set', { input_id: 'motor.start', active: 1, program_generation: 1 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('simulation.input.set', { input_id: 'motor.start', active: true, program_generation: 0 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('simulation.input.set', { input_id: 'motor.start', active: true, program_generation: 0x1_0000_0000 }))).toBe(false);
    expect(isAllowedNativeSimulationRequest(request('simulation.input.set', { input_id: 'motor.start', active: true, program_generation: 1, address: 0 }))).toBe(false);
  });

  it('accepts the last native request line that fits and rejects the first that does not', () => {
    const lineBytes = (request: Record<string, unknown>) => new TextEncoder().encode(`${JSON.stringify(request)}\n`).length;
    const programLoadForLineLength = (id: string, lineLength: number) => {
      const request = { id, type: 'request', method: 'program.load', params: { bytecode_hex: '' } };
      const bytecodeHexLength = lineLength - lineBytes(request);
      expect(bytecodeHexLength % 2).toBe(0);
      request.params.bytecode_hex = 'AA'.repeat(bytecodeHexLength / 2);
      return request;
    };

    const lastThatFits = programLoadForLineLength('req-1', 8191);
    const firstThatDoesNotFit = programLoadForLineLength('req-12', 8192);

    expect(lineBytes(lastThatFits)).toBe(8191);
    expect(isAllowedNativeSimulationRequest(lastThatFits)).toBe(true);
    expect(lineBytes(firstThatDoesNotFit)).toBe(8192);
    expect(isAllowedNativeSimulationRequest(firstThatDoesNotFit)).toBe(false);
  });

  it('builds a constrained CSP for packaged and development renderers', () => {
    const production = createContentSecurityPolicy(false);
    expect(production).toContain("default-src 'self'");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain('http:');
    expect(production).not.toContain('ws:');
    expect(production).toContain("worker-src 'self' blob:");

    const development = createContentSecurityPolicy(true);
    expect(development).toContain('http://localhost:3000');
    expect(development).toContain('ws://localhost:3000');
    expect(development).not.toContain("'unsafe-eval'");

    const smoke = createContentSecurityPolicy(true, 43127);
    expect(smoke).toContain('http://localhost:43127');
    expect(smoke).toContain('ws://localhost:43127');
    expect(smoke).not.toContain('localhost:3000');
  });
});
