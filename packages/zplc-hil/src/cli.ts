#!/usr/bin/env bun
/**
 * zplc-hil: run a scenario of a Studio project on a board.
 *
 *   bun packages/zplc-hil/src/cli.ts run --board rpi_pico --workspace <dir> --scenario <file> [--port PORT]
 *
 * It is a command for a person (HIL-003). It exits with an error when it has no interactive terminal, requires the
 * person to type the identity the board reports at each physical step, releases every force it applied at the end and
 * on abort, and leaves the board stopped. MCP and AI tools do not start it, and no flag lets a script do so.
 * `--link host-runtime` runs the same flow on the native runtime of this tree (ZPLC_NATIVE_SIM_BIN): no board, no
 * physical step, and a record that says it is not hardware.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { platform, release, arch } from 'node:os';

import { REPOSITORY_ROOT } from './compile';
import { HardwareRuntimePort, withHardwarePort } from './hardwarePort';
import type { ReleaseReport, ScenarioRuntimePort } from './hardwarePort';
import { confirmPhysicalStep, IdentityMismatchError, NotInteractiveError, requireInteractive, terminalIo } from './guard';
import type { HumanIo } from './guard';
import { HostRuntimeLink } from './hostLink';
import type { DeviceIdentity, DeviceLink } from './link';
import { listSerialPorts, SerialShellTransport } from './serialTransport';
import { selectPort } from './ports';
import { ShellLink } from './shellLink';
import { firmwareIdentity, sha256, summarize, validate, VERSION_OF_HARNESS } from './record';
import type { RunRecord, RunStep } from './record';

interface CompiledScenarioLike { readonly id: string }
interface ScenarioRunResultLike { passed: boolean; assertions: Array<{ kind: string; passed: boolean; atMs?: number }> }
interface EngineLike {
  compileScenario(input: unknown, debugMap: unknown): CompiledScenarioLike;
  runScenario(scenario: CompiledScenarioLike, zplc: Uint8Array, runtime: ScenarioRuntimePort): Promise<ScenarioRunResultLike>;
}
interface ToolApiLike {
  compilerCompile(root: string): Promise<{ ok: boolean; zplcFile?: Uint8Array; debugMap?: unknown; evidence: { diagnostics: Array<{ message: string }> } }>;
}

const USAGE = 'usage: zplc-hil run --board <ide_id> --workspace <dir> --scenario <file> [--port PORT] [--link serial|host-runtime] [--tolerance-ms N] [--record-dir DIR] [--operator NAME] [--firmware-image FILE]';

export interface CliIo extends HumanIo {
  error(text: string): void;
}

export interface CliDeps {
  io: HumanIo;
  stderr: (text: string) => void;
  env: Record<string, string | undefined>;
  /** Open the link of a run; a test supplies its own. */
  openLink?: (options: { link: 'serial' | 'host-runtime'; port?: string | undefined; board: string }) => Promise<DeviceLink>;
  signal?: AbortSignal;
}

async function engine(): Promise<{ engine: EngineLike; tools: ToolApiLike }> {
  // loaded by path at run time: the scenario engine and the Tool API belong to Studio's package, and this package does not depend on it
  const load = async <T>(file: string): Promise<T> => (await import(pathToFileURL(join(REPOSITORY_ROOT, file)).href)) as T;
  return { engine: await load<EngineLike>('packages/zplc-ide/src/test-engine/index.ts'), tools: await load<ToolApiLike>('packages/zplc-ide/src/cli/toolApi.ts') };
}

