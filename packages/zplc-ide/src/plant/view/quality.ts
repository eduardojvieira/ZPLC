/** Quality levels (VIS-005) and the look each one draws (VIS-015). Pure: no GPU, no three. */
import type { DisplayMode } from './displayModes';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  shadows: boolean;
  /** A WebGL context attribute: it applies when the context is created, not live. */
  antialias: boolean;
  /** Upper bound for the device pixel ratio. */
  pixelRatioCap: number;
  shadowMapSize: number;
  /** Base colour, normal, roughness and metalness maps on the materials that have them. */
  textures: boolean;
  /** Image-based lighting from an environment map generated in code. */
  environment: boolean;
  /** Anisotropic filtering of the textures (1 is none). */
  anisotropy: number;
}

// Low keeps the frame-rate budget of integrated graphics (VIS-004, VIS-005): no texture, no environment, no shadow. Medium and high
// draw the physically based look; high raises the shadow resolution, the filtering and the pixel ratio.
const SETTINGS: Readonly<Record<QualityLevel, QualitySettings>> = {
  low: { shadows: false, antialias: false, pixelRatioCap: 1, shadowMapSize: 0, textures: false, environment: false, anisotropy: 1 },
  medium: { shadows: true, antialias: true, pixelRatioCap: 1, shadowMapSize: 1024, textures: true, environment: true, anisotropy: 4 },
  high: { shadows: true, antialias: true, pixelRatioCap: 2, shadowMapSize: 2048, textures: true, environment: true, anisotropy: 8 },
};

export const qualityLevels: readonly QualityLevel[] = ['low', 'medium', 'high'];

export function qualitySettings(level: QualityLevel): QualitySettings {
  return SETTINGS[level];
}

export interface Look extends QualitySettings {
  /** High contrast: flat colours, no texture, no environment, no shadow, no tone curve, outlines (VIS-009). */
  flat: boolean;
  toneMapping: 'filmic' | 'none';
}

/** What the renderer draws with at a quality level in a display mode (VIS-015). */
export function lookFor(level: QualityLevel, mode: DisplayMode): Look {
  const s = SETTINGS[level];
  const flat = mode === 'high-contrast';
  return {
    ...s,
    flat,
    shadows: s.shadows && !flat,
    textures: s.textures && !flat,
    environment: s.environment && !flat,
    toneMapping: flat ? 'none' : 'filmic',
  };
}

export interface GpuProbe {
  webgl2: boolean;
  rendererString: string;
  maxTextureSize: number;
}

const INTEGRATED = /Radeon.*Graphics|Intel|UHD|Iris|Apple M|llvmpipe|SwiftShader/i;

/** First-run choice: integrated or software GPUs start at low, an unknown GPU never above medium. */
export function chooseInitialQuality(probe: GpuProbe): QualityLevel {
  if (!probe.webgl2 || probe.maxTextureSize < 4096) return 'low';
  return INTEGRATED.test(probe.rendererString) ? 'low' : 'medium';
}
