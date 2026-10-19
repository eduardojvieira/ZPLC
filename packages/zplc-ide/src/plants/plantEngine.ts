/**
 * The plants of Learn (LRN-018) as pure, deterministic models: integer arithmetic in permille, a fixed step per PLC scan, and no
 * clock, no random number and no float, so the same program and input script give the same trace on every platform (LRN-019).
 * A plant reads the commands the program writes (`reads`), drives the sensors the program reads (`drives`) and offers the
 * fault actions it defines. How those signals meet the program's I/O is the mapping of `plantMap.ts`; nothing here knows a
 * program variable.
 *
 * Pure TypeScript with no Electron, store or component import.
 */
export const PLANT_KINDS = ['motor-v1', 'conveyor-v1', 'tank-v1', 'pedestrian-v1'] as const;
export type PlantKind = typeof PLANT_KINDS[number];
export type PlantState = Readonly<Record<string, number | boolean | string>>;
export type Signals = Readonly<Record<string, boolean>>;

export interface PlantModel {
  readonly kind: PlantKind;
  /** Signals the program writes and the plant reads. */
  readonly reads: readonly string[];
  /** Signals the plant sets and the program reads as inputs. */
  readonly drives: readonly string[];
  /** The fault (or event) actions the plant defines, by name. */
  readonly actions: readonly string[];
  initial(): PlantState;
  step(state: PlantState, reads: Signals): PlantState;
  act(state: PlantState, action: string): PlantState;
  sense(state: PlantState): Record<string, boolean>;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const toggle = (state: PlantState, key: string): PlantState => ({ ...state, [key]: !state[key] });

const motor: PlantModel = {
  kind: 'motor-v1',
  reads: ['command'],
  drives: ['atSpeed'],
  actions: ['stall'],
  initial: () => ({ speed: 0, stall: false }),
  step: (s, r) => ({ ...s, speed: s.stall ? 0 : clamp((s.speed as number) + (r.command ? 100 : -100), 0, 1000) }),
  act: (s, a) => (a === 'stall' ? toggle(s, 'stall') : s),
  sense: (s) => ({ atSpeed: (s.speed as number) >= 900 }),
};

const conveyor: PlantModel = {
  kind: 'conveyor-v1',
  reads: ['belt', 'diverter'],
  drives: ['partAtClassifier', 'metalDetected', 'partAtDiverter', 'jamDetected'],
  actions: ['jam', 'metalPart'],
  initial: () => ({ position: 0, classified: 0, jam: false, metalPart: false }),
  step: (s, r) => {
    if (!r.belt || s.jam) return s;
    const moved = (s.position as number) + 50;
    return moved >= 1000 ? { ...s, position: 0, classified: (s.classified as number) + 1 } : { ...s, position: moved };
  },
  act: (s, a) => (a === 'jam' || a === 'metalPart' ? toggle(s, a) : s),
  sense: (s) => {
    const at = s.position as number;
    const atClassifier = at >= 200 && at < 300;
    return { partAtClassifier: atClassifier, metalDetected: atClassifier && s.metalPart === true, partAtDiverter: at >= 700 && at < 800, jamDetected: s.jam === true };
  },
};

const tank: PlantModel = {
  kind: 'tank-v1',
  reads: ['pump'],
  drives: ['levelLow', 'levelHigh', 'pumpFault'],
  actions: ['pumpFault'],
  initial: () => ({ level: 500, pumpFault: false }),
  step: (s, r) => ({ ...s, level: clamp((s.level as number) + (r.pump && !s.pumpFault ? 20 : 0) - 8, 0, 1000) }),
  act: (s, a) => (a === 'pumpFault' ? toggle(s, 'pumpFault') : s),
  sense: (s) => ({ levelLow: (s.level as number) <= 200, levelHigh: (s.level as number) >= 800, pumpFault: s.pumpFault === true }),
};

/** Scans a pedestrian takes to cross once WALK shows. */
const CROSSING_SCANS = 30;
const crossing: PlantModel = {
  kind: 'pedestrian-v1',
  reads: ['vehicleRed', 'vehicleYellow', 'vehicleGreen', 'pedWalk', 'pedStop'],
  drives: ['pedRequest'],
  actions: ['request', 'blocked'],
  initial: () => ({ phase: 'approaching', scans: 0, blocked: false }),
  step: (s, r) => {
    if (s.phase === 'waiting' && r.pedWalk && r.vehicleRed && !s.blocked) return { ...s, phase: 'crossing', scans: 0 };
    if (s.phase !== 'crossing') return s;
    const scans = (s.scans as number) + 1;
    return scans >= CROSSING_SCANS ? { ...s, phase: 'cleared', scans: 0 } : { ...s, scans };
  },
  act: (s, a) => (a === 'blocked' ? toggle(s, 'blocked') : a === 'request' && (s.phase === 'approaching' || s.phase === 'cleared') ? { ...s, phase: 'waiting', scans: 0 } : s),
  sense: (s) => ({ pedRequest: s.phase === 'waiting' }),
};

export const PLANT_MODELS: Record<PlantKind, PlantModel> = { 'motor-v1': motor, 'conveyor-v1': conveyor, 'tank-v1': tank, 'pedestrian-v1': crossing };

/** One running plant: play, pause, step and the fault actions. `tick` is called once per PLC scan. */
export function createPlantRun(kind: PlantKind) {
  const model = PLANT_MODELS[kind];
  const run = {
    model,
    state: model.initial(),
    tickCount: 0,
    paused: false,
    /** One scan of the plant; does nothing while paused. */
    tick(reads: Signals): void { if (!run.paused) run.step(reads); },
    /** Exactly one scan, paused or not. */
    step(reads: Signals): void { run.state = model.step(run.state, reads); run.tickCount += 1; },
    setPaused(paused: boolean): void { run.paused = paused; },
    act(action: string): void { if (model.actions.includes(action)) run.state = model.act(run.state, action); },
    sense: (): Record<string, boolean> => model.sense(run.state),
    reset(): void { run.state = model.initial(); run.tickCount = 0; },
  };
  return run;
}
export type PlantRun = ReturnType<typeof createPlantRun>;

export interface TraceRow { tick: number; reads: Signals; sense: Record<string, boolean>; state: PlantState }

/** Runs a plant against a scripted program and returns the trace; `schedule` maps a scan to the actions done before it. */
export function tracePlant(
  kind: PlantKind,
  ticks: number,
  program: (tick: number, sensed: Record<string, boolean>) => Signals,
  schedule: Readonly<Record<number, readonly string[]>> = {},
): TraceRow[] {
  const run = createPlantRun(kind);
  const rows: TraceRow[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const action of schedule[tick] ?? []) run.act(action);
    const reads = program(tick, run.sense());
    run.step(reads);
    rows.push({ tick, reads, sense: run.sense(), state: run.state });
  }
  return rows;
}

/** FNV-1a (32 bit) of the trace as JSON: the same on every platform because the trace holds integers, booleans and strings. */
export function traceHash(rows: readonly TraceRow[]): string {
  const text = JSON.stringify(rows);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}
