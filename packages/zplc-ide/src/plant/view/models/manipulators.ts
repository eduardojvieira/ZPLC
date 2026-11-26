/**
 * Manipulators (plan-vis C5, upgraded for C9 S3-02 & S3-07): the two-axis pick and place and the three-axis gantry with columns.
 * The part view is posed at the head, so the frame stays put in the world while the bridge, carriage, slide, head and gripper move.
 *
 * The actual gripper (clamp jaws with rubber pads, or vacuum manifold with 4 rubber suction cups) and its gripping status lamp/bezel
 * are drawn directly under/on the head from `view.state.gripper`, `view.state.closeFraction`, and `view.state.holding`.
 */
import type { PartView } from '../../contracts';
import type { Role } from '../look';
import { box, levellingLeg, piece, rod, slotted, type ModelBuilder, type ModelFamily, type Piece } from './shared';

/** The sizes of a manipulator's frame and gripper hardware, in metres. */
export const MANIPULATOR = {
  column: 0.08, // square profile of a column
  beam: 0.08, // the beam of a pick and place and the bridge of a gantry
  rail: 0.06, // a rail of a gantry
  carriage: 0.14,
  slide: 0.04,
  overhang: 0.2, // a column stands this far beyond the end of the stroke, so the head clears it
  above: 0.3, // the rail stands this far above the top of the Y stroke, as the core's frame does
  guideRail: { width: 0.022, height: 0.016 },
  motor: { flange: 0.012, length: 0.08, size: 0.064, cap: 0.022 },
  clamp: { bodyH: 0.036, jawW: 0.026, jawH: 0.078, jawD: 0.14, padT: 0.01, openReach: 0.125, closedReach: 0.036 },
  vacuum: { bodyH: 0.034, cupR: 0.024, cupOpenH: 0.042, cupGripH: 0.02 },
} as const;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** A servo motor + mounting flange + encoder end-cap mounted on an axis end along `axis` in direction `sign`. */
function axisDrive(id: string, x: number, y: number, z: number, axis: 'x' | 'z', sign: 1 | -1): Piece[] {
  const { flange, length, size, cap } = MANIPULATOR.motor;
  const f = sign * (flange / 2);
  const m = sign * (flange + length / 2);
  const c = sign * (flange + length + cap / 2);
  const flangeSize: [number, number, number] = axis === 'x' ? [flange, 0.092, 0.092] : [0.092, 0.092, flange];
  const motorSize: [number, number, number] = axis === 'x' ? [length, size, size] : [size, size, length];
  const capSize: [number, number, number] = axis === 'x' ? [cap, size * 0.85, size * 0.85] : [size * 0.85, size * 0.85, cap];
  const at = (d: number): [number, number, number] => (axis === 'x' ? [x + d, y, z] : [x, y, z + d]);
  return [
    piece(`flange-${id}`, box(flangeSize, 0.002), at(f), 'steel'),
    piece(`motor-${id}`, box(motorSize, 0.006), at(m), 'painted'),
    piece(`motor-cap-${id}`, box(capSize, 0.004), at(c), 'housing'),
  ];
}

