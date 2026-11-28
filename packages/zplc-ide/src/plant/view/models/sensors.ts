/**
 * Sensors (plan-vis C3): the diffuse photoelectric sensor, the light array, the scale, the vision sensor and the limit switch. Each
 * shows its state with a shape, not only a colour (VIS-003): a beam dashed or solid, digits on a readout, a lever that swings.
 *
 * The retro-reflective, inductive, capacitive and colour sensors publish the same view as the diffuse one (`sensor`); the kind their
 * catalogue entry declares rides in the view's state, and each kind is drawn its own way (owner decision 4).
 */
import type { PartView, Quat, Vec3 } from '../../contracts';
import { cuesFor } from '../cues';
import type { Role } from '../look';
import { BELT } from './conveyors';
import {
  box,
  extrusion,
  MIN_STAND,
  piece,
  rod,
  rotate,
  slotted,
  type ModelContext,
  type ModelFamily,
  type Piece,
  type Section,
} from './shared';

const conjugate = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const plus = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lit = (on: boolean): Role => (on ? 'lamp' : 'lampOff');
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------------------------------------------------
// Mounting: a bent plate to the frame of a belt in reach, a clamp on the back rail of the belt a part sits on, or a post
// ---------------------------------------------------------------------------------------------------------------------

/**
 * How far a belt frame may lie ahead of a sensor's lens, and below it, for the sensor's bracket to reach it. A sensor higher above the
 * rail stands on a post (the stacked sensors of a height check: two brackets on one spot of the rail would be drawn twice).
 */
const MOUNT_REACH = { ahead: 0.35, below: 0.15 } as const;

/**
 * Where a bracket from `from` (a point of the part's frame) along the part's +x meets the frame of a belt that +x crosses: the top of
 * the outer face of the near rail, in the part's frame. Null when no belt frame lies ahead of `from` and below it, within reach.
 */
function railAhead(view: PartView, parts: readonly PartView[], from: Vec3): Vec3 | null {
  const beam = rotate(view.pose.q, [1, 0, 0]);
  const origin = plus(view.pose.p, rotate(view.pose.q, from));
  let best: Vec3 | null = null;
  for (const belt of parts) {
    if (belt.part !== 'belt') continue;
    const [length, thickness, width] = belt.pose.size;
    const back = conjugate(belt.pose.q);
    const lens = rotate(back, minus(origin, belt.pose.p)); // the origin and the direction in the belt's frame
    const along = rotate(back, beam);
    const side = Math.sign(lens[2]);
    const face = width / 2 + BELT.rail.width;
    const railTop = thickness / 2 + BELT.rail.lip;
    const gap = Math.abs(lens[2]) - face;
    const drop = lens[1] - railTop;
    if (Math.abs(lens[0]) > length / 2 - BELT.drum || gap <= 0 || gap > MOUNT_REACH.ahead || drop < 0 || drop > MOUNT_REACH.below) continue;
    if (along[2] * side > -0.9) continue; // the direction must cross the belt
    const at = rotate(belt.pose.q, [lens[0], railTop, side * face]);
    const local = rotate(conjugate(view.pose.q), minus(plus(belt.pose.p, at), view.pose.p));
    if (!best || local[0] < best[0]) best = local;
  }
  return best;
}

/**
 * The top of the outer face of the back rail (on the part's -z side) of the belt a part sits on, under the part's origin, in the
 * part's frame: where a post for a part over the band is clamped. Null when the part is not on the top of a belt, or lies across it.
 */
function backRail(view: PartView, parts: readonly PartView[]): Vec3 | null {
  for (const belt of parts) {
    if (belt.part !== 'belt') continue;
    const [length, thickness, width] = belt.pose.size;
    const back = conjugate(belt.pose.q);
    const at = rotate(back, minus(view.pose.p, belt.pose.p));
    if (Math.abs(at[0]) > length / 2 || Math.abs(at[2]) > width / 2 || Math.abs(at[1] - thickness / 2) > 0.05) continue;
    const rear = rotate(back, rotate(view.pose.q, [0, 0, -1]));
    if (Math.abs(rear[2]) < 0.9) continue;
    const rail = rotate(belt.pose.q, [at[0], thickness / 2 + BELT.rail.lip, Math.sign(rear[2]) * (width / 2 + BELT.rail.width)]);
    return rotate(conjugate(view.pose.q), minus(plus(belt.pose.p, rail), view.pose.p));
  }
  return null;
}

