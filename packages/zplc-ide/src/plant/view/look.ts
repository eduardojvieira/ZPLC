/**
 * Colours and surfaces of the parts (VIS-015, VIS-018). Pure: the renderer turns a role into a three material. A part keeps its own
 * colour in every display mode (high contrast lightens it so it stands out on black); a surface names one of the bundled texture sets.
 */
import type { Palette } from './displayModes';

/** The colour of each part kind, kept in every display mode. */
export const PART_COLORS: Readonly<Record<string, number>> = {
  belt: 0x4b5563,
  roller: 0x6b7280,
  curved: 0x4b5563,
  'stop-blade': 0xb45309,
  sensor: 0x8a8f94, // a neutral grey housing, as photoelectric sensors are
  'push-button': 0x9ca3af,
  tank: 0x94a3b8,
  'selector-switch': 0x475569,
  'emergency-stop': 0xb91c1c,
  'stack-light': 0x1f2937,
  potentiometer: 0x475569,
  'numeric-display': 0x111827,
  'pick-place': 0x2563eb,
  gantry: 0x2563eb,
  'layer-palletizer': 0x2563eb,
  'manipulator-frame': 0x64748b,
  'manipulator-beam': 0x94a3b8,
  'light-array': 0x0f766e,
  scale: 0x64748b,
  'vision-sensor': 0x7c3aed,
  pusher: 0xb45309,
  'diverter-arm': 0xb45309,
  'chain-transfer': 0x4b5563,
  turntable: 0x4b5563,
  workpiece: 0xb91c1c,
  lift: 0x4b5563,
  'stacker-crane': 0x2563eb,
  'stacker-mast': 0x64748b,
  'stacker-rack': 0x94a3b8,
  'machining-centre': 0x94a3b8,
  'machining-door': 0xb45309,
  'limit-switch': 0x15803d,
  aligner: 0xb45309,
  chute: 0x6b7280,
};

