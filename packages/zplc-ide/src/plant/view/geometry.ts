import type { BodyPose, PartView, Quat, Vec3 } from '../contracts';
import type { Palette } from './displayModes';
import { modelBounds } from './models';

/** Shape descriptions generated in code (PRT-009): no asset is loaded. The renderer turns them into three geometry. */
export type ShapeSpec =
  | { shape: 'box'; size: Vec3 }
  | { shape: 'cylinder'; radius: number; length: number }
  | { shape: 'curve'; innerRadius: number; outerRadius: number; height: number; angleDeg: number };

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function boxShape(pose: BodyPose): ShapeSpec {
  return { shape: 'box', size: pose.size };
}

export function palletShape(pose: BodyPose): ShapeSpec {
  return { shape: 'box', size: pose.size };
}

export function beltShape(view: PartView): ShapeSpec {
  return { shape: 'box', size: view.pose.size };
}

export function rollerShape(view: PartView): ShapeSpec {
  const [length, height] = view.pose.size;
  return { shape: 'cylinder', radius: height / 2, length };
}

export function curveShape(view: PartView): ShapeSpec {
  const [width, height] = view.pose.size;
  const outerRadius = num(view.state.radius, width);
  return {
    shape: 'curve',
    innerRadius: Math.max(0, outerRadius - width),
    outerRadius,
    height,
    angleDeg: num(view.state.angleDeg, 90),
  };
}

export function bladeShape(view: PartView): ShapeSpec {
  return { shape: 'box', size: view.pose.size };
}

export function sensorShape(view: PartView): ShapeSpec {
  return { shape: 'box', size: view.pose.size };
}

/** The shape of a part by catalogue id; an unknown id is drawn as its pose box. */
export function partShape(view: PartView): ShapeSpec {
  switch (view.part) {
    case 'belt':
      return beltShape(view);
    case 'roller':
      return rollerShape(view);
    case 'curved':
      return curveShape(view);
    case 'stop-blade':
      return bladeShape(view);
    case 'sensor':
      return sensorShape(view);
    // M4 parts (PRT-009): each is its pose box (a numeric sensor's pose is already a thin marker); the strings are the ones the parts
    // publish.
    case 'light-array':
    case 'scale':
    case 'vision-sensor':
    case 'pusher':
    case 'diverter-arm':
    case 'chain-transfer':
    case 'turntable':
    case 'workpiece':
      return { shape: 'box', size: view.pose.size };
    // M5 parts (PRT-009): each is its pose box; the strings are the ones the parts publish. The crate is an item, drawn by
    // `crateBoxes`; the mast, rack and doors are secondary views of their parts.
    case 'crate':
    case 'lift':
    case 'stacker-crane':
    case 'stacker-mast':
    case 'stacker-rack':
    case 'machining-centre':
    case 'machining-door':
    case 'limit-switch':
    case 'aligner':
    case 'chute':
      return { shape: 'box', size: view.pose.size };
    // Manipulator parts (PRT-009): the pad is the pose box; the frame and beam are secondary views drawn from their own poses.
    case 'pick-place':
    case 'gantry':
    case 'layer-palletizer':
    case 'manipulator-frame':
    case 'manipulator-beam':
    case 'lid':
    case 'base':
      return { shape: 'box', size: view.pose.size };
    // Tank and operator panel parts (PRT-009): the pose box, drawn by the renderer; the tank is translucent and carries a fill.
    case 'tank':
    case 'selector-switch':
    case 'emergency-stop':
    case 'stack-light':
    case 'potentiometer':
    case 'numeric-display':
    default:
      return { shape: 'box', size: view.pose.size };
  }
}

/** A box drawn inside a part: `centre` is relative to the part's own centre. `tone` names its colour in the renderer. */
export interface Decor {
  slot: string;
  tone: 'fill' | 'red' | 'amber' | 'green' | 'jaw';
  lit: boolean;
  size: Vec3;
  centre: Vec3;
}

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);
const LAMPS = ['red', 'amber', 'green'] as const;

