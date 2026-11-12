/** Display modes of the 3D panel (VIS-009, UX-027). Pure palettes; the renderer applies them when it can. */
export type DisplayMode = 'light' | 'dark' | 'high-contrast';
export interface DisplayPrefs {
  mode: DisplayMode;
  reducedMotion: boolean;
}
export interface Palette {
  floor: number;
  belt: number;
  item: number;
  sensorOn: number;
  sensorOff: number;
  outline: number | null;
}

const PALETTES: Readonly<Record<DisplayMode, Palette>> = {
  light: { floor: 0xf3f4f6, belt: 0x6b7280, item: 0x7c2d12, sensorOn: 0x14532d, sensorOff: 0xf3f4f6, outline: null },
  dark: { floor: 0x111827, belt: 0x4b5563, item: 0xfbbf24, sensorOn: 0x86efac, sensorOff: 0x111827, outline: null },
  'high-contrast': { floor: 0x000000, belt: 0x808080, item: 0xffffff, sensorOn: 0xffff00, sensorOff: 0x000000, outline: 0xffffff },
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
