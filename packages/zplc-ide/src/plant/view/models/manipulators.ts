/**
 * Manipulators (plan-vis C5): the two-axis pick and place and the three-axis gantry with columns. The part view is posed at the head,
 * so the frame is drawn at the offset of the axes from it: it stays put in the world and the carriage, slide and head move. The
 * gripper (vacuum or clamp) is not a part of its own: the renderer adds it under the head, which is a neutral steel plate here.
 */
import type { PartView } from '../../contracts';
import { box, levellingLeg, piece, slotted, type ModelBuilder, type ModelFamily, type Piece } from './shared';

/** The sizes of a manipulator's frame, in metres. */
export const MANIPULATOR = {
  column: 0.08, // square profile of a column
  beam: 0.08, // the beam of a pick and place and the bridge of a gantry
  rail: 0.06, // a rail of a gantry
  carriage: 0.14,
  slide: 0.04,
  overhang: 0.2, // a column stands this far beyond the end of the stroke, so the head clears it
  above: 0.3, // the rail stands this far above the top of the Y stroke, as the core's frame does
} as const;

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** The frame and the moving parts of a manipulator; `gantry` adds the Z axis, the second column pair and the rails. */
function manipulator(view: PartView, gantry: boolean): Piece[] {
  const { column, beam, rail, carriage: car, slide: sl, overhang, above } = MANIPULATOR;
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
  const out: Piece[] = [];
  const ids = 'abcd';
  [xa, xb].forEach((cx, i) => zs.forEach((cz, j) => out.push(...levellingLeg(ids[i * zs.length + j]!, cx, cz, colTop, floor, column))));
  let carriageY = track;
  if (gantry) {
    zs.forEach((cz, i) =>
      out.push(piece(`rail-${'ab'[i]}`, slotted(rail, rail, xb - xa + column, 'x'), [(xa + xb) / 2, track - rail / 2, cz], 'frame')),
    );
    carriageY = track + beam / 2;
    out.push(piece('bridge', slotted(beam, beam, zs[1]! - zs[0]! + column, 'z'), [0, carriageY, (zs[0]! + zs[1]!) / 2], 'frame'));
  } else out.push(piece('beam', slotted(beam, beam, xb - xa + column, 'x'), [(xa + xb) / 2, track, 0], 'frame'));
  // The carriage rides the beam (x), or the bridge (z), straight above the head; the slide hangs from it down to the head.
  out.push(piece('carriage', box([car, car, car]), [0, carriageY, 0], 'housing'));
  const slideTop = carriageY - car / 2;
  const slideBottom = h / 2;
  out.push(piece('slide', slotted(sl, sl, slideTop - slideBottom, 'y'), [0, (slideTop + slideBottom) / 2, 0], 'frame'));
  out.push(piece('head', box(view.pose.size), [0, 0, 0], 'steel'));
  return out;
}

const twoAxis: ModelBuilder = (view) => manipulator(view, false);
const threeAxis: ModelBuilder = (view) => manipulator(view, true);

export const MANIPULATORS: ModelFamily = { 'pick-place': twoAxis, gantry: threeAxis };
