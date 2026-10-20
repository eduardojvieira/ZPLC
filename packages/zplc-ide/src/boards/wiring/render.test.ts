import { describe, expect, it } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWiringSvg, wiringCard } from './render';
import { BOARDS, ESP32S3, PICO, WIRING } from './wiring.fixtures';

/** `ZPLC_UPDATE_GOLDEN=1 bun test src/boards/wiring` rewrites the golden diagrams after a deliberate change. */
const golden = (name: string, actual: string): string => {
  const file = join(import.meta.dir, 'golden', name);
  if (process.env.ZPLC_UPDATE_GOLDEN === '1') writeFileSync(file, actual);
  return readFileSync(file, 'utf8');
};

describe('the wiring diagram of a lesson on a learner board (LRN-014)', () => {
  for (const board of BOARDS) {
    it(`draws the golden diagram for ${board.displayName}, the same bytes each time`, () => {
      const svg = renderWiringSvg(board, WIRING, 'en');
      expect(svg).toBe(renderWiringSvg(board, WIRING, 'en'));
      expect(svg).toBe(golden(`wiring.${board.boardId}.en.svg`, svg));
    });
  }

  it('labels every part and every pin in words, with the GPIO and the header position, so colour is never the only cue', () => {
    const svg = renderWiringSvg(ESP32S3, WIRING, 'en');
    for (const text of ['Lamp', 'Warning', 'Start', 'Armed', 'Stop', 'Level', 'GPIO15', 'J1-8', 'DO0', 'GPIO5', 'J1-5', 'GPIO4', 'J1-4', '330 Ω', 'red LED', 'yellow LED', '10 kΩ', 'GND · J1-22', '3V3 · J1-1']) {
      expect({ text, found: svg.includes(text) }).toEqual({ text, found: true });
    }
    // The Pico's on-board LED is named and drawn as on the board, with nothing wired to it.
    expect(renderWiringSvg(PICO, WIRING, 'en')).toContain('on the board: no wiring');
    expect(svg).not.toContain('on the board: no wiring');
  });

  it('has an accessible title and description that a screen reader announces', () => {
    const svg = renderWiringSvg(PICO, WIRING, 'es');
    expect(svg).toMatch(/^<svg [^>]*role="img" aria-labelledby="wiring-rpi-pico-rp2040-title wiring-rpi-pico-rp2040-desc"/);
    expect(svg).toContain('<title id="wiring-rpi-pico-rp2040-title">Cableado en Raspberry Pi Pico (RP2040)</title>');
    expect(svg).toContain('<desc id="wiring-rpi-pico-rp2040-desc">');
  });

  it('escapes the text it draws', () => {
    const tricky = { schemaVersion: 1 as const, parts: [{ ...WIRING.parts[0]!, label: { en: 'A <b> & "c"', es: 'A' } }] };
    expect(renderWiringSvg(PICO, tricky, 'en')).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
  });
});

describe('the wiring card: the same wiring as a text list, part by part (LRN-014, LRN-037)', () => {
  it('says for each part where it goes on the board, in English', () => {
    expect(wiringCard(ESP32S3, WIRING, 'en')).toEqual([
      'Lamp: red LED with a 330 Ω resistor in series, from GPIO15 (J1-8, DO0) to GND (GND · J1-22).',
      'Warning: yellow LED with a 330 Ω resistor in series, from GPIO16 (J1-9, DO1) to GND (GND · J1-22).',
      'Start: push button between GPIO5 (J1-5, DI0) and GND (GND · J1-22); the internal pull-up of the board reads it.',
      'Armed: jumper wire from GPIO6 (J1-6, DI1) to GND (GND · J1-22); plugged in means on.',
      'Stop: push button between GPIO8 (J1-12, DI3) and GND (GND · J1-22); the internal pull-up of the board reads it.',
      'Level: 10 kΩ potentiometer, ends to 3V3 (3V3 · J1-1) and GND (GND · J1-22), wiper to GPIO4 (ADC1 channel 3) (J1-4, AI0).',
    ]);
  });

  it('says the same in Spanish', () => {
    expect(wiringCard(PICO, WIRING, 'es')).toEqual([
      'Lámpara: LED rojo con una resistencia de 330 Ω en serie, desde GP0 (header pin 1, DO0) hasta GND (GND · pin 38).',
      'Advertencia: LED amarillo con una resistencia de 330 Ω en serie, desde GP1 (header pin 2, DO1) hasta GND (GND · pin 38).',
      'Arranque: pulsador entre GP15 (header pin 20, DI0) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.',
      'Armado: cable puente desde GP14 (header pin 19, DI1) hasta GND (GND · pin 38); conectado significa activado.',
      'Parada: pulsador entre GP12 (header pin 16, DI3) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.',
      'Nivel: potenciómetro de 10 kΩ, extremos a 3V3 (3V3(OUT) · pin 36) y GND (AGND · pin 33), cursor a GP26 (ADC0) (header pin 31, AI0).',
      'LED de la placa: GP25 (on-board LED, DO4) está en la placa; no necesita cableado.',
    ]);
  });
});
