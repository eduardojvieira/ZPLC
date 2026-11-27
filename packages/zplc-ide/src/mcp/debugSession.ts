/**
 * The private simulation debugger of the MCP server (AIX-014, plan-aix §7). One manager per MCP connection owns at most two
 * sessions; each session is a host runtime (`zplc_runtime`, a child process on the virtual clock with its own temporary
 * persistence folder) that this manager started for the agent alone, plus an optional private plant core of the project's
 * scene. Nothing here reaches a board, a serial port, a socket, Studio or a shell (AGENTS.md rule 8).
 *
 * Breakpoints use the element map of the build (`elementPcMap`, AIX-U8) and the runtime's own mid-scan stop under the virtual
 * clock: a `scenario.step` that hits an armed PC holds the scan, and the next step with the same `at_ms` finishes it. No C and
 * no code generation changed for it.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as toolApi from '../cli/toolApi';
import { createNativeScenarioSession, nativeScenarioLifecycle, type NativeScenarioSession } from '../cli/nativeScenarioRuntime';
import { elementPcMap, resolveElementPc, type DebugMap } from '../compiler';
import { loadSceneContext } from '../learn/sceneRun';
import type { PlantCore } from '../plant/contracts';
import { catalogue } from '../plant/core/catalogue';
import { createPlantCore } from '../plant/core/plantCore';
import { validateScene } from '../plant/core/scene';
import { exchangeOnce, planExchange, type ExchangeLayout } from '../plant/session/exchange';
import type { PlantMapV2 } from '../plants/plantMap';
import type { NativeAdapter } from '../runtime/nativeAdapter';
import { listIoMap } from '../runtime/ioMap';
import { findSignalVariable, readWatch, resolveWatch, watchableSignals, type ResolvedWatch } from '../test-engine';
import { validateSceneScript, type SceneScriptEvent } from '../test-engine/scenePort';
import { nativeSimulatorReady, workspaceLesson } from './resources';
import { audit } from './traceView';
import type { McpWorkspace } from './server';

export const DEBUG_TOOL_NAMES = [
  'debug_session_start',
  'debug_session_stop',
  'debug_set_inputs',
  'debug_breakpoints',
  'debug_step',
  'debug_inspect',
] as const;
export type DebugToolName = (typeof DEBUG_TOOL_NAMES)[number];
export const isDebugTool = (tool: string): tool is DebugToolName => (DEBUG_TOOL_NAMES as readonly string[]).includes(tool);

/** plan-aix §7.4: two sessions per connection, 300 s idle, the step budgets and the wall-clock deadline of one call. */
export const DEBUG_LIMITS = {
  sessions: 2,
  idleMs: 300_000,
  cycles: 1000,
  durationMs: 60_000,
  maxCycles: 5000,
  callDeadlineMs: 15_000,
  validValues: 64,
} as const;

type Body = Record<string, unknown>;
type Location = { file: string; line?: number; element?: string };
type PlantAction =
  | { kind: 'operate'; signal: string; value: boolean | number }
  | { kind: 'emit'; item: string; at: [number, number, number] }
  | { kind: 'fault'; part: string; action: string };

export interface DebugArgs {
  debug_session_start: { withScene?: 'auto' | 'always' | 'never'; sceneFile?: string; mapFile?: string };
  debug_session_stop: { sessionId: string };
  debug_set_inputs: { sessionId: string; inputs?: Record<string, boolean | number>; plantActions?: PlantAction[] };
  debug_breakpoints: { sessionId: string; action: 'list' | 'set' | 'add' | 'remove' | 'clear'; locations?: Location[] };
  debug_step: {
    sessionId: string;
    mode?: 'cycles' | 'ms' | 'continue';
    cycles?: number;
    durationMs?: number;
    maxCycles?: number;
    watch?: string[];
    includeFacts?: boolean;
  };
  debug_inspect: { sessionId: string; signals?: string[]; functionBlocks?: string[]; includeSfc?: boolean; includePlant?: boolean };
}

interface Session {
  readonly id: string;
  readonly root: string;
  readonly sourceFingerprints: ReadonlyMap<string, string>;
  readonly native: NativeScenarioSession;
  readonly adapter: NativeAdapter;
  readonly debugMap: DebugMap;
  readonly taskCount: number;
  readonly scanMs: number;
  readonly plant?: { core: PlantCore; map: PlantMapV2; layout: ExchangeLayout; scene: Parameters<typeof validateSceneScript>[1] };
  /** Armed breakpoints by PC, each with the place the agent named. */
  readonly breakpoints: Map<number, { file: string; element: string; line?: number }>;
  scans: number;
  lastCycles: number;
  /** The plant has stepped for the scan in flight (a breakpoint holds it): the continuation must not step it again. */
  exchanged: boolean;
  held: boolean;
  pc?: number;
  vmError: number;
  timer?: ReturnType<typeof setTimeout>;
}

