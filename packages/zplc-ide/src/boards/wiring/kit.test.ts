import { describe, expect, it } from 'bun:test';

import boardManifest from '../../../../../firmware/app/boards/boards.json';
import kitFile from '../../../lessons/kit.json';
import { bomProblems, joinLearnerBoards, validateKit, type BomItem } from './kit';
import { BOARDS, WIRING } from './wiring.fixtures';

describe('the learner kit of the course (LRN-014, LRN-016)', () => {
  it('is valid and names the two learner boards of boards.json', () => {
    expect(validateKit(kitFile)).toEqual([]);
    expect(joinLearnerBoards(kitFile as never, boardManifest).boards.map((board) => board.displayName)).toEqual([
      'Raspberry Pi Pico (RP2040)',
      'ESP32-S3-DevKitC-1 (N8R8)',
    ]);
    expect(joinLearnerBoards(kitFile as never, boardManifest).problems).toEqual([]);
  });

  it('LRN-029 refuses a kit board that boards.json does not mark as a learner board, whose Spanish text nothing checks', () => {
    const unmarked = (boardManifest as Array<Record<string, unknown>>).map((entry) =>
      entry.board_id === 'rpi-pico-rp2040' ? { ...entry, learner: false } : entry,
    );
    expect(joinLearnerBoards(kitFile as never, unmarked).problems).toEqual([
      'kit.json: board "rpi-pico-rp2040" is not marked "learner": true in boards.json, so its Spanish text is not checked (LRN-029)',
    ]);
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
    expect(validateKit({ ...kitFile, voltageLimit: { en: ['x'] } })).toContain(
      'kit.voltageLimit: must list the same number of non-empty sentences in en and es',
    );
    expect(
      joinLearnerBoards({ ...kitFile, boards: [{ boardId: 'uno', supply: 'a', ground: 'b', analogGround: 'c' }] } as never, boardManifest)
        .problems,
    ).toEqual(['kit.json: board "uno" has no valid I/O description in boards.json']);
  });
});

describe('the one bill of materials of the course (LRN-014)', () => {
  const bom = (kitFile as unknown as { bom: BomItem[] }).bom;
  const lessons = [{ id: 'fixture', wiring: WIRING }];

  it('lists the kit of lrn-shared section D, the same for either board', () => {
    expect(bom.map((item) => [item.id, item.quantity])).toEqual([
      ['board', 1],
      ['usb-cable', 1],
      ['breadboard', 1],
      ['led', 6],
      ['resistor-330', 6],
      ['button', 4],
      ['resistor-10k', 2],
      ['potentiometer', 1],
      ['capacitor', 1],
      ['jumper-wires', 20],
    ]);
  });

  it('covers the parts every lesson needs on each board, counting what one lesson needs at once', () => {
    expect(bomProblems(bom, lessons, BOARDS)).toEqual([]);
    const fewer = bom.map((item) => (item.id === 'button' ? { ...item, quantity: 1 } : item));
    // Every input is a part on the header of both boards (IO-009): Start and Stop are two buttons on each.
    expect(bomProblems(fewer, lessons, BOARDS)).toEqual([
      'fixture on Raspberry Pi Pico (RP2040) needs 2 of button, the bill of materials has 1',
      'fixture on ESP32-S3-DevKitC-1 (N8R8) needs 2 of button, the bill of materials has 1',
    ]);
    const noResistor = bom.filter((item) => item.id !== 'resistor-330');
    expect(bomProblems(noResistor, lessons, BOARDS)).toEqual([
      'fixture on Raspberry Pi Pico (RP2040) needs 2 of resistor 330 Ω, the bill of materials has 0',
      'fixture on ESP32-S3-DevKitC-1 (N8R8) needs 2 of resistor 330 Ω, the bill of materials has 0',
    ]);
  });

  it('counts the jumper wires: one for a jumper used as a switch, two for every other part on the breadboard, two for the rails', () => {
    // On each board: 1 jumper switch + 2 x 5 other parts on the breadboard + 2 rails = 13; the on-board LED needs none.
    const tight = bom.map((item) => (item.id === 'jumper-wires' ? { ...item, quantity: 12 } : item));
    expect(bomProblems(tight, lessons, BOARDS)).toEqual([
      'fixture on Raspberry Pi Pico (RP2040) needs 13 of jumper wire, the bill of materials has 12',
      'fixture on ESP32-S3-DevKitC-1 (N8R8) needs 13 of jumper wire, the bill of materials has 12',
    ]);
  });
});
