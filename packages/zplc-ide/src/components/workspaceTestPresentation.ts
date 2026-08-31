import type { ScenarioKind } from '../test-engine';

export type WorkspaceTestResultKind = 'passed' | 'assertion-failed' | 'cancelled' | 'timeout' | 'infrastructure-unavailable' | 'invalid';

export interface WorkspaceTestDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface WorkspaceTestArtifact {
  kind: 'zplc' | 'trace';
  sha256: string;
  byteLength: number;
}

export interface CanonicalWorkspaceBuildEvidence {
  projectSession: number;
  compilerRunId: number;
  workspaceId: string;
  zplc: WorkspaceTestArtifact;
}

export interface WorkspaceTestBuildLink {
  kind: 'verified' | 'not-linked';
  zplc?: WorkspaceTestArtifact;
  trace?: WorkspaceTestArtifact;
}

export interface WorkspaceTestPreview {
  traceEvidenceSha256: string;
  totalScenarioCount: number;
  scenarios: Array<{
    id: string; path: string; passed: boolean; totalSamples: number; totalSignals: number; totalAssertions: number; truncated: boolean;
    assertions: Array<{ kind: ScenarioKind; passed: boolean; atMs?: number }>;
    samples: Array<{ atMs: number; outputs: Record<string, boolean>; plant?: { kind: 'motor-v1'; atSpeedInput: boolean; speedPermilleAfterTick: number } | { kind: 'conveyor-v1'; seed: 0; partAtClassifierInput: boolean; metalDetectedInput: boolean; partAtDiverterInput: boolean; jamDetectedInput: boolean; classifiedCountAfterTick: number } | { kind: 'tank-v1'; levelLowInput: boolean; levelHighInput: boolean; levelPermilleAfterTick: number } | { kind: 'pedestrian-v1'; requestInput: boolean; phaseAfterTick: 'approaching' | 'waiting' | 'crossing' | 'cleared' } }>;
  }>;
}
export interface SavedTestInputIdentity { schemaVersion: 1; sha256: string; fileCount: number; }

export interface WorkspaceTestPresentation {
  operation?: 'test' | 'scenario-run';
  kind: WorkspaceTestResultKind;
  message: string;
  scenarioCount?: number;
  diagnostics: WorkspaceTestDiagnostic[];
  artifacts: WorkspaceTestArtifact[];
  hasEvidence: boolean;
  preview?: WorkspaceTestPreview;
  savedTestInputIdentity?: SavedTestInputIdentity;
}

export interface CandidateChangeSetReviewPresentation {
  kind: 'accepted' | 'rejected' | 'invalid';
  diagnostics: Array<{ code: string }>;
  artifacts: WorkspaceTestArtifact[];
  savedTestInputIdentity?: SavedTestInputIdentity;
}

export interface RecordedMotorOutput {
  signals: Array<'Motor.Forward' | 'Motor.Reverse'>;
  samples: Array<{ atMs: number; outputs: Partial<Record<'Motor.Forward' | 'Motor.Reverse', boolean>> }>;
}

export interface RecordedMotorPlant {
  kind: 'motor-v1';
  samples: Array<{ atMs: number; command: boolean; running: boolean; atSpeed: boolean; speedPermilleAfterTick: number }>;
}

export interface RecordedConveyorPlant {
  kind: 'conveyor-v1';
  samples: Array<{
    atMs: number;
    beltCommand: boolean;
    diverterCommand: boolean;
    faultLamp: boolean;
    partAtClassifierInput: boolean;
    metalDetectedInput: boolean;
    partAtDiverterInput: boolean;
    jamDetectedInput: boolean;
    classifiedCountAfterTick: number;
  }>;
}

export interface RecordedPedestrianCrossing {
  kind: 'pedestrian-v1';
  samples: Array<{ atMs: number; vehicle: 'RED' | 'YELLOW' | 'GREEN' | 'CLEAR'; pedestrian: 'WALK' | 'STOP'; request: 'ACTIVE' | 'CLEAR'; phase: 'APPROACHING' | 'WAITING' | 'CROSSING' | 'CLEARED' }>;
}

export interface RecordedTankLevel {
  kind: 'tank-v1';
  samples: Array<{ atMs: number; pump: 'RUNNING' | 'STOPPED'; alarm: 'ALARM' | 'NORMAL'; levelLowInput: boolean; levelHighInput: boolean; levelPermilleAfterTick: number }>;
}

export type WorkspaceTestAvailability = 'desktop-unavailable' | 'project-required' | 'virtual-project' | 'link-required' | 'unsaved' | 'ready';

