import { describe, expect, it } from 'bun:test';
import { chooseInitialQuality, qualityLevels, qualitySettings } from './quality';

const probe = (rendererString: string, maxTextureSize = 16384) => ({ webgl2: true, rendererString, maxTextureSize });

describe('quality', () => {
  it('VIS-005 first-run quality is low on integrated graphics and never above medium on an unknown GPU', () => {
    for (const s of ['AMD Radeon Graphics (radeonsi)', 'Intel(R) UHD Graphics 630', 'Apple M1', 'llvmpipe', 'SwiftShader']) {
      expect(chooseInitialQuality(probe(s))).toBe('low');
    }
    expect(chooseInitialQuality(probe('NVIDIA GeForce RTX 4070'))).toBe('medium');
    expect(chooseInitialQuality(probe('Mystery GPU 9000'))).toBe('medium');
    expect(chooseInitialQuality({ webgl2: false, rendererString: '', maxTextureSize: 0 })).toBe('low');
  });

  it('VIS-005 three levels exist and differ in shadows and antialiasing', () => {
    expect(qualityLevels).toEqual(['low', 'medium', 'high']);
    const [low, medium, high] = qualityLevels.map(qualitySettings);
    expect(low).toMatchObject({ shadows: false, antialias: false, pixelRatioCap: 1 });
    expect(medium).toMatchObject({ shadows: false, antialias: true });
    expect(high).toMatchObject({ shadows: true, antialias: true });
  });
});
