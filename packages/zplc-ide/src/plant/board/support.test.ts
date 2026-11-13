import { describe, expect, it } from 'bun:test';

import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import { plantBoardEn, plantBoardEs } from '../../i18n/catalog/plantBoard';
import { CAPABILITY, ENUMS } from '../../runtime/link/protocol.generated';
import { plantIoSupport } from './support';

const framed = (capabilities: number) => ({ kind: 'framed', version: 1, capabilities }) as const;

describe('plantIoSupport (LNK-012, LRN-011)', () => {
  it('supports a framed firmware with the PLANT capability', () => {
    expect(plantIoSupport(framed(CAPABILITY.SESSION | CAPABILITY.PLANT))).toEqual({ supported: true });
  });

  it('unsupported reasons exist in English and Spanish and name what to do instead (a firmware update)', () => {
    const cases = [
      plantIoSupport({ kind: 'shell-only', shellProtocolVersion: 1 }),
      plantIoSupport(framed(CAPABILITY.SESSION)),
      plantIoSupport(null),
      plantIoSupport({ kind: 'unknown' }),
    ];
    for (const result of cases) {
      expect(result.supported).toBe(false);
      if (result.supported) continue;
      expect(result.reason.en).toMatch(/update the firmware/i);
      expect(result.reason.en).toMatch(/simulation/);
      expect(result.reason.es).toMatch(/actualice el firmware/i);
      expect(result.reason.es).toMatch(/simulación/);
    }
    const [shell, framedWithout] = cases;
    expect(shell).not.toEqual(framedWithout);
  });

  it('i18n parity of the new keys: same keys, no empty text, an exit text for every exit reason, registered in en and es', () => {
    expect(Object.keys(plantBoardEs).sort()).toEqual(Object.keys(plantBoardEn).sort());
    for (const reason of Object.keys(ENUMS.PLANT_EXIT_REASON)) expect(`plantIo.exit.${reason}` in plantBoardEn).toBe(true);
    for (const key of Object.keys(plantBoardEn) as (keyof typeof plantBoardEn)[]) {
      expect(plantBoardEn[key].length).toBeGreaterThan(10);
      expect(plantBoardEs[key].length).toBeGreaterThan(10);
      expect(plantBoardEn[key]).not.toBe(plantBoardEs[key]);
      expect(plantBoardEn[key]).not.toContain('!');
      expect(plantBoardEs[key]).not.toContain('!');
      expect((en as Record<string, string>)[key]).toBe(plantBoardEn[key]);
      expect((es as Record<string, string>)[key]).toBe(plantBoardEs[key]);
    }
    for (const placeholder of ['{sceneMs}', '{worstGapMs}', '{scanMs}']) {
      expect(plantBoardEn['plantIo.warn.pulse']).toContain(placeholder);
      expect(plantBoardEs['plantIo.warn.pulse']).toContain(placeholder);
    }
  });
});
