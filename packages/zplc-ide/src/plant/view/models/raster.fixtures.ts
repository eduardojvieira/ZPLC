/**
 * The reviewer's pair measure without a GPU (C10): the share of pixels of a 300 by 225 cell whose colour differs by more than 24 of
 * 255 in a channel between two states of one part. The frame is a flat ray cast of every piece as its box, coloured by its role in
 * light mode: no light, shadow or texture, so it measures what the shapes and roles change, which is what the sheet shows apart.
 * Only the tests import this file.
 */
import type { PartView, Quat, Vec3 } from '../../contracts';
import { FOV_DEG } from '../camera';
import { paletteFor } from '../displayModes';
import { roleLook } from '../look';
import { partModel, type ModelContext, type Piece } from './index';

export const CELL = { w: 300, h: 225 } as const;
const PALETTE = paletteFor({ mode: 'light', reducedMotion: false });

const mul = ([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const turn = ([x, y, z, w]: Quat, [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

interface Box {
  c: Vec3;
  inv: Quat;
  half: Vec3;
  colour: number;
}

/** The half extents of a piece in its own axes, before any turn. */
function ownHalf(p: Piece): Vec3 {
  const s = p.shape;
  if (s.kind === 'box') return [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
  const [a, b] =
    s.kind === 'cylinder'
      ? [s.radius, s.radius]
      : [Math.max(...s.section.map((q) => Math.abs(q[0]))), Math.max(...s.section.map((q) => Math.abs(q[1])))];
  const along = s.length / 2;
  return s.axis === 'x' ? [along, b, a] : s.axis === 'y' ? [a, along, b] : [a, b, along];
}

/** Every visible piece of `views` as a box in the world. */
export function worldBoxes(views: readonly PartView[], context: (v: PartView) => ModelContext = () => ({ travel: 0 })): Box[] {
  const out: Box[] = [];
  for (const v of views) {
    const pq = v.pose.q as unknown as Quat;
    for (const p of partModel(v, context(v)) ?? []) {
      if (!p.visible) continue;
      const own: Quat = p.q ?? [0, Math.sin(p.yaw / 2), 0, Math.cos(p.yaw / 2)];
      const q = mul(pq, own);
      const r = turn(pq, p.at);
      out.push({
        c: [r[0] + v.pose.p[0], r[1] + v.pose.p[1], r[2] + v.pose.p[2]],
        inv: [-q[0], -q[1], -q[2], q[3]],
        half: ownHalf(p),
        colour: roleLook(p.role, v.part, PALETTE).colour,
      });
    }
  }
  return out;
}

/**
 * The cell seen from `camera`: one colour per pixel (-1 where no piece is hit). When `depth` is given it receives, per pixel, how far
 * from the camera the piece seen there is, in metres (Infinity where none is).
 */
export function rasterize(
  boxes: readonly Box[],
  camera: { position: Vec3; target: Vec3 },
  depth?: Float64Array,
  cell: { w: number; h: number } = CELL,
): Int32Array {
  const { w, h } = cell;
  const [px, py, pz] = camera.position;
  const f = [camera.target[0] - px, camera.target[1] - py, camera.target[2] - pz];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
  const fw: Vec3 = [f[0]! / fl, f[1]! / fl, f[2]! / fl];
  const rl = Math.hypot(fw[2], fw[0]);
  const right: Vec3 = [-fw[2] / rl, 0, fw[0] / rl];
  const up: Vec3 = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]];
  const tanV = Math.tan((FOV_DEG * Math.PI) / 360);
  const tanH = tanV * (w / h);
  const local = boxes.map((b) => ({ b, o: turn(b.inv, [px - b.c[0], py - b.c[1], pz - b.c[2]]) }));
  const out = new Int32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const sx = ((2 * (i + 0.5)) / w - 1) * tanH;
      const sy = (1 - (2 * (j + 0.5)) / h) * tanV;
      const d: Vec3 = [fw[0] + sx * right[0] + sy * up[0], fw[1] + sx * right[1] + sy * up[1], fw[2] + sx * right[2] + sy * up[2]];
      let best = Infinity;
      let colour = -1;
      for (const { b, o } of local) {
        const ld = turn(b.inv, d);
        let t0 = 0;
        let t1 = best;
        for (let k = 0; k < 3 && t0 <= t1; k++) {
          const inv = 1 / ld[k]!;
          let a = (-b.half[k]! - o[k]!) * inv;
          let c = (b.half[k]! - o[k]!) * inv;
          if (a > c) [a, c] = [c, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, c);
        }
        if (t0 <= t1 && t0 < best) {
          best = t0;
          colour = b.colour;
        }
      }
      out[j * w + i] = colour;
      if (depth) depth[j * w + i] = best * Math.hypot(d[0], d[1], d[2]);
    }
  return out;
}

const BACKGROUND = 0xd8dce1; // the light floor
const channelsDiffer = (a: number, b: number): boolean => {
  const [x, y] = [a < 0 ? BACKGROUND : a, b < 0 ? BACKGROUND : b];
  return [16, 8, 0].some((s) => Math.abs(((x >> s) & 255) - ((y >> s) & 255)) > 24);
};

/** The share of the cell, in per cent, whose colour differs between two frames. */
export function pairPercent(a: Int32Array, b: Int32Array): number {
  let differ = 0;
  for (let i = 0; i < a.length; i++) if (channelsDiffer(a[i]!, b[i]!)) differ++;
  return (100 * differ) / a.length;
}