/** The gripper and gripping status lamp/bezel mounted at the head. Never extends below `floor`. */
function gripperPieces(view: PartView, floor: number): Piece[] {
  const [, h, d] = view.pose.size;
  const { clamp, vacuum } = MANIPULATOR;
  const kind = view.state.gripper === 'clamp' ? 'clamp' : 'vacuum';
  const close = clamp01(num(view.state.closeFraction));
  const gripping = view.state.holding === true || close > 0.5;
  const lampRole: Role = gripping ? 'lamp' : 'lampOff';
  const clearance = Math.max(0, -floor - h / 2);
  const hasRoom = clearance >= 0.03;

  // Prominent wrist bezel + wrap-around status lamp on top of the head (always clear of the floor).
  const out: Piece[] = [
    piece('gripper-bezel', box([0.22, 0.028, 0.14], 0.004), [0, h / 2 + 0.014, 0], 'collar'),
    piece('gripper-lamp', box([0.232, 0.016, 0.152], 0.003), [0, h / 2 + 0.016, 0], lampRole),
    piece('gripper-front-lamp', box([0.14, 0.018, 0.014], 0.002), [0, 0, d / 2 - 0.004], lampRole),
  ];

  if (kind === 'clamp') {
    const bodyH = hasRoom ? Math.min(clamp.bodyH, clearance * 0.4) : 0.02;
    const jawH = hasRoom ? Math.min(clamp.jawH, Math.max(0.016, clearance - bodyH)) : 0.02;
    const bodyY = hasRoom ? -h / 2 - bodyH / 2 : 0;
    const jawY = hasRoom ? -h / 2 - bodyH - jawH / 2 : 0;
    const reach = clamp.closedReach + (clamp.openReach - clamp.closedReach) * (1 - close);
    out.push(piece('gripper-body', box([0.26, bodyH, clamp.jawD], 0.004), [0, bodyY, 0], 'housing', hasRoom));
    for (const [id, side] of [
      ['a', -1],
      ['b', 1],
    ] as const) {
      const jx = side * reach;
      const px = side * (reach - clamp.jawW / 2 - clamp.padT / 2);
      out.push(
        piece(`jaw-${id}`, box([clamp.jawW, jawH, clamp.jawD], 0.003), [jx, jawY, 0], 'painted', hasRoom),
        piece(`jaw-pad-${id}`, box([clamp.padT, jawH * 0.78, clamp.jawD * 0.85], 0.002), [px, jawY, 0], 'rubber', hasRoom),
      );
    }
    return out;
  }

  const bodyH = hasRoom ? Math.min(vacuum.bodyH, clearance * 0.45) : 0.02;
  const cupH = hasRoom ? Math.min(gripping ? vacuum.cupGripH : vacuum.cupOpenH, Math.max(0.014, clearance - bodyH)) : 0.02;
  const bodyY = hasRoom ? -h / 2 - bodyH / 2 : 0;
  const cupY = hasRoom ? -h / 2 - bodyH - cupH / 2 : 0;
  const cupR = gripping ? vacuum.cupR * 1.25 : vacuum.cupR;
  out.push(piece('gripper-manifold', box([0.22, bodyH, 0.14], 0.004), [0, bodyY, 0], 'housing', hasRoom));
  const corners = [
    [-0.075, -0.045],
    [0.075, -0.045],
    [-0.075, 0.045],
    [0.075, 0.045],
  ] as const;
  corners.forEach(([cx, cz], i) => {
    out.push(
      piece(`cup-stem-${i}`, rod(0.008, cupH, 'y'), [cx, cupY + 0.002, cz], 'steel', hasRoom),
      piece(`cup-${i}`, rod(cupR, cupH, 'y'), [cx, cupY, cz], 'rubber', hasRoom),
    );
  });
  return out;
}

