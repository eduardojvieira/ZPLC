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
export type PlantKind = (typeof PLANT_KINDS)[number];
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

const toggle = (state: PlantState, key: string): PlantState => ({ ...state, [key]: !state[key] });

// Each model below is the one the scenario engine grades with (`test-engine/index.ts`, `runScenario`), step for step, so a
// program that passes the live panel passes its check (PLT-013, D-19). The graded models live inline in `runScenario` and
// cannot be called from here; `plantParity.test.ts` drives both with one script and fails if they drift apart.
// The fault actions are the live-only addition (PLT-011) and change nothing until a person or a script triggers them.

const motor: PlantModel = {
  kind: 'motor-v1',
  reads: ['command'],
  drives: ['atSpeed'],
  actions: ['stall'],
  initial: () => ({ speed: 0, stall: false }),
  step: (s, r) => ({
    ...s,
    speed: s.stall ? 0 : r.command ? Math.min(1000, (s.speed as number) + 500) : Math.max(0, (s.speed as number) - 1000),
  }),
  act: (s, a) => (a === 'stall' ? toggle(s, 'stall') : s),
  sense: (s) => ({ atSpeed: (s.speed as number) >= 1000 }),
};

/** Where the part is on the belt, per graded phase (`position` is only what the view draws). */
const CONVEYOR_POSITION = { idle: 0, classifier: 250, diverter: 750, transfer: 900, jammed: 900 } as const;
type ConveyorPhase = keyof typeof CONVEYOR_POSITION;
const conveyorAt = (s: PlantState, phase: ConveyorPhase, extra: PlantState = {}): PlantState => ({
  ...s,
  ...extra,
  phase,
  position: CONVEYOR_POSITION[phase],
});

const conveyor: PlantModel = {
  kind: 'conveyor-v1',
  reads: ['belt', 'diverter'],
  drives: ['partAtClassifier', 'metalDetected', 'partAtDiverter', 'jamDetected'],
  actions: ['jam', 'metalPart'],
  initial: () => ({ phase: 'idle', position: 0, classified: 0, moving: false, jam: false, metalPart: false }),
  step: (s, r) => {
    if (!r.belt || s.jam) return { ...s, moving: false };
    const moving = { moving: true };
    switch (s.phase) {
      case 'idle':
        return conveyorAt(s, 'classifier', moving);
      case 'classifier':
        return conveyorAt(s, 'diverter', moving);
      case 'diverter':
        return conveyorAt(s, 'transfer', { ...moving, classified: r.diverter ? 1 : s.classified });
      case 'transfer':
        // the graded belt jams by itself once the part reaches the transfer
        return conveyorAt(s, 'jammed', { moving: false, jam: true });
      default:
        return { ...s, moving: false };
    }
  },
  // the jam toggles: it stops the belt where it is, and clearing it also frees a belt that jammed by itself
  act: (s, a) => {
    if (a === 'metalPart') return toggle(s, a);
    if (a !== 'jam') return s;
    if (!s.jam) return { ...s, jam: true };
    return s.phase === 'jammed' ? conveyorAt(s, 'idle', { jam: false }) : { ...s, jam: false };
  },
  // metalDetected follows the part at the classifier, as graded: the metalPart action does not change what the grader sees
  sense: (s) => ({
    partAtClassifier: s.phase === 'classifier',
    metalDetected: s.phase === 'classifier',
    partAtDiverter: s.phase === 'diverter',
    jamDetected: s.jam === true,
  }),
};

const tank: PlantModel = {
  kind: 'tank-v1',
  reads: ['pump'],
  drives: ['levelLow', 'levelHigh', 'pumpFault'],
  actions: ['pumpFault'],
  initial: () => ({ level: 200, filling: false, pumpFault: false }),
  step: (s, r) => {
    const filling = r.pump === true && !s.pumpFault;
    const level = s.level as number;
    return { ...s, filling, level: filling ? Math.min(1000, level + 100) : Math.max(0, level - 20) };
  },
  act: (s, a) => (a === 'pumpFault' ? toggle(s, 'pumpFault') : s),
  sense: (s) => ({ levelLow: (s.level as number) <= 250, levelHigh: (s.level as number) >= 750, pumpFault: s.pumpFault === true }),
};

/** Scans a pedestrian takes to cross once WALK shows. */
const CROSSING_SCANS = 3;
/** The pedestrian asks to cross from the second scan on (10 ms in), until the crossing starts. */
const pedRequest = (s: PlantState): boolean => s.phase === 'waiting' || (s.phase === 'approaching' && (s.elapsed as number) >= 1);
const crossing: PlantModel = {
  kind: 'pedestrian-v1',
  reads: ['vehicleRed', 'vehicleYellow', 'vehicleGreen', 'pedWalk', 'pedStop'],
  drives: ['pedRequest'],
  actions: ['request', 'blocked'],
  initial: () => ({ phase: 'approaching', scans: 0, elapsed: 0, blocked: false }),
  step: (s, r) => {
    const next = { ...s, elapsed: (s.elapsed as number) + 1 };
    const phase = s.phase === 'approaching' && pedRequest(s) ? 'waiting' : s.phase;
    if (phase === 'waiting' && r.pedWalk && !s.blocked) return { ...next, phase: 'crossing', scans: 0 };
    if (phase === 'crossing') {
      const scans = (s.scans as number) + 1;
      return scans >= CROSSING_SCANS ? { ...next, phase: 'cleared', scans: 0 } : { ...next, phase, scans };
    }
    return { ...next, phase };
  },
  act: (s, a) =>
    a === 'blocked'
      ? toggle(s, 'blocked')
      : a === 'request' && (s.phase === 'approaching' || s.phase === 'cleared')
        ? { ...s, phase: 'waiting', scans: 0 }
        : s,
  sense: (s) => ({ pedRequest: pedRequest(s) }),
};

export const PLANT_MODELS: Record<PlantKind, PlantModel> = {
  'motor-v1': motor,
  'conveyor-v1': conveyor,
  'tank-v1': tank,
  'pedestrian-v1': crossing,
};

/** One running plant: its state and the fault actions. `tick` is called once per PLC scan; the command bar is the one transport. */
export function createPlantRun(kind: PlantKind) {
  const model = PLANT_MODELS[kind];
  const run = {
    model,
    state: model.initial(),
    tickCount: 0,
    /** One scan of the plant. */
    tick(reads: Signals): void {
      run.step(reads);
    },
    /** One scan of the plant (the scripted traces call it directly). */
    step(reads: Signals): void {
      run.state = model.step(run.state, reads);
      run.tickCount += 1;
    },
    act(action: string): void {
      if (model.actions.includes(action)) run.state = model.act(run.state, action);
    },
    sense: (): Record<string, boolean> => model.sense(run.state),
    reset(): void {
      run.state = model.initial();
      run.tickCount = 0;
    },
  };
  return run;
}
export type PlantRun = ReturnType<typeof createPlantRun>;

export interface TraceRow {
  tick: number;
  reads: Signals;
  sense: Record<string, boolean>;
  state: PlantState;
}

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
