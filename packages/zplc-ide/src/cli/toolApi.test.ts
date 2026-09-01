import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAndMigrateProject } from '../project/projectModel';
import { artifactEvidence, boardsList, compilerCheck, compilerCompile, createTestDeadline, executionPermission, finishToolExecution, firmwareBuild, firmwareBuildPlan, isToolExecutionEnvelope, projectInspect, projectMigrationExport, projectMigrationPreview, projectValidate, safetyCheck, scenarioRun, startToolExecution, symbolsList, testsRun, toolchainInspect, withToolExecution } from './toolApi';

const demo = fileURLToPath(new URL('../../projects/multitask_demo', import.meta.url));
const blinky = fileURLToPath(new URL('../../projects/blinky', import.meta.url));
const motorStartStop = fileURLToPath(new URL('../../projects/motor_start_stop', import.meta.url));
const pedestrianCrossing = fileURLToPath(new URL('../../projects/pedestrian_crossing', import.meta.url));
const tankLevel = fileURLToPath(new URL('../../projects/tank_level', import.meta.url));
const motorPlant = fileURLToPath(new URL('../../projects/motor_plant', import.meta.url));
const edgeCounter = fileURLToPath(new URL('../../projects/edge_counter', import.meta.url));
const scanSnapshot = fileURLToPath(new URL('../../projects/scan_snapshot', import.meta.url));
const conveyor = fileURLToPath(new URL('../../projects/conveyor_01', import.meta.url));
const conveyorStarter = fileURLToPath(new URL('../../projects/conveyor_01_starter', import.meta.url));
const learnExercises = [
  ['motor_start_stop_starter', 'motor_start_stop', 'MotorStartStop'],
  ['pedestrian_crossing_starter', 'pedestrian_crossing', 'PedestrianCrossing'],
  ['tank_level_starter', 'tank_level', 'TankLevel'],
  ['conveyor_01_starter', 'conveyor_01', 'Conveyor01'],
  ['blinky_starter', 'blinky', 'BlinkyVisual'],
  ['motor_plant_starter', 'motor_plant', 'MotorPlant'],
  ['edge_counter_starter', 'edge_counter', 'EdgeCounter'],
  ['scan_snapshot_starter', 'scan_snapshot', 'ScanSnapshot'],
  ['conveyor_01_starter', 'conveyor_01', 'Conveyor01'],
  ['conveyor_two_parts_starter', 'conveyor_01', 'ConveyorTwoParts'],
] as const;
const legacyMotorStartStopFixture = fileURLToPath(new URL('./fixtures/motor_start_stop.v1/zplc.json', import.meta.url));
const nativeRuntimeBinary = fileURLToPath(new URL('../../../../firmware/lib/zplc_core/build/zplc_runtime', import.meta.url));
const nativeScenarioBinary = process.env.ZPLC_NATIVE_SIM_BIN ?? nativeRuntimeBinary;

function semanticScenarioTraceHash(result: Awaited<ReturnType<typeof scenarioRun>>, scenarioId: string): string {
  if (!result.ok || !result.traceFile) throw new Error(`${scenarioId}: native scenario result is unavailable`);
  const traceFile = JSON.parse(new TextDecoder().decode(result.traceFile)) as { scenarios?: Array<{ id?: unknown; trace?: Array<{ atMs?: unknown; outputs?: unknown; plant?: unknown }>; assertions?: Array<{ kind?: unknown; passed?: unknown; atMs?: unknown }> }> };
  const scenario = traceFile.scenarios?.find((entry) => entry.id === scenarioId);
  if (!scenario?.trace || !scenario.assertions) throw new Error(`${scenarioId}: native scenario trace is incomplete`);
  const trace = scenario.trace.map((sample) => {
    if (typeof sample.atMs !== 'number' || !sample.outputs || typeof sample.outputs !== 'object' || Array.isArray(sample.outputs)) throw new Error(`${scenarioId}: invalid trace sample`);
    const outputs = Object.entries(sample.outputs).map(([signal, value]) => {
      if (typeof value !== 'boolean') throw new Error(`${scenarioId}: invalid output ${signal}`);
      return [signal, value] as const;
    }).sort(([left], [right]) => left.localeCompare(right));
    const plant = sample.plant === undefined ? undefined : (() => {
      if (!sample.plant || typeof sample.plant !== 'object' || Array.isArray(sample.plant)) throw new Error(`${scenarioId}: invalid plant sample`);
      return Object.entries(sample.plant).sort(([left], [right]) => left.localeCompare(right));
    })();
    return { atMs: sample.atMs, outputs, ...(plant === undefined ? {} : { plant }) };
  });
  const assertions = scenario.assertions.map((assertion) => {
    if (typeof assertion.kind !== 'string' || typeof assertion.passed !== 'boolean' || (assertion.atMs !== undefined && typeof assertion.atMs !== 'number')) throw new Error(`${scenarioId}: invalid assertion`);
    return { kind: assertion.kind, passed: assertion.passed, ...(assertion.atMs === undefined ? {} : { atMs: assertion.atMs }) };
  });
  return createHash('sha256').update(JSON.stringify({ scenarioId, trace, assertions })).digest('hex');
}

async function legacyMotorStartStop() {
  const root = await mkdtemp(join(tmpdir(), 'zplc-legacy-motor-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'zplc.json'), await readFile(legacyMotorStartStopFixture, 'utf8'));
  await writeFile(join(root, 'src', 'Motor.st'), await readFile(join(motorStartStop, 'src', 'Motor.st'), 'utf8'));
  await writeFile(join(root, 'tests', 'motor-start-stop.scenario.json'), await readFile(join(motorStartStop, 'tests', 'motor-start-stop.scenario.json'), 'utf8'));
  return root;
}

async function toolchainRepository() {
  const root = await mkdtemp(join(tmpdir(), 'zplc-toolchain-'));
  await mkdir(join(root, 'firmware', 'app', 'boards'), { recursive: true });
  await writeFile(join(root, 'firmware', 'app', 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20.0)');
  await writeFile(join(root, 'west.yml'), 'manifest:\n  projects:\n    - name: zephyr\n      revision: dccb09599635bdff17633fa7e9dab014b91dce90\n');
  const boards = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map((ide_id) => ({ board_id: ide_id, display_name: ide_id, ide_id, zephyr_board: `${ide_id}/board`, variant: 'test', support_assets: [`firmware/app/boards/${ide_id}.conf`], build_command: 'west build', network_class: 'other', validation_level: 'cross-build', evidence_refs: [], docs_ref: 'docs' }));
  for (const board of boards) await writeFile(join(root, board.support_assets[0]!), 'CONFIG_TEST=y');
  await writeFile(join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'), JSON.stringify(boards));
  return root;
}
async function filesBelow(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(prefix, entry.name);
    return entry.isDirectory() ? filesBelow(root, path) : [path];
  }));
  return files.flat().sort();
}
async function toolchainHost(root: string, head = 'dccb09599635bdff17633fa7e9dab014b91dce90', westScript: string | null | undefined = undefined, westBuildScript?: string) {
  const host = await mkdtemp(join(tmpdir(), 'zplc-toolchain-host-')); const bin = join(host, 'bin'); const base = join(host, 'zephyr'); const sdk = join(host, 'sdk');
  await mkdir(bin); await mkdir(base); await mkdir(join(sdk, 'arm-zephyr-eabi', 'bin'), { recursive: true }); await mkdir(join(sdk, 'xtensa-espressif_esp32s3_zephyr-elf', 'bin'), { recursive: true });
  await writeFile(join(sdk, 'arm-zephyr-eabi', 'bin', 'arm-zephyr-eabi-gcc'), 'toolchain'); await writeFile(join(sdk, 'xtensa-espressif_esp32s3_zephyr-elf', 'bin', 'xtensa-espressif_esp32s3_zephyr-elf-gcc'), 'toolchain');
  const versions: Record<string, string> = { west: 'west 1.5.0', python3: 'Python 3.12.0', cmake: 'cmake version 3.30.0', ninja: '1.12.0', git: head };
  for (const [command, output] of Object.entries(versions)) {
    if (command === 'west' && westScript === null) continue;
    const args = command === 'git' ? '[ "$#" -eq 5 ] && [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--verify" ] && [ "$5" = "HEAD" ] || exit 64' : '[ "$#" -eq 1 ] && [ "$1" = "--version" ] || exit 64';
    const path = join(bin, command);
    const body = command !== 'west' ? `${args}\nprintf '%s\\n' '${output}'` : `if [ "$1" = "--version" ]; then\n  [ "$#" -eq 1 ] || exit 64\n  ${westScript !== undefined ? westScript : `printf '%s\\n' '${output}'`}\n  exit $?\nfi\n${westBuildScript ? `if [ "$1" = "build" ]; then\n  ${westBuildScript}\n  exit $?\nfi\n` : ''}exit 64`;
    await writeFile(path, `#!/bin/sh\n${body}\n`); await chmod(path, 0o755);
  }
  const oldPath = process.env.PATH; const oldBase = process.env.ZEPHYR_BASE; const oldSdk = process.env.ZEPHYR_SDK_INSTALL_DIR;
  process.env.PATH = bin; process.env.ZEPHYR_BASE = base; process.env.ZEPHYR_SDK_INSTALL_DIR = sdk;
  return async () => {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldBase === undefined) delete process.env.ZEPHYR_BASE; else process.env.ZEPHYR_BASE = oldBase;
    if (oldSdk === undefined) delete process.env.ZEPHYR_SDK_INSTALL_DIR; else process.env.ZEPHYR_SDK_INSTALL_DIR = oldSdk;
    await rm(host, { recursive: true, force: true }); await rm(root, { recursive: true, force: true });
  };
}