/** The tank's liquid: a box as wide as the tank and `fraction` of its height, resting on the bottom. */
export function tankFill(view: PartView): Decor {
  const [w, h, d] = view.pose.size;
  const f = clamp01(num(view.state.fraction, 0));
  return { slot: 'fill', tone: 'fill', lit: true, size: [w * 0.96, f * h, d * 0.96], centre: [0, (f * h - h) / 2, 0] };
}

/** The stack light's three lamps from top to bottom: red, amber, green; each is lit by its own state key. */
export function stackLamps(view: PartView): Decor[] {
  const [w, h, d] = view.pose.size;
  const lampH = h / 3;
  return LAMPS.map((tone, i) => ({
    slot: tone,
    tone,
    lit: view.state[tone] === true,
    size: [w, lampH * 0.9, d] as Vec3,
    centre: [0, h / 2 - lampH * (i + 0.5), 0] as Vec3,
  }));
}

const GRIPPER_PARTS: ReadonlySet<string> = new Set(['pick-place', 'gantry', 'layer-palletizer']);

/**
 * A manipulator's gripper under its pad (VIS-003): a clamp is two jaws whose gap shrinks as `closeFraction` grows,
 * a vacuum gripper a flat suction skirt. Only the shape differs, so the variant is not told by colour alone.
 */
export function gripperDecor(view: PartView): Decor[] {
  const [w, h, d] = view.pose.size;
  if (view.state.gripper === 'vacuum') {
    return [{ slot: 'skirt', tone: 'jaw', lit: true, size: [w * 0.6, h * 0.5, d * 0.6], centre: [0, -h, 0] }];
  }
  if (view.state.gripper !== 'clamp') return [];
  const close = clamp01(num(view.state.closeFraction, 0));
  const jawW = w * 0.08;
  const reach = (w / 2) * (1 - close) + jawW / 2; // from open (pad edge) to closed (meeting at the centre)
  const size: Vec3 = [jawW, h * 4, d];
  return [
    { slot: 'jaw-a', tone: 'jaw', lit: true, size, centre: [-reach, -h * 2.5, 0] },
    { slot: 'jaw-b', tone: 'jaw', lit: true, size, centre: [reach, -h * 2.5, 0] },
  ];
}

/** Parts that get edge lines in high contrast (VIS-009): sensors, blades and the M4 parts. */
export const OUTLINED_PARTS: ReadonlySet<string> = new Set([
  'sensor',
  'push-button',
  'stop-blade',
  'light-array',
  'scale',
  'vision-sensor',
  'pusher',
  'diverter-arm',
  'chain-transfer',
  'turntable',
  'lift',
  'stacker-crane',
  'machining-centre',
  'machining-door',
  'limit-switch',
  'aligner',
  'chute',
]);

const thin = 0.02;
const MAX_BEAMS = 32; // PRT-003

/**
 * Decor of the M4 parts. The surface direction of a turntable (its pose yaws with the platform) and a chain transfer
 * (along x lowered, across when raised) is a bar on top, so the direction is told by shape, not colour (VIS-003).
 */
