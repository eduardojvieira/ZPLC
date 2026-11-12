/** Quality levels (VIS-005). Pure: no GPU, no three. */
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  shadows: boolean;
  /** A WebGL context attribute: it applies when the context is created, not live. */
  antialias: boolean;
  /** Upper bound for the device pixel ratio. */
  pixelRatioCap: number;
  shadowMapSize: number;
}

const SETTINGS: Readonly<Record<QualityLevel, QualitySettings>> = {
  low: { shadows: false, antialias: false, pixelRatioCap: 1, shadowMapSize: 0 },
  medium: { shadows: false, antialias: true, pixelRatioCap: 1, shadowMapSize: 0 },
  high: { shadows: true, antialias: true, pixelRatioCap: 2, shadowMapSize: 2048 },
};

export const qualityLevels: readonly QualityLevel[] = ['low', 'medium', 'high'];

export function qualitySettings(level: QualityLevel): QualitySettings {
  return SETTINGS[level];
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
