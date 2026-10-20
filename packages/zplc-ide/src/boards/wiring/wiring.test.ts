import { describe, expect, it } from 'bun:test';

import { BOARDS, ESP32S3, PICO, WIRING } from './wiring.fixtures';
import { externalParts, isOnBoard, partsFor, validateWiring, wiringBoardProblems } from './wiring';

describe('the wiring file of a hardware lesson (LRN-013, LRN-014)', () => {
  it('accepts parts that name a kind, a channel and a label in English and Spanish', () => {
    expect(validateWiring(WIRING)).toEqual([]);
  });

  it('names every missing or wrong field', () => {
    expect(validateWiring({ schemaVersion: 1, parts: [] })).toEqual(['wiring.parts: must list at least one part']);
    expect(validateWiring({ schemaVersion: 2, parts: WIRING.parts })).toEqual(['wiring.schemaVersion: must be 1']);
    const [lamp] = WIRING.parts;
    expect(validateWiring({ schemaVersion: 1, parts: [{ ...lamp, label: { en: 'Lamp' } }] })).toEqual(['wiring.parts[0].label: must be a non-empty string in en and es']);
    expect(validateWiring({ schemaVersion: 1, parts: [{ ...lamp, channel: 'gp0' }] })).toEqual(['wiring.parts[0].channel: must be a channel id of the board I/O description, such as DO0 or DI1']);
    expect(validateWiring({ schemaVersion: 1, parts: [lamp, lamp] })).toEqual(['wiring.parts: part id "lamp" is used twice']);
    expect(validateWiring({ schemaVersion: 1, parts: [{ ...lamp, pin: 15 }] })).toEqual(['wiring.parts[0]: unknown key "pin"']);
    expect(validateWiring({ schemaVersion: 1, parts: [{ ...lamp, resistorOhms: -1 }] })).toEqual(['wiring.parts[0].resistorOhms: must be a positive integer number of ohms']);
    expect(validateWiring({ schemaVersion: 1, parts: [{ ...lamp, boards: [] }] })).toEqual(['wiring.parts[0].boards: must list at least one board id']);
  });

  it('requires every channel a part names to exist on every learner board the part is wired on', () => {
    expect(wiringBoardProblems(WIRING, BOARDS)).toEqual([]);
    const onBoardLed = { id: 'onboard', kind: 'led', channel: 'DO4', label: { en: 'On-board LED', es: 'LED de la placa' } };
    expect(wiringBoardProblems({ schemaVersion: 1, parts: [onBoardLed] }, BOARDS)).toEqual(['part "onboard": channel DO4 does not exist on ESP32-S3-DevKitC-1 (N8R8)']);
    // A part limited to the Pico may name a channel only the Pico has.
    expect(wiringBoardProblems({ schemaVersion: 1, parts: [{ ...onBoardLed, boards: ['rpi-pico-rp2040'] }] }, BOARDS)).toEqual([]);
    expect(wiringBoardProblems({ schemaVersion: 1, parts: [{ ...onBoardLed, boards: ['uno'] }] }, BOARDS)).toEqual(['part "onboard": board "uno" is not a learner board']);
    const twice = { schemaVersion: 1 as const, parts: [WIRING.parts[0]!, { ...WIRING.parts[1]!, channel: 'DO0' }] };
    expect(wiringBoardProblems(twice, BOARDS)).toEqual([
      'parts "lamp" and "warning" are both wired to DO0 on Raspberry Pi Pico (RP2040)',
      'parts "lamp" and "warning" are both wired to DO0 on ESP32-S3-DevKitC-1 (N8R8)',
    ]);
    const wrongWay = { schemaVersion: 1 as const, parts: [{ ...WIRING.parts[2]!, channel: 'DO2' }] };
    expect(wiringBoardProblems(wrongWay, BOARDS)).toEqual(['part "start": a button is an input, but DO2 is an output']);
  });

  it('tells an on-board channel from a header pin, so the BOOT button and the Pico LED need no wiring', () => {
    const channel = (board: typeof PICO, id: string) => board.io.channels.find((entry) => entry.id === id)!;
    expect(isOnBoard(channel(PICO, 'DO4'))).toBe(true);
    expect(isOnBoard(channel(PICO, 'DO0'))).toBe(false);
    expect(isOnBoard(channel(ESP32S3, 'DI3'))).toBe(true);
    expect(externalParts(WIRING, PICO).map((part) => part.id)).toEqual(['lamp', 'warning', 'start', 'armed', 'stop', 'level']);
    expect(externalParts(WIRING, ESP32S3).map((part) => part.id)).toEqual(['lamp', 'warning', 'start', 'armed', 'level']);
    expect(partsFor({ schemaVersion: 1, parts: [{ ...WIRING.parts[0]!, boards: ['esp32-s3-devkitc'] }] }, PICO)).toEqual([]);
  });
});
