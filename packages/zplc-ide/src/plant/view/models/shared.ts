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
export const rod = (radius: number, length: number, axis: 'x' | 'y' | 'z'): PieceShape => ({ kind: 'cylinder', radius, length, axis });

/** Below this height there is no room for a leg or a post: the part rests on the floor. */
export const MIN_STAND = 0.05;

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
