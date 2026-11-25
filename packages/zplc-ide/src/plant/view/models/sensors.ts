/**
 * Sensors (plan-vis C3): the diffuse photoelectric sensor, and the retro-reflective, inductive, capacitive, light array, scale,
 * vision sensor and limit switch the catalogue step adds here.
 */
import type { PartView, Quat, Vec3 } from '../../contracts';
import { cuesFor } from '../cues';
import { BELT } from './conveyors';
import { box, MIN_STAND, piece, rod, rotate, type ModelContext, type ModelFamily, type Piece } from './shared';

// ---------------------------------------------------------------------------------------------------------------------
// Photoelectric sensor: a neutral housing with its lens and an output lamp, on a bent bracket bolted to the frame of the belt its
// beam crosses (or on a post to the floor when no belt frame is in reach), and its fine beam
// ---------------------------------------------------------------------------------------------------------------------

/** The beam: a 6 mm line, solid while the sensor detects; while it is clear, a dash every `dash` metres, a quarter of it long. */
export const SENSOR = { dash: 0.06, beamRadius: 0.003, dashRadius: 0.0018 } as const;

/**
 * How far a belt frame may lie ahead of a sensor's lens, and below it, for the sensor's bracket to reach it. A sensor higher above the
 * rail stands on a post (the stacked sensors of a height check: two brackets on one spot of the rail would be drawn twice).
 */
const MOUNT_REACH = { ahead: 0.35, below: 0.15 } as const;

const conjugate = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Where the bracket of a sensor meets the frame of the belt its beam crosses, in the sensor's frame: the top of the outer face of the
 * near rail. Null when no belt runs across the beam with its frame ahead of the lens and below it, within reach.
 */
export function sensorMount(view: PartView, parts: readonly PartView[]): Vec3 | null {
  if (view.part !== 'sensor') return null;
  const beam = rotate(view.pose.q, [1, 0, 0]);
  let best: Vec3 | null = null;
  for (const belt of parts) {
    if (belt.part !== 'belt') continue;
    const [length, thickness, width] = belt.pose.size;
    const back = conjugate(belt.pose.q);
    const lens = rotate(back, minus(view.pose.p, belt.pose.p)); // the lens and the beam in the belt's frame
    const along = rotate(back, beam);
    const side = Math.sign(lens[2]);
    const face = width / 2 + BELT.rail.width;
    const railTop = thickness / 2 + BELT.rail.lip;
    const gap = Math.abs(lens[2]) - face;
    const drop = lens[1] - railTop;
    if (Math.abs(lens[0]) > length / 2 - BELT.drum || gap <= 0 || gap > MOUNT_REACH.ahead || drop < 0 || drop > MOUNT_REACH.below) continue;
    if (along[2] * side > -0.9) continue; // the beam must cross the belt
    const at = rotate(belt.pose.q, [lens[0], railTop, side * face]);
    const local = rotate(
      conjugate(view.pose.q),
      minus([belt.pose.p[0] + at[0], belt.pose.p[1] + at[1], belt.pose.p[2] + at[2]], view.pose.p),
    );
    if (!best || local[0] < best[0]) best = local;
  }
  return best;
}

function sensorModel(view: PartView, context: ModelContext): Piece[] {
  const cues = cuesFor(view);
  const detecting = cues.beam?.detecting === true;
  const length = typeof view.state.beamLength === 'number' && view.state.beamLength > 0 ? view.state.beamLength : 1;
  const floor = -view.pose.p[1];
  const back = -0.036; // the housing sits behind the beam's origin, which is the face of the lens
  const under = -0.024; // the bottom of the housing
  const pieces: Piece[] = [
    piece('housing', box([0.07, 0.048, 0.04], 0.005), [back, 0, 0], 'housing'),
    piece('lens', rod(0.013, 0.004, 'x'), [-0.0005, 0, 0], 'lens'),
    piece('lamp', rod(0.008, 0.004, 'y'), [back - 0.02, 0.025, 0], detecting ? 'lamp' : 'lampOff'),
  ];
  const mount = context.mount;
  if (mount) {
    // A bent plate: an arm under the housing out to the rail, then down the rail's outer face, bolted to it below its top edge.
    const t = 0.004;
    const rear = back - 0.035;
    const low = mount[1] - 0.06;
    pieces.push(piece('bracket-arm', box([mount[0] - rear, t, 0.044], 0.001), [(rear + mount[0]) / 2, under - t / 2, 0], 'steel'));
    pieces.push(piece('bracket-plate', box([t, under - low, 0.044], 0.001), [mount[0] - t / 2, (under + low) / 2, 0], 'steel'));
    for (const z of [-0.012, 0.012])
      pieces.push(piece(`bolt-${z > 0 ? 'b' : 'a'}`, rod(0.006, 0.005, 'x'), [mount[0] - t - 0.0025, mount[1] - 0.03, z], 'steel'));
  } else {
    pieces.push(piece('bracket', box([0.04, 0.005, 0.05], 0.0015), [back, under - 0.0025, 0], 'steel'));
    const post = under - 0.005 - floor;
    if (post > MIN_STAND) {
      pieces.push(piece('post', rod(0.008, post, 'y'), [back, floor + post / 2, 0], 'steel'));
      // A taller mast stands on a wider foot (two sensors stacked on one spot keep two distinct feet).
      const foot = 0.06 + 0.02 * Math.min(post, 2);
      pieces.push(piece('base', box([foot, 0.01, foot], 0.002), [back, floor + 0.005, 0], 'steel'));
    }
  }
  // The beam: a solid line while the sensor detects, a dashed one while it is clear (VIS-003, VIS-016); fine, like light.
  pieces.push(piece('beam', rod(SENSOR.beamRadius, length, 'x'), [length / 2, 0, 0], 'beam', detecting));
  const dashes = Math.max(1, Math.floor(length / SENSOR.dash));
  for (let k = 0; k < dashes; k++)
    pieces.push(piece(`dash-${k}`, rod(SENSOR.dashRadius, SENSOR.dash / 4, 'x'), [(k + 0.5) * SENSOR.dash, 0, 0], 'beam', !detecting));
  return pieces;
}

export const SENSORS: ModelFamily = { sensor: sensorModel };
