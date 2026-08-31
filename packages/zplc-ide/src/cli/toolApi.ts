import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { load } from 'js-yaml';
import { CompilerError, assertTaskProgramCardinality, compileMultiTaskProject, type DebugMap, type DebugVarInfo } from '../compiler';
import type { ProjectMigrationChange } from '../project/projectModel';
import { resolveProgramSource } from '../utils/programSourceResolution';
import { compileScenario, runScenario, type CompiledScenario, type ScenarioKind, type ScenarioRunResult } from '../test-engine';
import { createNativeScenarioSession } from './nativeScenarioRuntime';
import { directoryIdentity, runFirmwareBuild } from './firmwareBuildRunner';
import { readWorkspace, readWorkspaceScenarios, type ToolDiagnostic, type WorkspaceProject, type WorkspaceScenario } from './workspace';

export type ToolOperation = 'cli' | 'inspect' | 'migrate-preview' | 'migrate' | 'validate' | 'check' | 'compile' | 'symbols-list' | 'safety-check' | 'test' | 'scenario-run' | 'toolchain-inspect' | 'firmware-build-plan' | 'firmware-build';
export interface ToolArtifact { kind: 'zplc' | 'bytecode' | 'trace' | 'firmware-elf' | 'project-manifest'; sha256: string; byteLength: number; }
export interface ToolEvidence { schemaVersion: 1; operation: ToolOperation; outcome: 'passed' | 'failed'; diagnostics: ToolDiagnostic[]; artifacts: ToolArtifact[]; }
export type ToolResult<T> = { ok: true; summary: T; evidence: ToolEvidence } | { ok: false; evidence: ToolEvidence };
export type CompilerSummary = { name: string; version: string; taskCount: number; codeSize: number };
export type CompilerCheckResult = ToolResult<CompilerSummary>;
export interface SymbolSummary {
  symbols: Array<{
    pou: string;
    name: string;
    type: string;
    region: 'IPI' | 'OPI' | 'WORK' | 'RETAIN' | 'CODE';
    address: number;
    size: number;
    sourceRef?: string;
    bitOffset?: number;
    declarationLine?: number;
  }>;
}
export type SymbolsListResult = ToolResult<SymbolSummary>;
export interface SafetyCheckSummary {
  configured: boolean;
  declared: Array<{ outputs: [string, string] }>;
  covered: Array<{ outputs: [string, string] }>;
  uncovered: Array<{ outputs: [string, string] }>;
}
export type SafetyCheckResult = ToolResult<SafetyCheckSummary> | { ok: false; summary: SafetyCheckSummary; evidence: ToolEvidence };
export type ProjectMigrationExportResult = ToolResult<{ sourceSchemaVersion: 1 | 2; targetSchemaVersion: 2; changed: boolean; changes: ProjectMigrationChange[] }> & {
  /** Internal CLI export payload; intentionally non-enumerable. */ manifest?: Uint8Array;
};
export type CompilerCompileResult = CompilerCheckResult & {
  /** Internal main-process payload; never serialized by the CLI Tool API. */
  bytes?: Uint8Array;
  zplcFile?: Uint8Array;
  bytecode?: Uint8Array;
  assembly?: string;
  debugMap?: DebugMap;
};
export interface TestSummary {
  backend: 'native-posix';
  mode: 'logical-cyclic-task-set-scan';
  scenarios: Array<{ id: string; path: string; passed: boolean; traceSha256: string; traceByteLength: number }>;
}
export interface SavedTestInputIdentity { schemaVersion: 1; sha256: string; fileCount: number; }
export interface TestRunPreview {
  schemaVersion: 1;
  backend: 'native-posix';
  mode: 'logical-cyclic-task-set-scan';
  traceEvidenceSha256: string;
  totalScenarioCount: number;
  scenarios: Array<{
    id: string; path: string; passed: boolean; totalSamples: number; totalSignals: number; totalAssertions: number; truncated: boolean;
    assertions: Array<{ kind: ScenarioKind; passed: boolean; atMs?: number }>;
    samples: Array<{ atMs: number; outputs: Record<string, boolean>; plant?: { kind: 'motor-v1'; atSpeedInput: boolean; speedPermilleAfterTick: number } | { kind: 'conveyor-v1'; seed: 0; partAtClassifierInput: boolean; metalDetectedInput: boolean; partAtDiverterInput: boolean; jamDetectedInput: boolean; classifiedCountAfterTick: number } | { kind: 'tank-v1'; levelLowInput: boolean; levelHighInput: boolean; levelPermilleAfterTick: number } | { kind: 'pedestrian-v1'; requestInput: boolean; phaseAfterTick: 'approaching' | 'waiting' | 'crossing' | 'cleared' } }>;
  }>;
}
export type TestRunResult = (
  | { ok: true; summary: TestSummary; evidence: ToolEvidence; preview: TestRunPreview; savedTestInputIdentity?: SavedTestInputIdentity }
  | { ok: false; evidence: ToolEvidence; preview?: TestRunPreview; savedTestInputIdentity?: SavedTestInputIdentity }
) & { /** Internal CLI export payload; intentionally non-enumerable. */ traceFile?: Uint8Array };
const MAX_SCENARIO_RUNTIME_OPERATIONS = 100_000;
const WORKSPACE_TEST_TIMEOUT_MS = 30_000;
const TOOLCHAIN_FILE_MAX_BYTES = 128 * 1024;
const TOOLCHAIN_COMMAND_OUTPUT_MAX_BYTES = 4096;
const TOOLCHAIN_COMMAND_TIMEOUT_MS = 3000;
const EXPECTED_BOARD_COUNT = 6;

export type ToolchainCheckStatus = 'ready' | 'missing' | 'invalid' | 'malformed' | 'timeout' | 'unavailable';
export interface ToolchainCheck {
  id: 'repository-manifest' | 'west' | 'python3' | 'cmake' | 'ninja' | 'zephyr-base' | 'zephyr-sdk' | 'arm-toolchain' | 'xtensa-toolchain';
  status: ToolchainCheckStatus;
  version?: string;
  requiredRevision?: string;
  observedRevision?: string;
}
export interface ToolchainSummary {
  scope: 'local-firmware-build-prerequisites';
  ready: boolean;
  checks: ToolchainCheck[];
  boards: Array<{ ideId: string; zephyrBoard: string; validationLevel: string }>;
}
export interface ToolchainInspectResult { ok: boolean; summary: ToolchainSummary; evidence: ToolEvidence; }
export interface FirmwareBuildPlan {
  schemaVersion: 1;
  board: { boardId: string; ideId: string; zephyrBoard: string; validationLevel: 'cross-build' | 'human-hil' };
  applicationPath: 'firmware/app';
  expectedArtifacts: Array<{ role: 'cross-build-evidence'; relativePath: 'zephyr/zephyr.elf'; required: true }>;
}
export interface FirmwareBuildSummary {
  schemaVersion: 1;
  scope: 'local-ephemeral-cross-build';
  sourceIdentity: 'unverified';
  board: FirmwareBuildPlan['board'];
  artifact: ToolArtifact & { kind: 'firmware-elf' };
  output: { stdoutBytes: number; stderrBytes: number; truncated: boolean };
}

