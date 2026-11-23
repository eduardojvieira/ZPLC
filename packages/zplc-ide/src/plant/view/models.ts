/**
 * Composed part models (PRT-009, VIS-014, VIS-016): each part kind that has one is drawn as several bevelled pieces generated in
 * code, and the state of the part moves or shows pieces, so every state keeps a cue other than colour (VIS-003). Pure: a builder
 * reads one `PartView` and returns pieces in the part's own frame (x along the part, y up, origin at the pose); the renderer turns
 * them into meshes. A part kind with no builder keeps the single shape of `partShape`.
 *
 * Pieces that stand on the floor reach down to y = 0 of the world, so a builder needs the height of its pose: parts only turn
 * about the vertical axis, so the floor is at `-pose.p[1]` in the part's frame.
 */
import type { PartView, Vec3 } from '../contracts';
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

/** What a model needs besides the snapshot: how far the band of a belt has travelled, in metres (0 under reduced motion). */
export interface ModelMotion {
  travel: number;
}

const piece = (slot: string, shape: PieceShape, at: Vec3, role: Role, visible = true, yaw = 0): Piece => ({
  slot,
  shape,
  at,
  yaw,
  role,
  visible,
});
const box = (size: Vec3, bevel = 0.004): PieceShape => ({ kind: 'box', size, bevel });
const rod = (radius: number, length: number, axis: 'x' | 'y' | 'z'): PieceShape => ({ kind: 'cylinder', radius, length, axis });

/** Below this height there is no room for a leg or a post: the part rests on the floor. */
const MIN_STAND = 0.05;

// ---------------------------------------------------------------------------------------------------------------------
// Belt: band, side frames, end drums, legs with feet and cross braces, and direction marks that travel with the band
// ---------------------------------------------------------------------------------------------------------------------

export const BELT = {
  band: 0.012,
  rail: { height: 0.13, width: 0.03, lip: 0.012 },
  drum: 0.04,
  leg: 0.04,
  /** Distance between two direction marks along the band, and the radius of each arrow head. */
  markPitch: 0.3,
  markRadius: 0.065,
} as const;