function now(): string {
  return new Date().toISOString();
}

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv, allowPositionals: true,
      options: {
        board: { type: 'string' }, workspace: { type: 'string' }, scenario: { type: 'string' }, port: { type: 'string' },
        link: { type: 'string', default: 'serial' }, 'tolerance-ms': { type: 'string', default: '50' }, 'record-dir': { type: 'string' },
        operator: { type: 'string' }, 'firmware-image': { type: 'string' },
      },
    });
  } catch (error) {
    deps.stderr(`error: ${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const link = values.link === 'host-runtime' ? 'host-runtime' : values.link === 'serial' ? 'serial' : undefined;
  if (positionals[0] !== 'run' || !values.board || !values.workspace || !values.scenario || !link) {
    deps.stderr(`error: ${USAGE}`);
    return 2;
  }

  // The guard comes first: before a file is read, a port is listed or a link is opened.
  if (link === 'serial') {
    try {
      requireInteractive(deps.io, 'a hardware scenario run');
    } catch (error) {
      deps.stderr(`error: ${(error as NotInteractiveError).message}`);
      return 2;
    }
  }

  const operator = values.operator ?? (link === 'serial' ? (await deps.io.ask('Operator name for the record: ')).trim() || 'unknown' : 'rehearsal');
  const started = now();
  const steps: RunStep[] = [];
  const record = (step: Omit<RunStep, 'started_at' | 'ended_at'> & { started_at?: string }): RunStep => {
    const complete = { started_at: started, ended_at: now(), ...step } as RunStep;
    steps.push(complete);
    return complete;
  };

  let opened: DeviceLink | undefined;
  try {
    const { engine: scenarios, tools } = await engine();
    const workspace = resolve(values.workspace);
    const compiled = await tools.compilerCompile(workspace);
    if (!compiled.ok || !compiled.zplcFile) {
      deps.stderr(`error: the workspace does not compile: ${compiled.evidence.diagnostics.map((d) => d.message).join('; ')}`);
      return 2;
    }
    const scenarioBytes = readFileSync(resolve(values.scenario));
    const scenario = scenarios.compileScenario(JSON.parse(scenarioBytes.toString('utf8')), compiled.debugMap);

    opened = deps.openLink
      ? await deps.openLink({ link, port: values.port, board: values.board })
      : link === 'host-runtime'
        ? await HostRuntimeLink.open(deps.env.ZPLC_NATIVE_SIM_BIN ?? '')
        : await openSerial(values.port, values.board, deps.env);
    const identity: DeviceIdentity = await opened.identity();
    record({ id: 'handshake', title: 'Identity handshake', kind: 'automatic', result: 'pass', detail: `the device reports ${identity.board}` });

    for (const step of [
      { id: 'confirm-identity', title: 'Confirm the board', instruction: 'Check that this is the board you mean to drive and that it is connected to the port that was used.' },
      { id: 'safe-to-drive', title: 'Outputs are safe to drive', instruction: 'Nothing connected to the outputs can hurt anyone or damage equipment when it is switched on and off, and the scenario will force inputs.' },
    ]) {
      if (link === 'host-runtime') {
        record({ id: step.id, title: step.title, kind: 'physical', result: 'pass', detail: 'rehearsal on the host runtime: nobody is asked' });
        continue;
      }
      const confirmation = await confirmPhysicalStep(deps.io, step, identity.board);
      record({ id: step.id, title: step.title, kind: 'physical', result: 'pass', confirmed_at: confirmation.confirmedAt, confirmed_identity: confirmation.confirmedIdentity });
    }

    const toleranceMs = Number(values['tolerance-ms']);
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);
    deps.signal?.addEventListener('abort', abort, { once: true });
    const done = await withHardwarePort(opened, { toleranceMs, signal: controller.signal }, (port) => scenarios.runScenario(scenario, compiled.zplcFile!, port));
    const outcome: { result: ScenarioRunResultLike; release: ReleaseReport; port: HardwareRuntimePort } = { result: done.value, release: done.release, port: done.port };
    record({ id: 'scenario', title: `Scenario ${scenario.id}`, kind: 'automatic', result: outcome.result.passed ? 'pass' : 'fail',
      detail: outcome.result.assertions.map((a) => `${a.kind} ${a.passed ? 'held' : `failed at ${a.atMs} ms`}`).join('; '),
      measurements: { max_late_ms: outcome.port.maxLateMs, ticks: outcome.port.observations.length } });
    record({ id: 'release', title: 'Forces released, board stopped', kind: 'automatic', result: outcome.release.ok ? 'pass' : 'fail', detail: outcome.release.errors.join('; ') });

    const final: RunRecord = {
      schema: 'zplc.hil.run-record/1', run_id: randomUUID().replaceAll('-', ''), kind: 'scenario',
      evidence: opened.kind === 'serial' ? 'hardware' : opened.kind, result: 'incomplete', started_at: started, ended_at: now(),
      board: { id: values.board },
      device: { reported_board: identity.board, board_profile: identity.boardProfile ?? null, zplc_version: identity.zplcVersion ?? null, zephyr_version: identity.zephyrVersion ?? null, link: opened.kind },
      firmware: { ...firmwareIdentity(identity.build), ...(values['firmware-image'] ? { image_sha256: sha256(readFileSync(resolve(values['firmware-image']))) } : {}) },
      programs: [{ id: scenario.id, sha256: sha256(compiled.zplcFile) }],
      scenario: { id: scenario.id, sha256: sha256(scenarioBytes), tolerance_ms: toleranceMs },
      tools: { harness: VERSION_OF_HARNESS, platform: `${platform()} ${release()} ${arch()}`, bun: process.versions.bun ?? null },
      operator: { name: operator },
      steps, tests: [], logs: [],
    };
    final.result = summarize(final);
    const problems = validate(final);
    if (problems.length > 0) {
      deps.stderr(`error: the run record does not fit its schema:\n  ${problems.join('\n  ')}`);
      return 2;
    }
    const directory = resolve(values['record-dir'] ?? join(REPOSITORY_ROOT, 'build', 'hil-records'));
    mkdirSync(directory, { recursive: true });
    const file = join(directory, `${values.board}-${started.slice(0, 10)}-${final.run_id.slice(0, 8)}.json`);
    writeFileSync(file, `${JSON.stringify(final, null, 2)}\n`);
    deps.io.say(`${final.result.toUpperCase()}: ${file}`);
    return final.result === 'pass' && outcome.release.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof IdentityMismatchError || error instanceof NotInteractiveError) {
      deps.stderr(`error: ${error.message}`);
      return 2;
    }
    deps.stderr(`error: ${(error as Error).message}`);
    return 1;
  } finally {
    await opened?.close().catch(() => undefined);
  }
}

async function openSerial(port: string | undefined, board: string, env: Record<string, string | undefined>): Promise<DeviceLink> {
  const listed = await listSerialPorts();
  const path = selectPort({ port, board, env, listed: () => listed });
  return new ShellLink(await SerialShellTransport.open(path), 'serial');
}

if (import.meta.main) {
  const io = await terminalIo();
  const code = await main(process.argv.slice(2), { io, stderr: (text) => { console.error(text); }, env: process.env });
  io.close();
  process.exit(code);
}
