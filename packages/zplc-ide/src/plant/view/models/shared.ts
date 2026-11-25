/**
 * What every family of composed part models shares (PRT-009, VIS-014): the piece a builder returns, the shapes a piece may take,
 * and the helpers that make them. Pure: a builder reads one `PartView` and returns pieces in the part's own frame (x along the part,
 * y up, origin at the pose); the renderer turns them into meshes.
 *
 * Pieces that stand on the floor reach down to y = 0 of the world, so a builder needs the height of its pose: parts only turn
 * about the vertical axis, so the floor is at `-pose.p[1]` in the part's frame.
 */
import type { PartView, Quat, Vec3 } from '../../contracts';
import type { Role } from '../look';

export type Axis = 'x' | 'y' | 'z';

/**
 * A cross-section in metres: the points (a, b) of its outline, counter-clockwise, about the centre of the piece. Across an extrusion
 * along x, a is z and b is y; along y, a is x and b is z; along z, a is x and b is y.
 */
export type Section = ReadonlyArray<readonly [number, number]>;

export type PieceShape =
  /** A box with rounded edges of radius `bevel` (0: sharp). */
  | { kind: 'box'; size: Vec3; bevel: number }
  /** A cylinder along `axis`; `sides` 3 gives a flat triangle, the arrow head of a direction mark. */
  | { kind: 'cylinder'; radius: number; length: number; axis: Axis; sides?: number }
  /**
   * A `section` extruded `length` along `axis`, centred on the piece: a profile, a channel, a plate with a cut-out. `recessDark`
   * draws the faces that lie inside the box of the section darker, as light does not reach into the slots of a profile.
   */
  | { kind: 'extrusion'; section: Section; length: number; axis: Axis; recessDark?: boolean };

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

export type ModelBuilder = (view: PartView, context: ModelContext) => Piece[];
/** The builders of one family file, by the catalogue id a part view publishes. */
export type ModelFamily = Readonly<Record<string, ModelBuilder>>;

export const piece = (slot: string, shape: PieceShape, at: Vec3, role: Role, visible = true, yaw = 0): Piece => ({
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

/** A bevelled box: edges rounded to `bevel` metres (0: sharp). */
export const box = (size: Vec3, bevel = 0.004): PieceShape => ({ kind: 'box', size, bevel });
export const rod = (radius: number, length: number, axis: Axis): PieceShape => ({ kind: 'cylinder', radius, length, axis });
export const extrusion = (section: Section, length: number, axis: Axis): PieceShape => ({ kind: 'extrusion', section, length, axis });

/**
 * The cross-section of a slotted aluminium profile `width` by `height` (a across, b up): T-slots on every face, one per module of
 * its narrow side (a 30 by 130 mm frame has four on each long face and one on each short face), and chamfered corners. The
 * proportions keep the slots of two faces apart at any size, so the outline is always one simple loop.
 */
export function slottedSection(width: number, height: number): Section {
  const m = Math.min(width, height);
  const opening = 0.27 * m; // the slot's mouth
  const neck = 0.07 * m; // the lips either side of the mouth
  const inner = 0.5 * m; // the width of the T under the lips
  const depth = 0.24 * m; // from the face to the bottom of the T
  const chamfer = 0.04 * m;
  const [hw, hh] = [width / 2, height / 2];
  const out: [number, number][] = [];
  // The four faces counter-clockwise from the bottom left corner: where each starts, the way it runs, and the way into the metal.
  const faces: Array<{ from: [number, number]; run: [number, number]; into: [number, number]; length: number }> = [
    { from: [-hw, -hh], run: [1, 0], into: [0, 1], length: width },
    { from: [hw, -hh], run: [0, 1], into: [-1, 0], length: height },
    { from: [hw, hh], run: [-1, 0], into: [0, -1], length: width },
    { from: [-hw, hh], run: [0, -1], into: [1, 0], length: height },
  ];
  for (const { from, run, into, length } of faces) {
    const at = (along: number, inward: number): [number, number] => [
      from[0] + run[0] * along + into[0] * inward,
      from[1] + run[1] * along + into[1] * inward,
    ];
    out.push(at(chamfer, 0));
    const slots = Math.max(1, Math.floor(length / m + 1e-9));
    for (let i = 0; i < slots; i++) {
      const c = ((i + 0.5) * length) / slots;
      out.push(
        at(c - opening / 2, 0),
        at(c - opening / 2, neck),
        at(c - inner / 2, neck),
        at(c - inner / 2, depth),
        at(c + inner / 2, depth),
        at(c + inner / 2, neck),
        at(c + opening / 2, neck),
        at(c + opening / 2, 0),
      );
    }
    out.push(at(length - chamfer, 0));
  }
  return out;
}

/** A slotted aluminium profile `width` by `height` (across and up, as in `Section`), `length` long along `axis`. */
export const slotted = (width: number, height: number, length: number, axis: Axis): PieceShape => ({
  kind: 'extrusion',
  section: slottedSection(width, height),
  length,
  axis,
  recessDark: true,
});

/** Below this height there is no room for a leg or a post: the part rests on the floor. */
export const MIN_STAND = 0.05;

/**
 * The levelling foot under a leg: a rubber pad on the floor and a threaded stem up into the leg. Two meshes, as the plain leg's foot
 * plate was one more: every leg of a scene is drawn each frame.
 */
export const LEVELLING_FOOT = { rise: 0.06, pad: 0.04, padHeight: 0.012, stem: 0.008 } as const;

/**
 * A leg of square slotted profile `size` from `top` down to a levelling foot that stands on the floor at `floor`, at (x, z) of the
 * part's frame (concept-station). For a leg taller than `MIN_STAND`; the foot takes at most half of it. Its slots are `leg-<id>`,
 * `stem-<id>` and `foot-<id>`.
 */
export function levellingLeg(id: string, x: number, z: number, top: number, floor: number, size = 0.04): Piece[] {
  const { pad, padHeight, stem } = LEVELLING_FOOT;
  const legBottom = floor + Math.min(LEVELLING_FOOT.rise, (top - floor) / 2);
  const stemLength = legBottom - floor - padHeight;
  return [
    piece(`leg-${id}`, slotted(size, size, top - legBottom, 'y'), [x, (top + legBottom) / 2, z], 'frame'),
    piece(`stem-${id}`, rod(stem, stemLength, 'y'), [x, floor + padHeight + stemLength / 2, z], 'steel'),
    piece(`foot-${id}`, rod(pad, padHeight, 'y'), [x, floor + padHeight / 2, z], 'rubber'),
  ];
}

/** The half extents of a piece along x, y and z of the part's frame. */
export function pieceExtent(p: Piece): Vec3 {
  const s = p.shape;
  let half: Vec3;
  if (s.kind === 'box') half = [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
  else {
    const along = s.length / 2;
    // A section reaches as far as its farthest point from the centre on each side.
    const [a, b] =
      s.kind === 'cylinder'
        ? [s.radius, s.radius]
        : [Math.max(...s.section.map((p) => Math.abs(p[0]))), Math.max(...s.section.map((p) => Math.abs(p[1])))];
    half = s.axis === 'x' ? [along, b, a] : s.axis === 'y' ? [a, along, b] : [a, b, along];
  }
  if (p.yaw === 0) return half;
  const flat = Math.hypot(half[0], half[2]);
  return [flat, half[1], flat];
}
