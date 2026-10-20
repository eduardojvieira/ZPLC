import { describe, expect, it } from 'bun:test';

import { BOARDS, ESP32S3, PICO, WIRING } from './wiring.fixtures';
import { LOW_VOLTAGE_KINDS, externalParts, isOnBoard, partsFor, validateWiring, wiringBoardProblems, wiringSafetyProblems } from './wiring';

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

  it('tells an on-board channel from a header pin, so the Pico LED needs no wiring while every input is on the header (IO-009)', () => {
    const channel = (board: typeof PICO, id: string) => board.io.channels.find((entry) => entry.id === id)!;
    expect(isOnBoard(channel(PICO, 'DO4'))).toBe(true);
    expect(isOnBoard(channel(PICO, 'DO0'))).toBe(false);
    expect(isOnBoard(channel(ESP32S3, 'DI3'))).toBe(false);
    expect(externalParts(WIRING, PICO).map((part) => part.id)).toEqual(['lamp', 'warning', 'start', 'armed', 'stop', 'level']);
    expect(externalParts(WIRING, ESP32S3).map((part) => part.id)).toEqual(['lamp', 'warning', 'start', 'armed', 'stop', 'level']);
    expect(partsFor({ schemaVersion: 1, parts: [{ ...WIRING.parts[0]!, boards: ['esp32-s3-devkitc'] }] }, PICO)).toEqual([]);
  });
});

describe('LRN-016 hardware lessons use only logic-level I/O and low-voltage parts', () => {
  const lamp = WIRING.parts[0]!;
  const only = (part: object) => ({ schemaVersion: 1 as const, parts: [part as typeof lamp] });

  it('accepts the parts of the kit', () => {
    expect(wiringSafetyProblems(WIRING, BOARDS)).toEqual([]);
  });

  it('allows only the low-voltage kinds: no relay, motor, buzzer or mains part is ever wired to a pin', () => {
    expect([...LOW_VOLTAGE_KINDS]).toEqual(['led', 'resistor', 'button', 'potentiometer', 'capacitor', 'jumper']);
    for (const kind of ['relay', 'motor', 'buzzer', 'solenoid', 'lamp-230v']) {
      expect(wiringSafetyProblems(only({ ...lamp, kind, color: undefined, resistorOhms: undefined }), BOARDS)).toEqual([`part "lamp": kind "${kind}" is not a low-voltage part of the course (led, resistor, button, potentiometer, capacitor, jumper)`]);
    }
  });

  it('gives every LED wired to a header pin a series resistor of at least 330 ohms, and a colour that lights at 3.3 V', () => {
    expect(wiringSafetyProblems(only({ ...lamp, resistorOhms: 220 }), BOARDS)).toEqual(['part "lamp": an LED needs a series resistor of at least 330 ohms, it has 220']);
    const bare: Record<string, unknown> = { ...lamp };
    delete bare.resistorOhms;
    expect(wiringSafetyProblems(only(bare), BOARDS)).toEqual(['part "lamp": an LED needs a series resistor of at least 330 ohms, it has none']);
    expect(wiringSafetyProblems(only({ ...lamp, color: 'blue' }), BOARDS)).toEqual(['part "lamp": an LED must be red, green or yellow, not blue']);
    // The Pico's on-board LED has its own resistor on the board.
    expect(wiringSafetyProblems(only({ id: 'onboard', kind: 'led', channel: 'DO4', boards: ['rpi-pico-rp2040'], label: { en: 'On-board LED', es: 'LED de la placa' } }), BOARDS)).toEqual([]);
  });

  it('names no voltage above 3.3 V and nothing from mains in any label', () => {
    expect(wiringSafetyProblems(only({ ...lamp, label: { en: '5 V lamp', es: 'Lámpara de 5 V' } }), BOARDS)).toEqual([
      'part "lamp": the en label names 5 V, above the 3.3 V of the learner boards',
      'part "lamp": the es label names 5 V, above the 3.3 V of the learner boards',
    ]);
    expect(wiringSafetyProblems(only({ ...lamp, label: { en: 'Mains heater', es: 'Calefactor de red eléctrica' } }), BOARDS)).toEqual([
      'part "lamp": the en label names mains wiring',
      'part "lamp": the es label names mains wiring',
    ]);
    expect(wiringSafetyProblems(only({ ...lamp, label: { en: '3.3 V lamp', es: 'Lámpara de 3,3 V' } }), BOARDS)).toEqual([]);
  });
});