function m4Decor(view: PartView): Decor[] {
  const [w, h, d] = view.pose.size;
  const top = h / 2 + thin / 2;
  switch (view.part) {
    case 'turntable':
      return [{ slot: 'direction', tone: 'jaw', lit: true, size: [w * 0.8, thin, d * 0.12], centre: [0, top, 0] }];
    case 'chain-transfer': {
      const raised = view.state.text === 'raised';
      const out: Decor[] = [
        {
          slot: 'direction',
          tone: 'jaw',
          lit: true,
          size: raised ? [w * 0.12, thin, d * 0.8] : [w * 0.8, thin, d * 0.12],
          centre: [0, top, 0],
        },
      ];
      if (raised)
        for (const [slot, z] of [
          ['chain-a', -d * 0.3],
          ['chain-b', d * 0.3],
        ] as const)
          out.push({ slot, tone: 'jaw', lit: true, size: [w, thin, d * 0.06], centre: [0, top, z] });
      return out;
    }
    case 'light-array': {
      const n = Math.min(MAX_BEAMS, Math.max(0, Math.floor(num(view.state.beams, 0))));
      const pitch = num(view.state.pitchM, 0.05);
      return Array.from({ length: n }, (_, i) => ({
        slot: `beam-${i}`,
        tone: 'jaw' as const,
        lit: true,
        size: [w, thin / 2, thin / 2] as Vec3,
        centre: [0, h / 2 + (i + 0.5) * pitch, 0] as Vec3,
      }));
    }
    case 'scale':
      return [{ slot: 'plate', tone: 'jaw', lit: true, size: [w * 0.9, thin, d * 0.9], centre: [0, top, 0] }];
    case 'vision-sensor': {
      const f = num(view.state.fieldM, Math.max(w, d));
      const c = h / 2 + f / 2;
      return [
        { slot: 'frame-n', tone: 'jaw', lit: true, size: [f, thin, thin], centre: [0, c, -f / 2] },
        { slot: 'frame-s', tone: 'jaw', lit: true, size: [f, thin, thin], centre: [0, c, f / 2] },
        { slot: 'frame-e', tone: 'jaw', lit: true, size: [thin, thin, f], centre: [f / 2, c, 0] },
        { slot: 'frame-w', tone: 'jaw', lit: true, size: [thin, thin, f], centre: [-f / 2, c, 0] },
      ];
    }
    default:
      return [];
  }
}

/**
 * Decor of the M5 parts, every cue a shape (VIS-003): a lift has a direction bar on its platform and two guide rails down to
 * the floor; a crane's fork plate has an extension bar along the fork and a tip bar once the fork is out; a machining centre
 * has a roof bar, four posts and a progress bar that grows with the cycle (the housing is drawn translucent).
 */
function m5Decor(view: PartView): Decor[] {
  const [w, h, d] = view.pose.size;
  const top = h / 2 + thin / 2;
  switch (view.part) {
    case 'lift': {
      // Full guide rails: from the floor to the top of the platform at the end of its stroke.
      const stroke = num(view.state.strokeM, 0);
      const top3 = view.pose.p[1] - num(view.state.fraction, 0) * stroke + stroke + h / 2;
      const rail = Math.max(0, top3);
      const out: Decor[] = [{ slot: 'direction', tone: 'jaw', lit: true, size: [w * 0.8, thin, d * 0.12], centre: [0, top, 0] }];
      for (const [slot, z] of [
        ['rail-a', -(d / 2 + thin)],
        ['rail-b', d / 2 + thin],
      ] as const)
        out.push({ slot, tone: 'jaw', lit: true, size: [thin, rail, thin], centre: [0, rail / 2 - view.pose.p[1], z] });
      return out;
    }
    case 'stacker-rack': {
      // Cell rails: one bar per level boundary and one divider between neighbouring bays.
      const cols = Math.max(1, Math.round(num(view.state.columns, 1)));
      const levels = Math.max(1, Math.round(num(view.state.levels, 1)));
      const bay = num(view.state.bayPitchM, 0);
      const lvl = num(view.state.levelPitchM, 0);
      const out: Decor[] = [];
      for (let k = 0; k <= levels; k += 1)
        out.push({ slot: `level-${k}`, tone: 'jaw', lit: true, size: [w, thin, d * 1.5], centre: [0, -h / 2 + k * lvl, 0] });
      for (let c = 1; c < cols; c += 1)
        out.push({ slot: `bay-${c}`, tone: 'jaw', lit: true, size: [thin, h, d * 1.5], centre: [-w / 2 + 0.2 + (c - 0.5) * bay, 0, 0] });
      return out;
    }
    case 'stacker-crane': {
      const f = num(view.state.fraction, 0);
      const out: Decor[] = [{ slot: 'extension', tone: 'jaw', lit: true, size: [w * 0.1, thin, d * 0.8], centre: [0, top, 0] }];
      if (Math.abs(f) > 0.02)
        out.push({ slot: 'tip', tone: 'jaw', lit: true, size: [w * 0.9, thin, d * 0.1], centre: [0, top, Math.sign(f) * d * 0.45] });
      return out;
    }
    case 'machining-centre': {
      const f = clamp01(num(view.state.fraction, 0));
      const out: Decor[] = [{ slot: 'roof', tone: 'jaw', lit: true, size: [w, thin, d], centre: [0, h / 2, 0] }];
      for (const [slot, x, z] of [
        ['post-a', -1, -1],
        ['post-b', 1, -1],
        ['post-c', -1, 1],
        ['post-d', 1, 1],
      ] as const)
        out.push({ slot, tone: 'jaw', lit: true, size: [thin * 2, h, thin * 2], centre: [x * (w / 2 - thin), 0, z * (d / 2 - thin)] });
      out.push({
        slot: 'progress',
        tone: 'amber',
        lit: view.state.busy === true,
        size: [w * f, thin, thin * 2],
        centre: [-(w * (1 - f)) / 2, h / 2 + thin, 0],
      });
      return out;
    }
    default:
      return [];
  }
}