/** The frame and the moving parts of a manipulator; `gantry` adds the Z axis, the second column pair and the rails. */
function manipulator(view: PartView, gantry: boolean): Piece[] {
  const { column, beam, rail, carriage: car, slide: sl, overhang, above, guideRail } = MANIPULATOR;
  const [x, y, z] = [num(view.state.x), num(view.state.y), num(view.state.z)];
  const [sx, sy, sz] = [num(view.state.strokeX), num(view.state.strokeY), num(view.state.strokeZ)];
  const [, h] = view.pose.size;
  // Where the part's own origin (all axes at zero, the foot of the stroke) lies in the model's frame, centred on the head.
  const [ox, oy, oz] = [-x, -y - h / 2, -z];
  const floor = -view.pose.p[1];
  const track = oy + sy + above; // the rail, or the beam, of the top
  const xa = ox - overhang;
  const xb = ox + sx + overhang;
  // A pick and place stands in the middle of its footprint (z = 0); a gantry on the corners of its Z stroke.
  const zs = gantry ? [oz - overhang, oz + sz + overhang] : [0];
  const colTop = gantry ? track - rail : track - beam / 2;
  const spanX = xb - xa + column;
  const midX = (xa + xb) / 2;
  const out: Piece[] = [];

  // Columns with levelling feet and corner mounting gussets under the X beam/rails.
  const ids = 'abcd';
  [xa, xb].forEach((cx, i) =>
    zs.forEach((cz, j) => {
      const id = ids[i * zs.length + j]!;
      out.push(...levellingLeg(id, cx, cz, colTop, floor, column));
      const dirX = i === 0 ? 1 : -1;
      out.push(piece(`gusset-${id}`, box([0.09, 0.06, 0.07], 0.002), [cx + dirX * 0.025, colTop - 0.03, cz], 'steel'));
    }),
  );

  let carriageY = track;
  if (gantry) {
    const midZ = (zs[0]! + zs[1]!) / 2;
    const spanZ = zs[1]! - zs[0]! + column;
    zs.forEach((cz, i) => {
      const label = 'ab'[i]!;
      out.push(
        piece(`rail-${label}`, slotted(rail, rail, spanX, 'x'), [midX, track - rail / 2, cz], 'frame'),
        piece(`guide-x${label}`, box([spanX, guideRail.height, guideRail.width], 0.002), [midX, track + guideRail.height / 2, cz], 'steel'),
      );
    });
    carriageY = track + beam / 2;
    out.push(
      piece('bridge', slotted(beam, beam, spanZ, 'z'), [0, carriageY, midZ], 'frame'),
      piece(
        'guide-z',
        box([guideRail.width, guideRail.height, spanZ], 0.002),
        [0, carriageY + beam / 2 + guideRail.height / 2, midZ],
        'steel',
      ),
      piece('truck-a', box([0.16, 0.09, 0.1], 0.004), [0, carriageY, zs[0]!], 'housing'),
      piece('truck-b', box([0.16, 0.09, 0.1], 0.004), [0, carriageY, zs[1]!], 'housing'),
      piece('idler-x', box([0.018, 0.08, 0.08], 0.002), [xa - column / 2 - 0.009, track - rail / 2, zs[1]!], 'steel'),
      ...axisDrive('x', xb + column / 2, track - rail / 2, zs[1]!, 'x', 1),
      ...axisDrive('z', 0, carriageY, zs[1]! + column / 2, 'z', 1),
    );
  } else {
    out.push(
      piece('beam', slotted(beam, beam, spanX, 'x'), [midX, track, 0], 'frame'),
      piece('guide-x', box([spanX, guideRail.height, guideRail.width], 0.002), [midX, track + beam / 2 + guideRail.height / 2, 0], 'steel'),
      piece('guide-x-front', box([spanX, 0.018, 0.012], 0.002), [midX, track, beam / 2 + 0.006], 'steel'),
      piece('idler-x', box([0.018, 0.09, 0.086], 0.002), [xa - column / 2 - 0.009, track, 0], 'steel'),
      ...axisDrive('x', xb + column / 2, track, 0, 'x', 1),
    );
  }

  // Carriage with bearing runner blocks, vertical Y servo motor, guide shaft, slide, head and gripper.
  out.push(piece('carriage', box([car, car, car]), [0, carriageY, 0], 'housing'));
  for (const [id, side] of [
    ['a', -1],
    ['b', 1],
  ] as const) {
    const off = side * (car / 2 + 0.012);
    out.push(
      piece(
        `bearing-${id}`,
        box(gantry ? [0.15, 0.05, 0.024] : [0.024, 0.05, 0.15], 0.003),
        gantry ? [0, carriageY, off] : [off, carriageY, 0],
        'steel',
      ),
    );
  }
  out.push(
    piece('motor-y', box([0.064, 0.08, 0.064], 0.006), [0, carriageY + car / 2 + 0.04, 0], 'painted'),
    piece('motor-y-cap', box([0.054, 0.022, 0.054], 0.004), [0, carriageY + car / 2 + 0.08 + 0.011, 0], 'housing'),
  );

  const slideTop = carriageY - car / 2;
  const slideBottom = h / 2;
  const slideLen = slideTop - slideBottom;
  out.push(
    piece('slide', slotted(sl, sl, slideLen, 'y'), [0, (slideTop + slideBottom) / 2, 0], 'frame'),
    piece('guide-y', rod(0.01, slideLen, 'y'), [0.036, (slideTop + slideBottom) / 2, 0], 'steel'),
    piece('head', box(view.pose.size), [0, 0, 0], 'steel'),
    ...gripperPieces(view, floor),
  );
  return out;
}

const twoAxis: ModelBuilder = (view) => manipulator(view, false);
const threeAxis: ModelBuilder = (view) => manipulator(view, true);

export const MANIPULATORS: ModelFamily = { 'pick-place': twoAxis, gantry: threeAxis };