export function artifactEvidence(kind: ToolArtifact['kind'], bytes: Uint8Array): ToolArtifact { return { kind, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }; }
function evidence(operation: ToolOperation, outcome: 'passed' | 'failed', diagnostics: ToolDiagnostic[] = [], artifacts: ToolEvidence['artifacts'] = []): ToolEvidence { return { schemaVersion: 1, operation, outcome, diagnostics, artifacts }; }
function unresolvedPrograms(workspace: WorkspaceProject): ToolDiagnostic[] {
  const diagnostics: ToolDiagnostic[] = [];
  workspace.project.tasks.forEach((task, taskIndex) => task.programs.forEach((program, programIndex) => {
    if (!resolveProgramSource(program, workspace.sources)) diagnostics.push({ code: 'PROGRAM_NOT_FOUND', message: 'Task program could not be resolved from src', path: `tasks[${taskIndex}].programs[${programIndex}]` });
  }));
  return diagnostics;
}
function compilationSources(workspace: WorkspaceProject) {
  const sourceByProgram = new Map<string, ReturnType<typeof resolveProgramSource>>();
  for (const task of workspace.project.tasks) for (const program of task.programs) {
    if (!sourceByProgram.has(program)) sourceByProgram.set(program, resolveProgramSource(program, workspace.sources));
  }
  const bytesByPath = new Map(workspace.sources.map((source) => [source.path, source.bytes]));
  return [...sourceByProgram].flatMap(([name, source]) => source ? [{ ...source, name, bytes: bytesByPath.get(source.sourceRef)! }] : []);
}
function createSavedTestInputIdentity(workspace: WorkspaceProject, sources: Array<{ path: string; bytes: Uint8Array }>, scenarios: WorkspaceScenario[]): SavedTestInputIdentity {
  const inputs = [
    { path: 'zplc.json', bytes: workspace.manifestBytes },
    ...[...new Map(sources.map((source) => [source.path, source])).values()],
    ...scenarios,
  ].map(({ path, bytes }) => ({ path, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return {
    schemaVersion: 1,
    sha256: createHash('sha256').update(JSON.stringify({ schemaVersion: 1, inputs })).digest('hex'),
    fileCount: inputs.length,
  };
}
function failed<T>(operation: ToolOperation, diagnostics: ToolDiagnostic[], artifacts: ToolArtifact[] = []): ToolResult<T> { return { ok: false, evidence: evidence(operation, 'failed', diagnostics, artifacts) }; }
type TestOperation = 'test' | 'scenario-run';
function testFailed(operation: TestOperation, diagnostics: ToolDiagnostic[], artifacts: ToolArtifact[] = []): TestRunResult { return { ok: false, evidence: evidence(operation, 'failed', diagnostics, artifacts) }; }
function loadFailure<T>(operation: ToolOperation, loaded: Awaited<ReturnType<typeof readWorkspace>>): ToolResult<T> | null { return loaded.ok ? null : failed(operation, loaded.diagnostics); }
function safeCompilerDiagnostic(error: unknown): ToolDiagnostic {
  if (error instanceof CompilerError) {
    return { code: 'COMPILATION_FAILED', message: 'Compilation failed', phase: error.phase, line: error.line, column: error.column, ...(error.sourceRef ? { path: error.sourceRef } : {}) };
  }
  return { code: 'COMPILATION_FAILED', message: 'Compilation failed' };
}

function selectIndexes(length: number, cap: number, required: number[] = []): number[] {
  if (length <= cap) return Array.from({ length }, (_, index) => index);
  const selected = new Set([0, length - 1]);
  for (const index of required) if (selected.size < cap && index > 0 && index < length - 1) selected.add(index);
  for (let slot = 1; selected.size < cap && slot < cap; slot += 1) selected.add(Math.floor((slot * (length - 1)) / (cap - 1)));
  for (let index = 0; selected.size < cap && index < length; index += 1) selected.add(index);
  return [...selected].sort((left, right) => left - right);
}

function previewScenario(scenario: { id: string; path: string; passed: boolean; trace: ScenarioRunResult['trace']; assertions: ScenarioRunResult['assertions'] }) {
  const signals = [...new Set(scenario.trace.flatMap((sample) => Object.keys(sample.outputs)))].sort();
  const selectedSignals = signals.slice(0, 8);
  const assertionIndexes = selectIndexes(scenario.assertions.length, 32, scenario.assertions.flatMap((assertion, index) => assertion.passed ? [] : [index]));
  const assertions = assertionIndexes.map((index) => scenario.assertions[index]!).map(({ kind, passed, atMs }) => ({ kind, passed, ...(atMs === undefined ? {} : { atMs }) }));
  const failureTimes = scenario.assertions.flatMap((assertion) => !assertion.passed && assertion.atMs !== undefined ? [scenario.trace.findIndex((sample) => sample.atMs === assertion.atMs)] : []);
  const sampleIndexes = selectIndexes(scenario.trace.length, 24, failureTimes);
  const samples = sampleIndexes.map((index) => scenario.trace[index]!).map((sample) => {
    if (selectedSignals.some((signal) => typeof sample.outputs[signal] !== 'boolean')) throw new Error('Scenario trace is incomplete');
    return {
      atMs: sample.atMs,
      outputs: Object.fromEntries(selectedSignals.map((signal) => [signal, sample.outputs[signal]!])),
      ...(sample.plant ? { plant: sample.plant } : {}),
    };
  });
  return {
    id: scenario.id, path: scenario.path, passed: scenario.passed,
    totalSamples: scenario.trace.length, totalSignals: signals.length, totalAssertions: scenario.assertions.length,
    truncated: signals.length > selectedSignals.length || scenario.assertions.length > assertions.length || scenario.trace.length > samples.length,
    assertions, samples,
  };
}

function testPreview(completed: Array<{ id: string; path: string; passed: boolean; trace: ScenarioRunResult['trace']; assertions: ScenarioRunResult['assertions'] }>, traceEvidenceSha256: string): TestRunPreview {
  const selected = [...completed.filter((scenario) => !scenario.passed), ...completed.filter((scenario) => scenario.passed)].slice(0, 8);
  const scenarios = completed.filter((scenario) => selected.includes(scenario)).map(previewScenario);
  return { schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', traceEvidenceSha256, totalScenarioCount: completed.length, scenarios };
}

export async function projectInspect(root: string): Promise<ToolResult<{ schemaVersion: 2; sourceSchemaVersion: 1 | 2; migrated: boolean; name: string; version: string; taskCount: number; sources: Array<{ name: string; language: string }> }>> {
  const loaded = await readWorkspace(root); const failure = loadFailure('inspect', loaded); if (failure) return failure;
  const { workspace } = loaded;
  return { ok: true, summary: { schemaVersion: 2, sourceSchemaVersion: workspace.sourceSchemaVersion, migrated: workspace.migrated, name: workspace.project.name, version: workspace.project.version, taskCount: workspace.project.tasks.length, sources: workspace.sources.map(({ name, language }) => ({ name, language })) }, evidence: evidence('inspect', 'passed') };
}
export async function projectMigrationPreview(root: string): Promise<ToolResult<{ sourceSchemaVersion: 1 | 2; targetSchemaVersion: 2; changed: boolean; changes: ProjectMigrationChange[] }>> {
  const loaded = await readWorkspace(root); const failure = loadFailure<{ sourceSchemaVersion: 1 | 2; targetSchemaVersion: 2; changed: boolean; changes: ProjectMigrationChange[] }>('migrate-preview', loaded); if (failure) return failure;
  const { workspace } = loaded;
  return { ok: true, summary: { sourceSchemaVersion: workspace.sourceSchemaVersion, targetSchemaVersion: 2, changed: workspace.migrated, changes: workspace.migrationChanges }, evidence: evidence('migrate-preview', 'passed') };
}
export async function projectMigrationExport(root: string): Promise<ProjectMigrationExportResult> {
  const loaded = await readWorkspace(root);
  const failure = loadFailure<{ sourceSchemaVersion: 1 | 2; targetSchemaVersion: 2; changed: boolean; changes: ProjectMigrationChange[] }>('migrate', loaded);
  if (failure) return failure;
  const { workspace } = loaded;
  const manifest = Buffer.from(`${JSON.stringify(workspace.project, null, 2)}\n`, 'utf8');
  const result: ProjectMigrationExportResult = {
    ok: true,
    summary: { sourceSchemaVersion: workspace.sourceSchemaVersion, targetSchemaVersion: 2, changed: workspace.migrated, changes: workspace.migrationChanges },
    evidence: evidence('migrate', 'passed', [], [artifactEvidence('project-manifest', manifest)]),
  };
  Object.defineProperty(result, 'manifest', { value: new Uint8Array(manifest), enumerable: false });
  return result;
}
export async function projectValidate(root: string): Promise<ToolResult<{ name: string; taskCount: number }>> {
  const loaded = await readWorkspace(root); const failure = loadFailure<{ name: string; taskCount: number }>('validate', loaded); if (failure) return failure;
  try { assertTaskProgramCardinality(loaded.workspace.project); }
  catch (error) { return failed('validate', [safeCompilerDiagnostic(error)]); }
  const diagnostics = unresolvedPrograms(loaded.workspace); if (diagnostics.length) return failed('validate', diagnostics);
  return { ok: true, summary: { name: loaded.workspace.project.name, taskCount: loaded.workspace.project.tasks.length }, evidence: evidence('validate', 'passed') };
}
type CompileOperation = 'check' | 'compile' | 'symbols-list';
type CompileResult<Operation extends CompileOperation> = Operation extends 'symbols-list' ? SymbolsListResult : CompilerCompileResult;

function symbolSummary(debugMap: DebugMap, workspace: WorkspaceProject): SymbolSummary {
  const sourceRefs = new Set(workspace.sources.map((source) => source.path));
  return {
    symbols: Object.entries(debugMap.pou).flatMap(([pou, info]) => Object.entries(info.vars).map(([name, variable]) => ({
      pou,
      name,
      type: variable.type,
      region: variable.region,
      address: variable.addr,
      size: variable.size,
      ...(info.sourceRef && sourceRefs.has(info.sourceRef) ? { sourceRef: info.sourceRef } : {}),
      ...(variable.bitOffset === undefined ? {} : { bitOffset: variable.bitOffset }),
      ...(variable.declarationLine === undefined ? {} : { declarationLine: variable.declarationLine }),
    }))).sort((left, right) => left.pou === right.pou ? (left.name < right.name ? -1 : left.name > right.name ? 1 : 0) : (left.pou < right.pou ? -1 : 1)),
  };
}

async function compile<Operation extends CompileOperation>(root: string, operation: Operation): Promise<CompileResult<Operation>> {
  const loaded = await readWorkspace(root); const loadingFailure = loadFailure<CompilerSummary | SymbolSummary>(operation, loaded); if (loadingFailure) return loadingFailure as CompileResult<Operation>;
  try { assertTaskProgramCardinality(loaded.workspace.project); }
  catch (error) { return failed(operation, [safeCompilerDiagnostic(error)]) as CompileResult<Operation>; }
  const diagnostics = unresolvedPrograms(loaded.workspace); if (diagnostics.length) return failed(operation, diagnostics) as CompileResult<Operation>;
  try {
    const result = compileMultiTaskProject(loaded.workspace.project, compilationSources(loaded.workspace));
    if (operation === 'symbols-list') return { ok: true, summary: symbolSummary(result.debugMap, loaded.workspace), evidence: evidence('symbols-list', 'passed') } as CompileResult<Operation>;
    const bytes = result.zplcFile;
    const artifact = artifactEvidence('zplc', bytes);
    const response: CompilerCompileResult = { ok: true, summary: { name: loaded.workspace.project.name, version: loaded.workspace.project.version, taskCount: loaded.workspace.project.tasks.length, codeSize: result.codeSize }, evidence: evidence(operation, 'passed', [], operation === 'symbols-list' ? [] : [artifact]) };
    if (operation === 'compile') {
      Object.defineProperties(response, {
        bytes: { value: bytes, enumerable: false },
        zplcFile: { value: result.zplcFile, enumerable: false },
        bytecode: { value: result.bytecode, enumerable: false },
        assembly: { value: result.programDetails.map((program) => `; === ${program.name} ===\n${program.assembly}`).join('\n\n'), enumerable: false },
        debugMap: { value: result.debugMap, enumerable: false },
      });
    }
    return response as CompileResult<Operation>;
  } catch (error) { return failed(operation, [safeCompilerDiagnostic(error)]) as CompileResult<Operation>; }
}
export async function compilerCheck(root: string): Promise<CompilerCheckResult> { return compile(root, 'check'); }
export function compilerCompile(root: string): Promise<CompilerCompileResult> { return compile(root, 'compile'); }
export function symbolsList(root: string): Promise<SymbolsListResult> { return compile(root, 'symbols-list'); }

type SafetyOutput = { signal: string; address: number; bitOffset: number };
function safetyLocation(output: Pick<SafetyOutput, 'address' | 'bitOffset'>): string { return `${output.address}:${output.bitOffset}`; }
function safetyDiagnostic(code: 'SAFETY_OUTPUT_INVALID' | 'SAFETY_OUTPUT_DUPLICATE' | 'SAFETY_INTERLOCK_UNCOVERED' | 'SAFETY_SCENARIO_INVALID' | 'SAFETY_SCENARIOS_UNAVAILABLE', path?: string): ToolDiagnostic {
  return { code, message: code === 'SAFETY_INTERLOCK_UNCOVERED' ? 'Declared incompatible outputs lack exact NEVER coverage' : code === 'SAFETY_SCENARIO_INVALID' ? 'Scenario cannot be used for safety coverage' : code === 'SAFETY_SCENARIOS_UNAVAILABLE' ? 'Scenarios are unavailable for safety coverage' : 'Declared safety output is invalid', ...(path ? { path } : {}) };
}
function safetyOutput(debugMap: DebugMap, signal: string): SafetyOutput | undefined {
  const [pou, name] = signal.split('.');
  const variable: DebugVarInfo | undefined = pou === undefined || name === undefined ? undefined : debugMap.pou[pou]?.vars[name];
  if (!variable || variable.type !== 'BOOL' || variable.region !== 'OPI' || !Number.isInteger(variable.addr) || !Number.isInteger(variable.bitOffset) || variable.bitOffset < 0 || variable.bitOffset > 7 || !Number.isInteger(variable.size) || variable.size < 1) return undefined;
  const { opiBase, opiSize } = debugMap.memoryLayout;
  if (!Number.isInteger(opiBase) || !Number.isInteger(opiSize) || opiSize < 1 || variable.addr < opiBase || variable.addr + variable.size > opiBase + opiSize) return undefined;
  return { signal, address: variable.addr, bitOffset: variable.bitOffset };
}
function safetyPairKey(left: SafetyOutput, right: SafetyOutput): string { return [safetyLocation(left), safetyLocation(right)].sort().join('\u0000'); }

/** Checks declared logical output interlocks against compiled scenario assertions; it never starts a runtime. */
export async function safetyCheck(root: string): Promise<SafetyCheckResult> {
  const loaded = await readWorkspace(root); const loadingFailure = loadFailure<SafetyCheckSummary>('safety-check', loaded); if (loadingFailure) return loadingFailure;
  const declarations = loaded.workspace.project.safety?.incompatibleOutputs;
  if (!declarations) {
    const summary: SafetyCheckSummary = { configured: false, declared: [], covered: [], uncovered: [] };
    return { ok: true, summary, evidence: evidence('safety-check', 'passed') };
  }
  try { assertTaskProgramCardinality(loaded.workspace.project); }
  catch (error) { return failed('safety-check', [safeCompilerDiagnostic(error)]); }
  const unresolved = unresolvedPrograms(loaded.workspace); if (unresolved.length) return failed('safety-check', unresolved);
  let debugMap: DebugMap;
  try { debugMap = compileMultiTaskProject(loaded.workspace.project, compilationSources(loaded.workspace)).debugMap; }
  catch (error) { return failed('safety-check', [safeCompilerDiagnostic(error)]); }
  const declared: Array<{ outputs: [string, string]; left: SafetyOutput; right: SafetyOutput }> = [];
  const pairs = new Set<string>();
  for (const outputs of declarations) {
    const [leftName, rightName] = outputs;
    const left = safetyOutput(debugMap, leftName); const right = safetyOutput(debugMap, rightName);
    if (!left || !right || safetyLocation(left) === safetyLocation(right)) return failed('safety-check', [safetyDiagnostic('SAFETY_OUTPUT_INVALID')]);
    const key = safetyPairKey(left, right);
    if (pairs.has(key)) return failed('safety-check', [safetyDiagnostic('SAFETY_OUTPUT_DUPLICATE')]);
    pairs.add(key); declared.push({ outputs: [leftName, rightName], left, right });
  }
  const scenariosRead = await readWorkspaceScenarios(loaded.workspace.root);
  if (!scenariosRead.ok) return failed('safety-check', [safetyDiagnostic('SAFETY_SCENARIOS_UNAVAILABLE')]);
  const coveredKeys = new Set<string>();
  for (const source of scenariosRead.scenarios) {
    let scenario: CompiledScenario;
    try { scenario = compileScenario(source.input, debugMap); }
    catch { return failed('safety-check', [safetyDiagnostic('SAFETY_SCENARIO_INVALID', source.path)]); }
    for (const assertion of scenario.expectations) {
      if (assertion.kind !== 'NEVER' || assertion.reads.length !== 2 || assertion.reads.some((read) => !read.value)) continue;
      coveredKeys.add(safetyPairKey(assertion.reads[0]!, assertion.reads[1]!));
    }
  }
  const report = declared.map(({ outputs, left, right }) => ({ outputs, covered: coveredKeys.has(safetyPairKey(left, right)) }));
  const summary: SafetyCheckSummary = {
    configured: true,
    declared: report.map(({ outputs }) => ({ outputs })),
    covered: report.filter(({ covered }) => covered).map(({ outputs }) => ({ outputs })),
    uncovered: report.filter(({ covered }) => !covered).map(({ outputs }) => ({ outputs })),
  };
  return summary.uncovered.length === 0
    ? { ok: true, summary, evidence: evidence('safety-check', 'passed') }
    : { ok: false, summary, evidence: evidence('safety-check', 'failed', [safetyDiagnostic('SAFETY_INTERLOCK_UNCOVERED')]) };
}

function testDiagnostic(code: string, path?: string): ToolDiagnostic {
  return { code, message: 'Test execution failed', ...(path ? { path } : {}) };
}

type TestAbortKind = 'cancelled' | 'timeout';

function testAbort(operation: TestOperation, code: TestAbortKind, artifacts: ToolArtifact[] = []): TestRunResult {
  return testFailed(operation, [testDiagnostic(code === 'timeout' ? 'TEST_TIMEOUT' : 'TEST_CANCELLED')], artifacts);
}

export interface TestsRunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Test seam for a monotonic host clock; Electron never supplies it. */
  now?: () => number;
}

export interface CandidateChangeSetEdit { path: string; content: string; }
export interface CandidateChangeSetChange {
  path: string;
  kind: 'modify';
  before: { sha256: string; byteLength: number };
  after: { sha256: string; byteLength: number };
}
type CandidateChangeSetDiagnostic = { code: 'CHANGESET_INVALID' | 'CHANGESET_BASE_INVALID' | 'CHANGESET_MATERIALIZATION_FAILED' | 'CHANGESET_CLEANUP_FAILED'; message: string };
export interface CandidateChangeSetResult {
  schemaVersion: 1;
  accepted: boolean;
  evidenceScope: 'native-posix-host';
  changeSet?: { sha256: string; changes: CandidateChangeSetChange[] };
  diagnostics?: CandidateChangeSetDiagnostic[];
  evidence?: ToolEvidence;
  preview?: TestRunPreview;
  savedTestInputIdentity?: SavedTestInputIdentity;
}
interface CandidateSnapshot { workspace: WorkspaceProject; scenarios: WorkspaceScenario[]; identity: { sha256: string; fileCount: number }; }
/** @internal Test-only seams. Neither root nor source text is returned to callers. */
export const __changeSetTestHooks: { afterInitialSnapshot?: (root: string) => void | Promise<void>; afterMaterialize?: (root: string) => void | Promise<void>; afterCleanupAttempt?: (root: string) => void | Promise<void> } = {};
const CHANGESET_MANIFEST_MAX_BYTES = 128 * 1024;
const CHANGESET_SOURCE_MAX_BYTES = 256 * 1024;
const CHANGESET_PATH_MAX_LENGTH = 512;

export function createTestDeadline(options: TestsRunOptions): {
  signal: AbortSignal;
  kind: () => TestAbortKind | undefined;
  dispose: () => void;
} {
  const controller = new AbortController();
  let cause: TestAbortKind | undefined;
  const now = options.now ?? performance.now.bind(performance);
  const delay = options.timeoutMs ?? WORKSPACE_TEST_TIMEOUT_MS;
  const cutoff = now() + Math.max(0, delay);
  const timeout = () => {
    if (!cause) {
      cause = 'timeout';
      controller.abort();
    }
  };
  const cancel = () => {
    if (!cause) {
      cause = now() >= cutoff ? 'timeout' : 'cancelled';
      controller.abort();
    }
  };
  if (options.signal?.aborted) {
    cause = 'cancelled';
    controller.abort();
  }
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = delay <= 0 ? undefined : setTimeout(timeout, delay);
  timer?.unref?.();
  if (delay <= 0 && !cause) timeout();
  return {
    signal: controller.signal,
    kind: () => {
      if (!cause && now() >= cutoff) timeout();
      return cause;
    },
    dispose: () => { if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); },
  };
}

function homogeneousCyclicInterval(workspace: WorkspaceProject): number | undefined {
  const tasks = workspace.project.tasks;
  if (tasks.length < 1 || tasks.length > 16) return undefined;
  const interval = tasks[0]?.interval_ms;
  if (!Number.isInteger(interval) || interval! < 1 || interval! > 3_600_000) return undefined;
  return tasks.every((task) => task.trigger === 'cyclic'
    && task.programs.length === 1
    && task.interval_ms === interval) ? interval : undefined;
}

function traceBytes(trace: ScenarioRunResult['trace']): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(trace));
}

