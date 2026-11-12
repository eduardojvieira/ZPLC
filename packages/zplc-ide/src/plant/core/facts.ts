import type { FactValue, Vec3 } from '../contracts';
import type { ItemInfo } from './parts/items';

const CLOSING_MPS = 0.5; // itemsCollided: box to box contacts above this closing speed
const CELL_M = 1.5;
const TOUCH_M = 0.01;

interface Moving {
  id: string;
  p: Vec3;
  v: Vec3;
}

/** Counts new box to box contacts whose closing speed (read before the contact slowed them) is above 0.5 m/s. */
export function createContactTracker() {
  let touching = new Set<string>();
  let previous = new Map<string, Vec3>();
  return {
    /** Items in creation order, once per plant step. Returns the number of new fast contacts. */
    update(bodies: readonly Moving[], info: ReadonlyMap<string, ItemInfo>): number {
      const boxes = bodies.filter((b) => info.get(b.id)?.kind === 'item');
      const grid = new Map<string, Moving[]>(); // Map keeps insertion order
      for (const b of boxes) {
        const key = `${Math.floor(b.p[0] / CELL_M)},${Math.floor(b.p[2] / CELL_M)}`;
        const cell = grid.get(key);
        if (cell) cell.push(b);
        else grid.set(key, [b]);
      }
      const now = new Set<string>();
      let fast = 0;
      for (const b of boxes) {
        const cx = Math.floor(b.p[0] / CELL_M);
        const cz = Math.floor(b.p[2] / CELL_M);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            for (const o of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
              if (o.id <= b.id) continue;
              const sa = info.get(b.id)!.size;
              const sb = info.get(o.id)!.size;
              const gap = [0, 1, 2].map((k) => Math.abs(b.p[k]! - o.p[k]!) - (sa[k]! + sb[k]!) / 2);
              if (gap.some((g) => g > TOUCH_M)) continue;
              const pair = `${b.id}|${o.id}`;
              now.add(pair);
              if (touching.has(pair)) continue;
              const va = previous.get(b.id) ?? b.v;
              const vb = previous.get(o.id) ?? o.v;
              const n = [0, 1, 2].map((k) => o.p[k]! - b.p[k]!);
              const norm = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
              const closing = [0, 1, 2].reduce((s, k) => s + ((va[k]! - vb[k]!) * n[k]!) / norm, 0);
              if (closing > CLOSING_MPS) fast += 1;
            }
          }
        }
      }
      touching = now;
      previous = new Map(boxes.map((b) => [b.id, b.v]));
      return fast;
    },
  };
}

export interface FactInputs {
  partFacts: readonly Readonly<Record<string, FactValue>>[];
  dropped: number;
  collided: number;
  items: ReadonlyMap<string, ItemInfo>;
  poses: ReadonlyMap<string, Vec3>;
}

/** The plant facts (PLT-010). Names are API: scenarios and the text equivalent read them. */
export function buildFacts(input: FactInputs): Record<string, FactValue> {
  const merged: Record<string, FactValue> = Object.assign({}, ...input.partFacts);
  const sum = (prefix: string) =>
    Object.entries(merged).reduce((n, [k, v]) => (k.startsWith(prefix) && typeof v === 'number' ? n + v : n), 0);
  const out: Record<string, FactValue> = {
    itemsEmitted: sum('emitted:'),
    itemsRemoved: sum('delivered:'),
    itemsDropped: input.dropped,
    itemsCollided: input.collided,
    ...merged,
  };
  const seen: Record<string, number> = {};
  for (const [id, info] of input.items) {
    const kind = info.kind === 'pallet' ? 'pallet' : 'box';
    const p = input.poses.get(id);
    if (!p) continue;
    const index = (seen[kind] = (seen[kind] ?? -1) + 1);
    out[`position:${kind}:${index}`] = Math.round(p[0] * 1000) / 1000; // x along the line, metres
  }
  return out;
}