const VM_HALTED = 9;
const VM_PAUSED = 10;
const BOUNDARY = 'AGENTS.md rule 8';
const STALE_NEXT_STEP =
  'The project sources changed since this session started; call debug_session_stop and start a new session with ' +
  'debug_session_start to run the changed program.';

async function sha256File(path: string): Promise<string | undefined> {
  const bytes = await readFile(path).catch(() => undefined);
  return bytes ? createHash('sha256').update(bytes).digest('hex') : undefined;
}

function failure(error: string, message: string, cause: string, nextStep: string, extra: Body = {}): Body {
  return { ok: false, error, message, cause, nextStep, ...extra };
}
const values = (list: readonly string[]) => [...new Set(list)].slice(0, DEBUG_LIMITS.validValues);

/** The answer to arguments that failed the strict schema of a debug tool: the field, what was expected and the accepted values. */
export function debugArgumentsError(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string; code?: string; values?: unknown[]; keys?: string[] }>,
): Body {
  const first = issues[0];
  const field = first?.path.map(String).join('.') || '(arguments)';
  const accepted = first?.values?.map(String) ?? [];
  return failure(
    'MCP_INVALID_ARGUMENTS',
    'The arguments of the debug tool are not valid.',
    `${field}: ${first?.message ?? 'invalid'}${first?.keys ? ` (${first.keys.join(', ')})` : ''}`,
    'Fix the named field and call the tool again; no device, port or session argument is accepted (AGENTS.md rule 8).',
    accepted.length > 0 ? { validValues: accepted } : {},
  );
}