function beltModel(view: PartView, motion: ModelMotion): Piece[] {
  const [length, thickness, width] = view.pose.size;
  const top = thickness / 2;
  const floor = -view.pose.p[1];
  const { band, rail, drum, leg } = BELT;
  const railZ = width / 2 + rail.width / 2;
  const railBottom = top + rail.lip - rail.height;
  const pieces: Piece[] = [
    piece('band', box([length, band, width], 0.004), [0, top - band / 2, 0], 'band'),
    piece('rail-a', box([length + 0.02, rail.height, rail.width], 0.006), [0, top + rail.lip - rail.height / 2, -railZ], 'frame'),
    piece('rail-b', box([length + 0.02, rail.height, rail.width], 0.006), [0, top + rail.lip - rail.height / 2, railZ], 'frame'),
    piece('drum-a', rod(drum, width - 0.004, 'z'), [-(length / 2 - drum), top - band - drum, 0], 'steel'),
    piece('drum-b', rod(drum, width - 0.004, 'z'), [length / 2 - drum, top - band - drum, 0], 'steel'),
  ];
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
  // Direction marks: arrow heads on the band, shown only while it runs (shape, not colour, says "running"). They travel with the
  // band; under reduced motion `travel` stays put and they are a still direction mark (VIS-016).
  const speed = typeof view.state.speedMps === 'number' ? view.state.speedMps : 0;
  const running = Math.abs(speed) > 1e-6;
  const marks = Math.max(1, Math.floor(length / BELT.markPitch));
  const pitch = length / marks;
  const r = BELT.markRadius;
  for (let i = 0; i < marks; i++) {
    const u = ((((i + 0.5) * pitch + motion.travel) % length) + length) % length;
    const shown = running && u > r && u < length - r;
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
// Photoelectric sensor: housing with a lens and an output lamp, a bracket on a post, and its beam
// ---------------------------------------------------------------------------------------------------------------------

export const SENSOR = { dash: 0.06, beamRadius: 0.007, dashRadius: 0.0035 } as const;

function sensorModel(view: PartView): Piece[] {
  const cues = cuesFor(view);
  const detecting = cues.beam?.detecting === true;
  const length = typeof view.state.beamLength === 'number' && view.state.beamLength > 0 ? view.state.beamLength : 1;
  const floor = -view.pose.p[1];
  const back = -0.036; // the housing sits behind the beam's origin, which is the face of the lens
  const pieces: Piece[] = [
    piece('housing', box([0.07, 0.048, 0.04], 0.005), [back, 0, 0], 'housing'),
    piece('lens', rod(0.015, 0.004, 'x'), [-0.0005, 0, 0], 'lens'),
    piece('lamp', box([0.012, 0.005, 0.012], 0.0015), [back - 0.02, 0.0265, 0], detecting ? 'lamp' : 'lampOff'),
    piece('bracket', box([0.04, 0.005, 0.05], 0.0015), [back, -0.0265, 0], 'steel'),
  ];
  const post = -0.029 - floor;
  if (post > MIN_STAND) {
    pieces.push(piece('post', rod(0.008, post, 'y'), [back, floor + post / 2, 0], 'steel'));
    // A taller mast stands on a wider foot (two sensors stacked on one spot keep two distinct feet).
    const foot = 0.06 + 0.02 * Math.min(post, 2);
    pieces.push(piece('base', box([foot, 0.01, foot], 0.002), [back, floor + 0.005, 0], 'steel'));
  }
  // The beam: a thick solid line while the sensor detects, a thin dashed one while it is clear (VIS-003, VIS-016).
  pieces.push(piece('beam', rod(SENSOR.beamRadius, length, 'x'), [length / 2, 0, 0], 'beam', detecting));
  const dashes = Math.max(1, Math.floor(length / SENSOR.dash));
  for (let k = 0; k < dashes; k++)
    pieces.push(piece(`dash-${k}`, rod(SENSOR.dashRadius, SENSOR.dash / 3, 'x'), [(k + 0.5) * SENSOR.dash, 0, 0], 'beam', !detecting));
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Push button: a control box on a pedestal; the head travels into its collar while pressed
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
  const post = -0.14 - floor - 0.012;
  if (post > MIN_STAND) {
    pieces.push(piece('post', rod(0.022, post, 'y'), [0, floor + 0.012 + post / 2, 0], 'steel'));
    pieces.push(piece('base', box([0.2, 0.012, 0.2], 0.003), [0, floor + 0.006, 0], 'steel'));
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Emitter: the open frame of the zone where items appear (a simulation device, drawn as a light cage, not as a machine)
// ---------------------------------------------------------------------------------------------------------------------

export const EMITTER = { size: 0.3, bar: 0.012 } as const;

function emitterModel(): Piece[] {
  const { size: s, bar: t } = EMITTER;
  const h = s / 2;
  const pieces: Piece[] = [];
  for (const [i, x, z] of [
    [0, -h, -h],
    [1, h, -h],
    [2, -h, h],
    [3, h, h],
  ] as const)
    pieces.push(piece(`post-${i}`, box([t, s, t], 0.002), [x, s / 2, z], 'cage'));
  pieces.push(piece('top-n', box([s + t, t, t], 0.002), [0, s, -h], 'cage'));
  pieces.push(piece('top-s', box([s + t, t, t], 0.002), [0, s, h], 'cage'));
  pieces.push(piece('top-e', box([t, t, s - t], 0.002), [h, s, 0], 'cage'));
  pieces.push(piece('top-w', box([t, t, s - t], 0.002), [-h, s, 0], 'cage'));
  return pieces;
}

/** The model builders by the catalogue id a part view publishes; the catalogue step adds one per part kind. */
export const MODELS: Readonly<Record<string, (view: PartView, motion: ModelMotion) => Piece[]>> = {
  belt: beltModel,
  sensor: sensorModel,
  'push-button': pushButtonModel,
  emitter: emitterModel,
};

const STILL: ModelMotion = { travel: 0 };

/** The pieces of a part view, or null for a part kind drawn as a single shape. */
export function partModel(view: PartView, motion: ModelMotion = STILL): Piece[] | null {
  return MODELS[view.part]?.(view, motion) ?? null;
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

/** The box that holds every piece of a model at rest (marks and beams included), in the part's frame; null for no model. */
export function modelBounds(view: PartView): { min: Vec3; max: Vec3 } | null {
  const pieces = partModel(view);
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