export interface WorkspaceCompileDiagnostic {
  code: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export type WorkspaceCompilePresentation =
  | { ok: true; summary: { name: string; taskCount: number; codeSize: number }; artifact: { zplcFile: Uint8Array; bytecode: Uint8Array; assembly: string; debugMap: Record<string, unknown> }; zplcEvidence: WorkspaceTestArtifact }
  | { ok: false; diagnostics: WorkspaceCompileDiagnostic[] };

/** Pure, non-authoritative Console copy state; store guards remain the authority. */
export function workspaceTestAvailability(input: {
  desktopAvailable: boolean;
  isProjectOpen: boolean;
  isVirtualProject: boolean;
  hasCurrentLink: boolean;
  hasUnsavedChanges: boolean;
}): WorkspaceTestAvailability {
  if (!input.desktopAvailable) return 'desktop-unavailable';
  if (!input.isProjectOpen) return 'project-required';
  if (input.isVirtualProject) return 'virtual-project';
  if (!input.hasCurrentLink) return 'link-required';
  return input.hasUnsavedChanges ? 'unsaved' : 'ready';
}

/** Selects the only compiler allowed for the current trust boundary. */
export function resolveWorkspaceCompileRoute(input: {
  isElectronHost: boolean;
  canonicalCompileAvailable: boolean;
  isProjectOpen: boolean;
  isVirtualProject: boolean;
  hasCurrentLink: boolean;
  hasUnsavedChanges: boolean;
}): 'canonical' | 'canonical-unavailable' | 'link-required' | 'save-required' | 'renderer' {
  if (!input.isProjectOpen || input.isVirtualProject || !input.isElectronHost) return 'renderer';
  if (!input.canonicalCompileAvailable) return 'canonical-unavailable';
  if (!input.hasCurrentLink) return 'link-required';
  return input.hasUnsavedChanges ? 'save-required' : 'canonical';
}

/** Admission fence for an async host-test result; the Console owns rendering. */
export function isWorkspaceTestRunCurrent(
  current: { projectSession: number; compilerRunId: number; workspaceScenarioLink: { workspaceId: string; projectSession: number } | null },
  expected: { projectSession: number; compilerRunId: number; workspaceId: string },
): boolean {
  return current.projectSession === expected.projectSession
    && current.compilerRunId === expected.compilerRunId
    && current.workspaceScenarioLink?.projectSession === expected.projectSession
    && current.workspaceScenarioLink.workspaceId === expected.workspaceId;
}

/** Links only recorded host-test artifacts to the current canonical workspace build. */
export function classifyWorkspaceTestBuildLink(
  current: { projectSession: number; compilerRunId: number; workspaceScenarioLink: { workspaceId: string; projectSession: number } | null },
  build: CanonicalWorkspaceBuildEvidence | null,
  test: { presentation: WorkspaceTestPresentation; projectSession: number; compilerRunId: number; workspaceId: string } | null,
): WorkspaceTestBuildLink {
  if (!build || !test || !isWorkspaceTestRunCurrent(current, build) || !isWorkspaceTestRunCurrent(current, test)) return { kind: 'not-linked' };
  const zplc = test.presentation.artifacts.filter((artifact) => artifact.kind === 'zplc');
  const trace = test.presentation.artifacts.filter((artifact) => artifact.kind === 'trace');
  if (zplc.length !== 1 || trace.length !== 1
    || zplc[0].sha256 !== build.zplc.sha256 || zplc[0].byteLength !== build.zplc.byteLength) return { kind: 'not-linked' };
  return { kind: 'verified', zplc: zplc[0], trace: trace[0] };
}

/** Honest post-run state when a stale result was intentionally discarded. */
export function workspaceTestRunFallbackState(
  current: { isProjectOpen: boolean; isVirtualProject: boolean; projectSession: number; workspaceScenarioLink: { workspaceId: string; projectSession: number } | null },
): 'selected' | 'idle' {
  return current.isProjectOpen && !current.isVirtualProject && current.workspaceScenarioLink?.projectSession === current.projectSession
    ? 'selected'
    : 'idle';
}

/** Prevent a late manifest-registration failure from altering a replacement project. */
export function isWorkspaceManifestRegistrationCurrent(projectSession: number, expectedProjectSession: number): boolean {
  return projectSession === expectedProjectSession;
}

const unavailable = (evidence?: { diagnostics: WorkspaceTestDiagnostic[]; artifacts: WorkspaceTestArtifact[] }, hasEvidence = evidence?.artifacts.some((artifact) => artifact.kind === 'trace') ?? false): WorkspaceTestPresentation => ({
  kind: 'infrastructure-unavailable',
  message: 'Host POSIX simulation is unavailable.',
  diagnostics: evidence?.diagnostics ?? [],
  artifacts: evidence?.artifacts ?? [],
  hasEvidence,
});

const DIAGNOSTIC_MESSAGES: Record<string, string> = {
  WORKSPACE_INVALID: 'Workspace is invalid.',
  WORKSPACE_MISSING: 'Workspace is unavailable.',
  WORKSPACE_INVALID_DIRECTORY: 'Workspace directory is invalid.',
  WORKSPACE_SYMLINK: 'Symbolic links are not allowed.',
  WORKSPACE_INVALID_FILE: 'Workspace file is invalid.',
  WORKSPACE_READ_FAILED: 'Workspace file could not be read.',
  WORKSPACE_LIMIT: 'Workspace exceeds a supported limit.',
  WORKSPACE_DUPLICATE_SOURCE: 'Workspace source names must be unique.',
  WORKSPACE_DUPLICATE_SCENARIO: 'Scenario names must be unique.',
  PROJECT_INVALID: 'Project configuration is invalid.',
  PROGRAM_NOT_FOUND: 'Task program could not be resolved.',
  COMPILATION_FAILED: 'Compilation failed.',
  TEST_SCENARIO_INVALID: 'Scenario is invalid.',
  TEST_SCENARIOS_MISSING: 'Workspace has no scenarios.',
  TEST_DUPLICATE_SCENARIO: 'Scenario identifiers must be unique.',
  SCENARIO_TICK_MISMATCH: 'Scenario timing does not match the task.',
  SIMULATION_UNSUPPORTED_PROJECT: 'Project is not supported by host scenarios.',
  TEST_BUDGET_EXCEEDED: 'Scenario execution exceeded its budget.',
  TEST_CANCELLED: 'Scenario run was cancelled.',
  TEST_TIMEOUT: 'Scenario run exceeded its host deadline.',
  SIMULATOR_UNAVAILABLE: 'Host POSIX simulation is unavailable.',
  RUNTIME_FAILED: 'Host POSIX runtime failed.',
  SCENARIO_ASSERTION_FAILED: 'Scenario assertion failed.',
};
const INVALID_DIAGNOSTIC: WorkspaceTestDiagnostic = { code: 'TEST_RESULT_INVALID', message: 'Test result was invalid.' };
const SAVED_TEST_INPUT_FILE_COUNT_MIN = 3;
const SAVED_TEST_INPUT_FILE_COUNT_MAX = 1 + 128 + 64;

function array(value: unknown): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!Number.isSafeInteger(length) || length < 0 || Object.values(descriptors).some((descriptor) => !('value' in descriptor))) return null;
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !('value' in descriptor)) return null;
      snapshot.push(descriptor.value);
    }
    if (Reflect.ownKeys(descriptors).length !== length + 1) return null;
    return snapshot;
  } catch { return null; }
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0 || Object.values(descriptors).some((descriptor) => !('value' in descriptor))) return null;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of Object.entries(descriptors)) if (descriptor.enumerable) snapshot[key] = descriptor.value;
    return snapshot;
  } catch { return null; }
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => Object.hasOwn(value, key)); }

function safePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.includes('\0') || value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) return undefined;
  const segments = value.split(/[\\/]/);
  return segments.some((segment) => segment === '..') ? undefined : value;
}

function diagnostics(value: unknown): WorkspaceTestDiagnostic[] | null {
  const items = array(value);
  if (!items || items.length > 128) return null;
  const result: WorkspaceTestDiagnostic[] = [];
  for (const item of items) {
    const diagnostic = record(item);
    if (!diagnostic || typeof diagnostic.code !== 'string' || diagnostic.code.length === 0) return null;
    const message = Object.hasOwn(DIAGNOSTIC_MESSAGES, diagnostic.code) ? DIAGNOSTIC_MESSAGES[diagnostic.code] : undefined;
    result.push({ ...(message ? { code: diagnostic.code, message } : INVALID_DIAGNOSTIC), ...(safePath(diagnostic.path) ? { path: safePath(diagnostic.path) } : {}) });
  }
  return result;
}

function safeCompilerLocation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000 ? value : undefined;
}

/** Validates the deliberately small main-process compilation envelope before Toolbar uses it. */
export function presentWorkspaceCompileResult(value: unknown): WorkspaceCompilePresentation {
  const result = record(value);
  if (!result || typeof result.ok !== 'boolean') return { ok: false, diagnostics: [] };

  if (!result.ok) {
    const evidence = record(result.evidence);
    const parsed = evidence && evidence.outcome === 'failed' ? diagnostics(evidence.diagnostics) : null;
    if (parsed === null) return { ok: false, diagnostics: [] };
    return {
      ok: false,
      diagnostics: parsed.map((diagnostic, index) => {
        const rawDiagnostics = array(evidence?.diagnostics);
        const raw = rawDiagnostics ? record(rawDiagnostics[index]) : null;
        return {
          ...diagnostic,
          ...(safeCompilerLocation(raw?.line) ? { line: safeCompilerLocation(raw?.line) } : {}),
          ...(safeCompilerLocation(raw?.column) ? { column: safeCompilerLocation(raw?.column) } : {}),
        };
      }),
    };
  }

  const summary = record(result.summary);
  const artifact = record(result.artifact);
  const zplcEvidence = record(result.zplcEvidence);
  const debugMap = artifact && record(artifact.debugMap);
  const taskCount = summary?.taskCount;
  const codeSize = summary?.codeSize;
  if (!summary || !artifact || !debugMap || !zplcEvidence
    || typeof summary.name !== 'string' || summary.name.length === 0 || summary.name.length > 256
    || typeof taskCount !== 'number' || !Number.isSafeInteger(taskCount) || taskCount < 1
    || typeof codeSize !== 'number' || !Number.isSafeInteger(codeSize) || codeSize < 0
    || !(artifact.zplcFile instanceof Uint8Array) || artifact.zplcFile.byteLength === 0
    || !(artifact.bytecode instanceof Uint8Array) || artifact.bytecode.byteLength === 0
    || typeof artifact.assembly !== 'string'
    || !record(debugMap.pou) || !record(debugMap.memoryLayout)
    || typeof zplcEvidence.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(zplcEvidence.sha256)
    || typeof zplcEvidence.byteLength !== 'number' || !Number.isSafeInteger(zplcEvidence.byteLength) || zplcEvidence.byteLength !== artifact.zplcFile.byteLength) return { ok: false, diagnostics: [] };

  return {
    ok: true,
    summary: { name: summary.name, taskCount, codeSize },
    artifact: { zplcFile: artifact.zplcFile, bytecode: artifact.bytecode, assembly: artifact.assembly, debugMap },
    zplcEvidence: { kind: 'zplc', sha256: zplcEvidence.sha256, byteLength: zplcEvidence.byteLength },
  };
}

function artifacts(value: unknown): WorkspaceTestArtifact[] | null {
  const items = array(value);
  if (!items || items.length > 16) return null;
  const result: WorkspaceTestArtifact[] = [];
  for (const item of items) {
    const artifact = record(item);
    if (!artifact) continue;
    const { kind, sha256, byteLength } = artifact;
    if ((kind !== 'zplc' && kind !== 'trace') || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteLength) || typeof byteLength !== 'number' || byteLength <= 0) continue;
    result.push({ kind, sha256, byteLength });
  }
  return result;
}

const CANDIDATE_DIAGNOSTIC_CODES = new Set(['CHANGESET_INVALID', 'CHANGESET_BASE_INVALID', 'CHANGESET_MATERIALIZATION_FAILED', 'CHANGESET_CLEANUP_FAILED']);

