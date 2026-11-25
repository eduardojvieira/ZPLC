/**
 * The catalogue sheet (plan-vis C8): every part kind that has a model, with each state its model shows. Pure data and one pure
 * function, so a test can hold the list to `MODELS`; capture.ts draws it in the page. A state is a published-view override (the same
 * way the model tests build views): the size and state of the part as the plant core publishes it in the reference scenes, with
 * the keys a state changes. A kind that never changes its look has one state.
 */
import type { BodyPose, FactValue, PartView, Vec3 } from '../../src/plant/contracts';

type Facts = Readonly<Record<string, FactValue>>;
type Signals = Readonly<Record<string, boolean | number>>;

export interface CatalogueState {
  label: string;
  state?: Facts;
  signals?: Signals;
  /** The turn of the part about the vertical axis, in degrees, for a part whose state is its pose (a diverter arm). */
  yawDeg?: number;
  /** How far the part is raised above where it stands, in metres, for a part whose state is its pose (a machining door). */
  rise?: number;
}
export interface CatalogueKind {
  id: string;
  /** The part's own box, as the reference scenes publish it. */
  size: Vec3;
  /** Where the part stands (its centre height), so legs and posts reach the floor. */
  height: number;
  state: Facts;
  signals?: Signals;
  /** The point of the part, in its own frame, that a turn leaves where it stands (a diverter arm's pivot). */
  pivot?: Vec3;
  /** True when the model shows a different look in some state. */
  stateful: boolean;
  states: readonly CatalogueState[];
}

const still = (label = 'as published'): CatalogueState[] => [{ label }];
const kind = (
  id: string,
  size: Vec3,
  height: number,
  state: Facts,
  states: readonly CatalogueState[],
  signals?: Signals,
  pivot?: Vec3,
): CatalogueKind => ({
  id,
  size,
  height,
  state,
  ...(signals ? { signals } : {}),
  ...(pivot ? { pivot } : {}),
  stateful: states.length > 1,
  states,
});
const pick = (label: string, key: string, ...values: FactValue[]): CatalogueState[] =>
  values.map((v) => ({ label: `${label} ${String(v)}`, state: { [key]: v } }));

const BELT_STATE = { speedMps: 0, stalled: false, jammed: false };
const CRANE_RACK = { columns: 3, levels: 2, bayPitchM: 1, levelPitchM: 0.6 };
const ARM_AXES = {
  x: 0,
  y: 0,
  z: 0,
  strokeX: 1.2,
  strokeY: 0.5,
  strokeZ: 0,
  fraction: 0,
  holding: false,
  gripper: 'clamp',
  closeFraction: 0,
};
const GANTRY_AXES = { ...ARM_AXES, strokeX: 1.6, strokeY: 1.2, strokeZ: 1.2, gripper: 'vacuum' };
const POT = { value: 0, min: 0, max: 100, fraction: 0, unit: '%', text: '0.0 %' };