describe('local Tool API', () => {
  it('checks the declared motor output interlock from compiled NEVER assertions without running a simulator', async () => {
    const result = await safetyCheck(motorStartStop);
    expect(result).toMatchObject({ ok: true, summary: { configured: true, covered: [{ outputs: ['Motor.Forward', 'Motor.Reverse'] }], uncovered: [] }, evidence: { operation: 'safety-check', outcome: 'passed', artifacts: [] } });
    expect(JSON.stringify(result)).not.toContain(motorStartStop);
  });

  it('reports absent declarations and exact NEVER coverage failures without starting native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = '/not/a/runtime';
    const root = await mkdtemp(join(tmpdir(), 'zplc-safety-uncovered-'));
    try {
      await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
      await writeFile(join(root, 'zplc.json'), await readFile(join(motorStartStop, 'zplc.json')));
      await writeFile(join(root, 'src', 'Motor.st'), await readFile(join(motorStartStop, 'src', 'Motor.st')));
      const scenario = JSON.parse(await readFile(join(motorStartStop, 'tests', 'motor-start-stop.scenario.json'), 'utf8')) as { expectations: Array<{ kind: string; condition: Record<string, boolean> }> };
      scenario.expectations = scenario.expectations.map((assertion) => assertion.kind === 'NEVER' ? { ...assertion, condition: { 'Motor.Forward': true, 'Motor.Reverse': false } } : assertion);
      await writeFile(join(root, 'tests', 'motor-start-stop.scenario.json'), JSON.stringify(scenario));
      await expect(safetyCheck(root)).resolves.toMatchObject({ ok: false, summary: { covered: [], uncovered: [{ outputs: ['Motor.Forward', 'Motor.Reverse'] }] }, evidence: { operation: 'safety-check', diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED' }], artifacts: [] } });
      await expect(safetyCheck(demo)).resolves.toEqual({ ok: true, summary: { configured: false, declared: [], covered: [], uncovered: [] }, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'passed', diagnostics: [], artifacts: [] } });
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN; else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unbounded WHILE and REPEAT statements from the canonical ST AST without starting native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = '/not/a/runtime';
    const root = await mkdtemp(join(tmpdir(), 'zplc-safety-loops-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'loops', version: '1.0.0', communication: { bindings: [{ name: 'Injected', symbol: 'Injected', type: 'BOOL', publish: true }] }, tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }] }));
      await writeFile(join(root, 'src', 'Main.st'), `FUNCTION Count : INT
WHILE TRUE DO
END_WHILE;
END_FUNCTION

FUNCTION_BLOCK Controller
METHOD Step
REPEAT
UNTIL TRUE
END_REPEAT;
END_METHOD
WHILE FALSE DO
END_WHILE;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  i : INT;
END_VAR
CASE i OF
  0:
    WHILE FALSE DO
      REPEAT
      UNTIL TRUE
      END_REPEAT;
    END_WHILE;
END_CASE;
FOR i := 0 TO 1 DO
END_FOR;
END_PROGRAM`);
      await expect(safetyCheck(root)).resolves.toMatchObject({
        ok: false,
        evidence: {
          operation: 'safety-check',
          artifacts: [],
          diagnostics: [
            { code: 'SAFETY_UNBOUNDED_WHILE', path: 'src/Main.st', line: 2 },
            { code: 'SAFETY_UNBOUNDED_REPEAT', path: 'src/Main.st', line: 8 },
            { code: 'SAFETY_UNBOUNDED_WHILE', path: 'src/Main.st', line: 12 },
            { code: 'SAFETY_UNBOUNDED_WHILE', path: 'src/Main.st', line: 22 },
            { code: 'SAFETY_UNBOUNDED_REPEAT', path: 'src/Main.st', line: 23 },
          ],
        },
      });
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN; else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not treat the IL transpiler\'s internal bounded loop as user-authored ST', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-safety-il-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'il', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.il'] }] }));
      await writeFile(join(root, 'src', 'Main.il'), 'PROGRAM Main\nVAR\n  Count : INT;\nEND_VAR\n  LD Count\n  ADD 1\n  ST Count\nEND_PROGRAM');
      await expect(safetyCheck(root)).resolves.toEqual({ ok: true, summary: { configured: false, declared: [], covered: [], uncovered: [] }, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'passed', diagnostics: [], artifacts: [] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('checks SFC user action bodies only after their canonical ST transpilation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-safety-sfc-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'sfc', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.sfc'] }] }));
      const model = JSON.parse(await readFile(join(blinky, 'src', 'main.sfc.json'), 'utf8')) as { actions: Array<{ id: string; body: string }> };
      model.actions.find((action) => action.id === 'SET_LED_ON')!.body = 'WHILE TRUE DO\nEND_WHILE;';
      await writeFile(join(root, 'src', 'main.sfc.json'), JSON.stringify(model));
      const result = await safetyCheck(root);
      expect(result).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SAFETY_UNBOUNDED_WHILE', path: 'src/main.sfc.json' }] } });
      expect(result.evidence.diagnostics[0]).toEqual({ code: 'SAFETY_UNBOUNDED_WHILE', message: 'WHILE has no provable static iteration bound', path: 'src/main.sfc.json' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not treat a three-output NEVER as pair coverage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-safety-physical-'));
    try {
      await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
      const manifest = { schemaVersion: 2, name: 'safety', version: '1.0.0', safety: { incompatibleOutputs: [['Motor.Forward', 'Motor.Reverse']] }, tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Motor.st'] }] };
      await writeFile(join(root, 'zplc.json'), JSON.stringify(manifest));
      await writeFile(join(root, 'src', 'Motor.st'), 'PROGRAM Motor\nVAR_INPUT\nStart AT %I0.0 : BOOL;\nEND_VAR\nVAR_OUTPUT\nForward AT %Q0.0 : BOOL;\nReverse AT %Q0.1 : BOOL;\nThird AT %Q0.2 : BOOL;\nEND_VAR\nForward := FALSE; Reverse := FALSE; Third := FALSE;\nEND_PROGRAM');
      await writeFile(join(root, 'tests', 'main.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'Safety', tickMs: 10, durationMs: 10, events: [{ atMs: 0, set: { 'Motor.Start': true } }], expectations: [{ kind: 'NEVER', condition: { 'Motor.Forward': true, 'Motor.Reverse': true, 'Motor.Third': true } }] }));
      expect(await safetyCheck(root)).toMatchObject({ ok: false, summary: { uncovered: [{ outputs: ['Motor.Forward', 'Motor.Reverse'] }] }, evidence: { diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED' }] } });
      manifest.safety.incompatibleOutputs = [['Motor.Forward', 'Motor.Reverse'], ['Motor.Forward', 'Motor.Third']];
      await writeFile(join(root, 'zplc.json'), JSON.stringify(manifest));
      expect(await safetyCheck(root)).toMatchObject({ ok: false, summary: { uncovered: expect.any(Array) }, evidence: { diagnostics: [{ code: 'SAFETY_INTERLOCK_UNCOVERED' }] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects non-output declarations, physical aliases, and duplicate physical pairs before scenarios run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-safety-addresses-'));
    const writeManifest = async (incompatibleOutputs: string[][]) => writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'safety', version: '1.0.0', safety: { incompatibleOutputs }, tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Motor.st'] }] }));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'src', 'Motor.st'), 'PROGRAM Motor\nVAR_INPUT\nInput AT %I0.0 : BOOL;\nEND_VAR\nVAR\nMemory : BOOL;\nEND_VAR\nVAR_OUTPUT\nForward AT %Q0.0 : BOOL;\nAlias AT %Q0.0 : BOOL;\nReverse AT %Q0.1 : BOOL;\nOutputWord AT %QW1 : WORD;\nEND_VAR\nForward := FALSE; Alias := FALSE; Reverse := FALSE; OutputWord := 0;\nEND_PROGRAM');
      for (const invalid of ['Motor.Missing', 'Motor.Input', 'Motor.Memory', 'Motor.OutputWord']) {
        await writeManifest([[invalid, 'Motor.Reverse']]);
        expect(await safetyCheck(root)).toMatchObject({ ok: false, evidence: { operation: 'safety-check', diagnostics: [{ code: 'SAFETY_OUTPUT_INVALID' }], artifacts: [] } });
      }
      await writeManifest([['Motor.Forward', 'Motor.Alias']]);
      expect(await safetyCheck(root)).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SAFETY_OUTPUT_INVALID' }], artifacts: [] } });
      for (const pairs of [[['Motor.Forward', 'Motor.Reverse'], ['Motor.Alias', 'Motor.Reverse']], [['Motor.Forward', 'Motor.Reverse'], ['Motor.Reverse', 'Motor.Alias']]]) {
        await writeManifest(pairs);
        expect(await safetyCheck(root)).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SAFETY_OUTPUT_DUPLICATE' }], artifacts: [] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('exports a read-only toolchain inspection', async () => {
    await expect(toolchainInspect('/not/a/zplc/repository')).resolves.toMatchObject({ ok: false, evidence: { operation: 'toolchain-inspect' } });
    const root = await mkdtemp(join(tmpdir(), 'zplc-toolchain-file-'));
    try { await writeFile(join(root, 'not-a-directory'), 'file'); await expect(toolchainInspect(join(root, 'not-a-directory'))).resolves.toMatchObject({ ok: false, evidence: { operation: 'toolchain-inspect' } }); }
    finally { await rm(root, { recursive: true, force: true }); }
  });
  it('lists only canonical declared board facts without probing a toolchain', async () => {
    const root = await toolchainRepository();
    try {
      const result = await boardsList(root);
      expect(result.ok).toBe(true); if (result.ok) expect(result.summary.boards[0]).toEqual({ boardId: 'alpha', ideId: 'alpha', zephyrBoard: 'alpha/board', validationLevel: 'cross-build' });
      expect(result.evidence).toMatchObject({ operation: 'boards-list', outcome: 'passed' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('returns a static cross-build plan without probing, writing, or exposing build details', async () => {
    const root = await toolchainRepository();
    const oldPath = process.env.PATH; const oldBase = process.env.ZEPHYR_BASE; const oldSdk = process.env.ZEPHYR_SDK_INSTALL_DIR;
    process.env.PATH = ''; process.env.ZEPHYR_BASE = 'base-secret-value'; process.env.ZEPHYR_SDK_INSTALL_DIR = 'sdk-secret-value';
    try {
      const manifest = join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json');
      const boards = JSON.parse(await readFile(manifest, 'utf8')) as Array<Record<string, unknown>>;
      boards[0]!.board_id = 'alpha-board'; boards[0]!.build_command = 'west build; do-not-run'; await writeFile(manifest, JSON.stringify(boards));
      const before = await filesBelow(root);
      const result = await firmwareBuildPlan(root, 'alpha');
      expect(result).toEqual({
        ok: true,
        summary: {
          schemaVersion: 1,
          board: { boardId: 'alpha-board', ideId: 'alpha', zephyrBoard: 'alpha/board', validationLevel: 'cross-build' },
          applicationPath: 'firmware/app',
          expectedArtifacts: [{ role: 'cross-build-evidence', relativePath: 'zephyr/zephyr.elf', required: true }],
        },
        evidence: { schemaVersion: 1, operation: 'firmware-build-plan', outcome: 'passed', diagnostics: [], artifacts: [] },
      });
      const serialized = JSON.stringify(result);
      for (const value of [root, 'base-secret-value', 'sdk-secret-value', 'build_command', 'west build', 'do-not-run', 'argv', 'cwd', 'sha256']) expect(serialized).not.toContain(value);
      expect((await toolchainInspect(root)).summary.boards[0]).toEqual({ ideId: 'alpha', zephyrBoard: 'alpha/board', validationLevel: 'cross-build' });
      expect(await filesBelow(root)).toEqual(before);
    } finally {
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
      if (oldBase === undefined) delete process.env.ZEPHYR_BASE; else process.env.ZEPHYR_BASE = oldBase;
      if (oldSdk === undefined) delete process.env.ZEPHYR_SDK_INSTALL_DIR; else process.env.ZEPHYR_SDK_INSTALL_DIR = oldSdk;
      await rm(root, { recursive: true, force: true });
    }
  });
  it('fails closed for an unknown selector and invalid static build-plan prerequisites', async () => {
    const root = await toolchainRepository(); const linkedRoot = `${root}-alias`;
    const diagnostic = [{ code: 'FIRMWARE_BUILD_PLAN_UNAVAILABLE', message: 'Firmware build plan is unavailable' }];
    try {
      for (const ideId of ['unknown', 'Alpha']) await expect(firmwareBuildPlan(root, ideId)).resolves.toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build-plan', outcome: 'failed', diagnostics: diagnostic, artifacts: [] } });
      const fileRoot = join(root, 'not-a-directory');
      await writeFile(fileRoot, 'file'); await symlink(root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(firmwareBuildPlan(fileRoot, 'alpha')).resolves.toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build-plan', outcome: 'failed', diagnostics: diagnostic, artifacts: [] } });
      await expect(firmwareBuildPlan(linkedRoot, 'alpha')).resolves.toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build-plan', outcome: 'failed', diagnostics: diagnostic, artifacts: [] } });
      for (const kind of ['missing-cmake', 'linked-cmake', 'malformed-manifest', 'linked-asset'] as const) {
        const invalid = await toolchainRepository();
        try {
          const cmake = join(invalid, 'firmware', 'app', 'CMakeLists.txt');
          const manifest = join(invalid, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json');
          if (kind === 'missing-cmake') await rm(cmake);
          if (kind === 'linked-cmake') { await rm(cmake); await symlink(join(invalid, 'west.yml'), cmake); }
          if (kind === 'malformed-manifest') await writeFile(manifest, '{');
          if (kind === 'linked-asset') { const asset = join(invalid, 'firmware', 'app', 'boards', 'alpha.conf'); await rm(asset); await symlink(join(invalid, 'west.yml'), asset); }
          await expect(firmwareBuildPlan(invalid, 'alpha')).resolves.toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build-plan', outcome: 'failed', diagnostics: diagnostic, artifacts: [] } });
        } finally { await rm(invalid, { recursive: true, force: true }); }
      }
      await expect(firmwareBuildPlan(join(root, 'missing'), 'alpha')).resolves.toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build-plan', outcome: 'failed', diagnostics: diagnostic, artifacts: [] } });
    } finally { await rm(linkedRoot, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === 'win32')('does not run west for invalid firmware build admission', async () => {
    const root = await toolchainRepository(); const bin = await mkdtemp(join(tmpdir(), 'zplc-build-marker-')); const marker = join(bin, 'west-ran'); const oldPath = process.env.PATH;
    try {
      await writeFile(join(bin, 'west'), `#!/bin/sh\nprintf ran > '${marker}'\nexit 99\n`); await chmod(join(bin, 'west'), 0o755); process.env.PATH = `${bin}:/usr/bin:/bin`;
      await expect(firmwareBuild(root, 'Alpha')).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'FIRMWARE_BUILD_UNAVAILABLE' }] } });
      await expect(firmwareBuild(join(root, 'missing'), 'alpha')).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'FIRMWARE_BUILD_UNAVAILABLE' }] } });
      expect(existsSync(marker)).toBe(false);
    } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; await rm(bin, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === 'win32')('fails closed when the canonical toolchain baseline is not ready before west build', async () => {
    const root = await toolchainRepository(); const marker = join(root, 'west-build-ran'); let restore: (() => Promise<void>) | undefined;
    try {
      restore = await toolchainHost(root, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', undefined, `printf build > '${marker}'`);
      const result = await firmwareBuild(root, 'alpha');
      expect(result).toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'failed', diagnostics: [{ code: 'FIRMWARE_BUILD_TOOLCHAIN_UNAVAILABLE', message: 'Firmware build is unavailable' }], artifacts: [] } });
      expect(existsSync(marker)).toBe(false);
    } finally { await restore?.(); await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === 'win32')('cancels before toolchain inspection or west build', async () => {
    const root = await toolchainRepository(); const bin = await mkdtemp(join(tmpdir(), 'zplc-build-aborted-')); const marker = join(bin, 'ran'); const oldPath = process.env.PATH; const controller = new AbortController(); controller.abort();
    try {
      await writeFile(join(bin, 'west'), `#!/bin/sh\nprintf ran > '${marker}'\n`); await chmod(join(bin, 'west'), 0o755); process.env.PATH = bin;
      await expect(firmwareBuild(root, 'alpha', { signal: controller.signal })).resolves.toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'failed', diagnostics: [{ code: 'FIRMWARE_BUILD_CANCELLED', message: 'Firmware build is unavailable' }], artifacts: [] } });
      expect(existsSync(marker)).toBe(false);
    } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; await rm(bin, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === 'win32')('maps a ready canonical toolchain build to sanitized ELF evidence', async () => {
    const root = await toolchainRepository(); const marker = join(root, 'west-build-ran'); let restore: (() => Promise<void>) | undefined;
    try {
      restore = await toolchainHost(root, undefined, undefined, `while [ "$#" -gt 0 ]; do [ "$1" = -d ] && { shift; out=$1; }; shift; done\n/bin/mkdir -p "$out/zephyr"\n/bin/dd if=/dev/zero of="$out/zephyr/zephyr.elf" bs=52 count=1 2>/dev/null\nprintf '\\177ELF\\001\\001\\001' | /bin/dd of="$out/zephyr/zephyr.elf" bs=1 seek=0 conv=notrunc 2>/dev/null\nprintf '\\002\\000\\003\\000\\001\\000\\000\\000' | /bin/dd of="$out/zephyr/zephyr.elf" bs=1 seek=16 conv=notrunc 2>/dev/null\nprintf '\\064\\000' | /bin/dd of="$out/zephyr/zephyr.elf" bs=1 seek=40 conv=notrunc 2>/dev/null\nprintf build > '${marker}'\nprintf built`);
      const result = await firmwareBuild(root, 'alpha');
      expect(result).toMatchObject({ ok: true, summary: { schemaVersion: 1, scope: 'local-ephemeral-cross-build', sourceIdentity: 'unverified', board: { ideId: 'alpha', zephyrBoard: 'alpha/board' }, artifact: { kind: 'firmware-elf', byteLength: 52, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }, output: { stdoutBytes: 5, stderrBytes: 0, truncated: false } }, evidence: { operation: 'firmware-build', outcome: 'passed' } });
      if (result.ok) expect(result.evidence.artifacts).toEqual([result.summary.artifact]);
      expect(existsSync(marker)).toBe(true);
      const serialized = JSON.stringify(result); for (const value of [root, 'argv', 'cwd', 'PATH', 'built']) expect(serialized).not.toContain(value);
    } finally { await restore?.(); await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === 'win32')('fails closed when the admitted board plan changes during west execution', async () => {
    const root = await toolchainRepository(); let restore: (() => Promise<void>) | undefined;
    try {
      const manifest = join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'); const changed = JSON.stringify((JSON.parse(await readFile(manifest, 'utf8')) as Array<Record<string, unknown>>).map((board) => board.ide_id === 'alpha' ? { ...board, zephyr_board: 'changed/board' } : board));
      restore = await toolchainHost(root, undefined, undefined, `while [ "$#" -gt 0 ]; do [ "$1" = -d ] && { shift; out=$1; }; shift; done\n/bin/mkdir -p "$out/zephyr"\n/bin/dd if=/dev/zero of="$out/zephyr/zephyr.elf" bs=52 count=1 2>/dev/null\nprintf '\\177ELF\\001\\001\\001' | /bin/dd of="$out/zephyr/zephyr.elf" bs=1 seek=0 conv=notrunc 2>/dev/null\nprintf '\\002\\000\\003\\000\\001\\000\\000\\000' | /bin/dd of="$out/zephyr/zephyr.elf" bs=1 seek=16 conv=notrunc 2>/dev/null\nprintf '\\064\\000' | /bin/dd of="$out/zephyr/zephyr.elf" bs=1 seek=40 conv=notrunc 2>/dev/null\nprintf '%s' '${changed.replace(/'/g, "'\\''")}' > '${manifest}'`);
      await expect(firmwareBuild(root, 'alpha')).resolves.toEqual({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'failed', diagnostics: [{ code: 'FIRMWARE_BUILD_PLAN_STALE', message: 'Firmware build is unavailable' }], artifacts: [] } });
    } finally { await restore?.(); await rm(root, { recursive: true, force: true }); }
  });
  it('reports only structured prerequisite states and board facts without leaking paths or environment', async () => {
    const root = await toolchainRepository();
    const oldBase = process.env.ZEPHYR_BASE; const oldSdk = process.env.ZEPHYR_SDK_INSTALL_DIR;
    process.env.ZEPHYR_BASE = 'base-secret-value'; process.env.ZEPHYR_SDK_INSTALL_DIR = 'sdk-secret-value';
    try {
      const before = await readFile(join(root, 'west.yml'), 'utf8');
      const result = await toolchainInspect(root);
      expect(result.ok).toBe(false); expect(result.summary.ready).toBe(false); expect(result.summary.boards[0]).toEqual({ ideId: 'alpha', zephyrBoard: 'alpha/board', validationLevel: 'cross-build' });
      expect(result.summary.checks).toEqual(expect.arrayContaining([{ id: 'repository-manifest', status: 'ready' }, { id: 'west', status: expect.any(String) }, { id: 'zephyr-base', status: 'invalid', requiredRevision: 'dccb09599635bdff17633fa7e9dab014b91dce90' }, { id: 'zephyr-sdk', status: 'invalid' }, { id: 'arm-toolchain', status: 'missing' }, { id: 'xtensa-toolchain', status: 'missing' }]));
      expect(result.evidence).toMatchObject({ operation: 'toolchain-inspect', outcome: 'failed', artifacts: [] });
      expect(result.summary.checks.map((check) => check.id)).toEqual(['repository-manifest', 'west', 'python3', 'cmake', 'ninja', 'zephyr-base', 'zephyr-sdk', 'arm-toolchain', 'xtensa-toolchain']);
      expect(JSON.stringify(result)).not.toContain(root); expect(JSON.stringify(result)).not.toContain('secret-value');
      expect(await readFile(join(root, 'west.yml'), 'utf8')).toBe(before);
    } finally {
      if (oldBase === undefined) delete process.env.ZEPHYR_BASE; else process.env.ZEPHYR_BASE = oldBase;
      if (oldSdk === undefined) delete process.env.ZEPHYR_SDK_INSTALL_DIR; else process.env.ZEPHYR_SDK_INSTALL_DIR = oldSdk;
      await rm(root, { recursive: true, force: true });
    }
  });
  it('fails closed on malformed board inventories before any build action', async () => {
    const root = await toolchainRepository();
    try {
      const boardPath = join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json');
      await writeFile(boardPath, JSON.stringify(Array.from({ length: 6 }, () => ({ board_id: 'duplicate', display_name: 'duplicate', ide_id: 'duplicate', zephyr_board: 'board', variant: 'test', support_assets: ['firmware/app/boards/alpha.conf'], build_command: 'west build', network_class: 'other', validation_level: 'cross-build', evidence_refs: [], docs_ref: 'docs' }))));
      const result = await toolchainInspect(root);
      expect(result.ok).toBe(false); expect(result.summary.checks).toEqual(expect.arrayContaining([{ id: 'repository-manifest', status: 'malformed' }])); expect(result.evidence.diagnostics).toEqual(expect.arrayContaining([{ code: 'TOOLCHAIN_BOARDS_MALFORMED', message: 'Toolchain prerequisite is unavailable' }]));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects repository and asset symlinks or escapes without reading them', async () => {
    const root = await toolchainRepository(); const alias = `${root}-alias`;
    try {
      await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
      const linked = await toolchainInspect(alias); expect(linked.ok).toBe(false); expect(linked.evidence.diagnostics).toEqual([{ code: 'TOOLCHAIN_REPOSITORY_INVALID', message: 'Toolchain prerequisite is unavailable' }]);
      const boards = JSON.parse(await readFile(join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'), 'utf8')) as Array<{ support_assets: string[] }>;
      boards[0]!.support_assets = ['firmware/app/boards/../CMakeLists.txt']; await writeFile(join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'), JSON.stringify(boards));
      const escaped = await toolchainInspect(root); expect(escaped.summary.checks).toEqual(expect.arrayContaining([{ id: 'repository-manifest', status: 'malformed' }]));
    } finally { await rm(alias, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
  });
  it('rejects a symlinked board asset parent directory', async () => {
    const root = await toolchainRepository(); const boards = join(root, 'firmware', 'app', 'boards'); const original = join(root, 'firmware', 'app', 'boards-real');
    try {
      await rename(boards, original); await symlink(original, boards, process.platform === 'win32' ? 'junction' : 'dir');
      expect((await toolchainInspect(root)).summary.checks.find((check) => check.id === 'repository-manifest')?.status).not.toBe('ready');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('fails closed for required repository files that are absent, oversized, or linked', async () => {
    for (const kind of ['missing', 'oversized', 'linked'] as const) {
      const root = await toolchainRepository(); const cmake = join(root, 'firmware', 'app', 'CMakeLists.txt');
      try {
        if (kind === 'missing') await rm(cmake);
        if (kind === 'oversized') await writeFile(cmake, 'x'.repeat(128 * 1024 + 1));
        if (kind === 'linked') { await rm(cmake); await symlink(join(root, 'west.yml'), cmake); }
        const result = await toolchainInspect(root); expect(result.summary.checks).toEqual(expect.arrayContaining([{ id: 'repository-manifest', status: expect.any(String) }])); expect(result.summary.checks.find((check) => check.id === 'repository-manifest')?.status).not.toBe('ready');
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });
  it('rejects invalid board claims and assets outside the board asset root', async () => {
    const mutations = [
      (boards: Array<Record<string, unknown>>) => { boards[0]!.network_class = 'unknown'; },
      (boards: Array<Record<string, unknown>>) => { boards[0]!.board_id = 'x'.repeat(65); },
      (boards: Array<Record<string, unknown>>) => { boards[0]!.validation_level = 'human-hil'; boards[0]!.evidence_refs = []; },
      (boards: Array<Record<string, unknown>>) => { boards[1]!.board_id = boards[0]!.board_id; },
      (boards: Array<Record<string, unknown>>) => { boards[1]!.ide_id = boards[0]!.ide_id; },
      (boards: Array<Record<string, unknown>>) => { boards[0]!.support_assets = ['firmware/app/CMakeLists.txt']; },
    ];
    for (const mutate of mutations) {
      const root = await toolchainRepository();
      try {
        const path = join(root, 'firmware', 'app', 'boards', 'supported-boards.v1.5.0.json'); const boards = JSON.parse(await readFile(path, 'utf8')) as Array<Record<string, unknown>>;
        mutate(boards); await writeFile(path, JSON.stringify(boards)); expect((await toolchainInspect(root)).summary.checks.find((check) => check.id === 'repository-manifest')?.status).toBe('malformed');
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });
  it.skipIf(process.platform === 'win32')('accepts a coherent local host without invoking host tools outside its fixed allowlist', async () => {
    const root = await toolchainRepository(); const restore = await toolchainHost(root);
    try {
      const before = await Promise.all(['west.yml', 'firmware/app/CMakeLists.txt', 'firmware/app/boards/supported-boards.v1.5.0.json'].map((path) => readFile(join(root, path), 'utf8'))); const beforeFiles = await filesBelow(root);
      const result = await toolchainInspect(root);
      expect(result.ok).toBe(true); expect(result.summary).toMatchObject({ scope: 'local-firmware-build-prerequisites', ready: true }); expect(result.summary.boards.map((board) => board.ideId)).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']); expect(result.summary.boards.every((board) => board.validationLevel === 'cross-build')).toBe(true);
      expect(result.summary.checks).toEqual(expect.arrayContaining([{ id: 'west', status: 'ready', version: '1.5.0' }, { id: 'zephyr-base', status: 'ready', requiredRevision: 'dccb09599635bdff17633fa7e9dab014b91dce90', observedRevision: 'dccb09599635bdff17633fa7e9dab014b91dce90' }])); expect(result.evidence).toMatchObject({ operation: 'toolchain-inspect', outcome: 'passed', artifacts: [] });
      expect(await Promise.all(['west.yml', 'firmware/app/CMakeLists.txt', 'firmware/app/boards/supported-boards.v1.5.0.json'].map((path) => readFile(join(root, path), 'utf8')))).toEqual(before);
      expect(await filesBelow(root)).toEqual(beforeFiles);
    } finally { await restore(); }
  });
  it.skipIf(process.platform === 'win32')('associates a Zephyr HEAD mismatch with zephyr-base, not west', async () => {
    const root = await toolchainRepository(); const restore = await toolchainHost(root, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    try {
      const result = await toolchainInspect(root);
      expect(result.ok).toBe(false); expect(result.summary.checks).toEqual(expect.arrayContaining([{ id: 'west', status: 'ready', version: '1.5.0' }, { id: 'zephyr-base', status: 'invalid', requiredRevision: 'dccb09599635bdff17633fa7e9dab014b91dce90', observedRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]));
    } finally { await restore(); }
  });
  it('does not accept a Zephyr SHA attached to another west project', async () => {
    const root = await toolchainRepository();
    try {
      await writeFile(join(root, 'west.yml'), 'manifest:\n  projects:\n    - name: not-zephyr\n      revision: dccb09599635bdff17633fa7e9dab014b91dce90\n');
      const result = await toolchainInspect(root);
      expect(result.ok).toBe(false); expect(result.summary.checks).toEqual(expect.arrayContaining([{ id: 'repository-manifest', status: 'malformed' }, { id: 'west', status: expect.any(String) }, { id: 'zephyr-base', status: expect.any(String) }]));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === 'win32')('classifies fixed west probes as missing, malformed, timed out, or output-limited', async () => {
    const cases: Array<[string | null, string]> = [[null, 'missing'], ["printf '%s\\n' 'not-a-version'", 'malformed'], ['/bin/sleep 4', 'timeout'], ['i=0; while [ "$i" -lt 5000 ]; do printf x; i=$((i + 1)); done', 'unavailable']];
    for (const [script, status] of cases) {
      const root = await toolchainRepository(); const restore = await toolchainHost(root, 'dccb09599635bdff17633fa7e9dab014b91dce90', script);
      try { expect((await toolchainInspect(root)).summary.checks).toEqual(expect.arrayContaining([{ id: 'west', status }])); }
      finally { await restore(); }
    }
  }, 15_000);
  it('inspects canonical bundled projects without migration', async () => {
    await expect(projectInspect(demo)).resolves.toMatchObject({ ok: true, summary: { schemaVersion: 2, sourceSchemaVersion: 2, migrated: false, taskCount: 2 } });
  });
  it('migrates the checked-in v1 motor fixture, compiles its canonical artifact, and never writes it', async () => {
    const root = await legacyMotorStartStop();
    const manifestPath = join(root, 'zplc.json');
    const legacyManifest = await readFile(manifestPath, 'utf8');
    try {
      expect(JSON.parse(legacyManifest)).toMatchObject({
        schemaVersion: 1,
        communication: { tags: [] },
        tasks: [{ type: 'CYCLIC', interval: 10, file: 'Motor.st', watchdog: 100 }],
      });
      await expect(projectInspect(root)).resolves.toMatchObject({ ok: true, summary: { schemaVersion: 2, sourceSchemaVersion: 1, migrated: true, taskCount: 1 } });
      expect(await readFile(manifestPath, 'utf8')).toBe(legacyManifest);
      await expect(projectValidate(root)).resolves.toMatchObject({ ok: true });
      const [legacy, canonical] = await Promise.all([compilerCompile(root), compilerCompile(motorStartStop)]);
      expect(legacy).toMatchObject({ ok: true });
      expect(canonical).toMatchObject({ ok: true });
      if (legacy.ok && canonical.ok) expect(legacy.evidence.artifacts).toEqual(canonical.evidence.artifacts);
      expect(await readFile(manifestPath, 'utf8')).toBe(legacyManifest);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('previews every checked-in v1 motor alias without exposing values or writing', async () => {
    const root = await legacyMotorStartStop();
    const manifestPath = join(root, 'zplc.json');
    const legacyManifest = await readFile(manifestPath, 'utf8');
    try {
      const result = await projectMigrationPreview(root);
      expect(result).toMatchObject({
      ok: true,
      summary: {
        sourceSchemaVersion: 1,
        targetSchemaVersion: 2,
        changed: true,
        changes: expect.arrayContaining([
          { op: 'replace', path: '/schemaVersion' },
          { op: 'add', path: '/communication/bindings' },
          { op: 'remove', path: '/communication/tags' },
          { op: 'remove', path: '/tasks/0/type' },
          { op: 'remove', path: '/tasks/0/interval' },
          { op: 'remove', path: '/tasks/0/file' },
          { op: 'remove', path: '/tasks/0/watchdog' },
        ]),
      },
      evidence: { operation: 'migrate-preview', artifacts: [] },
      });
      expect(JSON.stringify(result)).not.toContain(root);
      expect(JSON.stringify(result)).not.toContain('Motor.Start');
      expect(await readFile(manifestPath, 'utf8')).toBe(legacyManifest);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('exports a deterministic v2 migration manifest as non-enumerable bytes without changing the source workspace', async () => {
    const root = await legacyMotorStartStop(); const manifestPath = join(root, 'zplc.json'); const source = await readFile(manifestPath);
    try {
      const result = await projectMigrationExport(root);
      expect(result).toMatchObject({ ok: true, summary: { sourceSchemaVersion: 1, targetSchemaVersion: 2, changed: true, changes: expect.any(Array) }, evidence: { operation: 'migrate', outcome: 'passed', artifacts: [{ kind: 'project-manifest' }] } });
      if (!result.ok) throw new Error('expected migration export');
      expect(Object.keys(result)).not.toContain('manifest'); expect(JSON.stringify(result)).not.toContain('Motor.Start');
      expect(result.manifest).toBeInstanceOf(Uint8Array);
      const artifact = result.evidence.artifacts[0]!;
      expect(artifact).toEqual(artifactEvidence('project-manifest', result.manifest!));
      const parsed = parseAndMigrateProject(JSON.parse(Buffer.from(result.manifest!).toString('utf8')));
      expect(parsed).toMatchObject({ ok: true, sourceSchemaVersion: 2, changed: false });
      expect(await readFile(manifestPath)).toEqual(source);
      const canonical = await projectMigrationExport(motorStartStop);
      expect(canonical).toMatchObject({ ok: true, summary: { sourceSchemaVersion: 2, targetSchemaVersion: 2, changed: false } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('validates and compiles through the canonical adapter with deterministic artifact evidence', async () => {
    await expect(projectValidate(demo)).resolves.toMatchObject({ ok: true });
    const checked = await compilerCheck(demo);
    const result = await compilerCompile(demo);
    expect(checked).toMatchObject({ ok: true, evidence: { operation: 'check', artifacts: [{ kind: 'zplc', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }] } });
    expect(checked.evidence.artifacts).toHaveLength(1);
    expect(checked.evidence.artifacts).toEqual(result.evidence.artifacts);
    for (const key of ['bytes', 'zplcFile', 'bytecode', 'assembly', 'debugMap']) {
      expect(Object.prototype.hasOwnProperty.call(checked, key)).toBe(false);
    }
    const checkedSerialized = JSON.stringify(checked);
    for (const key of ['bytes', 'zplcFile', 'bytecode', 'assembly', 'debugMap', 'SecretValue', demo]) {
      expect(checkedSerialized).not.toContain(key);
    }
    if (result.ok) {
      const artifact = result.evidence.artifacts[0];
      expect(artifact).toMatchObject({ kind: 'zplc', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(artifact?.byteLength).toBeGreaterThan(0);
      expect(result.bytes?.byteLength).toBe(artifact?.byteLength);
      expect(result.zplcFile).toBe(result.bytes);
      expect(result.bytecode).toBeInstanceOf(Uint8Array);
      expect(result.bytecode?.byteLength).toBeGreaterThan(0);
      expect(result.assembly).toEqual(expect.any(String));
      expect(result.debugMap).toMatchObject({ pou: expect.any(Object), memoryLayout: expect.any(Object) });
      for (const key of ['bytes', 'zplcFile', 'bytecode', 'assembly', 'debugMap']) {
        expect(Object.prototype.propertyIsEnumerable.call(result, key)).toBe(false);
      }
      expect(artifactEvidence('zplc', result.zplcFile!)).toEqual(artifact);
    }
    const serialized = JSON.stringify(result);
    for (const key of ['bytes', 'zplcFile', 'bytecode', 'assembly', 'debugMap']) {
      expect(serialized).not.toContain(key);
    }
    expect(serialized).not.toContain(demo);
    expect(serialized).not.toContain('SecretValue');
    const second = await compilerCompile(demo);
    if (result.ok && second.ok) expect(second.evidence.artifacts[0]).toEqual(result.evidence.artifacts[0]);
  });
  it('lists a deterministic sanitized debug-map symbol projection from the canonical compiler', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-symbols-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'symbols', version: '1.0.0', tasks: [
        { name: 'AlphaTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Alpha.st'] },
        { name: 'BetaTask', trigger: 'cyclic', interval_ms: 10, priority: 2, programs: ['Beta.st'] },
      ] }));
      await writeFile(join(root, 'src', 'Beta.st'), 'PROGRAM Beta\nVAR_INPUT\n Input AT %I0.0 : BOOL;\nEND_VAR\nVAR\n Work : INT;\nEND_VAR\nVAR_OUTPUT\n Output AT %Q0.1 : BOOL;\nEND_VAR\nOutput := Input;\nEND_PROGRAM');
      await writeFile(join(root, 'src', 'Alpha.st'), 'PROGRAM Alpha\nVAR_INPUT\n Input AT %I0.1 : BOOL;\nEND_VAR\nVAR\n Work : INT;\nEND_VAR\nVAR_OUTPUT\n Output AT %Q0.0 : BOOL;\nEND_VAR\nOutput := Input;\nEND_PROGRAM');
      const first = await symbolsList(root); const second = await symbolsList(root);
      expect(first).toMatchObject({ ok: true, summary: { symbols: [
        { pou: 'Alpha', name: 'Input', type: 'BOOL', region: 'IPI', address: 0, size: 1, bitOffset: 1, declarationLine: 3, sourceRef: 'src/Alpha.st' },
        { pou: 'Alpha', name: 'Output', type: 'BOOL', region: 'OPI', address: 4096, size: 1, bitOffset: 0, declarationLine: 9, sourceRef: 'src/Alpha.st' },
        { pou: 'Alpha', name: 'Work', type: 'INT', region: 'WORK', address: 8192, size: 2, declarationLine: 6, sourceRef: 'src/Alpha.st' },
        { pou: 'Beta', name: 'Input', type: 'BOOL', region: 'IPI', address: 0, size: 1, bitOffset: 0, declarationLine: 3, sourceRef: 'src/Beta.st' },
        { pou: 'Beta', name: 'Output', type: 'BOOL', region: 'OPI', address: 4096, size: 1, bitOffset: 1, declarationLine: 9, sourceRef: 'src/Beta.st' },
        { pou: 'Beta', name: 'Work', type: 'INT', region: 'WORK', address: 8448, size: 2, declarationLine: 6, sourceRef: 'src/Beta.st' },
      ] }, evidence: { operation: 'symbols-list', outcome: 'passed', artifacts: [] } });
      expect(second).toEqual(first);
      const serialized = JSON.stringify(first);
      for (const forbidden of ['zplcFile', 'bytecode', 'assembly', 'debugMap', 'tags', 'children', root, 'PROGRAM Alpha']) expect(serialized).not.toContain(forbidden);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('fails symbols listing through the canonical sanitized compile path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-symbols-failure-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'symbols', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }] }));
      await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nVAR\n SecretValue : BOOL;\nEND_VAR\n @\nEND_PROGRAM');
      const compileFailure = await symbolsList(root);
      expect(compileFailure).toMatchObject({ ok: false, evidence: { operation: 'symbols-list', outcome: 'failed', diagnostics: [{ code: 'COMPILATION_FAILED', path: 'src/Main.st' }], artifacts: [] } });
      expect(JSON.stringify(compileFailure)).not.toContain('SecretValue'); expect(JSON.stringify(compileFailure)).not.toContain(root);
      await rm(join(root, 'src', 'Main.st'));
      const missing = await symbolsList(root);
      expect(missing).toMatchObject({ ok: false, evidence: { operation: 'symbols-list', outcome: 'failed', diagnostics: [{ code: 'PROGRAM_NOT_FOUND', path: 'tasks[0].programs[0]' }], artifacts: [] } });
      expect(JSON.stringify(missing)).not.toContain(root);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('fails the canonical ESP32 compiler and test flows before emitting a program outside WORK', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-esp32-memory-'));
    try {
      await mkdir(join(root, 'src'));
      await mkdir(join(root, 'tests'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({
        schemaVersion: 2,
        name: 'esp32-memory',
        version: '1.0.0',
        target: { board: 'esp32s3_devkitc' },
        tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
      }));
      await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main VAR Value : ARRAY[0..2047] OF BOOL; END_VAR END_PROGRAM');
      await writeFile(join(root, 'tests', 'memory.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'Memory', tickMs: 10, durationMs: 10, events: [], expectations: [] }));

      for (const operation of [compilerCheck, compilerCompile, testsRun]) {
        const result = await operation(root);
        expect(result).toMatchObject({
          ok: false,
          evidence: { outcome: 'failed', diagnostics: [{ code: 'COMPILATION_FAILED', path: 'src/Main.st' }], artifacts: [] },
        });
        expect(JSON.stringify(result)).not.toContain(root);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('returns relative compiler paths and never echoes invalid source text', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-tool-api-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ name: 'test', version: '1.0.0', tasks: [{ name: 'Main', file: 'missing.st' }] }));
      await expect(projectValidate(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'PROGRAM_NOT_FOUND', path: 'tasks[0].programs[0]' }] } });
      await writeFile(join(root, 'src', 'missing.st'), 'PROGRAM Main\nVAR\n SecretValue : BOOL;\nEND_VAR\n @\nEND_PROGRAM');
      for (const compile of [compilerCheck, compilerCompile]) {
        const result = await compile(root);
        expect(result).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'COMPILATION_FAILED', message: 'Compilation failed', path: 'src/missing.st' }] } });
        expect(JSON.stringify(result)).not.toContain('SecretValue'); expect(JSON.stringify(result)).not.toContain(root);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('fails check and compile when a source declares multiple PROGRAMs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-tool-api-multiple-programs-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }] }));
      await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM First END_PROGRAM\nPROGRAM Second END_PROGRAM');
      for (const compile of [compilerCheck, compilerCompile]) {
        const result = await compile(root);
        expect(result).toMatchObject({
          ok: false,
          evidence: {
            outcome: 'failed',
            diagnostics: [{ code: 'COMPILATION_FAILED', message: 'Compilation failed', phase: 'codegen', line: 2, column: 1, path: 'src/Main.st' }],
            artifacts: [],
          },
        });
        for (const key of ['bytes', 'zplcFile', 'bytecode', 'assembly', 'debugMap']) {
          expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false);
        }
        expect(JSON.stringify(result)).not.toContain(root);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('checks task cardinality before resolving source files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-tool-api-task-cardinality-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['missing-a.st', 'missing-b.st'] }] }));
      for (const compile of [projectValidate, compilerCheck, compilerCompile]) {
        const result = await compile(root);
        expect(result).toMatchObject({
          ok: false,
          evidence: {
            outcome: 'failed',
            diagnostics: [{ code: 'COMPILATION_FAILED', message: 'Compilation failed', phase: 'codegen', line: 0, column: 0 }],
            artifacts: [],
          },
        });
        expect(result.evidence.diagnostics[0]).not.toHaveProperty('path');
        for (const key of ['bytes', 'zplcFile', 'bytecode', 'assembly', 'debugMap']) {
          expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false);
        }
        expect(JSON.stringify(result)).not.toContain(root); expect(JSON.stringify(result)).not.toContain('missing-a.st'); expect(JSON.stringify(result)).not.toContain('missing-b.st');
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('resolves a visual alias without using a task program name as a path', async () => {
    await expect(projectValidate(blinky)).resolves.toMatchObject({ ok: true });
    await expect(compilerCompile(blinky)).resolves.toMatchObject({ ok: true });
  });
  it('compiles upper-case IL and visual workspace sources through the shared detector', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-tool-case-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'src', 'Counter.IL'), 'PROGRAM Counter\nVAR\n Count : INT;\nEND_VAR\n LD Count\n ADD 1\n ST Count\nEND_PROGRAM');
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ name: 'il', version: '1.0.0', tasks: [{ name: 'Main', file: 'Counter.IL' }] }));
      await expect(compilerCompile(root)).resolves.toMatchObject({ ok: true });
      await writeFile(join(root, 'src', 'Main.LD.JSON'), await readFile(join(blinky, 'src', 'main.ld.json')));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ name: 'ld', version: '1.0.0', tasks: [{ name: 'Main', file: 'Main.LD.JSON' }] }));
      await expect(compilerCompile(root)).resolves.toMatchObject({ ok: true });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('testsRun', () => {
  async function workspace(source = 'PROGRAM Motor VAR_INPUT Start AT %I0.0 : BOOL; END_VAR VAR_OUTPUT Forward AT %Q0.0 : BOOL; END_VAR Forward := Start; END_PROGRAM') {
    const root = await mkdtemp(join(tmpdir(), 'zplc-tool-test-'));
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'tests'));
    await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Motor.st'] }] }));
    await writeFile(join(root, 'src', 'Motor.st'), source);
    return root;
  }
  const scenario = (id: string, tickMs = 10, expected = true) => JSON.stringify({ schemaVersion: 1, id, tickMs, durationMs: tickMs, events: [{ atMs: 0, set: { 'Motor.Start': true } }], expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': expected } }] });

  it.skipIf(!existsSync(nativeRuntimeBinary))('runs one selected scenario reproducibly without admitting an unselected assertion failure', async () => {
    const root = await workspace(); const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      await writeFile(join(root, 'tests', 'a.scenario.json'), scenario('Alpha'));
      await writeFile(join(root, 'tests', 'b.scenario.json'), scenario('Beta', 10, false));
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      const first = await scenarioRun(root, 'alpha'); const second = await scenarioRun(root, 'ALPHA');
      expect(first).toMatchObject({ ok: true, summary: { scenarios: [{ id: 'Alpha', path: 'tests/a.scenario.json', passed: true }] }, preview: { totalScenarioCount: 1, scenarios: [{ id: 'Alpha', passed: true }] }, evidence: { operation: 'scenario-run', artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] }, savedTestInputIdentity: { fileCount: 3 } });
      expect(first.traceFile).toBeInstanceOf(Uint8Array); expect(Object.getOwnPropertyDescriptor(first, 'traceFile')?.enumerable).toBe(false); expect(JSON.stringify(first)).not.toContain('traceFile');
      expect(second).toEqual(first);
      expect(await testsRun(root)).toMatchObject({ ok: false, evidence: { operation: 'test', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', path: 'tests/b.scenario.json' }] } });
      expect(await scenarioRun(root, 'Beta')).toMatchObject({ ok: false, preview: { totalScenarioCount: 1, scenarios: [{ id: 'Beta', passed: false }] }, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', path: 'tests/b.scenario.json' }], artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] } });
      await writeFile(join(root, 'tests', 'b.scenario.json'), `${scenario('Beta', 10, false)}\n`);
      expect(await scenarioRun(root, 'Alpha')).toEqual(first);
      await writeFile(join(root, 'tests', 'a.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'Alpha', tickMs: 10, durationMs: 20, events: [{ atMs: 0, set: { 'Motor.Start': true } }], expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': true } }] }));
      const changed = await scenarioRun(root, 'Alpha');
      expect(changed.savedTestInputIdentity).not.toEqual(first.savedTestInputIdentity);
      expect(changed.evidence.artifacts.find((artifact) => artifact.kind === 'trace')).not.toEqual(first.evidence.artifacts.find((artifact) => artifact.kind === 'trace'));
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN; else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('validates every scenario before selecting one and fails closed without a simulator', async () => {
    const root = await workspace(); const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      process.env.ZPLC_NATIVE_SIM_BIN = join(root, 'missing-runtime');
      await writeFile(join(root, 'tests', 'a.scenario.json'), scenario('Alpha'));
      await writeFile(join(root, 'tests', 'b.scenario.json'), scenario('alpha'));
      await expect(scenarioRun(root, 'Alpha')).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'TEST_DUPLICATE_SCENARIO', path: 'tests/b.scenario.json' }], artifacts: [] } });
      await writeFile(join(root, 'tests', 'b.scenario.json'), '{');
      await expect(scenarioRun(root, 'Alpha')).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'TEST_SCENARIO_INVALID', path: 'tests/b.scenario.json' }], artifacts: [] } });
      await writeFile(join(root, 'tests', 'b.scenario.json'), scenario('Beta', 20));
      await expect(scenarioRun(root, 'Alpha')).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'SCENARIO_TICK_MISMATCH', path: 'tests/b.scenario.json' }], artifacts: [] } });
      await rm(join(root, 'tests', 'b.scenario.json'));
      await expect(scenarioRun(root, 'Missing')).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'TEST_SCENARIO_NOT_FOUND', path: 'tests' }], artifacts: [] } });
      for (const selector of ['', 'x'.repeat(129), 'Alpha\0']) await expect(scenarioRun(root, selector)).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'TEST_SCENARIO_INVALID', path: 'tests' }], artifacts: [] } });
      const cancelled = new AbortController(); cancelled.abort();
      await expect(scenarioRun(root, 'Alpha', { signal: cancelled.signal })).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'TEST_CANCELLED' }], artifacts: [] } });
      await expect(scenarioRun(root, 'Alpha', { timeoutMs: 0 })).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', diagnostics: [{ code: 'TEST_TIMEOUT' }], artifacts: [] } });
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN; else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns structured cancellation and timeout results without trace evidence', async () => {
    const root = await workspace();
    try {
      const controller = new AbortController();
      controller.abort();
      const cancelled = await testsRun(root, { signal: controller.signal });
      expect(cancelled).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'TEST_CANCELLED' }], artifacts: [] } });
      expect(cancelled.traceFile).toBeUndefined();
      const timedOut = await testsRun(root, { timeoutMs: 0 });
      expect(timedOut).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'TEST_TIMEOUT' }] } });
      expect(timedOut.evidence.artifacts.some((artifact) => artifact.kind === 'trace')).toBe(false);
      expect(timedOut.traceFile).toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('uses a monotonic cutoff even before the event-loop timer can run', async () => {
    let now = 0;
    const deadline = createTestDeadline({ timeoutMs: 10_000, now: () => now });
    now = 10_001;
    expect(deadline.kind()).toBe('timeout');
    expect(deadline.signal.aborted).toBe(true);
    deadline.dispose();
  });

  it('keeps the first real abort source when cancellation and deadline compete', () => {
    let now = 0;
    const cancelled = new AbortController();
    const firstCancel = createTestDeadline({ signal: cancelled.signal, timeoutMs: 10, now: () => now });
    now = 9;
    cancelled.abort();
    now = 11;
    expect(firstCancel.kind()).toBe('cancelled');
    firstCancel.dispose();

    now = 0;
    const lateCancel = new AbortController();
    const firstTimeout = createTestDeadline({ signal: lateCancel.signal, timeoutMs: 10, now: () => now });
    now = 11;
    lateCancel.abort();
    expect(firstTimeout.kind()).toBe('timeout');
    firstTimeout.dispose();

    const preAborted = new AbortController();
    preAborted.abort();
    expect(createTestDeadline({ signal: preAborted.signal, timeoutMs: 0, now: () => 0 }).kind()).toBe('cancelled');
  });

  it('fails closed before native spawning for unsupported projects and invalid scenario inputs', async () => {
    const root = await workspace();
    try {
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'event', interval_ms: 10, priority: 1, programs: ['Motor.st'] }] }));
      await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SIMULATION_UNSUPPORTED_PROJECT', path: 'tasks' }], artifacts: [] } });
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Motor.st'] }] }));
      await writeFile(join(root, 'tests', 'bad.scenario.json'), '{');
      await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'TEST_SCENARIO_INVALID', path: 'tests/bad.scenario.json' }], artifacts: [] } });
      await writeFile(join(root, 'tests', 'bad.scenario.json'), scenario('MotorStart'));
      await writeFile(join(root, 'src', 'Motor.st'), 'PROGRAM Motor @ END_PROGRAM');
      await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'COMPILATION_FAILED', path: 'src/Motor.st' }], artifacts: [] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('admits only homogeneous cyclic task sets before native spawning', async () => {
    const root = await workspace();
    const tasks = [
      { name: 'Alpha', trigger: 'cyclic', interval_ms: 10, priority: 2, programs: ['Motor.st'] },
      { name: 'Beta', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Other.st'] },
    ];
    try {
      await writeFile(join(root, 'src', 'Other.st'), 'PROGRAM Other END_PROGRAM');
      for (const unsupported of [
        [{ ...tasks[0]!, interval_ms: 20 }, tasks[1]!],
        [{ ...tasks[0]!, trigger: 'event' }, tasks[1]!],
        [{ ...tasks[0]!, trigger: 'freewheeling' }, tasks[1]!],
      ]) {
        await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: unsupported }));
        await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SIMULATION_UNSUPPORTED_PROJECT', path: 'tasks' }], artifacts: [] } });
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.skipIf(!existsSync(nativeRuntimeBinary))('runs a deterministic homogeneous two-task POSIX scenario', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-taskset-posix-'));
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'taskset', version: '1.0.0', tasks: [
        { name: 'Second', trigger: 'cyclic', interval_ms: 10, priority: 2, programs: ['Second.st'] },
        { name: 'First', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['First.st'] },
      ] }));
      await writeFile(join(root, 'src', 'First.st'), 'PROGRAM First\nVAR_INPUT Start AT %I0.0 : BOOL; END_VAR\nVAR_OUTPUT Output AT %Q0.0 : BOOL; END_VAR\nOutput := Start;\nEND_PROGRAM');
      await writeFile(join(root, 'src', 'Second.st'), 'PROGRAM Second\nVAR_INPUT Start AT %I0.1 : BOOL; END_VAR\nVAR_OUTPUT Output AT %Q0.1 : BOOL; END_VAR\nOutput := Start;\nEND_PROGRAM');
      await writeFile(join(root, 'tests', 'taskset.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'TaskSet', tickMs: 10, durationMs: 20, events: [{ atMs: 0, set: { 'First.Start': true, 'Second.Start': true } }], expectations: [{ kind: 'ALWAYS', condition: { 'First.Output': true, 'Second.Output': true } }] }));
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      const first = await testsRun(root); const second = await testsRun(root);
      expect(first).toMatchObject({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'TaskSet', passed: true }] }, preview: { mode: 'logical-cyclic-task-set-scan', scenarios: [{ samples: expect.arrayContaining([expect.objectContaining({ outputs: { 'First.Output': true, 'Second.Output': true } })]) }] } });
      expect(second).toEqual(first);
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN; else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('checks cardinality before unsupported simulation, source resolution, or native spawning', async () => {
    const root = await workspace();
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'event', interval_ms: 10, priority: 1, programs: ['missing-a.st', 'missing-b.st'] }] }));
      process.env.ZPLC_NATIVE_SIM_BIN = join(root, 'missing-runtime');
      for (const run of [() => testsRun(root), () => scenarioRun(root, 'MotorStart')]) {
        const result = await run();
        expect(result).toMatchObject({ ok: false, evidence: { outcome: 'failed', diagnostics: [{ code: 'COMPILATION_FAILED', message: 'Compilation failed', phase: 'codegen', line: 0, column: 0 }], artifacts: [] } });
        expect(result.evidence.diagnostics[0]).not.toHaveProperty('path');
        expect(JSON.stringify(result)).not.toContain(root);
        expect(JSON.stringify(result)).not.toContain('missing-a.st');
        expect(JSON.stringify(result)).not.toContain('missing-b.st');
      }
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects duplicate scenario ids and task tick mismatches before native spawning', async () => {
    const root = await workspace();
    try {
      await writeFile(join(root, 'tests', 'a.scenario.json'), scenario('MotorStart'));
      await writeFile(join(root, 'tests', 'b.scenario.json'), scenario('motorstart'));
      await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'TEST_DUPLICATE_SCENARIO', path: 'tests/b.scenario.json' }], artifacts: [] } });
      await rm(join(root, 'tests', 'b.scenario.json'));
      await writeFile(join(root, 'tests', 'a.scenario.json'), scenario('MotorStart', 20));
      await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SCENARIO_TICK_MISMATCH', path: 'tests/a.scenario.json' }], artifacts: [] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('enforces the aggregate observation budget before native spawning', async () => {
    const outputs = Array.from({ length: 64 }, (_, index) => `Out${index}`);
    const source = `PROGRAM Motor VAR_INPUT Start AT %I0.0 : BOOL; END_VAR VAR_OUTPUT ${outputs.map((name, index) => `${name} AT %Q${Math.floor(index / 8)}.${index % 8} : BOOL;`).join(' ')} END_VAR ${outputs.map((name) => `${name} := Start;`).join(' ')} END_PROGRAM`;
    const root = await workspace(source);
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 1, priority: 1, programs: ['Motor.st'] }] }));
      await writeFile(join(root, 'tests', 'budget.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'Budget', tickMs: 1, durationMs: 2000, events: [{ atMs: 0, set: { 'Motor.Start': true } }], expectations: [{ kind: 'ALWAYS', condition: Object.fromEntries(outputs.map((name) => [`Motor.${name}`, true])) }] }));
      process.env.ZPLC_NATIVE_SIM_BIN = join(tmpdir(), 'zplc-tool-api-missing-simulator');
      await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'TEST_BUDGET_EXCEEDED', path: 'tests' }], artifacts: [] } });
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('counts many input writes as runtime operations before native spawning', async () => {
    const inputs = Array.from({ length: 10 }, (_, index) => `In${index}`);
    const source = `PROGRAM Motor VAR_INPUT ${inputs.map((name, index) => `${name} AT %I${Math.floor(index / 8)}.${index % 8} : BOOL;`).join(' ')} END_VAR VAR_OUTPUT Forward AT %Q0.0 : BOOL; END_VAR Forward := In0; END_PROGRAM`;
    const root = await workspace(source);
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    const events = Array.from({ length: 256 }, (_, atMs) => ({ atMs, set: Object.fromEntries(inputs.map((name) => [`Motor.${name}`, atMs % 2 === 0])) }));
    try {
      await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'test', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 1, priority: 1, programs: ['Motor.st'] }] }));
      for (let index = 0; index < 4; index += 1) {
        await writeFile(join(root, 'tests', `writes-${index}.scenario.json`), JSON.stringify({ schemaVersion: 1, id: `Writes${index}`, tickMs: 1, durationMs: 9999, events, expectations: [{ kind: 'ALWAYS', condition: { 'Motor.Forward': true } }] }));
      }
      process.env.ZPLC_NATIVE_SIM_BIN = join(tmpdir(), 'zplc-tool-api-missing-simulator');
      await expect(testsRun(root)).resolves.toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'TEST_BUDGET_EXCEEDED', path: 'tests' }], artifacts: [] } });
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('classifies a missing native simulator without emitting a fake trace', async () => {
    const root = await workspace();
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      await writeFile(join(root, 'tests', 'motor.scenario.json'), scenario('MotorStart'));
      process.env.ZPLC_NATIVE_SIM_BIN = join(tmpdir(), 'zplc-tool-api-missing-simulator');
      const result = await testsRun(root);
      expect(result).toMatchObject({ ok: false, evidence: { diagnostics: [{ code: 'SIMULATOR_UNAVAILABLE', path: 'tests/motor.scenario.json' }], artifacts: [{ kind: 'zplc' }] } });
      expect(result.savedTestInputIdentity).toBeUndefined();
      expect(result.traceFile).toBeUndefined();
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(!existsSync(nativeRuntimeBinary))('records complete zplc and trace evidence for assertion failures', async () => {
    const root = await workspace();
    try {
      await writeFile(join(root, 'tests', 'a.scenario.json'), scenario('MotorStart', 10, false));
      await writeFile(join(root, 'tests', 'b.scenario.json'), scenario('MotorStop', 10, false));
      const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      try {
        const result = await testsRun(root);
        expect(result).toMatchObject({ ok: false, evidence: { operation: 'test', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', path: 'tests/a.scenario.json' }, { code: 'SCENARIO_ASSERTION_FAILED', path: 'tests/b.scenario.json' }], artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] } });
        expect(result.savedTestInputIdentity).toMatchObject({ schemaVersion: 1, fileCount: 4, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
        expect(result).toMatchObject({ preview: { schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', totalScenarioCount: 2, scenarios: [{ id: 'MotorStart', passed: false }, { id: 'MotorStop', passed: false }] } });
        expect(result.preview?.traceEvidenceSha256).toBe(result.evidence.artifacts.find((artifact) => artifact.kind === 'trace')?.sha256);
        const trace = result.evidence.artifacts.find((artifact) => artifact.kind === 'trace');
        expect(result.traceFile).toBeInstanceOf(Uint8Array);
        expect(artifactEvidence('trace', result.traceFile!)).toEqual(trace);
        expect(Object.getOwnPropertyDescriptor(result, 'traceFile')?.enumerable).toBe(false);
        expect(JSON.stringify(result)).not.toContain('traceFile');
        expect(JSON.stringify(result)).not.toContain(root);
      } finally {
        if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(!existsSync(nativeRuntimeBinary))('changes aggregate trace evidence when only assertions change', async () => {
    const root = await workspace();
    try {
      const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      try {
        await writeFile(join(root, 'tests', 'motor.scenario.json'), scenario('MotorStart'));
        const passed = await testsRun(root);
        await writeFile(join(root, 'tests', 'motor.scenario.json'), scenario('MotorStart', 10, false));
        const failed = await testsRun(root);
        const passedTrace = passed.evidence.artifacts.find((artifact) => artifact.kind === 'trace');
        const failedTrace = failed.evidence.artifacts.find((artifact) => artifact.kind === 'trace');
        expect(passedTrace?.sha256).not.toBe(failedTrace?.sha256);
      } finally {
        if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(!existsSync(nativeRuntimeBinary))('runs a reproducible logical single-task scan on native POSIX', async () => {
    const root = await workspace();
    try {
      await writeFile(join(root, 'tests', 'motor.scenario.json'), scenario('MotorStart'));
      const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      try {
        const first = await testsRun(root);
        const second = await testsRun(root);
        expect(first).toMatchObject({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'MotorStart', path: 'tests/motor.scenario.json', passed: true }] }, evidence: { artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] }, preview: { scenarios: [{ id: 'MotorStart', passed: true }] } });
        const trace = first.evidence.artifacts.find((artifact) => artifact.kind === 'trace');
        expect(first.traceFile).toBeInstanceOf(Uint8Array);
        expect(artifactEvidence('trace', first.traceFile!)).toEqual(trace);
        expect(Object.getOwnPropertyDescriptor(first, 'traceFile')?.enumerable).toBe(false);
        expect(JSON.stringify(first)).not.toContain('traceFile');
        expect(second).toEqual(first);
      } finally {
        if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(!existsSync(nativeRuntimeBinary))('uses logical scenario time for TON at 0, 10, and 20ms', async () => {
    const root = await workspace(`PROGRAM Motor
VAR_INPUT
  Start AT %I0.0 : BOOL;
END_VAR
VAR
  Timer : TON;
END_VAR
VAR_OUTPUT
  Forward AT %Q0.0 : BOOL;
END_VAR
Timer(IN := TRUE, PT := T#20ms);
Forward := Timer.Q;
END_PROGRAM`);
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      await writeFile(join(root, 'tests', 'ton.scenario.json'), JSON.stringify({
        schemaVersion: 1, id: 'TonLogicalClock', tickMs: 10, durationMs: 20,
        events: [{ atMs: 0, set: { 'Motor.Start': false } }],
        expectations: [
          { kind: 'AT', atMs: 0, condition: { 'Motor.Forward': false } },
          { kind: 'AT', atMs: 10, condition: { 'Motor.Forward': false } },
          { kind: 'AT', atMs: 20, condition: { 'Motor.Forward': true } },
        ],
      }));
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      const first = await testsRun(root);
      const second = await testsRun(root);
      expect(first.ok).toBe(true);
      expect(first.preview?.scenarios[0]?.samples.map((sample) => [sample.atMs, sample.outputs['Motor.Forward']]))
        .toEqual([[0, false], [10, false], [20, true]]);
      expect(second).toEqual(first);
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeRuntimeBinary))('records only the exact saved inputs used by a completed host scenario run', async () => {
    const root = await workspace();
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    const identityOf = (result: Awaited<ReturnType<typeof testsRun>>) => (result as { savedTestInputIdentity?: { schemaVersion: number; sha256: string; fileCount: number } }).savedTestInputIdentity;
    try {
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      await writeFile(join(root, 'tests', 'motor.scenario.json'), scenario('MotorStart'));
      await writeFile(join(root, 'src', 'Unused.st'), 'PROGRAM Unused\nEND_PROGRAM');

      const initial = await testsRun(root);
      const repeated = await testsRun(root);
      expect(identityOf(initial)).toEqual(identityOf(repeated));
      expect(identityOf(initial)).toMatchObject({ schemaVersion: 1, fileCount: 3, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(JSON.stringify(initial)).not.toContain(root);
      expect(JSON.stringify(initial)).not.toContain('Unused.st');
      expect(JSON.stringify(initial)).not.toContain('PROGRAM Motor');

      await writeFile(join(root, 'zplc.json'), `${await readFile(join(root, 'zplc.json'), 'utf8')}\n`);
      const manifestChanged = await testsRun(root);
      expect(identityOf(manifestChanged)?.sha256).not.toBe(identityOf(initial)?.sha256);

      await writeFile(join(root, 'src', 'Motor.st'), `${await readFile(join(root, 'src', 'Motor.st'), 'utf8')}\n`);
      const sourceChanged = await testsRun(root);
      expect(identityOf(sourceChanged)?.sha256).not.toBe(identityOf(manifestChanged)?.sha256);

      await writeFile(join(root, 'tests', 'motor.scenario.json'), `${await readFile(join(root, 'tests', 'motor.scenario.json'), 'utf8')}\n`);
      const scenarioChanged = await testsRun(root);
      expect(identityOf(scenarioChanged)?.sha256).not.toBe(identityOf(sourceChanged)?.sha256);

      await writeFile(join(root, 'src', 'Unused.st'), 'PROGRAM Unused\n(* changed but unused *)\nEND_PROGRAM');
      const unusedChanged = await testsRun(root);
      expect(identityOf(unusedChanged)).toEqual(identityOf(scenarioChanged));
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeRuntimeBinary))('bounds preview samples while retaining endpoints and an intermediate failed assertion time', async () => {
    const root = await workspace();
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    try {
      await writeFile(join(root, 'tests', 'long.scenario.json'), JSON.stringify({ schemaVersion: 1, id: 'Long', tickMs: 10, durationMs: 300, events: [{ atMs: 0, set: { 'Motor.Start': true } }], expectations: [{ kind: 'AT', atMs: 150, condition: { 'Motor.Forward': false } }] }));
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      const result = await testsRun(root);
      expect(result.ok).toBe(false);
      const scenarioPreview = result.preview?.scenarios[0];
      expect(scenarioPreview).toMatchObject({ truncated: true, totalSamples: 31 });
      expect(scenarioPreview?.samples).toHaveLength(24);
      expect(scenarioPreview?.samples.map((sample) => sample.atMs)).toEqual(expect.arrayContaining([0, 150, 300]));
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('runs the checked-in motor start/stop golden scenario reproducibly on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      const first = await testsRun(motorStartStop);
      const second = await testsRun(motorStartStop);
      expect(first).toMatchObject({
        ok: true,
        summary: {
          backend: 'native-posix',
          mode: 'logical-cyclic-task-set-scan',
          scenarios: [{ id: 'MotorStartStop', path: 'tests/motor-start-stop.scenario.json', passed: true }],
        },
        evidence: { artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] },
      });
      expect(first.preview?.scenarios[0]?.assertions.map((assertion) => assertion.kind)).toEqual(expect.arrayContaining(['UNTIL', 'FOR', 'EVENTUALLY', 'RISING', 'FALLING']));
      expect(second).toEqual(first);
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('runs the checked-in pedestrian crossing golden scenario reproducibly on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      const first = await testsRun(pedestrianCrossing);
      const second = await testsRun(pedestrianCrossing);
      expect(first).toMatchObject({
        ok: true,
        summary: {
          backend: 'native-posix',
          mode: 'logical-cyclic-task-set-scan',
          scenarios: [{ id: 'PedestrianCrossing', path: 'tests/pedestrian-crossing.scenario.json', passed: true }],
        },
        evidence: { artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] },
      });
      expect(first.preview?.scenarios[0]?.assertions.map((assertion) => assertion.kind)).toEqual(expect.arrayContaining(['FOR', 'EVENTUALLY', 'RISING', 'FALLING', 'NEVER']));
      expect(first.preview?.scenarios[0]?.samples).toEqual(expect.arrayContaining([
        expect.objectContaining({ plant: expect.objectContaining({ kind: 'pedestrian-v1', requestInput: true, phaseAfterTick: 'crossing' }) }),
      ]));
      expect(first.savedTestInputIdentity).toEqual(expect.objectContaining({ schemaVersion: 1, fileCount: 3 }));
      expect(second).toEqual(first);
      expect(second.traceFile).toEqual(first.traceFile);
      expect(new TextDecoder().decode(first.traceFile!)).toContain('"kind":"pedestrian-v1"');
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('runs the checked-in tank level golden scenario reproducibly on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      const first = await testsRun(tankLevel);
      const second = await testsRun(tankLevel);
      expect(first).toMatchObject({
        ok: true,
        summary: {
          backend: 'native-posix',
          mode: 'logical-cyclic-task-set-scan',
          scenarios: [{ id: 'TankLevel', path: 'tests/tank-level.scenario.json', passed: true }],
        },
        evidence: { artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] },
      });
      expect(first.preview?.scenarios[0]?.assertions.map((assertion) => assertion.kind)).toEqual(expect.arrayContaining(['EVENTUALLY', 'FOR', 'UNTIL', 'RISING', 'FALLING', 'NEVER']));
      expect(first.savedTestInputIdentity).toEqual(expect.objectContaining({ schemaVersion: 1, fileCount: 3 }));
      expect(second).toEqual(first);
      expect(second.traceFile).toEqual(first.traceFile);
      expect(first.preview?.scenarios[0]?.samples).toEqual(expect.arrayContaining([
        expect.objectContaining({ plant: expect.objectContaining({ kind: 'tank-v1', levelPermilleAfterTick: expect.any(Number) }) }),
      ]));
      expect(new TextDecoder().decode(first.traceFile!)).toContain('"kind":"tank-v1"');
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('runs the checked-in motor plant golden scenario reproducibly on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      const first = await testsRun(motorPlant);
      const second = await testsRun(motorPlant);
      expect(first).toMatchObject({
        ok: true,
        summary: {
          backend: 'native-posix',
          mode: 'logical-cyclic-task-set-scan',
          scenarios: [{ id: 'MotorPlant', path: 'tests/motor-plant.scenario.json', passed: true }],
        },
        evidence: { artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] },
      });
      expect(second).toEqual(first);
      expect(first.preview?.scenarios[0]?.samples).toEqual(expect.arrayContaining([
        expect.objectContaining({ plant: { kind: 'motor-v1', atSpeedInput: false, speedPermilleAfterTick: 500 } }),
      ]));
      expect(new TextDecoder().decode(first.traceFile!)).toContain('"plant":{"kind":"motor-v1"');
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('runs the checked-in edge counter golden scenario reproducibly on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    const canonicalFiles = ['zplc.json', 'src/EdgeCounter.st', 'tests/edge-counter.scenario.json'];
    const before = await Promise.all(canonicalFiles.map((path) => readFile(join(edgeCounter, path))));
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      const first = await testsRun(edgeCounter);
      const second = await testsRun(edgeCounter);
      expect(first).toMatchObject({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'EdgeCounter', path: 'tests/edge-counter.scenario.json', passed: true }] } });
      const scenario = first.preview?.scenarios[0];
      expect(first.preview?.scenarios).toHaveLength(1);
      expect(scenario).toMatchObject({ id: 'EdgeCounter', truncated: false, totalAssertions: 7 });
      expect(scenario?.assertions).toHaveLength(scenario?.totalAssertions);
      expect(scenario?.assertions.map((assertion) => assertion.kind)).toEqual(expect.arrayContaining(['AT', 'RISING', 'FALLING']));
      expect(first.evidence.artifacts).toHaveLength(2);
      expect(first.evidence.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'zplc', sha256: expect.stringMatching(/^[a-f0-9]{64}$/), byteLength: expect.any(Number) }),
        expect.objectContaining({ kind: 'trace', sha256: expect.stringMatching(/^[a-f0-9]{64}$/), byteLength: expect.any(Number) }),
      ]));
      for (const artifact of first.evidence.artifacts) expect(artifact.byteLength).toBeGreaterThan(0);
      expect(first.savedTestInputIdentity).toEqual(expect.objectContaining({ schemaVersion: 1, fileCount: 3, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
      expect(scenario?.samples.map((sample) => sample.outputs['EdgeCounter.CountReached'])).toEqual(expect.arrayContaining([false, true]));
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
      expect(second.traceFile).toEqual(first.traceFile);
      expect(await Promise.all(canonicalFiles.map((path) => readFile(join(edgeCounter, path))))).toEqual(before);
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('runs the checked-in scan snapshot golden scenario reproducibly on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    const canonicalFiles = ['zplc.json', 'src/ScanSnapshot.st', 'tests/scan-snapshot.scenario.json'];
    const before = await Promise.all(canonicalFiles.map((path) => readFile(join(scanSnapshot, path))));
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      await expect(projectValidate(scanSnapshot)).resolves.toMatchObject({ ok: true, summary: { name: 'Scan Snapshot', taskCount: 1 } });
      const checked = await compilerCheck(scanSnapshot);
      const compiled = await compilerCompile(scanSnapshot);
      expect(checked).toMatchObject({ ok: true, summary: { name: 'Scan Snapshot', taskCount: 1 }, evidence: { operation: 'check', artifacts: [{ kind: 'zplc', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }] } });
      expect(compiled).toMatchObject({ ok: true, summary: { name: 'Scan Snapshot', taskCount: 1 }, evidence: { operation: 'compile', artifacts: [{ kind: 'zplc', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }] } });
      const first = await testsRun(scanSnapshot);
      const second = await testsRun(scanSnapshot);
      expect(first).toMatchObject({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'ScanSnapshot', path: 'tests/scan-snapshot.scenario.json', passed: true }] } });
      const scenario = first.preview?.scenarios[0];
      expect(first.preview?.scenarios).toHaveLength(1);
      expect(scenario).toMatchObject({ id: 'ScanSnapshot', truncated: false, totalAssertions: 9 });
      expect(scenario?.assertions).toHaveLength(scenario?.totalAssertions);
      expect(scenario?.assertions.map((assertion) => assertion.kind)).toEqual(expect.arrayContaining(['AT', 'RISING', 'FALLING', 'NEVER']));
      expect(first.evidence.artifacts).toHaveLength(2);
      expect(first.evidence.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'zplc', sha256: expect.stringMatching(/^[a-f0-9]{64}$/), byteLength: expect.any(Number) }),
        expect.objectContaining({ kind: 'trace', sha256: expect.stringMatching(/^[a-f0-9]{64}$/), byteLength: expect.any(Number) }),
      ]));
      for (const artifact of first.evidence.artifacts) expect(artifact.byteLength).toBeGreaterThan(0);
      expect(first.savedTestInputIdentity).toEqual(expect.objectContaining({ schemaVersion: 1, fileCount: 3, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
      expect(scenario?.samples.map((sample) => [
        sample.atMs,
        sample.outputs['ScanSnapshot.Current'],
        sample.outputs['ScanSnapshot.Delayed'],
        sample.outputs['ScanSnapshot.RisingPulse'],
      ])).toEqual([[0, false, false, false], [10, true, false, true], [20, false, true, false], [30, false, false, false]]);
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
      expect(second.traceFile).toEqual(first.traceFile);
      expect(await Promise.all(canonicalFiles.map((path) => readFile(join(scanSnapshot, path))))).toEqual(before);
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('runs the checked-in conveyor golden scenario reproducibly on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      const first = await testsRun(conveyor);
      const second = await testsRun(conveyor);
      const focused = await scenarioRun(conveyor, 'Conveyor01');
      const focusedTwoParts = await scenarioRun(conveyor, 'ConveyorTwoParts');
      expect(first).toMatchObject({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [
        { id: 'Conveyor01', path: 'tests/conveyor-01.scenario.json', passed: true },
        { id: 'ConveyorTwoParts', path: 'tests/conveyor-two-parts.scenario.json', passed: true },
      ] }, evidence: { artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] } });
      expect(second).toEqual(first);
      expect(focused).toMatchObject({ ok: true, summary: { scenarios: [{ id: 'Conveyor01', path: 'tests/conveyor-01.scenario.json', passed: true }] }, preview: { scenarios: [{ id: 'Conveyor01' }] } });
      expect(focusedTwoParts).toMatchObject({ ok: true, preview: { scenarios: [{ id: 'ConveyorTwoParts', path: 'tests/conveyor-two-parts.scenario.json', passed: true, totalAssertions: 3, truncated: false }] } });
      expect(focusedTwoParts.preview?.scenarios[0]?.samples).toEqual(expect.arrayContaining([
        expect.objectContaining({ atMs: 30, outputs: expect.objectContaining({ 'Conveyor.BeltCommand': true, 'Conveyor.DiverterCommand': true }) }),
        expect.objectContaining({ atMs: 70, outputs: expect.objectContaining({ 'Conveyor.BeltCommand': true, 'Conveyor.DiverterCommand': false }) }),
      ]));
      expect(first.preview?.scenarios[0]?.samples).toEqual(expect.arrayContaining([expect.objectContaining({ plant: expect.objectContaining({ kind: 'conveyor-v1', seed: 0, classifiedCountAfterTick: 1 }) })]));
      expect(new TextDecoder().decode(first.traceFile!)).toContain('"kind":"conveyor-v1"');
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('keeps the Conveyor Learn starter compilable but red until its host jam lockout is completed', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      await expect(compilerCheck(conveyorStarter)).resolves.toMatchObject({ ok: true, evidence: { operation: 'check', outcome: 'passed' } });
      await expect(scenarioRun(conveyorStarter, 'Conveyor01')).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED' }] }, preview: { scenarios: [{ id: 'Conveyor01', passed: false }] } });
      await expect(scenarioRun(conveyor, 'Conveyor01')).resolves.toMatchObject({ ok: true, evidence: { operation: 'scenario-run', outcome: 'passed' }, preview: { scenarios: [{ id: 'Conveyor01', passed: true }] } });
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('keeps every Learn exercise starter red and its paired reference green on native POSIX', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      for (const [starterId, referenceId, scenarioId] of learnExercises) {
        const starterRoot = fileURLToPath(new URL(`../../projects/${starterId}`, import.meta.url));
        const referenceRoot = fileURLToPath(new URL(`../../projects/${referenceId}`, import.meta.url));
        await expect(compilerCheck(starterRoot)).resolves.toMatchObject({ ok: true });
        await expect(scenarioRun(starterRoot, scenarioId)).resolves.toMatchObject({ ok: false, evidence: { operation: 'scenario-run', outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED' }] } });
        await expect(scenarioRun(referenceRoot, scenarioId)).resolves.toMatchObject({ ok: true, evidence: { operation: 'scenario-run', outcome: 'passed' } });
      }
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('replays every canonical plant scenario 100 times with the same semantic native POSIX trace', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    const experiences = [
      { root: motorPlant, scenarioId: 'MotorPlant' },
      { root: conveyor, scenarioId: 'Conveyor01' },
      { root: tankLevel, scenarioId: 'TankLevel' },
      { root: pedestrianCrossing, scenarioId: 'PedestrianCrossing' },
    ];
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      for (const { root, scenarioId } of experiences) {
        let expectedHash: string | undefined;
        for (let repetition = 1; repetition <= 100; repetition += 1) {
          const result = await scenarioRun(root, scenarioId);
          if (!result.ok || result.summary.backend !== 'native-posix' || result.summary.mode !== 'logical-cyclic-task-set-scan'
            || result.summary.scenarios.length !== 1 || result.summary.scenarios[0]?.id !== scenarioId || !result.summary.scenarios[0]?.passed
            || result.evidence.outcome !== 'passed' || result.evidence.diagnostics.length !== 0) {
            throw new Error(`${scenarioId} repetition ${repetition}: native scenario did not pass cleanly`);
          }
          const actualHash = semanticScenarioTraceHash(result, scenarioId);
          if (expectedHash === undefined) expectedHash = actualHash;
          else if (actualHash !== expectedHash) throw new Error(`${scenarioId} repetition ${repetition}: semantic trace diverged`);
        }
      }
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 45_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('preserves the fixed motor golden observable through an exported v1-to-v2 migration on native POSIX', async () => {
    const v1Root = await legacyMotorStartStop();
    const v2Root = await legacyMotorStartStop();
    const v1ManifestPath = join(v1Root, 'zplc.json');
    const v2ManifestPath = join(v2Root, 'zplc.json');
    const v1Manifest = await readFile(v1ManifestPath);
    const sourceBody = await readFile(join(v1Root, 'src', 'Motor.st'), 'utf8');
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      await expect(projectInspect(v1Root)).resolves.toMatchObject({ ok: true, summary: { schemaVersion: 2, sourceSchemaVersion: 1, migrated: true } });
      const legacy = await testsRun(v1Root);
      const exported = await projectMigrationExport(v1Root);
      expect(exported).toMatchObject({ ok: true, summary: { sourceSchemaVersion: 1, targetSchemaVersion: 2, changed: true }, evidence: { operation: 'migrate', outcome: 'passed', artifacts: [{ kind: 'project-manifest' }] } });
      if (!exported.ok || !exported.manifest) throw new Error('expected v2 migration manifest');
      expect(Object.keys(exported)).not.toContain('manifest');
      expect(Object.getOwnPropertyDescriptor(exported, 'manifest')).toMatchObject({ enumerable: false, value: expect.any(Uint8Array) });
      expect(exported.evidence.artifacts).toEqual([artifactEvidence('project-manifest', exported.manifest)]);
      expect(await readFile(v1ManifestPath)).toEqual(v1Manifest);

      await writeFile(v2ManifestPath, exported.manifest);
      const v2Manifest = await readFile(v2ManifestPath);
      await expect(projectInspect(v2Root)).resolves.toMatchObject({ ok: true, summary: { schemaVersion: 2, sourceSchemaVersion: 2, migrated: false } });
      const migrated = await testsRun(v2Root);

      expect(legacy).toMatchObject({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'MotorStartStop', passed: true }] }, evidence: { operation: 'test', outcome: 'passed' }, preview: { schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'MotorStartStop', passed: true }] } });
      expect(migrated).toMatchObject({ ok: true, summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'MotorStartStop', passed: true }] }, evidence: { operation: 'test', outcome: 'passed' }, preview: { schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'MotorStartStop', passed: true }] } });
      if (!legacy.ok || !migrated.ok || !legacy.traceFile || !migrated.traceFile) throw new Error('expected successful native POSIX runs with trace payloads');
      const artifact = (result: typeof legacy, kind: 'zplc' | 'trace') => result.evidence.artifacts.find((candidate) => candidate.kind === kind);
      const legacyZplc = artifact(legacy, 'zplc'); const migratedZplc = artifact(migrated, 'zplc');
      const legacyTrace = artifact(legacy, 'trace'); const migratedTrace = artifact(migrated, 'trace');
      if (!legacyZplc || !migratedZplc || !legacyTrace || !migratedTrace) throw new Error('expected zplc and trace artifacts');
      for (const [value, kind] of [[legacyZplc, 'zplc'], [migratedZplc, 'zplc'], [legacyTrace, 'trace'], [migratedTrace, 'trace']] as const) {
        expect(value.kind).toBe(kind); expect(value.sha256).toMatch(/^[a-f0-9]{64}$/); expect(Number.isSafeInteger(value.byteLength) && value.byteLength > 0).toBe(true);
      }
      expect(legacyTrace).toEqual(artifactEvidence('trace', legacy.traceFile));
      expect(migratedTrace).toEqual(artifactEvidence('trace', migrated.traceFile));
      expect(legacyZplc).toEqual(migratedZplc);
      expect(legacyTrace).toEqual(migratedTrace);
      expect(legacy.summary.scenarios).toEqual(migrated.summary.scenarios);
      expect(legacy.preview).toEqual(migrated.preview);
      expect(legacy.traceFile).toEqual(migrated.traceFile);
      expect(legacy.savedTestInputIdentity).toEqual(expect.objectContaining({ schemaVersion: 1, fileCount: 3, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
      expect(migrated.savedTestInputIdentity).toEqual(expect.objectContaining({ schemaVersion: 1, fileCount: 3, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
      expect(legacy.savedTestInputIdentity?.sha256).not.toBe(migrated.savedTestInputIdentity?.sha256);

      const rawTrace = new TextDecoder().decode(legacy.traceFile);
      const privateManifest = new TextDecoder().decode(exported.manifest);
      for (const serialized of [JSON.stringify(legacy), JSON.stringify(migrated), JSON.stringify(exported)]) {
        for (const privateValue of [v1Root, v2Root, sourceBody, rawTrace, privateManifest]) expect(serialized).not.toContain(privateValue);
      }
      expect(await readFile(v1ManifestPath)).toEqual(v1Manifest);
      expect(await readFile(v2ManifestPath)).toEqual(v2Manifest);
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      await Promise.all([rm(v1Root, { recursive: true, force: true }), rm(v2Root, { recursive: true, force: true })]);
    }
  }, 30_000);
});
describe('tool execution envelope', () => {
  it('is versioned, metadata-only, unique, and derives cancellation only from canonical diagnostics', () => {
    const first = startToolExecution('cli', executionPermission('test'), 'test', new Date('2026-08-31T00:00:00.000Z'));
    const second = startToolExecution('cli', executionPermission('test'), 'test', new Date('2026-08-31T00:00:00.000Z'));
    expect(first.jobId).not.toBe(second.jobId);
    const cancelled = finishToolExecution(first, { ok: false, evidence: { schemaVersion: 1, operation: 'test', outcome: 'failed', diagnostics: [{ code: 'TEST_CANCELLED', message: 'ignored' }], artifacts: [] } }, new Date('2026-08-31T00:00:01.000Z'));
    expect(cancelled).toEqual({ schemaVersion: 1, jobId: first.jobId, actor: 'cli', permission: 'tests:run', operation: 'test', outcome: 'cancelled', startedAt: '2026-08-31T00:00:00.000Z', finishedAt: '2026-08-31T00:00:01.000Z' });
    expect(isToolExecutionEnvelope(cancelled)).toBe(true);
    expect(Object.keys(withToolExecution({ ok: false }, cancelled))).toEqual(['ok', 'execution']);
    expect(JSON.stringify(cancelled)).not.toMatch(/path|secret|prompt|source|log|value/i);
    expect(isToolExecutionEnvelope({ ...cancelled, extra: true })).toBe(false);
    expect(isToolExecutionEnvelope({ ...cancelled, finishedAt: '2026-08-30T23:59:59.999Z' })).toBe(false);
    expect(isToolExecutionEnvelope({ ...cancelled, jobId: '018f4e1d-d941-4a8b-b5f7-8d15d9810001' })).toBe(true);
    expect(isToolExecutionEnvelope({ ...cancelled, jobId: '018f4e1d-d941-0a8b-b5f7-8d15d9810001' })).toBe(false);
    expect(isToolExecutionEnvelope({ ...cancelled, operation: 'firmware-flash' })).toBe(false);
    expect(isToolExecutionEnvelope({ ...cancelled, permission: 'compiler:check' })).toBe(false);
    const review = finishToolExecution(
      startToolExecution('agent', executionPermission('change-set-review'), 'change-set-review', new Date('2026-08-31T00:00:00.000Z')),
      { ok: true, evidence: { schemaVersion: 1, operation: 'test', outcome: 'passed', diagnostics: [], artifacts: [] } },
      new Date('2026-08-31T00:00:01.000Z'),
    );
    expect(review.permission).toBe('tests:run');
    expect(isToolExecutionEnvelope(review)).toBe(true);
    Object.defineProperty(review, 'operation', { value: 'change-set-review', enumerable: false });
    expect(isToolExecutionEnvelope(review)).toBe(false);
    expect(executionPermission('validate')).toBe('project:read');
  });
});