/** The owner of the private debug sessions of one MCP connection. Calls are serialised by the dispatcher of server.ts. */
export class McpDebugSessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly expired = new Set<string>();
  private starting = 0;
  private readonly idleMs: number;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(
    private readonly workspace: McpWorkspace,
    options: { idleMs?: number; environment?: NodeJS.ProcessEnv } = {},
  ) {
    this.idleMs = options.idleMs ?? DEBUG_LIMITS.idleMs;
    this.environment = options.environment ?? process.env;
  }

  /** The ids of the open sessions. */
  get sessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  async call<T extends DebugToolName>(tool: T, args: DebugArgs[T], signal: AbortSignal): Promise<Body> {
    const started = toolApi.startToolExecution('mcp', 'tests:run', 'scenario-run');
    const body = await this.answer(tool, args as never, signal);
    return { ...body, audit: audit(toolApi.finishToolExecution(started, body) as unknown as Record<string, unknown>) };
  }

  private async answer(tool: DebugToolName, args: DebugArgs[DebugToolName] & { sessionId?: string }, signal: AbortSignal): Promise<Body> {
    if (tool === 'debug_session_start') return this.start(args as DebugArgs['debug_session_start'], signal);
    const session = this.sessions.get(args.sessionId!);
    if (!session) return this.notFound(args.sessionId!);
    if (tool === 'debug_session_stop') {
      await this.close(session);
      return { ok: true, sessionId: session.id, stopped: true };
    }
    this.touch(session);
    try {
      let body: Body;
      switch (tool) {
        case 'debug_set_inputs':
          body = await this.setInputs(session, args as DebugArgs['debug_set_inputs']);
          break;
        case 'debug_breakpoints':
          body = await this.breakpoints(session, args as DebugArgs['debug_breakpoints']);
          break;
        case 'debug_step':
          body = await this.step(session, args as DebugArgs['debug_step'], signal);
          break;
        default:
          body = await this.inspect(session, args as DebugArgs['debug_inspect']);
      }
      const stale = await this.isStale(session);
      return { ...body, stale, ...(stale && body.nextStep === undefined ? { nextStep: STALE_NEXT_STEP } : {}) };
    } catch (error) {
      // the runtime of this session failed: it is torn down, the other session is untouched
      await this.close(session);
      const why = error instanceof Error ? error.message : String(error);
      return failure(
        'MCP_INTERNAL_ERROR',
        'The private simulation of this session failed and was stopped.',
        why.slice(0, 512),
        'Start a new session with debug_session_start; call server_self_check if it fails again.',
      );
    } finally {
      if (this.sessions.has(session.id)) this.touch(session);
    }
  }

  /** Stops every session: the MCP connection closed (plan-aix §7.1 step 6). */
  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => this.close(session)));
  }

  private notFound(sessionId: string): Body {
    const expired = this.expired.has(sessionId);
    return failure(
      'MCP_DEBUG_SESSION_NOT_FOUND',
      expired ? `The debug session was stopped after ${this.idleMs / 1000} s without a call.` : 'No open debug session has this id.',
      expired ? `session ${sessionId} was idle for ${this.idleMs / 1000} s and was torn down` : `unknown sessionId ${sessionId}`,
      'Start a new session with debug_session_start, or use one of validValues.',
      { validValues: this.sessionIds },
    );
  }

  private touch(session: Session): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      this.expired.add(session.id);
      if (this.expired.size > 32) this.expired.delete(this.expired.values().next().value!);
      void this.close(session);
    }, this.idleMs);
    session.timer.unref?.();
  }

  private async close(session: Session): Promise<void> {
    if (!this.sessions.delete(session.id)) return;
    if (session.timer) clearTimeout(session.timer);
    session.plant?.core.dispose();
    await session.native.close().catch(() => undefined);
  }

  private async start(args: DebugArgs['debug_session_start'], signal: AbortSignal): Promise<Body> {
    if (this.sessions.size + this.starting >= DEBUG_LIMITS.sessions)
      return failure(
        'MCP_DEBUG_SESSION_LIMIT',
        `At most ${DEBUG_LIMITS.sessions} private debug sessions can be open at once.`,
        `sessions ${this.sessionIds.join(', ')} are open`,
        'Call debug_session_stop on one of validValues, then start again.',
        { validValues: this.sessionIds },
      );
    const root = this.workspace.root;
    // a lesson workspace says whether its solutions are hidden, read with the shared fail-closed reader; the session only ever
    // runs the program of this folder, the learner's own, and no argument can name another project or a solution (AIX-002)
    const lesson = await workspaceLesson(this.workspace);
    if (lesson === 'changed')
      return failure(
        'MCP_WORKSPACE_CHANGED',
        'The user-data folder changed.',
        'the --user-data folder is not the one the server opened',
        'Restart zplc-mcp.',
      );
    const compiled = (await toolApi.compilerCompile(root)) as Awaited<ReturnType<typeof toolApi.compilerCompile>> & {
      zplcFile?: Uint8Array;
      debugMap?: DebugMap;
      sourceFingerprints?: Readonly<Record<string, string>>;
    };
    if (!compiled.ok || !compiled.zplcFile || !compiled.debugMap)
      return failure(
        'MCP_VALIDATION_FAILED',
        'The project does not compile.',
        'the compiler refused the project',
        'Fix the diagnostics (compiler_check names each place) and start again.',
        {
          diagnostics: (compiled.evidence?.diagnostics ?? []).slice(0, 32),
        },
      );
    const debugMap = compiled.debugMap;
    const sceneFile = args.sceneFile ?? 'scene.json';
    const mapFile = args.mapFile ?? 'plant-map.json';
    const exists = async (path: string) => (await stat(join(root, path)).catch(() => undefined))?.isFile() === true;
    const withScene = args.withScene ?? 'auto';
    const attach = withScene === 'always' || (withScene === 'auto' && (await exists(sceneFile)) && (await exists(mapFile)));
    let plant: Session['plant'];
    if (attach) {
      const context = await loadSceneContext(root, { scene: { file: sceneFile, map: mapFile } });
      if (!context.ok)
        return failure(
          'MCP_VALIDATION_FAILED',
          'The scene or the plant map cannot be loaded.',
          context.diagnostics[0]?.message ?? 'invalid scene',
          'Fix the diagnostics, or start with withScene "never".',
          {
            diagnostics: context.diagnostics.slice(0, 32),
          },
        );
      const problems = validateScene(context.scene, catalogue);
      if (problems.length > 0)
        return failure(
          'MCP_VALIDATION_FAILED',
          'The scene is not valid.',
          problems
            .map((problem) => problem.message)
            .join('; ')
            .slice(0, 512),
          'Fix the scene (plant_inspect names the problems), or start with withScene "never".',
        );
      let layout: ExchangeLayout;
      try {
        layout = planExchange(context.map, listIoMap(debugMap));
      } catch (error) {
        return failure(
          'MCP_VALIDATION_FAILED',
          'The plant map does not bind to the program.',
          String((error as Error).message).slice(0, 512),
          'Fix plant-map.json (plant_inspect names the points the program does not have).',
        );
      }
      plant = { core: await createPlantCore(context.scene), map: context.map, layout, scene: context.scene };
    }
    if (!nativeSimulatorReady(this.environment)) {
      plant?.core.dispose();
      return failure(
        'MCP_CAPABILITY_UNAVAILABLE',
        'The host simulator is not available.',
        'zplc_runtime was not found',
        'Set ZPLC_NATIVE_SIM_BIN or build the runtime; server_self_check says what is missing.',
      );
    }
    this.starting += 1;
    let native: NativeScenarioSession | undefined;
    try {
      let adapter: NativeAdapter | undefined;
      native = await createNativeScenarioSession(this.environment, {
        signal,
        createLifecycle: (persistRoot) => {
          const lifecycle = nativeScenarioLifecycle(this.environment, persistRoot);
          adapter = lifecycle.adapter;
          return lifecycle;
        },
      });
      await adapter!.loadProgram(compiled.zplcFile);
      // plan-aix §7.2 fact 1: the scan interval is the clock's answer after the load, never the task line of status.get
      const { scanIntervalMs } = await adapter!.setClockMode('virtual');
      if (!Number.isInteger(scanIntervalMs) || scanIntervalMs <= 0 || (plant && scanIntervalMs % plant.core.stepMs !== 0)) {
        await native.close();
        plant?.core.dispose();
        return failure(
          'MCP_VALIDATION_FAILED',
          'The scan interval does not suit the plant.',
          `the scan interval is ${scanIntervalMs} ms; the plant steps in 5 ms`,
          'Set the task interval to a multiple of 5 ms.',
        );
      }
      const info = await adapter!.getInfo();
      const sourceFingerprints = await this.captureFingerprints(root, debugMap, compiled.sourceFingerprints);
      const session: Session = {
        id: randomUUID(),
        root,
        sourceFingerprints,
        native,
        adapter: adapter!,
        debugMap,
        taskCount: compiled.summary?.taskCount ?? 1,
        scanMs: scanIntervalMs,
        ...(plant ? { plant } : {}),
        breakpoints: new Map(),
        scans: 0,
        lastCycles: info.cycles,
        exchanged: false,
        held: false,
        vmError: 0,
      };
      this.sessions.set(session.id, session);
      this.touch(session);
      const signals = (direction: 'command' | 'sensor') =>
        Object.entries(plant?.map.signals ?? {})
          .filter(([, entry]) => entry.direction === direction)
          .map(([name]) => name);
      return {
        ok: true,
        sessionId: session.id,
        scanIntervalMs,
        atMs: 0,
        cycles: 0,
        state: 'idle',
        sceneAttached: plant !== undefined,
        ...(plant ? { boundSignals: { commands: signals('command'), sensors: signals('sensor') } } : {}),
        idleTimeoutSec: this.idleMs / 1000,
        ...(lesson ? { lesson: { lessonId: lesson.lessonId, solutionsHidden: lesson.solutionsHidden } } : {}),
        evidence: { scope: 'private-native-posix-host', boundary: BOUNDARY },
      };
    } catch (error) {
      await native?.close().catch(() => undefined);
      plant?.core.dispose();
      if (signal.aborted)
        return failure('MCP_CANCELLED', 'The start was cancelled.', 'the request was aborted', 'Start the session again.');
      return failure(
        'MCP_CAPABILITY_UNAVAILABLE',
        'The host simulator did not start.',
        String((error as Error).message ?? error).slice(0, 512),
        'Run server_self_check and check ZPLC_NATIVE_SIM_BIN.',
      );
    } finally {
      this.starting -= 1;
    }
  }

  private async captureFingerprints(
    root: string,
    debugMap: DebugMap,
    compiledFingerprints?: Readonly<Record<string, string>>,
  ): Promise<Map<string, string>> {
    const fingerprints = new Map<string, string>();
    if (compiledFingerprints) {
      for (const [path, hash] of Object.entries(compiledFingerprints)) fingerprints.set(path, hash);
    } else {
      for (const pou of Object.values(debugMap.pou)) {
        if (!pou.sourceRef || fingerprints.has(pou.sourceRef)) continue;
        const hash = await sha256File(join(root, pou.sourceRef));
        if (hash) fingerprints.set(pou.sourceRef, hash);
      }
    }
    const manifestHash = await sha256File(join(root, 'zplc.json'));
    if (manifestHash) fingerprints.set('zplc.json', manifestHash);
    return fingerprints;
  }

  private async isStale(session: Session): Promise<boolean> {
    for (const [relativePath, expectedSha256] of session.sourceFingerprints) {
      const current = await sha256File(join(session.root, relativePath));
      if (current !== expectedSha256) return true;
    }
    return false;
  }

  private inputNames(session: Session): string[] {
    return watchableSignals(session.debugMap).filter((name) => (resolveWatch(session.debugMap, name)?.address ?? 0x1000) < 0x1000);
  }

  private async setInputs(session: Session, args: DebugArgs['debug_set_inputs']): Promise<Body> {
    const entries = Object.entries(args.inputs ?? {});
    const resolved: Array<{ watch: ResolvedWatch; value: boolean | number }> = [];
    for (const [name, value] of entries) {
      const watch = resolveWatch(session.debugMap, name);
      if (!watch || watch.address >= 0x1000)
        return failure(
          'MCP_NOT_FOUND',
          'No program input has this name.',
          `'${name}' is not an input (IPI) variable of the program`,
          'Use one of validValues (Program.Variable).',
          {
            validValues: values(this.inputNames(session)),
          },
        );
      const sensor = session.plant?.layout.sensors.find(
        (slot) => session.plant!.layout.inputBase + slot.byte === watch.address && (slot.bit ?? 0) === (watch.bitOffset ?? 0),
      );
      if (sensor)
        return failure(
          'MCP_DEBUG_INPUT_OWNED_BY_PLANT',
          'The plant drives this input.',
          `'${name}' is written by the scene sensor ${sensor.name} every scan`,
          `Use plantActions instead, for example { "kind": "operate", "signal": "${sensor.name}", "value": true }.`,
          {
            validValues: values(session.plant!.layout.sensors.map((slot) => slot.name)),
          },
        );
      const problem = encodeProblem(watch, value);
      if (problem)
        return failure(
          'MCP_INVALID_ARGUMENTS',
          'The value does not fit the input.',
          `${name}: ${problem}`,
          'Give a value of the type of the variable.',
        );
      resolved.push({ watch, value });
    }
    const actions = args.plantActions ?? [];
    if (actions.length > 0) {
      if (!session.plant)
        return failure(
          'MCP_INVALID_ARGUMENTS',
          'This session has no scene.',
          'plantActions need a session started with a scene',
          'Start a session with withScene "always" or "auto" in a project with scene.json and plant-map.json.',
        );
      const script: SceneScriptEvent[] = actions.map((action) =>
        action.kind === 'operate'
          ? { atMs: 0, operate: { signal: action.signal, value: action.value } }
          : action.kind === 'emit'
            ? { atMs: 0, emit: { kind: action.item, at: action.at as never } }
            : { atMs: 0, fault: { part: action.part, action: action.action } },
      );
      const problems = validateSceneScript(script, session.plant.scene, session.plant, catalogue).map((text) =>
        text.replace(/scene\.script/g, 'plantActions'),
      );
      if (problems.length > 0) {
        const panel = session.plant.core.signals.filter((entry) => entry.direction === 'sensor').map((entry) => entry.name);
        const parts = session.plant.scene.parts.map((part) => part.name);
        return failure(
          'MCP_NOT_FOUND',
          'A plant action names something the scene does not have.',
          problems.join('; ').slice(0, 512),
          'Use a panel signal or a part of validValues.',
          {
            validValues: values([...panel, ...parts]),
          },
        );
      }
    }
    for (const { watch, value } of resolved) await session.adapter.pokeN(watch.address, await encode(session.adapter, watch, value));
    try {
      for (const event of actions) {
        if (event.kind === 'operate') session.plant!.core.operate(event.signal, event.value);
        else if (event.kind === 'emit') session.plant!.core.addItem(event.item, event.at as never);
        else session.plant!.core.act(event.part, event.action);
      }
    } catch (error) {
      return failure(
        'MCP_INVALID_ARGUMENTS',
        'The scene refused a plant action.',
        String((error as Error).message).slice(0, 512),
        'Change the action and call again.',
      );
    }
    return {
      ok: true,
      sessionId: session.id,
      stagedInputs: resolved.map((entry) => entry.watch.signal),
      stagedPlantActions: actions.length,
    };
  }

  private async breakpoints(session: Session, args: DebugArgs['debug_breakpoints']): Promise<Body> {
    // plan-aix §7.2 fact 2: the runtime refuses breakpoints on a session with more than one task
    if (session.taskCount > 1 && args.action !== 'list')
      return failure(
        'MCP_INVALID_ARGUMENTS',
        'Breakpoints need a project with one task.',
        `the project has ${session.taskCount} tasks; the runtime arms breakpoints only with one task`,
        'Step and inspect without breakpoints, or debug a project with one task.',
      );
    if ((args.action === 'set' || args.action === 'add' || args.action === 'remove') && !args.locations?.length)
      return failure(
        'MCP_INVALID_ARGUMENTS',
        'This action needs locations.',
        `${args.action} needs at least one location`,
        'Give locations: [{ file, line }] for ST and IL, or [{ file, element }].',
      );
    const files = [...new Set(Object.values(session.debugMap.pou).flatMap((pou) => (pou.sourceRef ? [pou.sourceRef] : [])))];
    const wanted: Array<{ file: string; element: string; line?: number; pc: number }> = [];
    for (const location of args.locations ?? []) {
      if (!files.some((file) => sameFile(file, location.file)))
        return failure(
          'MCP_NOT_FOUND',
          'No program of this build was compiled from the file.',
          `unknown file ${location.file}`,
          'Use one of validValues.',
          { validValues: values(files) },
        );
      const element = location.element ?? `line:${location.line}`;
      const found = resolveElementPc(session.debugMap, location.file, element);
      if (!found.mapped)
        return failure(
          'MCP_NOT_FOUND',
          'Execution cannot stop at this place.',
          found.message,
          'Use one of validValues: the places of the file execution stops at.',
          {
            validValues: values(elementPcMap(session.debugMap, location.file).map((entry) => entry.element)),
          },
        );
      wanted.push({ file: location.file, element, ...(location.line !== undefined ? { line: location.line } : {}), pc: found.pc });
    }
    const { adapter, breakpoints } = session;
    if (args.action === 'set' || args.action === 'clear') {
      await adapter.clearBreakpoints();
      breakpoints.clear();
    }
    if (args.action === 'remove')
      for (const entry of wanted) {
        await adapter.removeBreakpoint(entry.pc);
        breakpoints.delete(entry.pc);
      }
    if (args.action === 'set' || args.action === 'add')
      for (const { pc, ...place } of wanted) {
        if (!(await adapter.setBreakpoint(pc))) throw new Error(`the runtime did not arm pc ${pc}`);
        breakpoints.set(pc, place);
      }
    const armed = new Set(await adapter.getBreakpoints());
    return {
      ok: true,
      sessionId: session.id,
      breakpoints: [...breakpoints].map(([pc, place]) => ({ ...place, pc, active: armed.has(pc) })),
    };
  }

  /** One scan under the virtual clock: the plant exchange once, then the runtime's step. False when a breakpoint held it. */
  private async scan(session: Session): Promise<boolean> {
    const atMs = session.scans * session.scanMs;
    const { plant, adapter } = session;
    if (plant && !session.exchanged) {
      await exchangeOnce(plant.core, adapter, plant.map, plant.layout, atMs, session.scanMs);
      session.exchanged = true;
    }
    await adapter.scenarioStep(atMs);
    const info = await adapter.getInfo();
    session.pc = info.pc;
    session.vmError = [0, VM_HALTED, VM_PAUSED].includes(info.error) ? 0 : info.error;
    if (info.error === VM_PAUSED || info.cycles === session.lastCycles) {
      session.held = true;
      return false;
    }
    session.held = false;
    session.lastCycles = info.cycles;
    session.scans += 1;
    session.exchanged = false;
    return true;
  }

  private async step(session: Session, args: DebugArgs['debug_step'], signal: AbortSignal): Promise<Body> {
    const mode = args.mode ?? 'cycles';
    let budget: number;
    if (mode === 'ms') {
      if (args.durationMs === undefined || args.durationMs % session.scanMs !== 0)
        return failure(
          'MCP_INVALID_ARGUMENTS',
          'durationMs must be a multiple of the scan interval.',
          `durationMs ${args.durationMs ?? '(missing)'} with a scan interval of ${session.scanMs} ms`,
          `Give durationMs as a multiple of ${session.scanMs}.`,
        );
      budget = args.durationMs / session.scanMs;
    } else budget = mode === 'continue' ? (args.maxCycles ?? 1000) : (args.cycles ?? 1);
    // the reads are checked before anything runs: a wrong name costs no scan
    const watch = this.resolveReads(session, args.watch ?? []);
    if (!Array.isArray(watch)) return watch;
    const deadline = Date.now() + DEBUG_LIMITS.callDeadlineMs;
    let executed = 0;
    let stopReason: 'stepped' | 'breakpoint' | 'fault' | 'budget_reached' = mode === 'continue' ? 'budget_reached' : 'stepped';
    while (executed < budget) {
      if (signal.aborted)
        return failure('MCP_CANCELLED', 'The step was cancelled.', 'the request was aborted', 'Step again with fewer cycles.');
      if (Date.now() > deadline) {
        stopReason = 'budget_reached';
        break;
      }
      if (!(await this.scan(session))) {
        stopReason = 'breakpoint';
        break;
      }
      executed += 1;
      if (session.vmError !== 0) {
        stopReason = 'fault';
        break;
      }
    }
    const read = await this.readValues(session, watch);
    return {
      ok: true,
      sessionId: session.id,
      stopReason,
      ...this.position(session),
      cyclesExecuted: executed,
      ...(session.vmError !== 0 ? { vmError: session.vmError } : {}),
      ...(watch.length > 0 ? { values: Object.fromEntries(Object.entries(read).map(([name, entry]) => [name, entry.value])) } : {}),
      ...(args.includeFacts && session.plant ? { plantFacts: session.plant.core.facts() } : {}),
    };
  }

  private position(session: Session): Body {
    const place = session.held && session.pc !== undefined ? this.placeOf(session, session.pc) : undefined;
    return {
      atMs: session.scans * session.scanMs,
      cycles: session.scans,
      state: session.vmError !== 0 ? 'error' : session.held ? 'paused' : 'idle',
      ...(place ? { location: place } : {}),
    };
  }

  private placeOf(session: Session, pc: number): Body {
    const armed = session.breakpoints.get(pc);
    for (const [pou, info] of Object.entries(session.debugMap.pou)) {
      if (!info.sourceRef) continue;
      const entry = elementPcMap(session.debugMap, info.sourceRef).find((candidate) => candidate.pc === pc);
      if (entry || (armed && sameFile(info.sourceRef, armed.file)))
        return {
          pou,
          file: armed?.file ?? info.sourceRef,
          element: armed?.element ?? entry!.element,
          ...(armed?.line ? { line: armed.line } : {}),
          pc,
        };
    }
    return { pc };
  }

  /** Names to reads through the debug map, never a raw address; an unknown name answers MCP_NOT_FOUND with the valid names. */
  private resolveReads(session: Session, names: readonly string[]): ResolvedWatch[] | Body {
    const reads: ResolvedWatch[] = [];
    for (const name of names) {
      const watch = resolveWatch(session.debugMap, name);
      if (!watch)
        return failure(
          'MCP_NOT_FOUND',
          'No program variable has this name.',
          `unknown variable '${name}'`,
          'Use one of validValues (Program.Variable or Program.Instance.Member).',
          {
            validValues: values(watchableSignals(session.debugMap)),
          },
        );
      reads.push(watch);
    }
    return reads;
  }

  private async readValues(
    session: Session,
    reads: readonly ResolvedWatch[],
  ): Promise<Record<string, { type: string; region: string; value: boolean | number }>> {
    const out: Record<string, { type: string; region: string; value: boolean | number }> = {};
    for (const watch of reads) {
      const bytes = await session.adapter.peek(watch.address, watch.size);
      out[watch.signal] = { type: watch.type, region: regionOf(watch.address), value: readWatch(watch, bytes) };
    }
    return out;
  }

  private async inspect(session: Session, args: DebugArgs['debug_inspect']): Promise<Body> {
    const names =
      args.signals ??
      watchableSignals(session.debugMap)
        .filter((name) => (resolveWatch(session.debugMap, name)?.address ?? 0x2000) < 0x2000)
        .slice(0, 64);
    const reads = this.resolveReads(session, names);
    if (!Array.isArray(reads)) return reads;
    const blocks: Record<string, Record<string, boolean | number>> = {};
    for (const name of args.functionBlocks ?? []) {
      const programs = Object.entries(session.debugMap.pou)
        .filter(([, pou]) => pou.type === 'PROGRAM')
        .map(([pou]) => pou);
      const found = [name, ...programs.map((pou) => `${pou}.${name}`)]
        .map((candidate) => findSignalVariable(session.debugMap, candidate))
        .find((entry) => entry?.variable.children);
      if (!found)
        return failure(
          'MCP_NOT_FOUND',
          'No function block instance has this name.',
          `unknown function block instance '${name}'`,
          'Use one of validValues.',
          {
            validValues: values(
              programs.flatMap((pou) =>
                Object.entries(session.debugMap.pou[pou]!.vars)
                  .filter(([, variable]) => variable.children)
                  .map(([variable]) => `${pou}.${variable}`),
              ),
            ),
          },
        );
      const members = Object.keys(found.variable.children!)
        .map((member) => resolveWatch(session.debugMap, `${found.signal}.${member}`))
        .filter((watch): watch is ResolvedWatch => watch !== undefined);
      const read = await this.readValues(session, members);
      blocks[found.signal] = Object.fromEntries(
        Object.entries(read).map(([signal, entry]) => [signal.slice(found.signal.length + 1), entry.value]),
      );
    }
    return {
      ok: true,
      sessionId: session.id,
      ...this.position(session),
      signals: await this.readValues(session, reads),
      ...(args.functionBlocks ? { functionBlocks: blocks } : {}),
      ...((args.includeSfc ?? true) ? await this.sfc(session) : {}),
      ...((args.includePlant ?? true) && session.plant
        ? { plant: { signals: session.plant.core.sense(), facts: session.plant.core.facts() } }
        : {}),
    };
  }

  /** The SFC charts from the monitor entries of the build (`debugMap.pou[].monitor`): active steps with their time, transitions. */
  private async sfc(session: Session): Promise<Body> {
    const charts: Body[] = [];
    for (const [pou, info] of Object.entries(session.debugMap.pou)) {
      const monitor = info.monitor?.filter((entry) => ['step', 'time', 'condition', 'fired'].includes(entry.role) && entry.variable);
      if (!monitor?.length) continue;
      const value = async (variable: string) => {
        const watch = resolveWatch(session.debugMap, `${pou}.${variable}`);
        return watch ? readWatch(watch, await session.adapter.peek(watch.address, watch.size)) : undefined;
      };
      const steps: Body[] = [];
      const transitions = new Map<string, Body>();
      for (const entry of monitor) {
        const id = entry.element.replace(/^(step|transition):/, '');
        const read = await value(entry.variable!);
        if (entry.role === 'step' && read === true) {
          const time = monitor.find((candidate) => candidate.role === 'time' && candidate.element === entry.element);
          const activeMs = time ? await value(time.variable!) : undefined;
          steps.push({ id, ...(typeof activeMs === 'number' ? { activeMs } : {}) });
        }
        if (entry.role === 'condition' || entry.role === 'fired')
          transitions.set(id, { id, ...transitions.get(id), [entry.role === 'condition' ? 'conditionTrue' : 'fired']: read === true });
      }
      charts.push({ pou, ...(info.sourceRef ? { file: info.sourceRef } : {}), activeSteps: steps, transitions: [...transitions.values()] });
    }
    return charts.length > 0 ? { sfc: charts } : {};
  }
}