export const CATALOGUE: readonly CatalogueKind[] = [
  // conveyors
  kind('belt', [3, 0.1, 0.6], 0.45, BELT_STATE, [{ label: 'stopped' }, { label: 'running', state: { speedMps: 0.5 } }]),
  kind('roller', [2, 0.1, 0.6], 0.45, BELT_STATE, [{ label: 'stopped' }, { label: 'running', state: { speedMps: 0.5 } }]),
  kind('curved', [0.6, 0.1, 0.6], 0.45, { ...BELT_STATE, radius: 1.2, angleDeg: 90 }, [
    { label: 'stopped' },
    { label: 'running', state: { speedMps: 0.5 } },
  ]),
  kind('chain-transfer', [0.8, 0.1, 0.6], 0.45, { ...BELT_STATE, fraction: 0, axis: 'x', liftStuck: false }, [
    { label: 'lowered' },
    { label: 'raised', state: { fraction: 1 } },
  ]),
  kind('turntable', [0.6, 0.1, 0.6], 0.45, { ...BELT_STATE, angleDeg: 0, fraction: 0, turnStuck: false }, [
    { label: 'centre' },
    { label: 'left', state: { angleDeg: -90 } },
    { label: 'right', state: { angleDeg: 90 } },
  ]),
  kind('lift', [1.4, 0.1, 0.7], 0.45, { ...BELT_STATE, fraction: 0, level: 1, strokeM: 0.6, levelPitchM: 0.6 }, [
    { label: 'level 1' },
    { label: 'level 2', state: { fraction: 1, level: 2 } },
  ]),
  // flow
  kind('emitter', [0.1, 0.1, 0.1], 0.5, { emitted: 0 }, still()),
  kind('stop-blade', [0.05, 0.3, 0.6], 0.33, { travelMs: 0, stuck: false }, [
    { label: 'retracted (down)' },
    { label: 'extended (up)', state: { travelMs: 400 } },
  ]),
  kind('pusher', [0.2, 0.25, 0.05], 0.63, { fraction: 0, stuck: false }, [
    { label: 'retracted' },
    { label: 'half', state: { fraction: 0.5 } },
    { label: 'extended', state: { fraction: 1 } },
  ]),
  kind(
    'diverter-arm',
    [1.2, 0.25, 0.05],
    0.63,
    { fraction: 0, stuck: false },
    [{ label: 'home' }, { label: 'diverted', state: { fraction: 1 }, yawDeg: 40 }],
    undefined,
    [-0.6, 0, 0],
  ),
  kind('aligner', [1, 0.1, 0.7], 0.45, { gapM: 0.6 }, [
    { label: 'open', state: { gapM: 0.6 } },
    { label: 'closed', state: { gapM: 0.25 } },
  ]),
  kind('chute', [1, 0.03, 0.4], 0.5, {}, still()),
  kind('remover', [0.6, 0.6, 0.6], 0.3, { delivered: 0 }, still()),
  // sensors
  kind('sensor', [0.05, 0.05, 0.05], 0.55, { detect: false, count: 0, beamLength: 0.8 }, [
    { label: 'clear' },
    { label: 'detecting', state: { detect: true }, signals: { detect: true } },
  ]),
  kind(
    'light-array',
    [0.05, 0.05, 0.8],
    0.5,
    { fraction: 0, detect: false, count: 0, beams: 12, pitchM: 0.05 },
    [
      { label: 'clear' },
      { label: 'blocked at 0.3 m', state: { detect: true }, signals: { 'LightArray1.height': 0.3, 'LightArray1.detect': true } },
    ],
    { 'LightArray1.height': 0, 'LightArray1.detect': false },
  ),
  kind(
    'scale',
    [0.6, 0.02, 0.6],
    0.5,
    { fraction: 0, detect: false },
    [
      { label: 'empty' },
      { label: 'loaded 12.5 kg', signals: { 'Scale1.weight': 12.5, 'Scale1.stable': false } },
      { label: 'stable 12.5 kg', signals: { 'Scale1.weight': 12.5, 'Scale1.stable': true } },
    ],
    { 'Scale1.weight': 0, 'Scale1.stable': false },
  ),
  kind(
    'vision-sensor',
    [0.5, 0.02, 0.5],
    0.5,
    { fraction: 0, detect: false },
    [{ label: 'empty field' }, { label: 'sees code 3', state: { detect: true }, signals: { 'Vision1.code': 3, 'Vision1.detect': true } }],
    { 'Vision1.code': 0, 'Vision1.detect': false },
  ),
  kind('limit-switch', [0.15, 0.05, 0.05], 0.5, { contact: false }, [{ label: 'free' }, { label: 'in contact', state: { contact: true } }]),
  // operator
  kind('push-button', [0.06, 0.04, 0.06], 0.5, { pressed: false }, [{ label: 'released' }, { label: 'pressed', state: { pressed: true } }]),
  kind('selector-switch', [0.06, 0.04, 0.06], 0.5, { positions: 3, position: 0 }, pick('position', 'position', 0, 1, 2)),
  kind('emergency-stop', [0.08, 0.05, 0.08], 0.5, { pressed: false, ok: true }, [
    { label: 'released' },
    { label: 'pressed', state: { pressed: true, ok: false } },
  ]),
  kind('indicator-light', [0.06, 0.06, 0.06], 0.5, { lit: false }, [{ label: 'off' }, { label: 'lit', state: { lit: true } }]),
  kind('stack-light', [0.08, 0.3, 0.08], 0.5, { red: false, amber: false, green: false }, [
    { label: 'all off' },
    { label: 'red', state: { red: true } },
    { label: 'amber', state: { amber: true } },
    { label: 'green', state: { green: true } },
    { label: 'all lit', state: { red: true, amber: true, green: true } },
  ]),
  kind('potentiometer', [0.06, 0.06, 0.06], 0.5, POT, [
    { label: 'min', state: { fraction: 0 } },
    { label: 'half', state: { fraction: 0.5, value: 50 } },
    { label: 'max', state: { fraction: 1, value: 100 } },
  ]),
  kind('numeric-display', [0.2, 0.08, 0.04], 0.8, { value: 0, min: 0, max: 100, fraction: 0, unit: '%' }, [
    { label: 'zero' },
    { label: 'value 42', state: { value: 42, fraction: 0.42 } },
    { label: 'out of range', state: { value: 250 } },
  ]),
  // manipulators
  kind('pick-place', [0.3, 0.03, 0.2], 0.735, ARM_AXES, [
    { label: 'home, open' },
    { label: 'moved, open', state: { x: 0.8, y: 0.3 } },
    { label: 'moved, gripping', state: { x: 0.8, y: 0.3, holding: true, closeFraction: 1 } },
  ]),
  kind('gantry', [0.3, 0.03, 0.2], 0.2, GANTRY_AXES, [
    { label: 'home, open' },
    { label: 'moved on X, Y, Z', state: { x: 0.9, y: 0.6, z: 0.6 } },
  ]),
  // stations
  kind('stacker-crane', [0.6, 0.04, 0.16], 0.05, { fraction: 0, bay: 0, level: 0 }, [
    { label: 'fork centre' },
    { label: 'fork left', state: { fraction: -1 } },
    { label: 'fork right', state: { fraction: 1 } },
  ]),
  kind('stacker-mast', [0.1, 1.7, 0.1], 0.85, {}, still()),
  kind('stacker-rack', [2.4, 1.3, 0.05], 0.65, CRANE_RACK, still()),
  kind('layer-palletizer', [0.8, 0.03, 0.6], 0.555, { closeFraction: 0 }, [
    { label: 'jaws open' },
    { label: 'jaws closed', state: { closeFraction: 1 } },
  ]),
  kind('manipulator-frame', [1.5, 0.06, 0.06], 1.52, {}, still()),
  kind('manipulator-beam', [0.08, 0.08, 0.08], 1.42, {}, still()),
  kind('layer-pusher', [0.8, 0.5, 0.05], 0.79, {}, still()),
  kind('layer-plate', [0.05, 0.5, 0.7], 0.79, {}, still()),
  kind('machining-centre', [1, 0.5, 0.6], 0.75, { fraction: 0, text: 'idle', busy: false }, [
    { label: 'idle' },
    { label: 'busy', state: { text: 'busy', busy: true, fraction: 0.5 } },
    { label: 'done', state: { text: 'done', busy: false, fraction: 1 } },
  ]),
  // The core lowers a door under the belt (fraction 0, open) and raises it to close the chamber (fraction 1): its pose moves 0.32 m.
  kind('machining-door', [0.05, 0.3, 0.6], 0.33, { fraction: 0 }, [
    { label: 'lowered (open)' },
    { label: 'half risen', state: { fraction: 0.5 }, rise: 0.16 },
    { label: 'risen (closed)', state: { fraction: 1 }, rise: 0.32 },
  ]),
  // process
  kind('tank', [0.4, 1, 0.25], 0.5, { level: 0, heightM: 1, fraction: 0, spilling: false }, [
    { label: 'empty' },
    { label: 'half full', state: { level: 0.5, fraction: 0.5 } },
    { label: 'full, spilling', state: { level: 1, fraction: 1, spilling: true } },
  ]),
];

