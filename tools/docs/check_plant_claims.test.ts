import { describe, expect, it } from 'bun:test';

import { check, checkText } from './check_plant_claims';

const EVIDENCE = 'specs/012-zplc-2-1-plant-simulation/evidence/bench-linux-x64.json';
const rules = (text: string) => checkText('p.md', text).map((finding) => finding.rule);

describe('plant claims: public text states only what an evidence file backs (CRS-013)', () => {
  it('CRS-013 a plant page with "60 fps" and no evidence file fails', () => {
    expect(rules('The largest scene renders at 60 fps.')).toEqual(['frame-rate']);
  });

  it('CRS-013 the same sentence citing an existing evidence file passes', () => {
    expect(rules(`The largest scene renders at 60 fps ([bench](../../../${EVIDENCE})).`)).toEqual([]);
  });

  it('CRS-013 a cited evidence file that does not exist does not back the claim', () => {
    const missing = 'specs/012-zplc-2-1-plant-simulation/evidence/nope.json';
    expect(rules(`It renders at 60 fps (${missing}).`)).toEqual(['frame-rate']);
  });

  it('CRS-013 the evidence must be in the same paragraph, not the next one', () => {
    expect(rules(`It runs at 30 frames per second.\n\nSee ${EVIDENCE}.`)).toEqual(['frame-rate']);
  });

  it('CRS-013 a latency figure fails without evidence', () => {
    expect(rules('The link latency is 12 ms.')).toEqual(['latency']);
    expect(rules('One 10 ms task runs the scan.')).toEqual([]);
  });

  it('CRS-013 a board named as supported fails without evidence', () => {
    expect(rules('The Raspberry Pi Pico is supported.')).toEqual(['board']);
    expect(rules('The Raspberry Pi Pico runs the lesson.')).toEqual([]);
  });

  it('CRS-013 the Spanish wording is checked', () => {
    expect(rules('La escena corre a 60 cuadros por segundo.')).toEqual(['frame-rate']);
    expect(rules('La latencia del enlace es de 12 ms.')).toEqual(['latency']);
    expect(rules('La placa ESP32-S3-DevKitC-1 está soportada.')).toEqual(['board']);
  });

  it('CRS-013 code blocks are not prose', () => {
    expect(rules('```\n60 fps\n```')).toEqual([]);
  });

  it('CRS-013 the pages of this tree pass, in both languages', () => {
    const result = check();
    expect(result.files.length).toBeGreaterThan(10);
    expect(result.findings).toEqual([]);
  });

  it('CRS-013 the Spanish twin is read', () => {
    expect(check().files.some((file) => file.startsWith('docs/i18n/es/') && file.includes('/plant/'))).toBe(true);
  });
});
