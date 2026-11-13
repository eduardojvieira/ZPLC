import type { PlantMapV2, SignalType } from '../plants/plantMap';

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type FactValue = number | boolean | string;

/** C1. The scene file (PLT-002). A file `scene.json` of a project or of `plant-scenes/<id>/`. Data only. */
export interface PlantSceneFile {
  schemaVersion: 1;
  name: string;
  parts: ScenePart[]; // order is the creation order: it is part of determinism
  cameras: CameraPreset[];
  /** The shortest sensor pulse the scene can produce at catalogue speeds, in ms (SCN-007). */
  shortestPulseMs?: number;
}
export interface ScenePart {
  id: string; // unique in the scene, [a-z][a-z0-9-]{0,31}
  part: string; // a catalogue id, e.g. 'belt'
  name: string; // the signal prefix, [A-Za-z][A-Za-z0-9_]{0,23}, unique in the scene
  position: Vec3; // metres
  rotationYDeg: number; // multiple of 15 in the editor; any value in a file
  config: Readonly<Record<string, number | string | boolean>>;
}
export interface CameraPreset {
  name: string;
  position: Vec3;
  target: Vec3;
}

/** C2. One catalogue part, defined once (PRT-002). `physics` and `behave` are the only parts that know Jolt. */
export interface PartDefinition {
  id: string;
  family: 'items' | 'sources' | 'conveyors' | 'flow' | 'sensors' | 'panel' | 'process' | 'manipulators' | 'stations';
  names: { en: string; es: string };
  config: Readonly<Record<string, ConfigField>>;
  signals(part: ScenePart): PlantSignalDef[]; // derived: `${part.name}.${signal}`
  actions: readonly string[]; // fault actions (PLT-011, PRT-008)
  snapPoints(part: ScenePart): readonly SnapPoint[];
  doc: { en: string; es: string };
  /** The equations of a process model, in prose and symbols, both languages (PLT-009). Required for family 'process'. */
  equations?: { en: string; es: string };
}
export interface ConfigField {
  kind: 'number' | 'enum' | 'boolean';
  min?: number;
  max?: number;
  values?: readonly string[];
  default: number | string | boolean;
  unit?: string;
}
export interface SnapPoint {
  name: string;
  position: Vec3;
  normalYDeg: number;
  accepts: readonly string[];
}
export interface PlantSignalDef {
  name: string;
  direction: 'command' | 'sensor';
  type: SignalType;
  unit?: string;
  /** The engineering range of a numeric signal, in `unit`; the plant map's `eng_min`, `eng_max` and `unit` MUST equal it. */
  range?: { min: number; max: number };
}

/** C3 amended: optional properties of an item that a sensor reads and the view draws. Pallets have none. */
export type ItemColour = 'red' | 'blue';
export interface ItemProps {
  colour?: ItemColour;
  /** True for a metal item (an inductive sensor sees only these). Absent means false. */
  metal?: boolean;
  /** An identity code 1 to 9 a vision sensor reads; absent means unlabelled (0). */
  code?: number;
}

/** C3. A drawable state; the view reads nothing else (P14). */
export interface BodyPose extends ItemProps {
  id: string;
  part: string;
  kind: 'box' | 'pallet' | 'item';
  size: Vec3;
  p: Vec3;
  q: Quat;
  /** An optional tag of an item, so the view can draw a lid or a base differently from a box. Pallets have none. */
  tag?: 'box' | 'lid' | 'base';
}
export interface PartView {
  id: string;
  part: string;
  name: string;
  pose: BodyPose;
  state: Readonly<Record<string, FactValue>>;
  signals: Readonly<Record<string, boolean | number>>;
}
export interface PlantSnapshot {
  timeMs: number;
  scans: number;
  parts: readonly PartView[];
  items: readonly BodyPose[];
  facts: Readonly<Record<string, FactValue>>;
}

/** C4. The plant core. Created by `createPlantCore` (Task P4). All times are multiples of `stepMs`. */
export interface PlantCore {
  readonly stepMs: 5;
  readonly signals: readonly PlantSignalDef[]; // direction 'command' goes program to plant
  /** Latch commands (by full signal name) for the next `advance`. Unknown names throw a located Error. */
  apply(commands: Readonly<Record<string, boolean | number>>): void;
  advance(ms: number): void; // throws RangeError unless ms is a positive multiple of stepMs
  sense(): Readonly<Record<string, boolean | number>>;
  facts(): Readonly<Record<string, FactValue>>;
  /** A person operating a panel part (push button, VIS-010). */
  operate(signal: string, value: boolean | number): void;
  act(part: string, action: string): void; // fault action by part name
  addItem(kind: string, at: Vec3): string; // returns the item id; throws when the scene forbids it
  removeItem(id: string): void;
  snapshot(): PlantSnapshot;
  capture(): PlantState; // PLT-012
  restore(state: PlantState): void;
  reset(): void;
  traceHash(): Promise<string>; // sha256 hex of the per-advance trace so far
  dispose(): void;
}
export type PlantState = { readonly format: 1; readonly bytes: Uint8Array }; // opaque to every caller
export declare function createPlantCore(scene: PlantSceneFile, options?: { seed?: number }): Promise<PlantCore>;

/** C5. The runtime port the lock-step session uses (a subset of `NativeAdapter`; WASM adapter shares it). */
export interface PlantRuntimePort {
  setClockMode(mode: 'virtual' | 'free'): Promise<{ scanIntervalMs: number }>; // new, Tasks R1/R2
  scenarioStep(atMs: number): Promise<void>;
  getInfo(): Promise<{ cycles: number }>;
  peek(address: number, length: number): Promise<Uint8Array>; // memory.read, at most 64 bytes
  pokeN(address: number, bytes: Uint8Array): Promise<void>; // memory.write, at most 64 bytes, force-aware (RT-011)
}

/** C6. The lock-step session (Task R3). */
export type PlantSessionState = 'idle' | 'running' | 'paused' | 'held' | 'faulted' | 'stopped';
export interface PlantSession {
  readonly state: PlantSessionState;
  readonly slowdown: number; // 1 = real time; below 1 the plant and program are slowed together (PLT-016)
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  step(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
  onChange(listener: (event: PlantSessionEvent) => void): () => void;
}
export type PlantSessionEvent =
  | { kind: 'scan'; scans: number; snapshot: PlantSnapshot }
  | { kind: 'state'; state: PlantSessionState; reason?: string }
  | { kind: 'slowdown'; factor: number; message: string };
export declare function createPlantSession(ports: {
  core: PlantCore;
  runtime: PlantRuntimePort;
  map: PlantMapV2;
  paceMs?: (ms: number) => Promise<void>;
}): PlantSession;

/** C7. Scenario seam (Task S1): the optional port `runScenario` uses for a scene scenario. */
export interface ScenarioPlantPort {
  core: PlantCore;
  map: PlantMapV2;
}
