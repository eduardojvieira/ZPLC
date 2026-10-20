import { describe, expect, it } from 'bun:test';

import boardManifest from '../../../../../firmware/app/boards/boards.json';
import kitFile from '../../../lessons/kit.json';
import { joinLearnerBoards, validateKit } from './kit';

describe('the learner kit of the course (LRN-014, LRN-016)', () => {
  it('is valid and names the two learner boards of boards.json', () => {
    expect(validateKit(kitFile)).toEqual([]);
    expect(joinLearnerBoards(kitFile as never, boardManifest).boards.map((board) => board.displayName)).toEqual(['Raspberry Pi Pico (RP2040)', 'ESP32-S3-DevKitC-1 (N8R8)']);
  });

  it('LRN-016 states the voltage limit in English and Spanish with the same facts', () => {
    const { voltageLimit } = kitFile as { voltageLimit: Record<'en' | 'es', string[]> };
    expect(voltageLimit.en.length).toBe(voltageLimit.es.length);
    const en = voltageLimit.en.join(' ');
    const es = voltageLimit.es.join(' ');
    for (const fact of ['3.3 V', '5 V', 'VBUS', 'VSYS', '3V3', '10 mA', '330 Ω', '50 mA']) {
      expect({ fact, en: en.includes(fact), es: es.includes(fact) }).toEqual({ fact, en: true, es: true });
    }
    expect(en).toMatch(/mains/);
    expect(es).toMatch(/red eléctrica/);
    expect(en).toMatch(/unplugged/);
    expect(es).toMatch(/desconectado/);
  });

  it('names every missing or wrong field', () => {
    expect(validateKit({ ...kitFile, boards: [] })).toContain('kit.boards: must list the learner boards');
    expect(validateKit({ ...kitFile, voltageLimit: { en: ['x'] } })).toContain('kit.voltageLimit: must list the same number of non-empty sentences in en and es');
    expect(joinLearnerBoards({ ...(kitFile as never), boards: [{ boardId: 'uno', supply: 'a', ground: 'b', analogGround: 'c' }] }, boardManifest).problems).toEqual(['kit.json: board "uno" has no valid I/O description in boards.json']);
  });
});
