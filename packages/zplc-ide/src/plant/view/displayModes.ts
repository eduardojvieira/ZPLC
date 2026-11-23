/** Display modes of the 3D panel (VIS-009, UX-027). Pure palettes; the renderer applies them when it can. */
export type DisplayMode = 'light' | 'dark' | 'high-contrast';
export interface DisplayPrefs {
  mode: DisplayMode;
  reducedMotion: boolean;
}

/** The colour of each kind of item a lesson or a scene names (VIS-018); `item` of the palette is a box with no colour. */
export interface ItemTones {
  red: number;
  blue: number;
  metal: number;
  lid: number;
  base: number;
  pallet: number;
}

export interface Palette {
  mode: DisplayMode;
  /** The floor and the background. */
  floor: number;
  /** An item with no colour named (a box, a crate, or a box a person adds): kraft cardboard, darker than a light floor and lighter
   * than a dark one. A workpiece always has a colour. */
  item: number;
  items: ItemTones;
  /** A sensor's light beam. */
  beam: number;
  /** Edge lines of sensors, actuators and items, and a flat look (high contrast); null draws neither. */
  outline: number | null;
}

// Named colours keep their hue in light and dark (red near 0 degrees, blue near 240); light mode draws items dark on a light floor
// and dark mode light on a dark one, so each one keeps a 4.5:1 contrast against the floor. High contrast uses full tones.
const PALETTES: Readonly<Record<DisplayMode, Palette>> = {
  light: {
    mode: 'light',
    floor: 0xf3f4f6,
    item: 0x86653a,
    items: { red: 0xc81e3a, blue: 0x2f4fd8, metal: 0x5f6b76, lid: 0x6d28d9, base: 0x166534, pallet: 0x7c5a3a },
    beam: 0xc81e1e,
    outline: null,
  },
  dark: {
    mode: 'dark',
    floor: 0x111827,
    item: 0xd8a868,
    items: { red: 0xf0506a, blue: 0x6b8cff, metal: 0xb8c0c8, lid: 0xa78bfa, base: 0x4ade80, pallet: 0xc8a27a },
    beam: 0xf87171,
    outline: null,
  },
  'high-contrast': {
    mode: 'high-contrast',
    floor: 0x000000,
    item: 0xffffff,
    items: { red: 0xff5c5c, blue: 0x5cadff, metal: 0xc0c0c0, lid: 0xffff00, base: 0x00e0e0, pallet: 0xe0b070 },
    beam: 0xffff00,
    outline: 0xffffff,
  },
};

export function paletteFor(prefs: DisplayPrefs): Palette {
  return PALETTES[prefs.mode];
}

/** What `applyDisplayPrefs` may drive; a renderer implements whichever it supports (V1 has neither yet). */
export interface DisplayTarget {
  setCameraAnimation?(on: boolean): void;
  setPalette?(palette: Palette): void;
}

export function applyDisplayPrefs(renderer: DisplayTarget, prefs: DisplayPrefs): void {
  renderer.setCameraAnimation?.(!prefs.reducedMotion);
  renderer.setPalette?.(paletteFor(prefs));
}