function runtimeOperationCost(scenario: CompiledScenario): number {
  const samples = scenario.durationMs / scenario.tickMs + 1;
  const outputs = new Set([...scenario.expectations.flatMap((expectation) => expectation.reads.map((read) => read.signal)), ...(scenario.plant?.kind === 'motor-v1' ? [scenario.plant.command.signal] : scenario.plant?.kind === 'conveyor-v1' ? [scenario.plant.beltCommand.signal, scenario.plant.diverterCommand.signal] : scenario.plant?.kind === 'tank-v1' ? [scenario.plant.pump.signal] : scenario.plant?.kind === 'pedestrian-v1' ? [scenario.plant.pedWalk.signal] : [])]);
  const writes = scenario.events.reduce((total, event) => total + event.writes.length, 0);
  return 3 + samples + samples * outputs.size + 2 * writes + (scenario.plant?.kind === 'motor-v1' ? samples : scenario.plant?.kind === 'conveyor-v1' ? 4 * samples : scenario.plant?.kind === 'tank-v1' ? 2 * samples : scenario.plant?.kind === 'pedestrian-v1' ? samples : 0);
}

async function runWorkspaceScenarios(root: string, operation: TestOperation, scenarioId: string | undefined, options: TestsRunOptions): Promise<TestRunResult> {
  const deadline = createTestDeadline(options);
  const interrupted = (artifacts: ToolArtifact[] = []): TestRunResult | undefined => {
    const kind = deadline.kind();
    return kind ? testAbort(operation, kind, artifacts) : undefined;
  };
  try {
    const beforeLoad = interrupted(); if (beforeLoad) return beforeLoad;
    const loaded = await readWorkspace(root);
    const afterLoad = interrupted(); if (afterLoad) return afterLoad;
    const loadingFailure = loadFailure<TestSummary>(operation, loaded);
    if (loadingFailure) return testFailed(operation, loadingFailure.evidence.diagnostics, loadingFailure.evidence.artifacts);
    const { workspace } = loaded;
    try {
      assertTaskProgramCardinality(workspace.project);
    } catch (error) {
      return testFailed(operation, [safeCompilerDiagnostic(error)]);
    }
    const intervalMs = homogeneousCyclicInterval(workspace);
    if (intervalMs === undefined) return testFailed(operation, [testDiagnostic('SIMULATION_UNSUPPORTED_PROJECT', 'tasks')]);
    const unresolved = unresolvedPrograms(workspace);
    if (unresolved.length) return testFailed(operation, unresolved);

    const scenariosRead = await readWorkspaceScenarios(workspace.root);
    const afterScenariosRead = interrupted(); if (afterScenariosRead) return afterScenariosRead;
    if (!scenariosRead.ok) return testFailed(operation, scenariosRead.diagnostics);

  const sources = compilationSources(workspace);
  let compiled: ReturnType<typeof compileMultiTaskProject>;
  try {
    compiled = compileMultiTaskProject(workspace.project, sources);
  } catch (error) {
    const afterCompile = interrupted(); if (afterCompile) return afterCompile;
    return testFailed(operation, [safeCompilerDiagnostic(error)]);
  }
  const zplcArtifact = artifactEvidence('zplc', compiled.zplcFile);
  if (interrupted([zplcArtifact])) return interrupted([zplcArtifact])!;
  const scenarios: Array<{ id: string; path: string; compiled: CompiledScenario; source: WorkspaceScenario }> = [];
  for (const source of scenariosRead.scenarios) {
    if (interrupted([zplcArtifact])) return interrupted([zplcArtifact])!;
    try {
      const scenario = compileScenario(source.input, compiled.debugMap);
      scenarios.push({ id: scenario.id, path: source.path, compiled: scenario, source });
    } catch {
      return testFailed(operation, [testDiagnostic('TEST_SCENARIO_INVALID', source.path)]);
    }
  }
  const ids = new Set<string>();
  for (const scenario of scenarios) {
    if (interrupted([zplcArtifact])) return interrupted([zplcArtifact])!;
    const key = scenario.id.toLowerCase();
    if (ids.has(key)) return testFailed(operation, [testDiagnostic('TEST_DUPLICATE_SCENARIO', scenario.path)]);
    ids.add(key);
    if (scenario.compiled.tickMs !== intervalMs) return testFailed(operation, [testDiagnostic('SCENARIO_TICK_MISMATCH', scenario.path)]);
  }
  const selected = scenarioId === undefined ? scenarios : scenarios.filter((scenario) => scenario.id.toLowerCase() === scenarioId.toLowerCase());
  if (selected.length === 0) return testFailed(operation, [testDiagnostic('TEST_SCENARIO_NOT_FOUND', 'tests')]);
  if (selected.reduce((total, scenario) => total + runtimeOperationCost(scenario.compiled), 0) > MAX_SCENARIO_RUNTIME_OPERATIONS) {
    return testFailed(operation, [testDiagnostic('TEST_BUDGET_EXCEEDED', 'tests')]);
  }

  const completed: Array<{ id: string; path: string; passed: boolean; trace: ScenarioRunResult['trace']; assertions: ScenarioRunResult['assertions']; traceArtifact: ToolArtifact }> = [];
  const assertionFailures: ToolDiagnostic[] = [];
  for (const scenario of selected) {
    if (interrupted([zplcArtifact])) return interrupted([zplcArtifact])!;
    let session: Awaited<ReturnType<typeof createNativeScenarioSession>>;
    try {
      session = await createNativeScenarioSession(process.env, { signal: deadline.signal });
    } catch {
      if (interrupted([zplcArtifact])) return interrupted([zplcArtifact])!;
      return testFailed(operation, [testDiagnostic('SIMULATOR_UNAVAILABLE', scenario.path)], [zplcArtifact]);
    }
    let result: ScenarioRunResult | undefined;
    let runtimeFailed = false;
    const closeOnAbort = () => { void session.close().catch(() => undefined); };
    deadline.signal.addEventListener('abort', closeOnAbort, { once: true });
    try {
      result = await runScenario(scenario.compiled, compiled.zplcFile, session.runtime);
    } catch {
      runtimeFailed = true;
    } finally {
      deadline.signal.removeEventListener('abort', closeOnAbort);
      try {
        await session.close();
      } catch {
        runtimeFailed = true;
      }
    }
    if (interrupted([zplcArtifact])) return interrupted([zplcArtifact])!;
    if (runtimeFailed || !result) return testFailed(operation, [testDiagnostic('RUNTIME_FAILED', scenario.path)], [zplcArtifact]);
    const bytes = traceBytes(result.trace);
    completed.push({ id: scenario.id, path: scenario.path, passed: result.passed, trace: result.trace, assertions: result.assertions, traceArtifact: artifactEvidence('trace', bytes) });
    if (!result.passed) assertionFailures.push(testDiagnostic('SCENARIO_ASSERTION_FAILED', scenario.path));
  }

  const beforePublish = interrupted(); if (beforePublish) return beforePublish;
  const aggregateTrace = new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    backend: 'native-posix',
    mode: 'logical-cyclic-task-set-scan',
    scenarios: completed.map(({ id, path, passed, trace, assertions }) => ({ id, path, passed, trace, assertions })),
  }));
  const artifacts = [zplcArtifact, artifactEvidence('trace', aggregateTrace)];
  const preview = testPreview(completed, artifacts[1]!.sha256);
  const savedTestInputIdentity = createSavedTestInputIdentity(workspace, sources, selected.map((scenario) => scenario.source));
  const response: TestRunResult = assertionFailures.length ? {
    ok: false, evidence: evidence(operation, 'failed', assertionFailures, artifacts), preview, savedTestInputIdentity,
  } : {
    ok: true,
    summary: {
      backend: 'native-posix',
      mode: 'logical-cyclic-task-set-scan',
      scenarios: completed.map(({ id, path, passed, traceArtifact }) => ({ id, path, passed, traceSha256: traceArtifact.sha256, traceByteLength: traceArtifact.byteLength })),
    },
    evidence: evidence(operation, 'passed', [], artifacts), preview, savedTestInputIdentity,
  };
  Object.defineProperty(response, 'traceFile', { value: aggregateTrace });
  return response;
  } finally {
    deadline.dispose();
  }
}