/** Boxes drawn inside a part, by catalogue id; empty for a part with none. */
export function partDecor(view: PartView): readonly Decor[] {
  if (GRIPPER_PARTS.has(view.part)) return gripperDecor(view);
  if (view.part === 'tank') return [tankFill(view)];
  if (view.part === 'stack-light') return stackLamps(view);
  const m5 = m5Decor(view);
  return m5.length > 0 ? m5 : m4Decor(view);
}

/** Wall thickness of the crate (the part publishes the same 0.02 m). */
export const CRATE_WALL = 0.02;

/**
 * A crate is an open box (VIS-003): a floor and four wall bars, no top. The floor comes first so it can stand in for the item's
 * own instance; the rest are the walls. Centres are relative to the item's centre.
 */
export function crateBoxes(size: Vec3): readonly { centre: Vec3; size: Vec3 }[] {
  const [w, h, d] = size;
  const t = CRATE_WALL;
  const wallH = Math.max(0, h - t);
  const y = t / 2;
  return [
    { centre: [0, -(h - t) / 2, 0], size: [w, t, d] },
    { centre: [-(w / 2 - t / 2), y, 0], size: [t, wallH, d] },
    { centre: [w / 2 - t / 2, y, 0], size: [t, wallH, d] },
    { centre: [0, y, -(d / 2 - t / 2)], size: [w - 2 * t, wallH, t] },
    { centre: [0, y, d / 2 - t / 2], size: [w - 2 * t, wallH, t] },
  ];
}

const rotate = ([x, y, z, w]: Quat, [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

/** The world pose of one box of a crate (`index` into `crateBoxes`). */
function crateBox(item: BodyPose, index: number): { p: Vec3; size: Vec3 } {
  const box = crateBoxes(item.size)[index]!;
  const o = rotate(item.q, box.centre);
  return { p: [item.p[0] + o[0], item.p[1] + o[1], item.p[2] + o[2]], size: box.size };
}

/** The four walls of every crate item, in item order (four consecutive matrices per crate). */
export function crateWallMatrices(items: readonly BodyPose[], out?: Float32Array): Float32Array {
  const crates = items.filter((i) => i.tag === 'crate');
  const m = out && out.length >= crates.length * 64 ? out : new Float32Array(crates.length * 64);
  crates.forEach((c, i) => {
    for (let k = 1; k <= 4; k++) {
      const b = crateBox(c, k);
      composeMatrix(b.p, c.q, b.size, m, (i * 4 + k - 1) * 16);
    }
  });
  return m;
}

/** The size of the box that holds a shape: what a fit of the camera needs to know of it. */
export function shapeExtent(spec: ShapeSpec): Vec3 {
  return spec.shape === 'box'
    ? spec.size
    : spec.shape === 'cylinder'
      ? [spec.length, spec.radius * 2, spec.radius * 2]
      : [spec.outerRadius * 2, spec.height, spec.outerRadius * 2]; // an arc lies inside the square of its outer radius around its origin
}

/**
 * The box that holds every part view and every item of a snapshot (corners of each rotated box), or null for an empty one. A part
 * drawn as a composed model counts with all of its pieces: legs and posts down to the floor, a beam to its end.
 */
export function snapshotBounds(snapshot: { parts: readonly PartView[]; items: readonly BodyPose[] }): { min: Vec3; max: Vec3 } | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const add = (p: Vec3, q: Quat, lo: Vec3, hi: Vec3) => {
    for (const x of [lo[0], hi[0]])
      for (const y of [lo[1], hi[1]])
        for (const z of [lo[2], hi[2]]) {
          const c = rotate(q, [x, y, z]);
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i]!, p[i]! + c[i]!);
            max[i] = Math.max(max[i]!, p[i]! + c[i]!);
          }
        }
  };
  const centred = (p: Vec3, q: Quat, size: Vec3) =>
    add(p, q, [-size[0] / 2, -size[1] / 2, -size[2] / 2], [size[0] / 2, size[1] / 2, size[2] / 2]);
  for (const view of snapshot.parts) {
    const model = modelBounds(view);
    if (model) add(view.pose.p, view.pose.q, model.min, model.max);
    else centred(view.pose.p, view.pose.q, shapeExtent(partShape(view)));
  }
  for (const item of snapshot.items) centred(item.p, item.q, item.size);
  return Number.isFinite(min[0]) ? { min: min as unknown as Vec3, max: max as unknown as Vec3 } : null;
}