/** Redacts an isolated candidate review; acceptance requires exact saved inputs and host evidence. */
export function presentCandidateChangeSetReview(value: unknown, expected: { path: string; beforeSha256: string; afterSha256: string }): CandidateChangeSetReviewPresentation {
  const invalid = (): CandidateChangeSetReviewPresentation => ({ kind: 'invalid', diagnostics: [], artifacts: [] });
  const result = record(value);
  if (!result || Object.keys(result).some((key) => !['schemaVersion', 'accepted', 'evidenceScope', 'changeSet', 'diagnostics', 'evidence', 'savedTestInputIdentity'].includes(key))
    || result.schemaVersion !== 1 || typeof result.accepted !== 'boolean' || result.evidenceScope !== 'native-posix-host') return invalid();

  const rawDiagnostics = result.diagnostics === undefined ? [] : array(result.diagnostics);
  if (!rawDiagnostics || rawDiagnostics.length > 32) return invalid();
  const safeDiagnostics: Array<{ code: string }> = [];
  for (const item of rawDiagnostics) {
    const diagnostic = record(item);
    if (!diagnostic || !onlyKeys(diagnostic, ['code']) || typeof diagnostic.code !== 'string' || !CANDIDATE_DIAGNOSTIC_CODES.has(diagnostic.code)) return invalid();
    safeDiagnostics.push({ code: diagnostic.code });
  }

  const evidence = record(result.evidence);
  const rawEvidenceArtifacts = evidence && array(evidence.artifacts);
  const evidenceArtifacts = evidence && artifacts(evidence.artifacts);
  const evidenceDiagnostics = evidence && array(evidence.diagnostics);
  const safeEvidenceDiagnostics: Array<{ code: string }> = [];
  if (evidenceDiagnostics) for (const item of evidenceDiagnostics) {
    const diagnostic = record(item);
    if (!diagnostic || Object.keys(diagnostic).some((key) => !['code', 'path', 'line', 'column'].includes(key))
      || typeof diagnostic.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,95}$/.test(diagnostic.code)) return invalid();
    safeEvidenceDiagnostics.push({ code: diagnostic.code });
  }
  const validEvidence = evidence && onlyKeys(evidence, ['schemaVersion', 'operation', 'outcome', 'diagnostics', 'artifacts'])
    && evidence.schemaVersion === 1 && evidence.operation === 'test' && (evidence.outcome === 'passed' || evidence.outcome === 'failed')
    && rawEvidenceArtifacts?.length === 2 && evidenceDiagnostics !== null && evidenceArtifacts?.length === 2
    && evidenceArtifacts.filter((artifact) => artifact.kind === 'zplc').length === 1
    && evidenceArtifacts.filter((artifact) => artifact.kind === 'trace').length === 1;
  if (result.evidence !== undefined && !validEvidence) return invalid();
  const passedEvidence = validEvidence && evidence!.outcome === 'passed' && evidenceDiagnostics!.length === 0;
  const identity = savedTestInputIdentity(result.savedTestInputIdentity, { artifacts: evidenceArtifacts ?? [] });
  if (result.savedTestInputIdentity !== undefined && !identity) return invalid();

  const changeSet = record(result.changeSet);
  const changes = changeSet && array(changeSet.changes);
  const change = changes?.length === 1 ? record(changes[0]) : null;
  const before = change && record(change.before); const after = change && record(change.after);
  const boundChange = change && before && after && onlyKeys(change, ['path', 'kind', 'before', 'after'])
    && onlyKeys(before, ['sha256', 'byteLength']) && onlyKeys(after, ['sha256', 'byteLength'])
    && change.path === expected.path && change.kind === 'modify'
    && before.sha256 === expected.beforeSha256 && after.sha256 === expected.afterSha256
    && sha256(before.sha256) && sha256(after.sha256)
    && integerBetween(before.byteLength, 0, 256 * 1024) && integerBetween(after.byteLength, 0, 256 * 1024);
  if (result.accepted) return passedEvidence && identity && boundChange
    ? { kind: 'accepted', diagnostics: [], artifacts: evidenceArtifacts!, savedTestInputIdentity: identity }
    : invalid();
  return { kind: 'rejected', diagnostics: [...safeDiagnostics, ...safeEvidenceDiagnostics], artifacts: validEvidence ? evidenceArtifacts! : [], ...(identity ? { savedTestInputIdentity: identity } : {}) };
}