/** Runs all fixed workspace scenarios on fresh native POSIX sessions only. */
export function testsRun(root: string, options: TestsRunOptions = {}): Promise<TestRunResult> {
  return runWorkspaceScenarios(root, 'test', undefined, options);
}

function changeSetDigest(bytes: Uint8Array): { sha256: string; byteLength: number } {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength };
}
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
function changeSetRejected(code: CandidateChangeSetDiagnostic['code']): CandidateChangeSetResult {
  return { schemaVersion: 1, accepted: false, evidenceScope: 'native-posix-host', diagnostics: [{ code, message: code === 'CHANGESET_INVALID' ? 'Candidate change set is invalid' : code === 'CHANGESET_BASE_INVALID' ? 'Candidate base is unavailable' : code === 'CHANGESET_CLEANUP_FAILED' ? 'Candidate cleanup failed' : 'Candidate materialization failed' }] };
}
function invalidChangeSetPath(path: string): boolean {
  return path.length === 0 || path.includes('\0') || path.includes('\\') || isAbsolute(path) || win32.isAbsolute(path) || path.split('/').some((part) => part === '' || part === '.' || part === '..');
}
function decodeChangeSetEdits(value: unknown, limit: number): CandidateChangeSetEdit[] | undefined {
  try {
    if (!Array.isArray(value) || (Object.getPrototypeOf(value) !== Array.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length !== 0) return undefined;
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (!length || !('value' in length) || typeof length.value !== 'number' || length.value < 1 || length.value > limit) return undefined;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== length.value + 1 || !names.includes('length')) return undefined;
    const edits: CandidateChangeSetEdit[] = [];
    for (let index = 0; index < length.value; index += 1) {
      if (!names.includes(String(index))) return undefined;
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item || !('value' in item) || typeof item.value !== 'object' || item.value === null) return undefined;
      const edit = item.value;
      if ((Object.getPrototypeOf(edit) !== Object.prototype && Object.getPrototypeOf(edit) !== null) || Object.getOwnPropertySymbols(edit).length !== 0) return undefined;
      const keys = Object.getOwnPropertyNames(edit);
      if (keys.length !== 2 || !keys.includes('path') || !keys.includes('content')) return undefined;
      const path = Object.getOwnPropertyDescriptor(edit, 'path'); const content = Object.getOwnPropertyDescriptor(edit, 'content');
      if (!path || !content || !('value' in path) || !('value' in content) || typeof path.value !== 'string' || typeof content.value !== 'string') return undefined;
      edits.push({ path: path.value, content: content.value });
    }
    return edits;
  } catch { return undefined; }
}
async function readCandidateSnapshot(root: string): Promise<CandidateSnapshot | undefined> {
  const loaded = await readWorkspace(root);
  if (!loaded.ok) return undefined;
  const scenarios = await readWorkspaceScenarios(loaded.workspace.root);
  if (!scenarios.ok) return undefined;
  const inputs = [
    { path: 'zplc.json', bytes: loaded.workspace.manifestBytes },
    ...loaded.workspace.sources.map((source) => ({ path: source.path, bytes: source.bytes })),
    ...scenarios.scenarios.map((scenario) => ({ path: scenario.path, bytes: scenario.bytes })),
  ].map(({ path, bytes }) => ({ path, ...changeSetDigest(bytes) })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { workspace: loaded.workspace, scenarios: scenarios.scenarios, identity: { sha256: createHash('sha256').update(JSON.stringify({ schemaVersion: 1, inputs })).digest('hex'), fileCount: inputs.length } };
}
async function removeCandidateDirectory(root: string): Promise<boolean> {
  let failed = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { await rm(root, { recursive: true, force: true }); } catch { failed = true; }
    try { await lstat(root); }
    catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) failed = true;
      try { await __changeSetTestHooks.afterCleanupAttempt?.(root); } catch { failed = true; }
      return !failed;
    }
  }
  return false;
}
function acceptsCandidateResult(result: TestRunResult): boolean {
  return result.ok && result.savedTestInputIdentity !== undefined && result.evidence.artifacts.some((artifact) => artifact.kind === 'zplc') && result.evidence.artifacts.some((artifact) => artifact.kind === 'trace');
}