/** The instance names the signals of these kinds are keyed by (`<name>.weight`), as the reference scenes name them. */
const NAMES: Readonly<Record<string, string>> = { scale: 'Scale1', 'vision-sensor': 'Vision1', 'light-array': 'LightArray1' };

/** The view a part kind publishes in one of its states, on the floor at the origin, turned to the model's own axes. */
export function catalogueView(kind: CatalogueKind, state: CatalogueState): PartView {
  const a = ((state.yawDeg ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const [px, , pz] = kind.pivot ?? [0, 0, 0];
  return {
    id: kind.id,
    part: kind.id,
    name: NAMES[kind.id] ?? kind.id,
    // About the vertical axis, a point (x, z) of the part lands at (x c + z s, -x s + z c); the pivot stays at the origin.
    pose: {
      p: [-(px * c + pz * s), kind.height + (state.rise ?? 0), -(-px * s + pz * c)],
      q: [0, Math.sin(a / 2), 0, Math.cos(a / 2)],
      size: kind.size,
    } as unknown as PartView['pose'],
    state: { ...kind.state, ...state.state },
    signals: { ...kind.signals, ...state.signals },
  };
}

export interface CatalogueItem {
  id: string;
  label: string;
  pose: Pick<BodyPose, 'kind' | 'size' | 'tag' | 'colour' | 'metal'>;
}
/** The items the renderer draws, one of each look: the skins of `itemSkin` and the lid, base, crate and pallet shapes. */
export const ITEMS: readonly CatalogueItem[] = [
  { id: 'box', label: 'plain box (cardboard)', pose: { kind: 'item', size: [0.3, 0.2, 0.2] } },
  { id: 'part', label: 'coloured part (red, plastic)', pose: { kind: 'item', size: [0.3, 0.2, 0.2], colour: 'red' } },
  { id: 'metal', label: 'metal item', pose: { kind: 'item', size: [0.3, 0.2, 0.2], metal: true } },
  { id: 'lid', label: 'lid', pose: { kind: 'item', size: [0.3, 0.05, 0.3], tag: 'lid' } },
  { id: 'base', label: 'base', pose: { kind: 'item', size: [0.3, 0.12, 0.3], tag: 'base' } },
  { id: 'crate', label: 'crate', pose: { kind: 'item', size: [0.4, 0.3, 0.3], tag: 'crate' } },
  { id: 'pallet', label: 'pallet', pose: { kind: 'pallet', size: [1.2, 0.144, 0.8] } },
];