const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const boundedInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 3_600_000;
const integerBetween = (value: unknown, minimum: number, maximum: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const safeId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const safeSignal = (value: string): boolean => {
  const parts = value.split('.');
  return parts.length === 2 && parts.every((part) => part.length > 0 && part.length <= 128 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(part));
};
const scenarioKind = (value: unknown): value is ScenarioKind => value === 'AT' || value === 'WITHIN' || value === 'FOR' || value === 'EVENTUALLY' || value === 'ALWAYS' || value === 'NEVER' || value === 'UNTIL' || value === 'RISING' || value === 'FALLING';

function preview(value: unknown, evidence: { artifacts: WorkspaceTestArtifact[] }): WorkspaceTestPreview | undefined {
  const source = record(value);
  const totalScenarioCount = source?.totalScenarioCount;
  const sourceScenarios = source && array(source.scenarios);
  if (!source || !onlyKeys(source, ['schemaVersion', 'backend', 'mode', 'traceEvidenceSha256', 'totalScenarioCount', 'scenarios']) || source.schemaVersion !== 1 || source.backend !== 'native-posix' || source.mode !== 'logical-cyclic-task-set-scan' || !sha256(source.traceEvidenceSha256) || !integerBetween(totalScenarioCount, 1, 64) || !sourceScenarios || sourceScenarios.length === 0 || sourceScenarios.length > 8 || !evidence.artifacts.some((artifact) => artifact.kind === 'trace' && artifact.sha256 === source.traceEvidenceSha256)) return undefined;
  const scenarios: WorkspaceTestPreview['scenarios'] = [];
  const identities = new Set<string>();
  for (const item of sourceScenarios) {
    const scenario = record(item);
    const path = scenario && safePath(scenario.path);
    const totalSamples = scenario?.totalSamples; const totalSignals = scenario?.totalSignals; const totalAssertions = scenario?.totalAssertions;
    const scenarioAssertions = scenario && array(scenario.assertions); const scenarioSamples = scenario && array(scenario.samples);
    if (!scenario || !onlyKeys(scenario, ['id', 'path', 'passed', 'totalSamples', 'totalSignals', 'totalAssertions', 'truncated', 'assertions', 'samples']) || !safeId(scenario.id) || !path || identities.has(`${scenario.id}\u0000${path}`) || typeof scenario.passed !== 'boolean' || !integerBetween(totalSamples, 1, 10_000) || !integerBetween(totalSignals, 1, 64) || !integerBetween(totalAssertions, 1, 256) || typeof scenario.truncated !== 'boolean' || !scenarioAssertions || !scenarioSamples || scenarioAssertions.length === 0 || scenarioSamples.length === 0 || scenarioAssertions.length > 32 || scenarioSamples.length > 24) return undefined;
    identities.add(`${scenario.id}\u0000${path}`);
    const assertions: WorkspaceTestPreview['scenarios'][number]['assertions'] = [];
    for (const raw of scenarioAssertions) {
      const assertion = record(raw);
      if (!assertion || !onlyKeys(assertion, assertion.atMs === undefined ? ['kind', 'passed'] : ['kind', 'passed', 'atMs']) || !scenarioKind(assertion.kind) || typeof assertion.passed !== 'boolean' || (assertion.atMs !== undefined && !boundedInteger(assertion.atMs))) return undefined;
      assertions.push({ kind: assertion.kind, passed: assertion.passed, ...(assertion.atMs === undefined ? {} : { atMs: assertion.atMs }) });
    }
    const samples: WorkspaceTestPreview['scenarios'][number]['samples'] = [];
    let previous = -1;
    let sampleSignals: string[] | undefined;
    let hasPlant: boolean | undefined;
    let plantKind: 'motor-v1' | 'conveyor-v1' | 'tank-v1' | 'pedestrian-v1' | undefined;
    for (const raw of scenarioSamples) {
      const sample = record(raw); const outputs = sample && record(sample.outputs);
      const plant = sample && record(sample.plant);
      const sampleHasPlant = plant !== null;
      if (!sample || !onlyKeys(sample, sampleHasPlant ? ['atMs', 'outputs', 'plant'] : ['atMs', 'outputs']) || !boundedInteger(sample.atMs) || sample.atMs <= previous || !outputs || (hasPlant !== undefined && hasPlant !== sampleHasPlant)) return undefined;
      if (plant && ((plant.kind === 'motor-v1' && (!onlyKeys(plant, ['kind', 'atSpeedInput', 'speedPermilleAfterTick']) || typeof plant.atSpeedInput !== 'boolean' || !integerBetween(plant.speedPermilleAfterTick, 0, 1000)))
        || (plant.kind === 'conveyor-v1' && (!onlyKeys(plant, ['kind', 'seed', 'partAtClassifierInput', 'metalDetectedInput', 'partAtDiverterInput', 'jamDetectedInput', 'classifiedCountAfterTick']) || plant.seed !== 0 || typeof plant.partAtClassifierInput !== 'boolean' || typeof plant.metalDetectedInput !== 'boolean' || typeof plant.partAtDiverterInput !== 'boolean' || typeof plant.jamDetectedInput !== 'boolean' || !integerBetween(plant.classifiedCountAfterTick, 0, 1)))
        || (plant.kind === 'tank-v1' && (!onlyKeys(plant, ['kind', 'levelLowInput', 'levelHighInput', 'levelPermilleAfterTick']) || typeof plant.levelLowInput !== 'boolean' || typeof plant.levelHighInput !== 'boolean' || !integerBetween(plant.levelPermilleAfterTick, 0, 1000)))
        || (plant.kind === 'pedestrian-v1' && (!onlyKeys(plant, ['kind', 'requestInput', 'phaseAfterTick']) || typeof plant.requestInput !== 'boolean' || (plant.phaseAfterTick !== 'approaching' && plant.phaseAfterTick !== 'waiting' && plant.phaseAfterTick !== 'crossing' && plant.phaseAfterTick !== 'cleared')))
        || (plant.kind !== 'motor-v1' && plant.kind !== 'conveyor-v1' && plant.kind !== 'tank-v1' && plant.kind !== 'pedestrian-v1'))) return undefined;
      hasPlant = sampleHasPlant;
      if (plant) {
        if (plantKind !== undefined && plantKind !== plant.kind) return undefined;
        plantKind = plant.kind as 'motor-v1' | 'conveyor-v1' | 'tank-v1' | 'pedestrian-v1';
      }
      previous = sample.atMs;
      const entries = Object.entries(outputs);
      if (entries.length === 0 || entries.length > 8 || entries.some(([signal, output]) => !safeSignal(signal) || typeof output !== 'boolean')) return undefined;
      const orderedSignals = entries.map(([signal]) => signal).sort();
      if (sampleSignals && orderedSignals.join('\u0000') !== sampleSignals.join('\u0000')) return undefined;
      if (!sampleSignals) sampleSignals = orderedSignals;
      samples.push({
        atMs: sample.atMs,
        outputs: Object.fromEntries(entries) as Record<string, boolean>,
        ...(plant?.kind === 'motor-v1' ? { plant: { kind: 'motor-v1', atSpeedInput: plant.atSpeedInput as boolean, speedPermilleAfterTick: plant.speedPermilleAfterTick as number } } : {}),
        ...(plant?.kind === 'conveyor-v1' ? { plant: { kind: 'conveyor-v1', seed: 0, partAtClassifierInput: plant.partAtClassifierInput as boolean, metalDetectedInput: plant.metalDetectedInput as boolean, partAtDiverterInput: plant.partAtDiverterInput as boolean, jamDetectedInput: plant.jamDetectedInput as boolean, classifiedCountAfterTick: plant.classifiedCountAfterTick as number } } : {}),
        ...(plant?.kind === 'tank-v1' ? { plant: { kind: 'tank-v1', levelLowInput: plant.levelLowInput as boolean, levelHighInput: plant.levelHighInput as boolean, levelPermilleAfterTick: plant.levelPermilleAfterTick as number } } : {}),
        ...(plant?.kind === 'pedestrian-v1' ? { plant: { kind: 'pedestrian-v1', requestInput: plant.requestInput as boolean, phaseAfterTick: plant.phaseAfterTick as 'approaching' | 'waiting' | 'crossing' | 'cleared' } } : {}),
      });
    }
    if (!sampleSignals || totalSamples < samples.length || totalSignals < sampleSignals.length || totalAssertions < assertions.length || totalScenarioCount < sourceScenarios.length || scenario.truncated !== (totalSamples > samples.length || totalSignals > sampleSignals.length || totalAssertions > assertions.length)) return undefined;
    scenarios.push({ id: scenario.id, path, passed: scenario.passed, totalSamples, totalSignals, totalAssertions, truncated: scenario.truncated, assertions, samples });
  }
  return { traceEvidenceSha256: source.traceEvidenceSha256, totalScenarioCount, scenarios };
}

function testEvidence(value: unknown): { operation: 'test' | 'scenario-run'; diagnostics: WorkspaceTestDiagnostic[]; artifacts: WorkspaceTestArtifact[] } | null {
  const evidence = record(value);
  if (!evidence || evidence.schemaVersion !== 1 || (evidence.operation !== 'test' && evidence.operation !== 'scenario-run') || (evidence.outcome !== 'passed' && evidence.outcome !== 'failed')) return null;
  const safeDiagnostics = diagnostics(evidence.diagnostics);
  const safeArtifacts = artifacts(evidence.artifacts);
  return safeDiagnostics && safeArtifacts ? { operation: evidence.operation, diagnostics: safeDiagnostics, artifacts: safeArtifacts } : null;
}

function savedTestInputIdentity(value: unknown, evidence: { artifacts: WorkspaceTestArtifact[] }): SavedTestInputIdentity | undefined {
  const identity = record(value);
  return identity
    && onlyKeys(identity, ['schemaVersion', 'sha256', 'fileCount'])
    && identity.schemaVersion === 1
    && sha256(identity.sha256)
    && integerBetween(identity.fileCount, SAVED_TEST_INPUT_FILE_COUNT_MIN, SAVED_TEST_INPUT_FILE_COUNT_MAX)
    && evidence.artifacts.some((artifact) => artifact.kind === 'trace')
    ? { schemaVersion: 1, sha256: identity.sha256, fileCount: identity.fileCount }
    : undefined;
}

function validPassedSummary(value: unknown): Array<{ id: string; path: string }> | null {
  const summary = record(value);
  const sourceScenarios = summary && array(summary.scenarios);
  if (!summary || summary.backend !== 'native-posix' || summary.mode !== 'logical-cyclic-task-set-scan' || !sourceScenarios || sourceScenarios.length === 0 || sourceScenarios.length > 64) return null;
  const scenarios: Array<{ id: string; path: string }> = [];
  const identities = new Set<string>();
  for (const scenario of sourceScenarios) {
    const item = record(scenario);
    const { id, path, passed, traceSha256, traceByteLength } = item ?? {};
    const safeSummaryPath = safePath(path);
    const identity = typeof id === 'string' ? id.toLowerCase() : '';
    if (!item || !safeId(id) || !safeSummaryPath || identities.has(identity) || passed !== true || !sha256(traceSha256) || !Number.isSafeInteger(traceByteLength) || typeof traceByteLength !== 'number' || traceByteLength < 0) return null;
    identities.add(identity);
    scenarios.push({ id, path: safeSummaryPath });
  }
  return scenarios;
}

function previewForSuccess(value: unknown, evidence: { artifacts: WorkspaceTestArtifact[] }, summary: Array<{ id: string; path: string }>): WorkspaceTestPreview | undefined {
  const safePreview = preview(value, evidence);
  return safePreview && safePreview.totalScenarioCount === summary.length && safePreview.scenarios.every((scenario) => scenario.passed && summary.some((item) => item.id === scenario.id && item.path === scenario.path)) ? safePreview : undefined;
}

function previewForFailure(value: unknown, evidence: { diagnostics: WorkspaceTestDiagnostic[]; artifacts: WorkspaceTestArtifact[] }): WorkspaceTestPreview | undefined {
  const safePreview = preview(value, evidence);
  if (!safePreview) return undefined;
  const failedPaths = new Set(evidence.diagnostics.filter((diagnostic) => diagnostic.code === 'SCENARIO_ASSERTION_FAILED' && diagnostic.path).map((diagnostic) => diagnostic.path!));
  return safePreview.scenarios.some((scenario) => !scenario.passed && failedPaths.has(scenario.path))
    && safePreview.scenarios.every((scenario) => scenario.passed ? scenario.assertions.every((assertion) => assertion.passed) : scenario.assertions.some((assertion) => !assertion.passed))
    ? safePreview : undefined;
}

/** Projects complete, already-validated scenario evidence; it never represents live output. */
export function presentRecordedMotorOutput(scenario: WorkspaceTestPreview['scenarios'][number]): RecordedMotorOutput | undefined {
  if (scenario.truncated || scenario.samples.length === 0) return undefined;
  const signals = (['Motor.Forward', 'Motor.Reverse'] as const).filter((signal) => Object.hasOwn(scenario.samples[0]!.outputs, signal));
  if (signals.length === 0 || scenario.samples.some((sample) => Object.keys(sample.outputs).length !== signals.length || signals.some((signal) => !Object.hasOwn(sample.outputs, signal)))) return undefined;
  return {
    signals: [...signals],
    samples: scenario.samples.map((sample) => ({
      atMs: sample.atMs,
      outputs: Object.fromEntries(signals.map((signal) => [signal, sample.outputs[signal]])) as Partial<Record<'Motor.Forward' | 'Motor.Reverse', boolean>>,
    })),
  };
}

/** Projects complete, recorded motor-v1 evidence; it never represents a live plant. */
export function presentRecordedMotorPlant(scenario: WorkspaceTestPreview['scenarios'][number]): RecordedMotorPlant | undefined {
  if (scenario.truncated || scenario.samples.length === 0 || scenario.samples.some((sample) => sample.plant?.kind !== 'motor-v1' || typeof sample.outputs['MotorPlant.Command'] !== 'boolean' || typeof sample.outputs['MotorPlant.Running'] !== 'boolean')) return undefined;
  return {
    kind: 'motor-v1',
    samples: scenario.samples.map((sample) => {
      const plant = sample.plant;
      if (!plant || plant.kind !== 'motor-v1') throw new Error('validated motor plant was lost');
      return { atMs: sample.atMs, command: sample.outputs['MotorPlant.Command']!, running: sample.outputs['MotorPlant.Running']!, atSpeed: plant.atSpeedInput, speedPermilleAfterTick: plant.speedPermilleAfterTick };
    }),
  };
}

/** Projects complete, recorded conveyor-v1 evidence; it never represents a live plant. */
export function presentRecordedConveyorPlant(scenario: WorkspaceTestPreview['scenarios'][number]): RecordedConveyorPlant | undefined {
  if (scenario.truncated || scenario.samples.length === 0 || scenario.samples.some((sample) => sample.plant?.kind !== 'conveyor-v1'
    || typeof sample.outputs['Conveyor.BeltCommand'] !== 'boolean'
    || typeof sample.outputs['Conveyor.DiverterCommand'] !== 'boolean'
    || typeof sample.outputs['Conveyor.FaultLamp'] !== 'boolean')) return undefined;
  return {
    kind: 'conveyor-v1',
    samples: scenario.samples.map((sample) => {
      const plant = sample.plant;
      if (!plant || plant.kind !== 'conveyor-v1') throw new Error('validated conveyor plant was lost');
      return {
        atMs: sample.atMs,
        beltCommand: sample.outputs['Conveyor.BeltCommand']!,
        diverterCommand: sample.outputs['Conveyor.DiverterCommand']!,
        faultLamp: sample.outputs['Conveyor.FaultLamp']!,
        partAtClassifierInput: plant.partAtClassifierInput,
        metalDetectedInput: plant.metalDetectedInput,
        partAtDiverterInput: plant.partAtDiverterInput,
        jamDetectedInput: plant.jamDetectedInput,
        classifiedCountAfterTick: plant.classifiedCountAfterTick,
      };
    }),
  };
}

/** Projects exact, complete pedestrian-v1 host evidence; it never represents a live crossing. */
export function presentRecordedPedestrianCrossing(scenario: WorkspaceTestPreview['scenarios'][number]): RecordedPedestrianCrossing | undefined {
  const signals = [
    'PedestrianCrossing.VehicleRed',
    'PedestrianCrossing.VehicleYellow',
    'PedestrianCrossing.VehicleGreen',
    'PedestrianCrossing.PedWalk',
    'PedestrianCrossing.PedStop',
  ] as const;
  if (scenario.id !== 'PedestrianCrossing'
    || scenario.path !== 'tests/pedestrian-crossing.scenario.json'
    || scenario.truncated || scenario.samples.length === 0 || scenario.samples.some((sample) => {
    const outputs = sample.outputs;
    return sample.plant?.kind !== 'pedestrian-v1' || typeof sample.plant.requestInput !== 'boolean'
      || !['approaching', 'waiting', 'crossing', 'cleared'].includes(sample.plant.phaseAfterTick)
      || Object.keys(outputs).length !== signals.length
      || signals.some((signal) => typeof outputs[signal] !== 'boolean');
  })) return undefined;

  const samples: RecordedPedestrianCrossing['samples'] = [];
  for (const sample of scenario.samples) {
    const outputs = sample.outputs;
    const vehicleCount = Number(outputs['PedestrianCrossing.VehicleRed'])
      + Number(outputs['PedestrianCrossing.VehicleYellow'])
      + Number(outputs['PedestrianCrossing.VehicleGreen']);
    const plant = sample.plant;
    if (!plant || plant.kind !== 'pedestrian-v1' || vehicleCount > 1 || outputs['PedestrianCrossing.PedWalk'] === outputs['PedestrianCrossing.PedStop'] || (outputs['PedestrianCrossing.PedWalk'] && (!outputs['PedestrianCrossing.VehicleRed'] || outputs['PedestrianCrossing.VehicleYellow'] || outputs['PedestrianCrossing.VehicleGreen']))) return undefined;
    samples.push({
      atMs: sample.atMs,
      vehicle: outputs['PedestrianCrossing.VehicleRed'] ? 'RED'
        : outputs['PedestrianCrossing.VehicleYellow'] ? 'YELLOW'
          : outputs['PedestrianCrossing.VehicleGreen'] ? 'GREEN' : 'CLEAR',
      pedestrian: outputs['PedestrianCrossing.PedWalk'] ? 'WALK' : 'STOP',
      request: plant.requestInput ? 'ACTIVE' : 'CLEAR',
      phase: plant.phaseAfterTick.toUpperCase() as 'APPROACHING' | 'WAITING' | 'CROSSING' | 'CLEARED',
    });
  }
  return { kind: 'pedestrian-v1', samples };
}

/** Projects exact, complete tank-v1 host evidence; it never represents live process state. */
export function presentRecordedTankLevel(scenario: WorkspaceTestPreview['scenarios'][number]): RecordedTankLevel | undefined {
  const signals = ['TankLevel.Pump', 'TankLevel.Alarm'] as const;
  if (scenario.id !== 'TankLevel'
    || scenario.path !== 'tests/tank-level.scenario.json'
    || scenario.truncated || scenario.samples.length === 0 || scenario.samples.some((sample) => {
    const outputs = sample.outputs;
    return sample.plant?.kind !== 'tank-v1' || typeof sample.plant.levelLowInput !== 'boolean' || typeof sample.plant.levelHighInput !== 'boolean' || !integerBetween(sample.plant.levelPermilleAfterTick, 0, 1000) || Object.keys(outputs).length !== signals.length
      || signals.some((signal) => typeof outputs[signal] !== 'boolean')
      || (outputs['TankLevel.Pump'] && outputs['TankLevel.Alarm']);
  })) return undefined;

  return {
    kind: 'tank-v1',
    samples: scenario.samples.map((sample) => {
      const plant = sample.plant;
      if (!plant || plant.kind !== 'tank-v1') throw new Error('validated tank plant was lost');
      return {
        atMs: sample.atMs,
        pump: sample.outputs['TankLevel.Pump'] ? 'RUNNING' : 'STOPPED',
        alarm: sample.outputs['TankLevel.Alarm'] ? 'ALARM' : 'NORMAL',
        levelLowInput: plant.levelLowInput,
        levelHighInput: plant.levelHighInput,
        levelPermilleAfterTick: plant.levelPermilleAfterTick,
      };
    }),
  };
}

/** Redacts an untrusted Tool API result into the limited evidence Console may render. */
export function presentWorkspaceTestResult(value: unknown): WorkspaceTestPresentation {
  const result = record(value);
  const evidence = result && testEvidence(result.evidence);
  if (!result || !evidence || typeof result.ok !== 'boolean') return unavailable();

  if (result.ok) {
    if (record(result.evidence)?.outcome !== 'passed') return unavailable(evidence, false);
    const summary = validPassedSummary(result.summary);
    if (summary === null || evidence.diagnostics.length !== 0 || !evidence.artifacts.some((artifact) => artifact.kind === 'zplc') || !evidence.artifacts.some((artifact) => artifact.kind === 'trace')) return unavailable(evidence, false);
    const safePreview = previewForSuccess(result.preview, evidence, summary);
    const identity = savedTestInputIdentity(result.savedTestInputIdentity, evidence);
    return { kind: 'passed', message: evidence.operation === 'scenario-run' ? 'Host POSIX scenario passed.' : 'Host POSIX scenarios passed.', scenarioCount: summary.length, ...evidence, hasEvidence: true, ...(safePreview ? { preview: safePreview } : {}), ...(identity ? { savedTestInputIdentity: identity } : {}) };
  }

  if (record(result.evidence)?.outcome !== 'failed' || evidence.diagnostics.length === 0) return unavailable(evidence, false);

  const codes = new Set(evidence.diagnostics.map((diagnostic) => diagnostic.code));
  if (codes.has('TEST_CANCELLED')) return { kind: 'cancelled', message: 'Host scenario run was cancelled.', diagnostics: evidence.diagnostics, artifacts: [], hasEvidence: false };
  if (codes.has('TEST_TIMEOUT')) return { kind: 'timeout', message: 'Host scenario run exceeded its deadline.', diagnostics: evidence.diagnostics, artifacts: [], hasEvidence: false };
  if (codes.has('SIMULATOR_UNAVAILABLE') || codes.has('RUNTIME_FAILED')) {
    return unavailable(evidence);
  }
  if (codes.has('SCENARIO_ASSERTION_FAILED')) {
    const safePreview = previewForFailure(result.preview, evidence);
    const identity = savedTestInputIdentity(result.savedTestInputIdentity, evidence);
    return evidence.artifacts.some((artifact) => artifact.kind === 'trace')
      ? { kind: 'assertion-failed', message: evidence.operation === 'scenario-run' ? 'Scenario assertion failed.' : 'One or more scenario assertions failed.', ...evidence, hasEvidence: true, ...(safePreview ? { preview: safePreview } : {}), ...(identity ? { savedTestInputIdentity: identity } : {}) }
      : unavailable(evidence, false);
  }
  return { kind: 'invalid', message: 'Host scenarios could not run.', ...evidence, hasEvidence: evidence.artifacts.some((artifact) => artifact.kind === 'trace') };
}
