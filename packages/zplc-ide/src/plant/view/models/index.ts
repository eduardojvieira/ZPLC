/**
 * Composed part models (PRT-009, VIS-014, VIS-016): each part kind that has one is drawn as several bevelled pieces generated in
 * code, and the state of the part moves or shows pieces, so every state keeps a cue other than colour (VIS-003). A part kind with no
 * builder keeps the single shape of `partShape`.
 *
 * One file per family (plan-vis C1 to C7), so one writer can work on each family without touching another; `shared.ts` holds what
 * they all use. This module only joins the families.
 */
import type { PartView, Vec3 } from '../../contracts';
import { CONVEYORS } from './conveyors';
import { FLOW } from './flow';
import { MANIPULATORS } from './manipulators';
import { OPERATOR } from './operator';
import { PROCESS } from './process';
import { SENSORS, sensorMount } from './sensors';
import { pieceExtent, type ModelContext, type ModelFamily, type Piece } from './shared';
import { STATIONS } from './stations';

export { BELT } from './conveyors';
export { EMITTER } from './flow';
export { PUSH_BUTTON } from './operator';
export { SENSOR, sensorMount } from './sensors';
export { pieceExtent, rotate, type ModelContext, type Piece, type PieceShape, type Section } from './shared';

/** The families in the order of plan-vis C1 to C7. */
export const FAMILIES: readonly ModelFamily[] = [CONVEYORS, FLOW, SENSORS, OPERATOR, MANIPULATORS, STATIONS, PROCESS];

/** The model builders by the catalogue id a part view publishes: every family's together. */
export const MODELS: ModelFamily = Object.assign({}, ...FAMILIES);

const STILL: ModelContext = { travel: 0 };

/** The pieces of a part view, or null for a part kind drawn as a single shape. */
export function partModel(view: PartView, context: ModelContext = STILL): Piece[] | null {
  return MODELS[view.part]?.(view, context) ?? null;
}

/**
 * The box that holds every piece of a model at rest (marks and beams included), in the part's frame; null for no model. With the
 * other parts of the snapshot, a sensor is measured on the bracket that mounts it to a belt.
 */
export function modelBounds(view: PartView, parts: readonly PartView[] = []): { min: Vec3; max: Vec3 } | null {
  const pieces = partModel(view, { travel: 0, mount: sensorMount(view, parts) });
  if (!pieces || pieces.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces) {
    const e = pieceExtent(p);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p.at[i]! - e[i]!);
      max[i] = Math.max(max[i]!, p.at[i]! + e[i]!);
    }
  }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
}
