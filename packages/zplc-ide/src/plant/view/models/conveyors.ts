/**
 * Conveyors (plan-vis C1): the belt, and the roller conveyor, curved conveyor, chain transfer, turntable and lift the catalogue
 * step adds here.
 */
import type { PartView } from '../../contracts';
import { box, MIN_STAND, piece, rod, type ModelContext, type ModelFamily, type Piece } from './shared';

// ---------------------------------------------------------------------------------------------------------------------
// Belt: a band that wraps a steel drum at each end, side frames that stop at the drum axes, round end caps that hold the
// drums, legs with feet and cross braces, and direction marks that travel with the band
// ---------------------------------------------------------------------------------------------------------------------

export const BELT = {
  band: 0.012,
  rail: { height: 0.13, width: 0.03, lip: 0.012 },
  /** Radius of the band where it wraps an end drum; the steel drum inside it is one band thinner. */
  drum: 0.05,
  leg: 0.04,
  /** Distance between two direction marks along the band, and the radius of each arrow head. */
  markPitch: 0.3,
  markRadius: 0.065,
} as const;

function beltModel(view: PartView, context: ModelContext): Piece[] {
  const [length, thickness, width] = view.pose.size;
  const top = thickness / 2;
  const floor = -view.pose.p[1];
  const { band, rail, drum, leg } = BELT;
  const railZ = width / 2 + rail.width / 2;
  const railBottom = top + rail.lip - rail.height;
  const axle = length / 2 - drum; // x of each drum's axis; the band's flat runs lie between the two
  const axleY = top - drum;
  const pieces: Piece[] = [
    piece('band', box([2 * axle, band, width], 0.002), [0, top - band / 2, 0], 'band'),
    piece('return', box([2 * axle, band, width], 0.002), [0, axleY - drum + band / 2, 0], 'band'),
    piece('rail-a', box([2 * axle, rail.height, rail.width], 0.006), [0, top + rail.lip - rail.height / 2, -railZ], 'frame'),
    piece('rail-b', box([2 * axle, rail.height, rail.width], 0.006), [0, top + rail.lip - rail.height / 2, railZ], 'frame'),
  ];
  for (const [end, x] of [
    ['a', -axle],
    ['b', axle],
  ] as const) {
    pieces.push(piece(`wrap-${end}`, rod(drum, width, 'z'), [x, axleY, 0], 'band'));
    pieces.push(piece(`drum-${end}`, rod(drum - band, width + 2 * rail.width, 'z'), [x, axleY, 0], 'steel'));
    for (const side of [-1, 1]) {
      const z = side * (railZ + rail.width / 2);
      pieces.push(piece(`cap-${end}${side}`, rod(drum + 0.008, 0.008, 'z'), [x, axleY, z + side * 0.004], 'steel'));
      pieces.push(piece(`nut-${end}${side}`, rod(0.012, 0.01, 'z'), [x, axleY, z + side * 0.013], 'steel'));
    }
  }
  const legLength = railBottom - floor;
  if (legLength > MIN_STAND) {
    const pairs = Math.max(2, Math.ceil(length / 1.5) + 1);
    const span = Math.max(0, length - 0.3);
    for (let k = 0; k < pairs; k++) {
      const x = -span / 2 + (span * k) / (pairs - 1);
      for (const [side, z] of [
        ['a', -railZ],
        ['b', railZ],
      ] as const) {
        pieces.push(piece(`leg-${k}-${side}`, box([leg, legLength, leg]), [x, floor + legLength / 2, z], 'frame'));
        pieces.push(piece(`foot-${k}-${side}`, box([0.08, 0.012, 0.08], 0.003), [x, floor + 0.006, z], 'steel'));
      }
      pieces.push(piece(`brace-${k}`, box([0.03, 0.03, 2 * railZ]), [x, floor + legLength * 0.3, 0], 'frame'));
    }
  }
  // Direction marks: arrow heads on the flat top run, shown only while the band runs (shape, not colour, says "running"). They
  // travel with the band; under reduced motion `travel` stays put and they are a still direction mark (VIS-016).
  const speed = typeof view.state.speedMps === 'number' ? view.state.speedMps : 0;
  const running = Math.abs(speed) > 1e-6;
  const marks = Math.max(1, Math.floor(length / BELT.markPitch));
  const pitch = length / marks;
  const r = BELT.markRadius;
  for (let i = 0; i < marks; i++) {
    const u = ((((i + 0.5) * pitch + context.travel) % length) + length) % length;
    const shown = running && u > drum + r && u < length - drum - r;
    pieces.push(
      piece(
        `mark-${i}`,
        { kind: 'cylinder', radius: r, length: 0.003, axis: 'y', sides: 3 },
        [-length / 2 + u, top + 0.002, 0],
        'mark',
        shown,
        speed >= 0 ? Math.PI / 2 : -Math.PI / 2,
      ),
    );
  }
  return pieces;
}

export const CONVEYORS: ModelFamily = { belt: beltModel };
