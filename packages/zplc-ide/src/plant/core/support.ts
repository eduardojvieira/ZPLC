import type { Vec3 } from '../contracts';

// IDE/src/plant/core/support.ts (Task K5; pure, synchronous, no clock, no random).
// Support facts read the poses of one plant step; they know nothing about how an item got there.
export interface SupportItem {
  id: string;
  kind: 'item' | 'pallet';
  tag?: 'box' | 'lid' | 'base';
  size: Vec3;
  p: Vec3;
  v: Vec3;
}
export interface SupportTracker {
  update(items: readonly SupportItem[]): void;
  facts(): Record<string, number>;
}

const CONTACT_M = 0.005; // B.bottom within this of A.top
const MIN_OVERLAP = 0.3; // share of B's footprint that must lie over A
const REST_MPS = 0.05;
const ASSEMBLED_STEPS = 40;
const ASSEMBLED_CENTRE_M = 0.1;

// ponytail: footprints are axis-aligned boxes from `size` (yaw ignored), exact for items squared to the
// axes, loose for a rotated one; upgrade to an oriented-box overlap test if a scene needs rotated stacks.
function overlapShare(b: SupportItem, a: SupportItem): number {
  const ox = Math.min(b.p[0] + b.size[0] / 2, a.p[0] + a.size[0] / 2) - Math.max(b.p[0] - b.size[0] / 2, a.p[0] - a.size[0] / 2);
  const oz = Math.min(b.p[2] + b.size[2] / 2, a.p[2] + a.size[2] / 2) - Math.max(b.p[2] - b.size[2] / 2, a.p[2] - a.size[2] / 2);
  return ox > 0 && oz > 0 ? (ox * oz) / (b.size[0] * b.size[2]) : 0;
}

function atRest(i: SupportItem): boolean {
  return i.v[0] * i.v[0] + i.v[1] * i.v[1] + i.v[2] * i.v[2] <= REST_MPS * REST_MPS;
}

/** The supporter of `b` among `all` (best overlap, first in creation order on a tie), or -1. */
function supporterOf(b: SupportItem, all: readonly SupportItem[]): number {
  if (b.kind === 'pallet' || !atRest(b)) return -1;
  const bottom = b.p[1] - b.size[1] / 2;
  let best = -1;
  let bestShare = 0;
  for (let k = 0; k < all.length; k += 1) {
    const a = all[k];
    if (a.id === b.id || b.p[1] <= a.p[1] || !atRest(a)) continue;
    if (Math.abs(bottom - (a.p[1] + a.size[1] / 2)) > CONTACT_M) continue;
    const share = overlapShare(b, a);
    if (share >= MIN_OVERLAP && share > bestShare) {
      best = k;
      bestShare = share;
    }
  }
  return best;
}

export function createSupportTracker(): SupportTracker {
  const restSteps = new Map<string, number>(); // lid id -> consecutive steps on a base
  const assembled = new Set<string>();
  let current: Record<string, number> = { itemsAssembled: 0 };

  return {
    update(items) {
      const sup = items.map((b) => supporterOf(b, items));

      // Lids: count each id once after 40 consecutive steps resting on a base.
      const seen = new Set<string>();
      items.forEach((lid, k) => {
        if (lid.kind !== 'item' || lid.tag !== 'lid') return;
        seen.add(lid.id);
        const base = sup[k] >= 0 ? items[sup[k]] : undefined;
        const on =
          base?.tag === 'base' &&
          Math.abs(lid.p[0] - base.p[0]) <= ASSEMBLED_CENTRE_M &&
          Math.abs(lid.p[2] - base.p[2]) <= ASSEMBLED_CENTRE_M;
        const n = on ? (restSteps.get(lid.id) ?? 0) + 1 : 0;
        restSteps.set(lid.id, n);
        if (n >= ASSEMBLED_STEPS) assembled.add(lid.id);
      });
      for (const id of [...restSteps.keys()]) if (!seen.has(id)) restSteps.delete(id);

      // Chains: depth of each item above a pallet (0 = not on one). Supporters are strictly lower, so no cycle.
      const root = new Array<number>(items.length).fill(-1);
      const depth = new Array<number>(items.length).fill(0);
      const order = items.map((_, k) => k).sort((x, y) => items[x].p[1] - items[y].p[1] || x - y);
      for (const k of order) {
        const s = sup[k];
        if (s < 0 || items[k].kind !== 'item') continue;
        if (items[s].kind === 'pallet') {
          root[k] = s;
          depth[k] = 1;
        } else if (root[s] >= 0) {
          root[k] = root[s];
          depth[k] = depth[s] + 1;
        }
      }

      const next: Record<string, number> = { itemsAssembled: assembled.size };
      let index = 0;
      items.forEach((it, k) => {
        if (it.kind !== 'pallet') return;
        let stacked = 0;
        let layers = 0;
        items.forEach((_, j) => {
          if (root[j] !== k) return;
          stacked += 1;
          layers = Math.max(layers, depth[j]);
        });
        next[`stacked:pallet:${index}`] = stacked;
        next[`layers:pallet:${index}`] = layers;
        index += 1;
      });
      current = next;
    },
    facts: () => ({ ...current }),
  };
}