/** Validates source replacements in a fresh native-POSIX-only workspace without applying them to the base. */
export async function createCandidateChangeSet(root: string, input: unknown, options: TestsRunOptions = {}): Promise<CandidateChangeSetResult> {
  if (typeof root !== 'string' || root.length === 0 || root.includes('\0')) return changeSetRejected('CHANGESET_INVALID');
  let candidateRoot: string | undefined;
  let response: CandidateChangeSetResult;
  try {
    const initial = await readCandidateSnapshot(root);
    if (!initial) return changeSetRejected('CHANGESET_BASE_INVALID');
    await __changeSetTestHooks.afterInitialSnapshot?.(initial.workspace.root);
    const stable = await readCandidateSnapshot(initial.workspace.root);
    if (!stable || stable.identity.sha256 !== initial.identity.sha256 || stable.identity.fileCount !== initial.identity.fileCount) return changeSetRejected('CHANGESET_BASE_INVALID');
    const files = new Map<string, Uint8Array>([['zplc.json', stable.workspace.manifestBytes] as const, ...stable.workspace.sources.map((source): readonly [string, Uint8Array] => [source.path, source.bytes])]);
    const edits = decodeChangeSetEdits(input, files.size);
    if (!edits) return changeSetRejected('CHANGESET_INVALID');
    const allowedByCase = new Map([...files.keys()].map((path) => [path.toLowerCase(), path]));
    const replacements = new Map<string, Uint8Array>();
    for (const edit of edits) {
      if (edit.path.length > CHANGESET_PATH_MAX_LENGTH || invalidChangeSetPath(edit.path)) return changeSetRejected('CHANGESET_INVALID');
      const path = allowedByCase.get(edit.path.toLowerCase());
      if (!path || path !== edit.path || replacements.has(path)) return changeSetRejected('CHANGESET_INVALID');
      const limit = path === 'zplc.json' ? CHANGESET_MANIFEST_MAX_BYTES : CHANGESET_SOURCE_MAX_BYTES;
      if (edit.content.length > limit) return changeSetRejected('CHANGESET_INVALID');
      const bytes = new TextEncoder().encode(edit.content);
      if (bytes.byteLength > limit || sameBytes(files.get(path)!, bytes)) return changeSetRejected('CHANGESET_INVALID');
      replacements.set(path, bytes);
    }
    const changes = [...replacements].map(([path, after]) => ({ path, kind: 'modify' as const, before: changeSetDigest(files.get(path)!), after: changeSetDigest(after) })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const changeSet = { sha256: createHash('sha256').update(JSON.stringify({ schemaVersion: 1, changes })).digest('hex'), changes };
    candidateRoot = await mkdtemp(join(tmpdir(), 'zplc-change-set-'));
    await mkdir(join(candidateRoot, 'src'), { mode: 0o700 }); await mkdir(join(candidateRoot, 'tests'), { mode: 0o700 });
    await writeFile(join(candidateRoot, 'zplc.json'), replacements.get('zplc.json') ?? files.get('zplc.json')!, { mode: 0o600 });
    for (const source of stable.workspace.sources) await writeFile(join(candidateRoot, source.path), replacements.get(source.path) ?? source.bytes, { mode: 0o600 });
    for (const scenario of stable.scenarios) await writeFile(join(candidateRoot, scenario.path), scenario.bytes, { mode: 0o600 });
    await __changeSetTestHooks.afterMaterialize?.(candidateRoot);
    const result = await testsRun(candidateRoot, options);
    response = { schemaVersion: 1, accepted: acceptsCandidateResult(result), evidenceScope: 'native-posix-host', changeSet, evidence: result.evidence, ...(result.preview ? { preview: result.preview } : {}), ...(result.savedTestInputIdentity ? { savedTestInputIdentity: result.savedTestInputIdentity } : {}) };
  } catch { response = changeSetRejected('CHANGESET_MATERIALIZATION_FAILED'); }
  if (candidateRoot && !(await removeCandidateDirectory(candidateRoot))) return changeSetRejected('CHANGESET_CLEANUP_FAILED');
  return response!;
}

export function scenarioRun(root: string, scenarioId: string, options: TestsRunOptions = {}): Promise<TestRunResult> {
  if (typeof scenarioId !== 'string' || scenarioId.length === 0 || scenarioId.length > 128 || scenarioId.includes('\0')) return Promise.resolve(testFailed('scenario-run', [testDiagnostic('TEST_SCENARIO_INVALID', 'tests')]));
  return runWorkspaceScenarios(root, 'scenario-run', scenarioId, options);
}

type ToolchainCheckId = ToolchainCheck['id'];
type BoardSummary = ToolchainSummary['boards'][number];
type ParsedBoard = BoardSummary & { boardId: string; validationLevel: FirmwareBuildPlan['board']['validationLevel'] };
const TOOLCHAIN_CHECK_IDS: ToolchainCheckId[] = ['repository-manifest', 'west', 'python3', 'cmake', 'ninja', 'zephyr-base', 'zephyr-sdk', 'arm-toolchain', 'xtensa-toolchain'];

function toolchainDiagnostic(code: string): ToolDiagnostic { return { code, message: 'Toolchain prerequisite is unavailable' }; }
function toolchainResult(checks: ToolchainCheck[], boards: BoardSummary[], diagnostics: ToolDiagnostic[]): ToolchainInspectResult {
  const ready = diagnostics.length === 0 && checks.every((check) => check.status === 'ready');
  return { ok: ready, summary: { scope: 'local-firmware-build-prerequisites', ready, checks, boards }, evidence: evidence('toolchain-inspect', ready ? 'passed' : 'failed', diagnostics) };
}
function emptyToolchainChecks(): ToolchainCheck[] { return TOOLCHAIN_CHECK_IDS.map((id) => ({ id, status: 'invalid' })); }
function replaceCheck(checks: ToolchainCheck[], check: ToolchainCheck): void { checks[TOOLCHAIN_CHECK_IDS.indexOf(check.id)] = check; }
function pathInside(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return !isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`);
}
function samePath(left: string, right: string): boolean { return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right; }
async function realDirectory(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isDirectory()) return undefined;
    const canonical = await realpath(path);
    const canonicalStatus = await lstat(canonical);
    return !canonicalStatus.isSymbolicLink() && canonicalStatus.isDirectory() ? canonical : undefined;
  } catch { return undefined; }
}
async function containedFile(root: string, relativePath: string, maxBytes?: number): Promise<{ ok: true; path: string; text?: string } | { ok: false; status: ToolchainCheckStatus }> {
  if (isAbsolute(relativePath)) return { ok: false, status: 'invalid' };
  const candidate = resolve(root, relativePath);
  if (!pathInside(root, candidate)) return { ok: false, status: 'invalid' };
  const parts = relative(root, candidate).split(sep);
  let current = root;
  try {
    for (let index = 0; index < parts.length; index += 1) {
      current = join(current, parts[index]!);
      const status = await lstat(current);
      if (status.isSymbolicLink()) return { ok: false, status: 'invalid' };
      if (index < parts.length - 1 && !status.isDirectory()) return { ok: false, status: 'invalid' };
      if (index === parts.length - 1 && !status.isFile()) return { ok: false, status: 'invalid' };
      if (index === parts.length - 1 && maxBytes !== undefined && status.size > maxBytes) return { ok: false, status: 'invalid' };
    }
    const canonical = await realpath(candidate);
    if (!pathInside(root, canonical) || !samePath(canonical, candidate)) return { ok: false, status: 'invalid' };
    if (maxBytes === undefined) return { ok: true, path: canonical };
    const text = await readFile(canonical, 'utf8');
    return Buffer.byteLength(text) > maxBytes ? { ok: false, status: 'invalid' } : { ok: true, path: canonical, text };
  } catch { return { ok: false, status: 'missing' }; }
}
async function sdkToolchain(sdk: string | undefined, relativePath: string): Promise<boolean> {
  if (!sdk) return false;
  const candidate = resolve(sdk, relativePath);
  if (!pathInside(sdk, candidate)) return false;
  try {
    const status = await lstat(candidate);
    if (status.isSymbolicLink() || !status.isFile()) return false;
    return pathInside(sdk, await realpath(candidate));
  } catch { return false; }
}
function versionFrom(output: string): string | undefined { return output.match(/\b\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0]; }
type FixedCommand = { command: 'west' | 'python3' | 'cmake' | 'ninja' | 'git' | 'py' | 'python'; args: string[] };
async function inspectCommand({ command, args }: FixedCommand, cwd: string, revision = false): Promise<{ status: ToolchainCheckStatus; version?: string; observedRevision?: string }> {
  return new Promise((resolve) => {
    let settled = false; let output = ''; let exceeded = false;
    const child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const settle = (value: { status: ToolchainCheckStatus; version?: string; observedRevision?: string }) => { if (!settled) { settled = true; clearTimeout(timeout); resolve(value); } };
    const append = (chunk: Buffer) => {
      if (exceeded) return;
      const remaining = TOOLCHAIN_COMMAND_OUTPUT_MAX_BYTES - Buffer.byteLength(output);
      if (remaining <= 0 || chunk.byteLength > remaining) { exceeded = true; child.kill('SIGKILL'); return; }
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timeout = setTimeout(() => { child.kill('SIGKILL'); settle({ status: 'timeout' }); }, TOOLCHAIN_COMMAND_TIMEOUT_MS);
    child.once('error', () => settle({ status: 'missing' }));
    child.once('close', (code) => {
      if (settled) return;
      if (exceeded || code !== 0) return settle({ status: 'unavailable' });
      if (revision) {
        const observedRevision = output.trim().match(/^[a-f0-9]{40}$/i)?.[0]?.toLowerCase();
        return settle(observedRevision ? { status: 'ready', observedRevision } : { status: 'malformed' });
      }
      const version = versionFrom(output);
      settle(version ? { status: 'ready', version } : { status: 'malformed' });
    });
  });
}
function parseWestRevision(text: string): string | undefined {
  try {
    const manifest = load(text) as { manifest?: { projects?: Array<{ name?: unknown; revision?: unknown }> } };
    const zephyr = manifest.manifest?.projects?.filter((project) => project.name === 'zephyr') ?? [];
    return zephyr.length === 1 && typeof zephyr[0]?.revision === 'string' && /^[a-f0-9]{40}$/i.test(zephyr[0].revision) ? zephyr[0].revision.toLowerCase() : undefined;
  } catch { return undefined; }
}
async function parseBoards(root: string, text: string): Promise<ParsedBoard[] | undefined> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  if (!Array.isArray(value) || value.length !== EXPECTED_BOARD_COUNT) return undefined;
  const boards: ParsedBoard[] = [];
  const boardIds = new Set<string>(); const ideIds = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return undefined;
    const board = item as Record<string, unknown>;
    const required = ['board_id', 'display_name', 'ide_id', 'zephyr_board', 'variant', 'build_command', 'network_class', 'validation_level', 'docs_ref'];
    const validString = (value: unknown, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && [...value].every((character) => character >= ' ' && character !== '\x7f');
    if (required.some((field) => !validString(board[field]))) return undefined;
    const boardId = board.board_id as string; const ideId = board.ide_id as string; const zephyrBoard = board.zephyr_board as string; const validationLevel = board.validation_level as string;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(boardId) || !/^[a-z0-9][a-z0-9_]{0,63}$/.test(ideId) || !/^[a-z0-9][a-z0-9_/-]{0,127}$/.test(zephyrBoard) || boardIds.has(boardId) || ideIds.has(ideId) || !['cross-build', 'human-hil'].includes(validationLevel) || !['serial-focused', 'network-capable', 'other'].includes(board.network_class as string)) return undefined;
    if (!Array.isArray(board.support_assets) || board.support_assets.length === 0 || board.support_assets.length > 16 || !board.support_assets.every((asset): asset is string => validString(asset) && /^firmware\/app\/boards\/[a-z0-9][a-z0-9_-]{0,127}\.(conf|overlay)$/.test(asset))) return undefined;
    if (!Array.isArray(board.evidence_refs) || board.evidence_refs.length > 16 || !board.evidence_refs.every((ref): ref is string => validString(ref)) || (validationLevel === 'human-hil' && board.evidence_refs.length === 0)) return undefined;
    for (const asset of board.support_assets) if (!(await containedFile(root, asset)).ok) return undefined;
    boardIds.add(boardId); ideIds.add(ideId); boards.push({ boardId, ideId, zephyrBoard, validationLevel: validationLevel as ParsedBoard['validationLevel'] });
  }
  return boards.sort((left, right) => left.ideId.localeCompare(right.ideId));
}

function firmwareBuildPlanFailure(): ToolResult<FirmwareBuildPlan> {
  return failed('firmware-build-plan', [{ code: 'FIRMWARE_BUILD_PLAN_UNAVAILABLE', message: 'Firmware build plan is unavailable' }]);
}

/** Static local cross-build expectation only. It does not inspect toolchains or execute a build. */
export async function firmwareBuildPlan(repositoryRoot: string, ideId: string): Promise<ToolResult<FirmwareBuildPlan>> {
  const root = await realDirectory(repositoryRoot);
  if (!root || typeof ideId !== 'string') return firmwareBuildPlanFailure();
  const [appCmake, boardManifest] = await Promise.all([
    containedFile(root, 'firmware/app/CMakeLists.txt', TOOLCHAIN_FILE_MAX_BYTES),
    containedFile(root, 'firmware/app/boards/supported-boards.v1.5.0.json', TOOLCHAIN_FILE_MAX_BYTES),
  ]);
  if (!appCmake.ok || !boardManifest.ok) return firmwareBuildPlanFailure();
  const board = (await parseBoards(root, boardManifest.text!))?.find((candidate) => candidate.ideId === ideId);
  if (!board) return firmwareBuildPlanFailure();
  return {
    ok: true,
    summary: {
      schemaVersion: 1,
      board: { boardId: board.boardId, ideId: board.ideId, zephyrBoard: board.zephyrBoard, validationLevel: board.validationLevel },
      applicationPath: 'firmware/app',
      expectedArtifacts: [{ role: 'cross-build-evidence', relativePath: 'zephyr/zephyr.elf', required: true }],
    },
    evidence: evidence('firmware-build-plan', 'passed'),
  };
}

function firmwareBuildFailure(code: string): ToolResult<FirmwareBuildSummary> {
  return failed('firmware-build', [{ code, message: 'Firmware build is unavailable' }]);
}

function inspectedBoardMatchesPlan(inspected: ToolchainInspectResult, board: FirmwareBuildPlan['board']): boolean {
  const matches = inspected.summary.boards.filter((candidate) => candidate.ideId === board.ideId);
  return matches.length === 1
    && matches[0]!.zephyrBoard === board.zephyrBoard
    && matches[0]!.validationLevel === board.validationLevel;
}

/** Runs a local POSIX west cross-build; it neither flashes nor qualifies hardware. */
export async function firmwareBuild(repositoryRoot: string, ideId: string, options?: { signal?: AbortSignal }): Promise<ToolResult<FirmwareBuildSummary>> {
  const root = await directoryIdentity(repositoryRoot);
  if (!root) return firmwareBuildFailure('FIRMWARE_BUILD_UNAVAILABLE');
  const admitted = await firmwareBuildPlan(root.path, ideId);
  if (!admitted.ok) return firmwareBuildFailure('FIRMWARE_BUILD_UNAVAILABLE');
  if (options?.signal?.aborted) return firmwareBuildFailure('FIRMWARE_BUILD_CANCELLED');
  let inspected: ToolchainInspectResult;
  try { inspected = await toolchainInspect(root.path); }
  catch { return firmwareBuildFailure('FIRMWARE_BUILD_TOOLCHAIN_UNAVAILABLE'); }
  if (options?.signal?.aborted) return firmwareBuildFailure('FIRMWARE_BUILD_CANCELLED');
  if (!inspected.ok || !inspected.summary.ready || !inspectedBoardMatchesPlan(inspected, admitted.summary.board)) return firmwareBuildFailure('FIRMWARE_BUILD_TOOLCHAIN_UNAVAILABLE');
  const run = await runFirmwareBuild(root.path, admitted.summary.board.zephyrBoard, options);
  if (!run.ok) return firmwareBuildFailure(`FIRMWARE_BUILD_${run.failure.replace(/-/g, '_').toUpperCase()}`);
  const currentRoot = await directoryIdentity(root.path); const revalidated = currentRoot && currentRoot.path === root.path && currentRoot.dev === root.dev && currentRoot.ino === root.ino ? await firmwareBuildPlan(root.path, ideId) : undefined;
  if (!revalidated?.ok || JSON.stringify(revalidated.summary) !== JSON.stringify(admitted.summary)) return firmwareBuildFailure('FIRMWARE_BUILD_PLAN_STALE');
  const artifact: ToolArtifact & { kind: 'firmware-elf' } = { kind: 'firmware-elf', ...run.artifact };
  return { ok: true, summary: { schemaVersion: 1, scope: 'local-ephemeral-cross-build', sourceIdentity: 'unverified', board: admitted.summary.board, artifact, output: run.output }, evidence: evidence('firmware-build', 'passed', [], [artifact]) };
}

/** Read-only local firmware-build prerequisite inspection. It does not build, connect, or qualify a target. */
export async function toolchainInspect(repositoryRoot: string): Promise<ToolchainInspectResult> {
  const checks = emptyToolchainChecks(); const diagnostics: ToolDiagnostic[] = []; let boards: BoardSummary[] = [];
  const root = await realDirectory(repositoryRoot);
  if (!root) return toolchainResult(checks, boards, [toolchainDiagnostic('TOOLCHAIN_REPOSITORY_INVALID')]);
  const [appCmake, boardManifest, westManifest] = await Promise.all([
    containedFile(root, 'firmware/app/CMakeLists.txt', TOOLCHAIN_FILE_MAX_BYTES),
    containedFile(root, 'firmware/app/boards/supported-boards.v1.5.0.json', TOOLCHAIN_FILE_MAX_BYTES),
    containedFile(root, 'west.yml', TOOLCHAIN_FILE_MAX_BYTES),
  ]);
  const requiredRevision = westManifest.ok && westManifest.text ? parseWestRevision(westManifest.text) : undefined;
  if (!appCmake.ok || !boardManifest.ok || !requiredRevision) {
    replaceCheck(checks, { id: 'repository-manifest', status: !appCmake.ok ? appCmake.status : !boardManifest.ok ? boardManifest.status : 'malformed' });
    diagnostics.push(toolchainDiagnostic('TOOLCHAIN_REPOSITORY_MANIFEST_INVALID'));
  } else {
    const parsedBoards = await parseBoards(root, boardManifest.text!);
    if (!parsedBoards) { replaceCheck(checks, { id: 'repository-manifest', status: 'malformed' }); diagnostics.push(toolchainDiagnostic('TOOLCHAIN_BOARDS_MALFORMED')); }
    else { boards = parsedBoards.map(({ ideId, zephyrBoard, validationLevel }) => ({ ideId, zephyrBoard, validationLevel })); replaceCheck(checks, { id: 'repository-manifest', status: 'ready' }); }
  }
  for (const [id, probe] of [['west', { command: 'west', args: ['--version'] }], ['cmake', { command: 'cmake', args: ['--version'] }], ['ninja', { command: 'ninja', args: ['--version'] }]] as const) {
    const observed = await inspectCommand(probe, root);
    replaceCheck(checks, { id, ...observed });
    if (observed.status !== 'ready') diagnostics.push(toolchainDiagnostic(`TOOLCHAIN_${id.toUpperCase()}_${observed.status.toUpperCase()}`));
  }
  const pythonProbes: FixedCommand[] = process.platform === 'win32' ? [{ command: 'py', args: ['-3', '--version'] }, { command: 'python', args: ['--version'] }] : [{ command: 'python3', args: ['--version'] }];
  let python = await inspectCommand(pythonProbes[0]!, root);
  if (process.platform === 'win32' && python.status !== 'ready') python = await inspectCommand(pythonProbes[1]!, root);
  replaceCheck(checks, { id: 'python3', ...python });
  if (python.status !== 'ready') diagnostics.push(toolchainDiagnostic(`TOOLCHAIN_PYTHON3_${python.status.toUpperCase()}`));
  const zephyrBase = await realDirectory(process.env.ZEPHYR_BASE);
  const revision = zephyrBase && requiredRevision ? await inspectCommand({ command: 'git', args: ['-C', zephyrBase, 'rev-parse', '--verify', 'HEAD'] }, root, true) : undefined;
  const zephyrStatus: ToolchainCheckStatus = !zephyrBase ? process.env.ZEPHYR_BASE ? 'invalid' : 'missing' : !requiredRevision ? 'invalid' : revision?.status !== 'ready' ? revision?.status ?? 'unavailable' : revision.observedRevision === requiredRevision ? 'ready' : 'invalid';
  replaceCheck(checks, { id: 'zephyr-base', status: zephyrStatus, ...(requiredRevision ? { requiredRevision } : {}), ...(revision?.observedRevision ? { observedRevision: revision.observedRevision } : {}) });
  if (zephyrStatus !== 'ready') diagnostics.push(toolchainDiagnostic('TOOLCHAIN_ZEPHYR_BASE_INVALID'));
  const sdk = await realDirectory(process.env.ZEPHYR_SDK_INSTALL_DIR);
  replaceCheck(checks, { id: 'zephyr-sdk', status: sdk ? 'ready' : process.env.ZEPHYR_SDK_INSTALL_DIR ? 'invalid' : 'missing' });
  if (!sdk) diagnostics.push(toolchainDiagnostic('TOOLCHAIN_ZEPHYR_SDK_INVALID'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const armReady = await sdkToolchain(sdk, `arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc${suffix}`);
  const xtensaReady = await sdkToolchain(sdk, `xtensa-espressif_esp32s3_zephyr-elf/bin/xtensa-espressif_esp32s3_zephyr-elf-gcc${suffix}`);
  replaceCheck(checks, { id: 'arm-toolchain', status: armReady ? 'ready' : 'missing' });
  replaceCheck(checks, { id: 'xtensa-toolchain', status: xtensaReady ? 'ready' : 'missing' });
  if (!armReady) diagnostics.push(toolchainDiagnostic('TOOLCHAIN_ARM_MISSING'));
  if (!xtensaReady) diagnostics.push(toolchainDiagnostic('TOOLCHAIN_XTENSA_MISSING'));
  return toolchainResult(checks, boards, diagnostics);
}
