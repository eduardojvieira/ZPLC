/**
 * Flow control, sources and sinks (plan-vis C2): the emitter, and the stop blade, pusher, diverter arm, aligner, chute and remover
 * the catalogue step adds here.
 */
import type { PartView } from '../../contracts';
import { catalogue } from '../../core/catalogue';
import { box, levellingLeg, MIN_STAND, piece, rod, slotted, type ModelContext, type ModelFamily, type Piece } from './shared';

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------------------------------------------------------------
// Emitter: the zone where items appear, marked by four flat corner marks on the surface they appear on, like the zone markings of
// a factory floor (a simulation device, not a machine)
// ---------------------------------------------------------------------------------------------------------------------

export const EMITTER = { size: 0.3, mark: 0.07, bar: 0.012, thickness: 0.002 } as const;

function emitterModel(): Piece[] {
  const { size, mark, bar, thickness } = EMITTER;
  const h = size / 2;
  const y = 0.001 + thickness / 2; // just above the surface, so the band does not cover it
  const pieces: Piece[] = [];
  for (const [i, sx, sz] of [
    [0, -1, -1],
    [1, 1, -1],
    [2, -1, 1],
    [3, 1, 1],
  ] as const) {
    pieces.push(piece(`corner-${i}-x`, box([mark, thickness, bar], 0), [sx * (h - mark / 2), y, sz * (h - bar / 2)], 'zone'));
    pieces.push(
      piece(`corner-${i}-z`, box([bar, thickness, mark - bar], 0), [sx * (h - bar / 2), y, sz * (h - bar - (mark - bar) / 2)], 'zone'),
    );
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// The three devices below move their pose with the state (the blade rises, the pusher plate runs, the arm swings), so a model is drawn
// in the moving frame: what stands still in the world (cylinder, stand, column) is offset back by the travel.
// ---------------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------
// Stop blade: a steel blade that rises through the slot between the belt rails, on a pneumatic cylinder under the frame that a
// slotted-profile bracket holds. Raised or lowered is the height of the blade (the rod shows it too), never a colour
// ---------------------------------------------------------------------------------------------------------------------

/** The plant core's blade: it sinks `sink` under the belt surface when retracted and travels in `travelMs`. */
export const BLADE = { sink: 0.02, travelMs: 400, cylinder: { radius: 0.035, length: 0.22 }, rod: 0.012, section: 0.03 } as const;

function stopBladeModel(view: PartView): Piece[] {
  const { sink, travelMs, cylinder, rod: rodRadius, section } = BLADE;
  const [thickness, height, width] = view.pose.size;
  const f = clamp01(num(view.state.travelMs, 0) / travelMs);
  const surface = (1 - f) * (height + sink) - height / 2; // the belt surface in the blade's frame
  const floor = -view.pose.p[1];
  const bodyTop = surface - height - sink; // where the blade's bottom is when retracted: the cylinder stands still there
  const length = Math.min(cylinder.length, Math.max(0.05, bodyTop - floor - 0.01));
  const rodBottom = bodyTop - 0.05; // the rod runs up into the cylinder
  const rodTop = -height / 2;
  const bracketY = bodyTop - 0.04;
  const pieces: Piece[] = [
    piece('blade', box([thickness, height, width], 0.004), [0, 0, 0], 'steel'),
    piece('rod', rod(rodRadius, rodTop - rodBottom, 'y'), [0, (rodTop + rodBottom) / 2, 0], 'steel'),
    piece('cylinder', rod(cylinder.radius, length, 'y'), [0, bodyTop - length / 2, 0], 'housing'),
    piece('bracket', slotted(section, section, width + 2 * section, 'z'), [0, bracketY, 0], 'frame'),
  ];
  // Two posts hold the bracket up to the underside of the belt frame (the foot of a rail is about 0.12 under the surface).
  const postTop = surface - 0.12;
  if (postTop - bracketY > MIN_STAND)
    for (const [side, z] of [
      ['a', -(width / 2 + section / 2)],
      ['b', width / 2 + section / 2],
    ] as const)
      pieces.push(
        piece(`bracket-post-${side}`, slotted(section, section, postTop - bracketY, 'y'), [0, (postTop + bracketY) / 2, z], 'frame'),
      );
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pusher: a pneumatic cylinder on a slotted-profile stand beside the belt, a steel rod and a painted plate at its end. The plate
// moves by the stroke; its pose carries it, so the cylinder and the stand are drawn back by the travel
// ---------------------------------------------------------------------------------------------------------------------

/** `stroke` is the last resort of strokeM: the view carries the fraction of the stroke, not the stroke (see `strokeOf`). */
export const PUSHER = { stroke: 0.6, cylinder: { radius: 0.04, length: 0.35 }, rod: 0.012, gap: 0.05, leg: 0.04, rail: 0.04 } as const;

/** The stroke of a pusher: its scene part's strokeM, else the default the catalogue declares, else `PUSHER.stroke`. */
function strokeOf(context: ModelContext): number {
  const set = context.scenePart?.config.strokeM;
  if (typeof set === 'number' && set > 0) return set;
  const field = catalogue.get('pusher')?.config.strokeM;
  // ponytail: a view without a scene part (the scene bounds) draws the default stroke; pass the scene to `snapshotBounds` if that matters.
  return field?.default !== undefined && typeof field.default === 'number' ? field.default : PUSHER.stroke;
}

function pusherModel(view: PartView, context: ModelContext): Piece[] {
  const stroke = strokeOf(context);
  const { cylinder, rod: rodRadius, gap, leg, rail } = PUSHER;
  const [width, height, thickness] = view.pose.size;
  const travel = clamp01(num(view.state.fraction, 0)) * stroke;
  const floor = -view.pose.p[1];
  const front = -travel - thickness / 2 - gap; // the cylinder's front face; the rod shows `gap` of it when retracted
  const middle = front - cylinder.length / 2;
  const rodBack = front - 0.04;
  const rodFront = -thickness / 2;
  const railTop = -cylinder.radius;
  const pieces: Piece[] = [
    piece('plate', box([width, height, thickness], 0.004), [0, 0, 0], 'painted'),
    piece('rod', rod(rodRadius, rodFront - rodBack, 'z'), [0, 0, (rodFront + rodBack) / 2], 'steel'),
    piece('cylinder', rod(cylinder.radius, cylinder.length, 'z'), [0, 0, middle], 'housing'),
  ];
  if (railTop - floor > MIN_STAND + rail) {
    pieces.push(piece('stand-rail', slotted(rail, rail, cylinder.length * 0.8, 'z'), [0, railTop - rail / 2, middle], 'frame'));
    for (const [side, z] of [
      ['a', middle - cylinder.length * 0.3],
      ['b', middle + cylinder.length * 0.3],
    ] as const)
      pieces.push(...levellingLeg(side, 0, z, railTop - rail, floor, leg));
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Diverter arm: a painted arm with a rubber edge on its guiding face, on a vertical steel shaft at its end under a motor housing.
// The pose turns the arm about that end, so the shaft, the housing and the column under it are round: they look the same at any angle
// ---------------------------------------------------------------------------------------------------------------------

export const ARM = { length: 0.8, edge: 0.012, hub: 0.05, motor: { radius: 0.06, length: 0.12 }, shaft: 0.02, foot: 0.08 } as const;

function diverterArmModel(view: PartView): Piece[] {
  const { edge, hub, motor, shaft, foot } = ARM;
  const [length, height, thickness] = view.pose.size;
  const pivot = -length / 2;
  const floor = -view.pose.p[1];
  const motorY = height / 2 + 0.06 + motor.length / 2;
  const pieces: Piece[] = [
    piece('arm', box([length, height, thickness - edge], 0.004), [0, 0, -edge / 2], 'painted'),
    piece('edge', box([length, height, edge], 0.002), [0, 0, (thickness - edge) / 2], 'rubber'),
    piece('shaft', rod(shaft, motorY - -height / 2, 'y'), [pivot, (motorY - height / 2) / 2, 0], 'steel'),
    piece('motor', rod(motor.radius, motor.length, 'y'), [pivot, motorY, 0], 'housing'),
  ];
  const column = -height / 2 - floor;
  if (column > MIN_STAND) {
    pieces.push(piece('column', rod(hub, column - 0.012, 'y'), [pivot, floor + 0.012 + (column - 0.012) / 2, 0], 'housing'));
    pieces.push(piece('foot', rod(foot, 0.012, 'y'), [pivot, floor + 0.006, 0], 'rubber'));
  }
  return pieces;
}

export const FLOW: ModelFamily = {
  emitter: emitterModel,
  'stop-blade': stopBladeModel,
  pusher: pusherModel,
  'diverter-arm': diverterArmModel,
};