/**
 * Where a sensor is mounted on a belt frame, in its own frame, or null for a post to the floor: the diffuse sensor and the limit switch
 * on the near rail their beam or lever crosses, the scale and the vision sensor on the back rail of the belt they sit on.
 */
export function sensorMount(view: PartView, parts: readonly PartView[]): Vec3 | null {
  switch (view.part) {
    case 'sensor':
      return railAhead(view, parts, [0, 0, 0]);
    case 'limit-switch':
      return railAhead(view, parts, [-view.pose.size[0] / 2, 0, 0]);
    case 'scale':
    case 'vision-sensor':
      return backRail(view, parts);
    default:
      return null;
  }
}

/**
 * What holds a housing whose centre is at x = `x`, its rear end at `rear` and its bottom at `under`: a bent plate under it out to the
 * rail at `mount`, then down the rail's outer face, bolted to it below its top edge; or, with no mount, a plate on a post to the floor.
 */
function stand(mount: Vec3 | null | undefined, x: number, rear: number, under: number, floor: number): Piece[] {
  if (mount) {
    const t = 0.004;
    const low = mount[1] - 0.06;
    const bolt = Math.min(mount[1] - 0.03, (under + low) / 2); // on the plate, however low the housing sits
    return [
      piece('bracket-arm', box([mount[0] - rear, t, 0.044], 0.001), [(rear + mount[0]) / 2, under - t / 2, 0], 'steel'),
      piece('bracket-plate', box([t, under - low, 0.044], 0.001), [mount[0] - t / 2, (under + low) / 2, 0], 'steel'),
      ...[-0.012, 0.012].map((z) => piece(`bolt-${z > 0 ? 'b' : 'a'}`, rod(0.006, 0.005, 'x'), [mount[0] - t - 0.0025, bolt, z], 'steel')),
    ];
  }
  const pieces = [piece('bracket', box([0.04, 0.005, 0.05], 0.0015), [x, under - 0.0025, 0], 'steel')];
  const post = under - 0.005 - floor;
  if (post > MIN_STAND) {
    pieces.push(piece('post', rod(0.008, post, 'y'), [x, floor + post / 2, 0], 'steel'));
    // A taller mast stands on a wider foot (two sensors stacked on one spot keep two distinct feet).
    const foot = 0.06 + 0.02 * Math.min(post, 2);
    pieces.push(piece('base', box([foot, 0.01, foot], 0.002), [x, floor + 0.005, 0], 'steel'));
  }
  return pieces;
}

/**
 * A square profile post for a part over a belt, at x = `x`, up to `top`: clamped by a plate bolted to the back rail's outer face at
 * `mount`, or standing on a base plate on the floor at z = `z`. Returns its pieces and the z of its axis.
 */
