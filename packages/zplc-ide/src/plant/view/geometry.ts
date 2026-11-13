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
  'stop-blade',
  'light-array',
  'scale',
  'vision-sensor',
  'pusher',
  'diverter-arm',
  'chain-transfer',
  'turntable',
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

/** Boxes drawn inside a part, by catalogue id; empty for a part with none. */
export function partDecor(view: PartView): readonly Decor[] {
  if (GRIPPER_PARTS.has(view.part)) return gripperDecor(view);
  if (view.part === 'tank') return [tankFill(view)];
  if (view.part === 'stack-light') return stackLamps(view);
  return m4Decor(view);
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

/** Red and blue differ in lightness, and metal is a lighter neutral (VIS-009, open question 7: never colour alone). */
const PROP_COLORS: Readonly<Record<'red' | 'blue' | 'metal', Vec3>> = {
  red: [0.7, 0.1, 0.1],
  blue: [0.45, 0.7, 1],
  metal: [0.78, 0.8, 0.82],
};

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

const mix = (c: number, t: number): number => {
  const ch = (s: number): number => Math.round(((c >> s) & 255) * (1 - t) + 255 * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * The tone of an item under a palette: its tag, else its colour or metal. `palette.item` is the one spare tone, so red,
 * blue and metal are derived from it by lightness (darkest to lightest); high contrast uses grey steps plus the outline.
 */
export function itemToneOf(item: Pick<BodyPose, 'tag' | 'colour' | 'metal'>, palette: Palette): number {
  if (item.tag === 'lid' || item.tag === 'base') return itemTone(item.tag, palette);
  const kind = item.metal ? 'metal' : item.colour;
  if (!kind) return palette.item;
  if (palette.outline !== null) return { red: 0x909090, blue: 0xc8c8c8, metal: 0xffffff }[kind];
  return mix(palette.item, { red: 0, blue: 0.35, metal: 0.7 }[kind]);
}

export function instanceColors(items: readonly BodyPose[], out?: Float32Array): Float32Array {
  const c = out && out.length >= items.length * 3 ? out : new Float32Array(items.length * 3);
  items.forEach((item, i) => {
    const tagged = item.tag === 'lid' || item.tag === 'base' ? TAG_COLORS[item.tag] : undefined;
    const prop = item.metal ? 'metal' : item.colour; // a metal part is drawn metal; its colour stays data
    c.set(tagged ?? (prop ? PROP_COLORS[prop] : undefined) ?? ITEM_COLORS[item.kind] ?? ITEM_COLORS.item, i * 3);
  });
  return c;
}
