import type { BodyPose, PartView, Quat, Vec3 } from '../contracts';
import type { Palette } from './displayModes';

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

/** Boxes drawn inside a part, by catalogue id; empty for a part with none. */
export function partDecor(view: PartView): readonly Decor[] {
  if (GRIPPER_PARTS.has(view.part)) return gripperDecor(view);
  if (view.part === 'tank') return [tankFill(view)];
  if (view.part === 'stack-light') return stackLamps(view);
  return [];
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
  items.forEach((item, i) => composeMatrix(item.p, item.q, item.size, m, i * 16));
  return m;
}

const ITEM_COLORS: Readonly<Record<BodyPose['kind'], Vec3>> = {
  box: [0.82, 0.58, 0.28],
  pallet: [0.62, 0.48, 0.32],
  item: [0.3, 0.6, 0.85],
};

/** Lids and bases (VIS-009) are told from a box by tone; a tagless item keeps its kind's colour. */
const TAG_COLORS: Readonly<Record<'lid' | 'base', Vec3>> = {
  lid: [0.85, 0.85, 0.9],
  base: [0.2, 0.35, 0.3],
};

/** The tone of a tagged item under a palette: its three tags stay three different colours in every display mode. */
export function itemTone(tag: BodyPose['tag'], palette: Palette): number {
  return tag === 'lid' ? palette.sensorOn : tag === 'base' ? palette.belt : palette.item;
}

export function instanceColors(items: readonly BodyPose[], out?: Float32Array): Float32Array {
  const c = out && out.length >= items.length * 3 ? out : new Float32Array(items.length * 3);
  items.forEach((item, i) => {
    const tagged = item.tag === 'lid' || item.tag === 'base' ? TAG_COLORS[item.tag] : undefined;
    c.set(tagged ?? ITEM_COLORS[item.kind] ?? ITEM_COLORS.item, i * 3);
  });
  return c;
}