const sameFile = (a: string, b: string) => {
  const key = (value: string) =>
    value
      .replace(/\\/g, '/')
      .replace(/^(\.\/)+/, '')
      .replace(/\.json$/i, '')
      .toLowerCase();
  return key(a) === key(b);
};

function regionOf(address: number): string {
  return address < 0x1000 ? 'IPI' : address < 0x2000 ? 'OPI' : address < 0x4000 ? 'WORK' : 'RETAIN';
}

const INTEGER_RANGES: Record<string, [number, number]> = {
  SINT: [-128, 127],
  USINT: [0, 255],
  BYTE: [0, 255],
  INT: [-32768, 32767],
  UINT: [0, 65535],
  WORD: [0, 65535],
  DINT: [-2147483648, 2147483647],
  TIME: [-2147483648, 2147483647],
  UDINT: [0, 4294967295],
  DWORD: [0, 4294967295],
};

/** Why `value` cannot be written to the input, or undefined when it can. */
function encodeProblem(watch: ResolvedWatch, value: boolean | number): string | undefined {
  if (watch.type === 'BOOL') return typeof value === 'boolean' ? undefined : 'a BOOL input takes true or false';
  if (typeof value !== 'number') return `a ${watch.type} input takes a number`;
  if (watch.type === 'REAL' || watch.type === 'LREAL') return undefined;
  const range = INTEGER_RANGES[watch.type];
  if (!range) return `an input of type ${watch.type} cannot be set here`;
  return Number.isInteger(value) && value >= range[0] && value <= range[1]
    ? undefined
    : `a ${watch.type} takes an integer from ${range[0]} to ${range[1]}`;
}

async function encode(adapter: NativeAdapter, watch: ResolvedWatch, value: boolean | number): Promise<Uint8Array> {
  const bytes = new Uint8Array(watch.size);
  const view = new DataView(bytes.buffer);
  if (watch.type === 'BOOL') {
    if (watch.bitOffset === undefined) bytes[0] = value ? 1 : 0;
    else {
      const current = (await adapter.peek(watch.address, 1))[0]!;
      bytes[0] = value ? current | (1 << watch.bitOffset) : current & ~(1 << watch.bitOffset);
    }
    return bytes;
  }
  const number = value as number;
  if (watch.type === 'REAL') view.setFloat32(0, number, true);
  else if (watch.type === 'LREAL') view.setFloat64(0, number, true);
  else if (watch.size === 1) view.setUint8(0, number & 0xff);
  else if (watch.size === 2) view.setUint16(0, number & 0xffff, true);
  else view.setUint32(0, number >>> 0, true);
  return bytes;
}