function mast(mount: Vec3 | null | undefined, x: number, z: number, top: number, floor: number): { pieces: Piece[]; z: number } {
  const size = 0.03;
  if (mount) {
    const t = 0.004;
    const at = mount[2] - t - size / 2; // outside the rail's outer face, behind the clamp plate
    const bottom = mount[1] - 0.08;
    return {
      z: at,
      pieces: [
        piece('clamp', box([0.07, 0.08, t], 0.001), [x, mount[1] - 0.04, mount[2] - t / 2], 'steel'),
        ...[-0.022, 0.022].map((dx) =>
          piece(`bolt-${dx > 0 ? 'b' : 'a'}`, rod(0.006, 0.005, 'z'), [x + dx, mount[1] - 0.04, mount[2] - t - 0.0025], 'steel'),
        ),
        piece('post', slotted(size, size, top - bottom, 'y'), [x, (top + bottom) / 2, at], 'frame'),
      ],
    };
  }
  const plate = 0.01;
  return {
    z,
    pieces: [
      piece('post', slotted(size, size, top - floor - plate, 'y'), [x, (top + floor + plate) / 2, z], 'frame'),
      piece('base', box([0.14, plate, 0.14], 0.002), [x, floor + plate / 2, z], 'steel'),
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Seven-segment readout: lit segments are drawn and dark ones are not, so a reading is told by its shape
// ---------------------------------------------------------------------------------------------------------------------

const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
};

/**
 * `text` (digits, '-' and '.') right-aligned in `cells` seven-segment cells `h` tall, on a face that looks along +z, the row centred
 * on `at`: slots `<prefix><cell>-<a..g>` and `point-<cell>`, each segment shown only while lit.
 */
function readout(prefix: string, text: string, cells: number, at: Vec3, h: number, role: Role): Piece[] {
  const [w, t, depth] = [0.55 * h, 0.14 * h, 0.002];
  const pitch = w + 0.35 * h;
  const chars: string[] = [];
  const points = new Set<number>();
  for (const c of text)
    if (c === '.') points.add(chars.length - 1);
    else chars.push(c);
  const shift = cells - chars.length;
  const across = box([w - 2 * t, t, depth], 0);
  const upright = box([t, h / 2 - t, depth], 0);
  const pieces: Piece[] = [];
  for (let k = 0; k < cells; k++) {
    const on = SEGMENTS[chars[k - shift] ?? ''] ?? '';
    const x = at[0] + (k - (cells - 1) / 2) * pitch;
    const [y, z] = [at[1], at[2]];
    const [left, right] = [x - w / 2 + t / 2, x + w / 2 - t / 2];
    const segments: Array<[string, Piece['shape'], number, number]> = [
      ['a', across, x, y + h / 2 - t / 2],
      ['b', upright, right, y + h / 4],
      ['c', upright, right, y - h / 4],
      ['d', across, x, y - h / 2 + t / 2],
      ['e', upright, left, y - h / 4],
      ['f', upright, left, y + h / 4],
      ['g', across, x, y],
    ];
    for (const [s, shape, sx, sy] of segments) pieces.push(piece(`${prefix}${k}-${s}`, shape, [sx, sy, z], role, on.includes(s)));
    pieces.push(piece(`point-${k}`, box([t, t, depth], 0), [x + w / 2 + 0.17 * h, y - h / 2 + t / 2, z], role, points.has(k - shift)));
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Photoelectric sensor: a neutral housing with its lens and an output lamp, on a bent bracket bolted to the frame of the belt its
// beam crosses (or on a post to the floor when no belt frame is in reach), and its fine beam
// ---------------------------------------------------------------------------------------------------------------------

/** The beam: a 6 mm line, solid while the sensor detects; while it is clear, a dash every `dash` metres, a sixth of it long. */
export const SENSOR = { dash: 0.06, beamRadius: 0.003, dashRadius: 0.0018 } as const;

/**
 * The body of each beam sensor kind, behind the beam's origin (the face of its lens), with its output lamp and the bezel that glows
 * while it detects; `under` is the bottom of the body and `x` the middle the bracket holds.
 */
function sensorBody(kind: unknown, on: boolean, length: number, floor: number): { pieces: Piece[]; x: number; under: number } {
  switch (kind) {
    case 'inductive': {
      // A threaded steel barrel with two lock nuts and a green sensing face; the lamp is a ring at its rear end.
      const x = -0.03;
      return {
        x,
        under: -0.012,
        pieces: [
          piece('barrel', rod(0.009, 0.06, 'x'), [x, 0, 0], 'steel'),
          piece('face', rod(0.0085, 0.003, 'x'), [-0.0015, 0, 0], 'head'),
          piece('nut-a', box([0.006, 0.024, 0.024], 0.001), [-0.048, 0, 0], 'collar'),
          piece('nut-b', box([0.006, 0.024, 0.024], 0.001), [-0.012, 0, 0], 'collar'),
          piece('bezel', rod(0.0095, 0.002, 'x'), [-0.004, 0, 0], lit(on)),
          piece('lamp', rod(0.0095, 0.008, 'x'), [-0.064, 0, 0], lit(on)),
          piece('field', rod(0.03, 0.004, 'x'), [0.004, 0, 0], 'lamp', on), // the target field, drawn only while it detects
        ],
      };
    }
    case 'capacitive': {
      // A thick plastic barrel closed by a wider flat face cap, with a tall sensitivity knob on top; the lamp is a ring at its rear.
      const x = -0.04;
      return {
        x,
        under: -0.024,
        pieces: [
          piece('barrel', rod(0.02, 0.07, 'x'), [x, 0, 0], 'housing'),
          piece('face', rod(0.024, 0.006, 'x'), [-0.004, 0, 0], 'collar'),
          piece('knob', rod(0.007, 0.024, 'y'), [-0.055, 0.032, 0], 'steel'),
          piece('bezel', rod(0.021, 0.002, 'x'), [-0.008, 0, 0], lit(on)),
          piece('lamp', rod(0.0205, 0.01, 'x'), [-0.08, 0, 0], lit(on)),
          piece('field', rod(0.045, 0.004, 'x'), [0.004, 0, 0], 'lamp', on), // the target field, drawn only while it detects
        ],
      };
    }
    case 'colour': {
      // A wide head with a sloped top and two lenses, one over the other (the light it sends and the eye that reads the colour), on a
      // slimmer housing behind it.
      const back = -0.06;
      const head: Section = [
        [-0.015, -0.036],
        [0.015, -0.036],
        [0.015, 0.036],
        [-0.015, 0.012],
      ];
      return {
        x: back,
        under: -0.036,
        pieces: [
          piece('head', extrusion(head, 0.07, 'z'), [-0.0165, 0, 0], 'housing'),
          piece('housing', box([0.05, 0.04, 0.036], 0.004), [back, -0.012, 0], 'housing'),
          piece('bezel', box([0.003, 0.068, 0.064], 0.0005), [-0.0015, 0, 0], lit(on)),
          piece('lens-a', rod(0.011, 0.004, 'x'), [-0.0005, 0.017, 0], 'lens'),
          piece('lens-b', rod(0.011, 0.004, 'x'), [-0.0005, -0.017, 0], 'lens'),
          piece('lamp', box([0.04, 0.004, 0.03], 0.001), [back, 0.01, 0], lit(on)),
        ],
      };
    }
    default: {
      // The diffuse housing; the retro-reflective one adds the reflector its beam is aimed at, on its own post.
      const back = -0.036;
      const pieces: Piece[] = [
        piece('housing', box([0.07, 0.048, 0.04], 0.005), [back, 0, 0], 'housing'),
        piece('lens', rod(0.013, 0.004, 'x'), [-0.0005, 0, 0], 'lens'),
        piece('bezel', box([0.003, 0.044, 0.036], 0.0005), [-0.0015, 0, 0], lit(on)), // a face plate that glows while it detects
        piece('lamp', box([0.05, 0.004, 0.032], 0.001), [back, 0.026, 0], lit(on)), // a lit window over the top of the housing
      ];
      if (kind === 'retro-reflective') {
        pieces.push(
          piece('reflector', box([0.006, 0.06, 0.06], 0.001), [length + 0.003, 0, 0], 'collar'),
          piece('reflector-face', box([0.001, 0.05, 0.05], 0), [length - 0.0005, 0, 0], 'mark'),
        );
        const post = -0.03 - floor;
        if (post > MIN_STAND) pieces.push(piece('reflector-post', rod(0.006, post, 'y'), [length + 0.003, floor + post / 2, 0], 'steel'));
      }
      return { x: back, under: -0.024, pieces };
    }
  }
}

function sensorModel(view: PartView, context: ModelContext): Piece[] {
  const cues = cuesFor(view);
  const detecting = cues.beam?.detecting === true;
  const length = typeof view.state.beamLength === 'number' && view.state.beamLength > 0 ? view.state.beamLength : 1;
  const floor = -view.pose.p[1];
  const body = sensorBody(view.state.kind, detecting, length, floor);
  const pieces: Piece[] = [...body.pieces, ...stand(context.mount, body.x, body.x - 0.035, body.under, floor)];
  // The beam: a solid line while the sensor detects, a dashed one while it is clear (VIS-003, VIS-016); fine, like light.
  pieces.push(piece('beam', rod(SENSOR.beamRadius, length, 'x'), [length / 2, 0, 0], 'beam', detecting));
  const dashes = Math.max(1, Math.floor(length / SENSOR.dash));
  for (let k = 0; k < dashes; k++)
    pieces.push(piece(`dash-${k}`, rod(SENSOR.dashRadius, SENSOR.dash / 6, 'x'), [(k + 0.5) * SENSOR.dash, 0, 0], 'beam', !detecting));
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Light array: an emitter and a receiver column of anodised profile with end caps and a dark window, each on a stand, and a fine
// beam between them at each height the core casts one; the beams a box breaks are solid, the clear ones dashed
// ---------------------------------------------------------------------------------------------------------------------

/** A column's width (x) and depth (z), how far it runs past the end beams, its caps; a clear beam has a dash every `dash` metres. */
export const LIGHT_ARRAY = { width: 0.045, depth: 0.035, margin: 0.04, cap: 0.03, dash: 0.2 } as const;

function lightArrayModel(view: PartView): Piece[] {
  const beams = Math.max(1, Math.round(num(view.state.beams, 12)));
  const pitch = num(view.state.pitchM, 0.05);
  const span = view.pose.size[2]; // the beams run along +z from the part's origin
  const floor = -view.pose.p[1];
  const reading = num(view.signals[`${view.name}.height`], 0);
  const broken = Math.min(beams, Math.max(0, Math.round(reading / pitch))); // the core reads the top of the highest broken beam
  const { width, depth, margin, cap } = LIGHT_ARRAY;
  const [low, high] = [-margin, beams * pitch + margin];
  const pieces: Piece[] = [];
  for (const [end, face, out] of [
    ['a', 0, -1],
    ['b', span, 1],
  ] as const) {
    const z = face + (out * depth) / 2;
    pieces.push(
      piece(`column-${end}`, box([width, high - low, depth], 0.003), [0, (low + high) / 2, z], 'frame'),
      piece(`window-${end}`, box([0.02, beams * pitch, 0.002], 0), [0, (beams * pitch) / 2, face - out * 0.001], 'lens'),
      piece(`cap-${end}-top`, box([width + 0.006, cap, depth + 0.006], 0.004), [0, high + cap / 2, z], 'housing'),
      piece(`cap-${end}-bottom`, box([width + 0.006, cap, depth + 0.006], 0.004), [0, low - cap / 2, z], 'housing'),
    );
    const plate = 0.01;
    const post = low - cap - floor - plate;
    if (post > MIN_STAND)
      pieces.push(
        piece(`stand-${end}`, slotted(0.03, 0.03, post, 'y'), [0, floor + plate + post / 2, z], 'frame'),
        piece(`base-${end}`, box([0.12, plate, 0.12], 0.002), [0, floor + plate / 2, z], 'steel'),
      );
  }
  // The receiver's output lamp, on its top cap.
  pieces.push(piece('lamp', rod(0.012, 0.006, 'y'), [0, high + cap + 0.003, span + depth / 2], lit(view.state.detect === true)));
  const dashes = Math.max(1, Math.floor(span / LIGHT_ARRAY.dash));
  const dash = span / dashes;
  for (let i = 0; i < beams; i++) {
    const y = (i + 0.5) * pitch;
    pieces.push(piece(`beam-${i}`, rod(SENSOR.beamRadius, span, 'z'), [0, y, span / 2], 'beam', i < broken));
    for (let k = 0; k < dashes; k++)
      pieces.push(piece(`dash-${i}-${k}`, rod(SENSOR.dashRadius, dash / 4, 'z'), [0, y, (k + 0.5) * dash], 'beam', i >= broken));
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Scale: a stainless weighing frame on the band over its footprint (on a platform where no belt runs through it), and a weighing
// indicator on a post whose digits show the weight the program reads and whose lamp says the reading is stable
// ---------------------------------------------------------------------------------------------------------------------

/** The weighing frame's bars, the indicator (width, height, depth) and the height of its middle above the band, and its digits. */
export const SCALE = { bar: 0.02, barHeight: 0.004, inset: 0.04, indicator: [0.22, 0.12, 0.05], above: 0.4, digit: 0.036 } as const;

function scaleModel(view: PartView, context: ModelContext): Piece[] {
  const [length, , width] = view.pose.size;
  const floor = -view.pose.p[1];
  const { bar, barHeight: t, inset, indicator, above, digit } = SCALE;
  const weight = view.signals[`${view.name}.weight`];
  const stable = view.signals[`${view.name}.stable`] === true;
  const pieces: Piece[] = [
    piece('weigh-a', box([length - 2 * inset, t, bar], 0.001), [0, t / 2, -(width / 2 - bar / 2)], 'steel'),
    piece('weigh-b', box([length - 2 * inset, t, bar], 0.001), [0, t / 2, width / 2 - bar / 2], 'steel'),
    piece('weigh-c', box([bar, t, width - 2 * bar], 0.001), [-(length / 2 - inset - bar / 2), t / 2, 0], 'steel'),
    piece('weigh-d', box([bar, t, width - 2 * bar], 0.001), [length / 2 - inset - bar / 2, t / 2, 0], 'steel'),
  ];
  if (!context.mount) pieces.push(piece('platform', box([length, 0.02, width], 0.003), [0, -0.01, 0], 'steel'));
  // The indicator stands at the upstream end, behind the belt, above the items on it.
  const [iw, ih, id] = indicator;
  const x = -length / 2 + 0.04;
  const post = mast(context.mount, x, -width / 2 - 0.08, above - ih / 2, floor);
  const face = post.z + id / 2;
  const text = typeof weight === 'number' && Number.isFinite(weight) ? weight.toFixed(2) : '-';
  pieces.push(
    ...post.pieces,
    piece('indicator', box([iw, ih, id], 0.006), [x, above, post.z], 'housing'),
    piece('display', box([iw - 0.03, 0.06, 0.002], 0), [x, above + 0.018, face + 0.001], 'lens'),
    ...readout('digit-', text, 5, [x - 0.005, above + 0.018, face + 0.003], digit, 'lamp'),
    // Prominent front status band + top beacon so stable vs unsettled weight reads unmistakably at scene and sheet scale.
    piece('stable', box([iw - 0.03, 0.026, 0.006], 0.001), [x, above - 0.035, face + 0.003], lit(stable)),
    piece('stable-collar', box([0.132, 0.006, id - 0.004], 0.002), [x, above + ih / 2 + 0.003, post.z], 'collar'),
    piece('stable-beacon', box([0.12, 0.028, id - 0.01], 0.004), [x, above + ih / 2 + 0.02, post.z], lit(stable)),
  );
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Vision sensor: a smart camera looking down at the middle of its field, with a ring light round its lens and the code it read on
// a display, on an arm from a post; its field marked on the band, dashed while empty and solid while an item is in it
// ---------------------------------------------------------------------------------------------------------------------

/** The camera body (width, height, depth), the width of the field's marks and the spacing of their dashes. */
export const VISION = { body: [0.07, 0.06, 0.09], line: 0.01, dash: 0.1 } as const;

function visionModel(view: PartView, context: ModelContext): Piece[] {
  const field = view.pose.size[0];
  const floor = -view.pose.p[1];
  const seen = view.state.detect === true;
  const code = view.signals[`${view.name}.code`];
  const [bw, bh, bd] = VISION.body;
  const height = field; // a lens of about 53 degrees sees a field as wide as it is high above it
  const centre = height + 0.03 + bh / 2; // the body, above the ring light
  const pieces: Piece[] = [
    piece('lens', rod(0.016, 0.03, 'y'), [0, height + 0.015, 0], 'lens'),
    piece('ring', rod(0.034, 0.015, 'y'), [0, height + 0.0225, 0], lit(seen)),
    piece('camera', box([bw, bh, bd], 0.006), [0, centre, 0], 'housing'),
    piece('lamp', rod(0.007, 0.004, 'y'), [bw / 2 - 0.015, centre + bh / 2 + 0.002, -bd / 2 + 0.015], lit(seen)),
    piece('display', box([0.036, 0.046, 0.002], 0), [0, centre, bd / 2 + 0.001], 'lens'),
    ...readout('code-', typeof code === 'number' ? String(Math.round(code)) : '-', 1, [0, centre, bd / 2 + 0.003], 0.032, 'lamp'),
  ];
  const post = mast(context.mount, 0, -field / 2 - 0.08, centre + 0.015, floor);
  const arm = -bd / 2 - post.z;
  pieces.push(...post.pieces, piece('arm', slotted(0.03, 0.03, arm, 'z'), [0, centre, (post.z - bd / 2) / 2], 'frame'));
  // The field on the band: four solid sides while an item is in it, dashed sides while it is empty.
  const { line, dash } = VISION;
  const h = 0.003;
  const n = Math.max(2, Math.round(field / dash));
  const step = field / n;
  for (const [side, along, a, b] of [
    ['n', 'x', 0, -field / 2],
    ['s', 'x', 0, field / 2],
    ['e', 'z', field / 2, 0],
    ['w', 'z', -field / 2, 0],
  ] as const) {
    const size = (l: number): Vec3 => (along === 'x' ? [l, h, line] : [line, h, l]);
    pieces.push(piece(`field-${side}`, box(size(along === 'x' ? field + line : field - line), 0), [a, h / 2, b], 'beam', seen));
    for (let k = 0; k < n; k++) {
      const u = -field / 2 + (k + 0.5) * step;
      pieces.push(piece(`edge-${side}-${k}`, box(size(step * 0.4), 0), along === 'x' ? [u, h / 2, b] : [a, h / 2, u], 'beam', !seen));
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Limit switch: a switch body with a rotary head and a roller lever that reaches to the far end of its contact zone, on a bracket
// bolted to the belt frame (or on a post); the lever swings while the switch makes contact
// ---------------------------------------------------------------------------------------------------------------------

/** The lever's swing while the switch makes contact, in radians, and the radius of its roller. */
export const LIMIT_SWITCH = { swing: (50 * Math.PI) / 180, roller: 0.015 } as const;

function limitSwitchModel(view: PartView, context: ModelContext): Piece[] {
  const reach = view.pose.size[0]; // the contact zone runs reach metres along +x from the switch's face; the origin is its middle
  const contact = view.state.contact === true;
  const { swing, roller } = LIMIT_SWITCH;
  const x = -reach / 2 - 0.02; // the body's axis, behind the start of the zone
  const arm = reach + 0.02 - roller; // from the head's axis to the roller's: the roller ends at the far end of the zone
  const yaw = contact ? swing : 0;
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const lever: Piece = piece('arm', box([arm, 0.012, 0.016], 0.002), [x + (arm / 2) * c, 0.005, (-arm / 2) * s], 'steel', true, yaw);
  lever.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]; // the lever turns about its pivot at the head
  const flag: Piece = piece('flag', box([0.026, 0.01, 0.026], 0.002), [x + arm * c, 0.016, -arm * s], 'mark', true, yaw);
  flag.q = lever.q;
  return [
    piece('body', box([0.04, 0.06, 0.052], 0.003), [x, -0.04, 0], 'housing'),
    piece('bezel', box([0.038, 0.032, 0.056], 0.002), [x, -0.036, 0], lit(contact)),
    piece('head', rod(0.015, 0.028, 'y'), [x, 0, 0], 'collar'),
    piece('lamp', box([0.038, 0.02, 0.048], 0.003), [x, 0.023, 0], lit(contact)),
    lever,
    piece('roller', rod(roller, 0.022, 'y'), [x + arm * c, 0, -arm * s], 'rubber'),
    flag,
    ...stand(context.mount, x, x - 0.02, -0.07, -view.pose.p[1]),
  ];
}

export const SENSORS: ModelFamily = {
  sensor: sensorModel,
  'light-array': lightArrayModel,
  scale: scaleModel,
  'vision-sensor': visionModel,
  'limit-switch': limitSwitchModel,
};
