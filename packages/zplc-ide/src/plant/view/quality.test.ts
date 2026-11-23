import { describe, expect, it } from 'bun:test';
import { chooseInitialQuality, lookFor, qualityLevels, qualitySettings } from './quality';

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

  it('VIS-005 VIS-015 three levels exist: low has no texture, environment or shadow, medium and high draw the full look', () => {
    expect(qualityLevels).toEqual(['low', 'medium', 'high']);
    const [low, medium, high] = qualityLevels.map(qualitySettings);
    expect(low).toMatchObject({ shadows: false, antialias: false, pixelRatioCap: 1, textures: false, environment: false });
    expect(medium).toMatchObject({ shadows: true, antialias: true, textures: true, environment: true });
    expect(high).toMatchObject({ shadows: true, antialias: true, textures: true, environment: true, pixelRatioCap: 2 });
    expect(high!.shadowMapSize).toBeGreaterThan(medium!.shadowMapSize);
    expect(high!.anisotropy).toBeGreaterThan(medium!.anisotropy);
  });

  it('VIS-015 light and dark use a filmic tone curve at every level; high contrast is flat: no texture, environment or shadow', () => {
    for (const level of qualityLevels) {
      for (const mode of ['light', 'dark'] as const) {
        const look = lookFor(level, mode);
        expect(look).toMatchObject({ flat: false, toneMapping: 'filmic' });
        expect([look.textures, look.environment, look.shadows]).toEqual(Array(3).fill(level !== 'low'));
      }
      expect(lookFor(level, 'high-contrast')).toMatchObject({
        flat: true,
        toneMapping: 'none',
        textures: false,
        environment: false,
        shadows: false,
      });
    }
  });
});
