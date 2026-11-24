/**
 * Composed part models (PRT-009, VIS-014, VIS-016): each part kind that has one is drawn as several bevelled pieces generated in
 * code, and the state of the part moves or shows pieces, so every state keeps a cue other than colour (VIS-003). Pure: a builder
 * reads one `PartView` and returns pieces in the part's own frame (x along the part, y up, origin at the pose); the renderer turns
 * them into meshes. A part kind with no builder keeps the single shape of `partShape`.
 *
 * Pieces that stand on the floor reach down to y = 0 of the world, so a builder needs the height of its pose: parts only turn
 * about the vertical axis, so the floor is at `-pose.p[1]` in the part's frame.
 */
import type { PartView, Quat, Vec3 } from '../contracts';
import { cuesFor } from './cues';
import type { Role } from './look';

export type PieceShape =
  /** A box with rounded edges of radius `bevel` (0: sharp). */
  | { kind: 'box'; size: Vec3; bevel: number }
  /** A cylinder along `axis`; `sides` 3 gives a flat triangle, the arrow head of a direction mark. */
  | { kind: 'cylinder'; radius: number; length: number; axis: 'x' | 'y' | 'z'; sides?: number };

export interface Piece {
  /** Stable per part: the renderer keeps one mesh per slot and only moves it, shows or hides it, or changes its role. */
  slot: string;
  shape: PieceShape;
  /** Centre of the piece in the part's frame. */
  at: Vec3;
  /** Turn about the vertical axis, in radians. */
  yaw: number;
  role: Role;
  visible: boolean;
}

/**
 * What a model needs besides its own view: how far the band of a belt has travelled, in metres (0 under reduced motion), and for a
 * sensor where its bracket meets a belt frame (`sensorMount`), if one is in reach.
 */
export interface ModelContext {
  travel: number;
  mount?: Vec3 | null;
}

const piece = (slot: string, shape: PieceShape, at: Vec3, role: Role, visible = true, yaw = 0): Piece => ({
  slot,
  shape,
  at,
  yaw,
  role,
  visible,
});
/** `v` turned by the unit quaternion `q`. */
export const rotate = ([x, y, z, w]: Quat, [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

const box = (size: Vec3, bevel = 0.004): PieceShape => ({ kind: 'box', size, bevel });
const rod = (radius: number, length: number, axis: 'x' | 'y' | 'z'): PieceShape => ({ kind: 'cylinder', radius, length, axis });

/** Below this height there is no room for a leg or a post: the part rests on the floor. */
const MIN_STAND = 0.05;

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

// ---------------------------------------------------------------------------------------------------------------------
// Push button: a control box on a pedestal (a square column on a base plate bolted to the floor); the head travels into its
// collar while pressed
// ---------------------------------------------------------------------------------------------------------------------

export const PUSH_BUTTON = { collarTop: -0.006, released: 0.024, pressed: -0.003, head: 0.034, radius: 0.03 } as const;

function pushButtonModel(view: PartView): Piece[] {
  const pressed = view.state.pressed === true;
  const floor = -view.pose.p[1];
  const { collarTop, head } = PUSH_BUTTON;
  const headTop = pressed ? PUSH_BUTTON.pressed : PUSH_BUTTON.released;
  const pieces: Piece[] = [
    piece('head', rod(PUSH_BUTTON.radius, head, 'y'), [0, headTop - head / 2, 0], 'head'),
    piece('enclosure', box([0.14, 0.12, 0.11], 0.01), [0, -0.08, 0], 'housing'),
    piece('collar', rod(PUSH_BUTTON.radius + 0.007, 0.014, 'y'), [0, collarTop - 0.007, 0], 'collar'),
  ];
  const plate = 0.012;
  const column = -0.14 - floor - plate;
  if (column > MIN_STAND) {
    pieces.push(piece('post', box([0.06, column, 0.06], 0.004), [0, floor + plate + column / 2, 0], 'steel'));
    pieces.push(piece('base', box([0.2, plate, 0.2], 0.003), [0, floor + plate / 2, 0], 'steel'));
    for (const [k, x, z] of [
      [0, -0.07, -0.07],
      [1, 0.07, -0.07],
      [2, -0.07, 0.07],
      [3, 0.07, 0.07],
    ] as const)
      pieces.push(piece(`bolt-${k}`, rod(0.009, 0.008, 'y'), [x, floor + plate + 0.004, z], 'steel'));
  }
  return pieces;
}

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

/** The model builders by the catalogue id a part view publishes; the catalogue step adds one per part kind. */
export const MODELS: Readonly<Record<string, (view: PartView, context: ModelContext) => Piece[]>> = {
  belt: beltModel,
  sensor: sensorModel,
  'push-button': pushButtonModel,
  emitter: emitterModel,
};

const STILL: ModelContext = { travel: 0 };

/** The pieces of a part view, or null for a part kind drawn as a single shape. */
export function partModel(view: PartView, context: ModelContext = STILL): Piece[] | null {
  return MODELS[view.part]?.(view, context) ?? null;
}

/** The half extents of a piece along x, y and z of the part's frame. */
export function pieceExtent(p: Piece): Vec3 {
  const s = p.shape;
  let half: Vec3;
  if (s.kind === 'box') half = [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
  else {
    const along = s.length / 2;
    half = s.axis === 'x' ? [along, s.radius, s.radius] : s.axis === 'y' ? [s.radius, along, s.radius] : [s.radius, s.radius, along];
  }
  if (p.yaw === 0) return half;
  const flat = Math.hypot(half[0], half[2]);
  return [flat, half[1], flat];
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
