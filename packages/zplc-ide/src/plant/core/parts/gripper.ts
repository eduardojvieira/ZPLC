import type { Vec3 } from '../../contracts';
import type { PhysicsWorld } from '../world';
import { PLANT_STEP_MS } from '../world';
import { trackedItems } from './items';

export type GripperKind = 'vacuum' | 'clamp';
export interface GripperSpec {
  kind: GripperKind;
  maxLoadKg: number;
  maxItems: number;
}
/** The pad body id, its bottom-face centre and half footprint (x, z), world frame. */
export interface Pad {
  id: string;
  centre: Vec3;
  half: readonly [number, number];
}
export interface Gripper {
  /** Once per plant step from `beforeStep`, after the pad has been posed: capture or release (rules R-G1, R-G2, R-G4). */
  update(grip: boolean, pad: Pad): void;
  /** From `afterStep`: settles the `placed` and `drops` accounting of released items (rule R-G3). */
  settle(): void;
  held(): readonly string[]; // item ids, attach order
  counts(): { picked: number; placed: number; drops: number };
  /** Jaw closure 0..1 (clamp only; a vacuum pad reports 0 while it holds nothing and 1 while it holds). */
  closeFraction(): number;
  act(action: 'gripFail' | 'dropLoad'): void;
}

// Starting values of rule R-G1 to R-G3 (plan-m3 "Contract extensions").
const MAX_REL_SPEED_MPS = 0.05; // a grip on a faster item misses
const VACUUM_ABOVE_M = 0.005; // item top up to this far above the pad bottom ...
const VACUUM_BELOW_M = 0.02; // ... and down to this far below it
const CLAMP_REACH_M = 0.05; // clamp window around the pad centre (never narrower than the pad itself)
const CLAMP_DEPTH_M = 0.25;
const CLAMP_CLOSE_STEPS = Math.round(300 / PLANT_STEP_MS); // 0.3 s
const WATCH_STEPS = Math.round(3000 / PLANT_STEP_MS); // 3 s
const REST_STEPS = Math.round(100 / PLANT_STEP_MS); // 100 ms
const REST_SPEED_MPS = 0.05;
const PLACED_GAP_M = 0.01;
// Plan choice (the plan's own tests need it): an item let go from higher than this is a drop, and one resting this close to the floor
// (y = 0 in every scene) is on the ground, not placed. ponytail: floor height is hard-coded, a scene with a raised floor needs a parameter.
const RELEASE_GAP_M = 0.05;
const FLOOR_M = 0.02;

const speed = (v: Vec3): number => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

export function createGripper(world: PhysicsWorld, spec: GripperSpec): Gripper {
  const held: string[] = [];
  const watched: { id: string; steps: number; rest: number }[] = []; // released items, release order
  let picked = 0;
  let placed = 0;
  let drops = 0;
  let gripFail = false;
  let closeSteps = 0;
  const shed = new Set<string>(); // dropped by `dropLoad`: not re-captured until the grip is let go

  const forgetRemoved = () => {
    for (let i = held.length - 1; i >= 0; i -= 1) if (!world.has(held[i]!)) held.splice(i, 1);
  };
  const release = () => {
    for (const id of held.splice(0)) {
      const gap = world.gapBelow(id);
      world.detach(id);
      if (gap > RELEASE_GAP_M) drops += 1;
      else watched.push({ id, steps: 0, rest: 0 });
    }
  };

  return {
    update(grip, pad) {
      if (!world.has(pad.id)) throw new Error(`gripper: pad ${pad.id} is not a body of the world`);
      forgetRemoved();
      closeSteps = grip ? Math.min(closeSteps + 1, CLAMP_CLOSE_STEPS) : 0;
      if (!grip) {
        shed.clear();
        return release();
      }
      if (gripFail || held.length >= spec.maxItems) return;
      if (spec.kind === 'clamp' && closeSteps < CLAMP_CLOSE_STEPS) return;

      const poses = new Map(world.bodies().map((b) => [b.id, b]));
      const padV = poses.get(pad.id)?.v ?? [0, 0, 0];
      const [cx, py, cz] = pad.centre;
      const wx = Math.max(CLAMP_REACH_M, pad.half[0]);
      const wz = Math.max(CLAMP_REACH_M, pad.half[1]);
      const tracked = trackedItems(world);
      const found: { id: string; d: number; top: number }[] = [];
      for (const id of world.bodiesInBox([cx - 2, py - 1, cz - 2], [cx + 2, py + VACUUM_ABOVE_M, cz + 2])) {
        const info = tracked.get(id);
        const b = poses.get(id);
        if (!info || !b || held.includes(id) || shed.has(id) || world.attachedTo(id) !== null || info.massKg > spec.maxLoadKg) continue;
        if (speed([b.v[0] - padV[0], b.v[1] - padV[1], b.v[2] - padV[2]]) > MAX_REL_SPEED_MPS) continue;
        const dx = Math.abs(b.p[0] - cx);
        const dz = Math.abs(b.p[2] - cz);
        const below = py - (b.p[1] + info.size[1] / 2); // how far the item top lies under the pad bottom
        const fits =
          spec.kind === 'vacuum'
            ? dx <= info.size[0] / 2 && dz <= info.size[2] / 2 && below >= -VACUUM_ABOVE_M && below <= VACUUM_BELOW_M
            : dx <= wx && dz <= wz && below >= 0 && below <= CLAMP_DEPTH_M;
        if (fits) found.push({ id, d: Math.sqrt(dx * dx + dz * dz), top: b.p[1] + info.size[1] / 2 });
      }
      // nearest horizontally (ties within 1 mm), then the highest top face (the item of a stack nearest the pad), then id
      found.sort((a, b) => (Math.abs(a.d - b.d) > 1e-3 ? a.d - b.d : 0) || b.top - a.top || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const { id } of found.slice(0, spec.maxItems - held.length)) {
        world.attach(pad.id, id);
        held.push(id);
        picked += 1;
        const w = watched.findIndex((x) => x.id === id);
        if (w >= 0) watched.splice(w, 1);
      }
    },
    settle() {
      const poses = new Map(world.bodies().map((b) => [b.id, b]));
      const tracked = trackedItems(world);
      for (let i = 0; i < watched.length;) {
        const w = watched[i]!;
        const b = poses.get(w.id);
        const info = tracked.get(w.id);
        w.steps += 1;
        if (!b || !info) {
          drops += 1; // fell below the drop plane and was removed by the core
        } else {
          const still = speed(b.v) <= REST_SPEED_MPS && world.gapBelow(w.id) <= PLACED_GAP_M && b.p[1] - info.size[1] / 2 > FLOOR_M;
          w.rest = still ? w.rest + 1 : 0;
          if (w.rest >= REST_STEPS) placed += 1;
          else if (w.steps >= WATCH_STEPS) drops += 1;
          else {
            i += 1;
            continue;
          }
        }
        watched.splice(i, 1);
      }
    },
    held: () => held,
    counts: () => ({ picked, placed, drops }),
    closeFraction: () => (spec.kind === 'clamp' ? closeSteps / CLAMP_CLOSE_STEPS : held.length > 0 ? 1 : 0),
    act(action) {
      if (action === 'gripFail') gripFail = true;
      else {
        for (const id of held.splice(0)) {
          world.detach(id);
          shed.add(id);
          drops += 1;
        }
      }
    },
  };
}