/** `hex` moved toward white by `t` (0..1). */
export const lighten = (hex: number, t: number): number => {
  const ch = (s: number): number => Math.round(((hex >> s) & 255) * (1 - t) + 255 * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** A part's own colour; high contrast lightens it, so a dark part is not lost on the black floor. */
export function partColour(part: string, palette: Palette): number {
  const own = PART_COLORS[part] ?? 0x9ca3af;
  return palette.outline === null ? own : lighten(own, 0.4);
}

/**
 * The floor of the medium and high levels (VIS-015): an epoxy coat whose finish shows under the light (satin and a little deeper in tone
 * than the plain floor in light mode; matt in dark mode, where a sheen would lift the dark floor to grey), which fades into a haze at
 * the horizon with a far wall of another tone above it, so the scene stands on a floor that ends instead of floating in one colour.
 * `roughness` is scaled by the floor's roughness map. Low and high contrast keep the plain floor as their background: null.
 */
export function epoxyFloor(palette: Palette): { floor: number; haze: number; wall: number; roughness: number } | null {
  switch (palette.mode) {
    case 'light':
      return { floor: 0xd8dce1, haze: 0xcbd1d8, wall: 0xe9ecef, roughness: 0.45 };
    case 'dark':
      return { floor: palette.floor, haze: 0x263142, wall: 0x0d1421, roughness: 0.9 };
    case 'high-contrast':
      return null;
  }
}

/** The bundled texture sets (src/plant/assets/textures). */
export type Skin = 'painted-steel' | 'brushed-metal' | 'rubber-belt' | 'plastic' | 'cardboard' | 'floor';

/**
 * What a piece of a composed part is made of; the model builders name roles, never colours. `frame` is the silver anodised aluminium
 * of slotted profiles, the same on every part; `painted` is painted steel in the part's own colour (a machine body); `steel` is the
 * brushed steel of drums, plates and bolts; `rubber` a pad or a tyre; `safety` the yellow enclosure of an emergency stop;
 * `signal*` the lit and unlit segments of a stack light.
 */
export type Role =
  | 'frame'
  | 'painted'
  | 'steel'
  | 'rubber'
  | 'band'
  | 'mark'
  | 'housing'
  | 'safety'
  | 'signalRed'
  | 'signalAmber'
  | 'signalGreen'
  | 'signalRedOff'
  | 'signalAmberOff'
  | 'signalGreenOff'
  | 'lens'
  | 'lamp'
  | 'lampOff'
  | 'beam'
  | 'head'
  | 'collar'
  | 'zone'
  | 'glass'
  | 'liquid';

export interface RoleLook {
  skin: Skin | null;
  colour: number;
  roughness: number;
  metalness: number;
  /** Lit from inside: a lamp or a beam keeps its colour in the dark. */
  glow: boolean;
  opacity: number;
  castShadow: boolean;
}

const surface = (skin: Skin | null, colour: number, roughness: number, metalness = 0): RoleLook => ({
  skin,
  colour,
  roughness,
  metalness,
  glow: false,
  opacity: 1,
  castShadow: true,
});
const light = (colour: number, opacity = 1): RoleLook => ({ ...surface(null, colour, 1), glow: true, opacity, castShadow: false });

export function roleLook(role: Role, part: string, palette: Palette): RoleLook {
  const flat = palette.outline !== null;
  const tone = (hex: number) => (flat ? lighten(hex, 0.4) : hex);
  switch (role) {
    case 'frame':
      // Anodised: the brushed maps with a lighter, satin finish, so a frame reads apart from the steel of the drums it holds.
      return surface('brushed-metal', tone(0xd2d6db), 0.55, 1);
    case 'painted':
      return surface('painted-steel', partColour(part, palette), 0.55, 0.2);
    case 'steel':
      return surface('brushed-metal', tone(0xb8bec6), 0.4, 1);
    case 'rubber':
      return surface('plastic', tone(0x1c1c1f), 0.85);
    case 'band':
      return surface('rubber-belt', tone(0x2a2a2c), 0.85);
    case 'mark':
      return surface(null, 0xf4f4f5, 0.6);
    case 'housing':
      return surface('plastic', partColour(part, palette), 0.45);
    case 'safety':
      return surface('plastic', tone(0xeab308), 0.45);
    case 'signalRed':
      return light(flat ? 0xff0000 : 0xef4444);
    case 'signalAmber':
      return light(flat ? 0xffaa00 : 0xf59e0b);
    case 'signalGreen':
      return light(flat ? 0x00ff00 : 0x22c55e);
    // An unlit segment still shows its coloured cover, dimmed, as a real stack light does.
    case 'signalRedOff':
      return surface(null, tone(0x7f1d1d), 0.35);
    case 'signalAmberOff':
      return surface(null, tone(0x78350f), 0.35);
    case 'signalGreenOff':
      return surface(null, tone(0x14532d), 0.35);
    case 'lens':
      return surface(null, tone(0x0b0f14), 0.12);
    case 'lamp':
      return light(flat ? 0xffff00 : 0xfacc15);
    case 'lampOff':
      return surface(null, tone(0x3f3f46), 0.5);
    case 'beam':
      return light(palette.beam, flat ? 1 : 0.85);
    case 'head':
      return surface('plastic', tone(0x16a34a), 0.35);
    case 'collar':
      return surface('plastic', tone(0x27272a), 0.5);
    // Clear and neutral, as the old translucent tank box was; the liquid inside shows through.
    case 'glass':
      return { ...surface(null, tone(0xcbd5e1), 0.2), opacity: 0.3, castShadow: false };
    case 'liquid':
      return { ...surface(null, tone(0x2563eb), 0.3), opacity: 0.85, castShadow: false };
    case 'zone':
      return light(flat ? 0x00ffff : 0x22d3ee, flat ? 1 : 0.9);
  }
}