/** Column-major 4x4 matrix for translation `p`, rotation `q` and scale `s` (same layout as three's Matrix4). */
export function composeMatrix(p: Vec3, q: Quat, s: Vec3, out: Float32Array, offset: number): void {
  const [x, y, z, w] = q;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  const [sx, sy, sz] = s;
  out[offset] = (1 - (yy + zz)) * sx;
  out[offset + 1] = (xy + wz) * sx;
  out[offset + 2] = (xz - wy) * sx;
  out[offset + 3] = 0;
  out[offset + 4] = (xy - wz) * sy;
  out[offset + 5] = (1 - (xx + zz)) * sy;
  out[offset + 6] = (yz + wx) * sy;
  out[offset + 7] = 0;
  out[offset + 8] = (xz + wy) * sz;
  out[offset + 9] = (yz - wx) * sz;
  out[offset + 10] = (1 - (xx + yy)) * sz;
  out[offset + 11] = 0;
  out[offset + 12] = p[0];
  out[offset + 13] = p[1];
  out[offset + 14] = p[2];
  out[offset + 15] = 1;
}

/** Snapshot to instance data: one unit-cube instance per item, scaled to the item size. */
export function instanceMatrices(items: readonly BodyPose[], out?: Float32Array): Float32Array {
  const m = out && out.length >= items.length * 16 ? out : new Float32Array(items.length * 16);
  items.forEach((item, i) => {
    // A crate's own instance is its floor; its walls are drawn by `crateWallMatrices`.
    const b = item.tag === 'crate' ? crateBox(item, 0) : item;
    composeMatrix(b.p, item.q, b.size, m, i * 16);
  });
  return m;
}

/**
 * The colour of an item under a palette (VIS-018): a lid or a base has its own; a metal item is metal; a red or blue item takes the
 * palette's red or blue (each keeps its hue in light and dark); a pallet is wood; any other item has no colour named (a box, a crate,
 * a box a person adds: a workpiece always carries a colour) and is cardboard.
 */
export function itemToneOf(item: Partial<Pick<BodyPose, 'kind' | 'tag' | 'colour' | 'metal'>>, palette: Palette): number {
  const tones = palette.items;
  if (item.tag === 'lid' || item.tag === 'base') return tones[item.tag];
  if (item.metal) return tones.metal;
  if (item.colour === 'red' || item.colour === 'blue') return tones[item.colour];
  if (item.kind === 'pallet') return tones.pallet;
  return palette.item;
}

/** The surface of an item at the textured levels: an item with no colour, a crate or a pallet is cardboard; a coloured, metal, lid or
 * base item is plastic. */
export function itemSkin(item: Partial<Pick<BodyPose, 'kind' | 'tag' | 'colour' | 'metal'>>): 'cardboard' | 'plastic' {
  return item.colour || item.metal || item.tag === 'lid' || item.tag === 'base' ? 'plastic' : 'cardboard';
}
