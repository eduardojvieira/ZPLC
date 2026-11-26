/**
 * Test helper, imported only by tests: a silhouette proxy of what a catalogue cell shows. Each visible piece is projected through the
 * cell camera as the convex hull of its corners (a cylinder as a 16-gon) and filled into a mask; two masks are compared by the share
 * of pixels where one is covered and the other is not. A proxy of the drawn frame, not renderer pixels.
 */
import type { PartView, Vec3 } from '../../src/plant/contracts';
import { FOV_DEG } from '../../src/plant/view/camera';
import { partModel, rotate, sensorMount, type Piece } from '../../src/plant/view/models';

type P2 = [number, number];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The corners of a piece in the part's frame. */
function corners(p: Piece): Vec3[] {
  const s = p.shape;
  const out: Vec3[] = [];
  if (s.kind === 'box') {
    for (const x of [-1, 1])
      for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([(x * s.size[0]) / 2, (y * s.size[1]) / 2, (z * s.size[2]) / 2]);
  } else {
    const section: ReadonlyArray<readonly [number, number]> =
      s.kind === 'cylinder'
        ? Array.from({ length: 16 }, (_, i) => [s.radius * Math.cos((i * Math.PI) / 8), s.radius * Math.sin((i * Math.PI) / 8)] as const)
        : s.section;
    for (const e of [-1, 1])
      for (const [a, b] of section) {
        const along = (e * s.length) / 2;
        out.push(s.axis === 'x' ? [along, b, a] : s.axis === 'y' ? [a, along, b] : [a, b, along]);
      }
  }
  const [c, n] = [Math.cos(p.yaw), Math.sin(p.yaw)];
  return out.map((v) => {
    const r: Vec3 = p.q ? rotate(p.q, v) : [v[0] * c + v[2] * n, v[1], -v[0] * n + v[2] * c];
    return [r[0] + p.at[0], r[1] + p.at[1], r[2] + p.at[2]];
  });
}

function hull(points: P2[]): P2[] {
  const P = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P2[]) => {
    const h: P2[] = [];
    for (const p of list) {
      while (h.length >= 2 && turn(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  return [...half(P), ...half(P.reverse())];
}

/** The silhouette of the parts of a snapshot, as the renderer mounts them, through `camera` on a `w` x `h` cell. */
export function silhouette(parts: readonly PartView[], camera: { position: Vec3; target: Vec3 }, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const f = unit(sub(camera.target, camera.position));
  const r = unit(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const t = Math.tan((FOV_DEG * Math.PI) / 360);
  for (const view of parts)
    for (const p of partModel(view, { travel: 0, mount: sensorMount(view, parts) }) ?? []) {
      if (!p.visible) continue;
      const shape = hull(
        corners(p).map((c): P2 => {
          const wc = rotate(view.pose.q, c);
          const v = sub([wc[0] + view.pose.p[0], wc[1] + view.pose.p[1], wc[2] + view.pose.p[2]], camera.position);
          const d = dot(v, f);
          return [((dot(v, r) / d / (t * (w / h))) * 0.5 + 0.5) * w, (0.5 - (dot(v, u) / d / t) * 0.5) * h];
        }),
      );
      if (shape.length < 3) continue;
      const xs = shape.map((q) => q[0]);
      const ys = shape.map((q) => q[1]);
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h - 1, Math.ceil(Math.max(...ys))); y++)
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(w - 1, Math.ceil(Math.max(...xs))); x++) {
          const [px, py] = [x + 0.5, y + 0.5];
          let inside = true;
          for (let i = 0; i < shape.length && inside; i++) {
            const [a, b] = [shape[i]!, shape[(i + 1) % shape.length]!];
            if ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) < 0) inside = false;
          }
          if (inside) mask[y * w + x] = 1;
        }
    }
  return mask;
}

/** The share of the cell where exactly one of two silhouettes is covered. */
export function silhouetteXor(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n / a.length;
}
