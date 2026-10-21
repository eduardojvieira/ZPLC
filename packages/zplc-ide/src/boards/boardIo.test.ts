import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '../../../../firmware/app/boards/boards.json';
import { channelIn, descriptionHash, fnv1a32, imageExtent, parseDirectAddress, readBoardIo } from './boardIo';

const channel = (overrides: Record<string, unknown> = {}) => ({
  id: 'DO0',
  direction: 'output',
  kind: 'digital',
  address: '%QX0.0',
  pin: 'GP0',
  dt: { alias: 'led0', controller: 'gpio0', pin: 0 },
  safe: 0,
  electrical: '3.3 V logic',
  pin_status: 'devicetree',
  source: 'firmware/app/boards/rpi_pico_rp2040.overlay',
  ...overrides,
});
const analog = (overrides: Record<string, unknown> = {}) => ({
  id: 'AI0',
  direction: 'input',
  kind: 'analog',
  address: '%IW4',
  pin: 'GP26',
  dt: { controller: 'adc', channel: 0 },
  resolution_bits: 12,
  range: { raw_min: 0, raw_max: 4095, eng_min: 0, eng_max: 3.3, unit: 'V' },
  electrical: '0 V to 3.3 V',
  pin_status: 'devicetree',
  source: 'firmware/app/boards/rpi_pico_rp2040.overlay',
  ...overrides,
});
const io = (channels: unknown[]) => readBoardIo({ schema_version: 1, channels, unmapped: [] })!;

describe('direct addresses of the process image (IO-001)', () => {
  test('a bit address names its byte and bit', () => {
    expect(parseDirectAddress('%IX0.3')).toEqual({ region: 'I', byte: 0, bit: 3, width: 1, text: '%IX0.3' });
  });
  test('a word address is a word index of two bytes', () => {
    expect(parseDirectAddress('%IW4')).toEqual({ region: 'I', byte: 8, width: 2, text: '%IW4' });
  });
  test('malformed addresses are refused', () => {
    for (const bad of ['%IX0.8', '%I0', '%IW4.1', 'IX0.0', '%MX0.0', '']) expect(parseDirectAddress(bad)).toBeUndefined();
  });
});

describe('the board I/O description (IO-001, IO-005)', () => {
  test('a valid description reads into typed channels', () => {
    const description = io([channel(), analog()]);
    expect(description.channels.map((entry) => entry.id)).toEqual(['DO0', 'AI0']);
    expect(description.channels[1]!.range).toEqual({ rawMin: 0, rawMax: 4095, engMin: 0, engMax: 3.3, unit: 'V' });
  });
  test('a channel with a wrong direction for its address makes the description unreadable', () => {
    expect(readBoardIo({ schema_version: 1, channels: [channel({ direction: 'input' })], unmapped: [] })).toBeUndefined();
  });
  test('an unknown schema version is refused', () => {
    expect(readBoardIo({ schema_version: 2, channels: [channel()], unmapped: [] })).toBeUndefined();
  });
  test('the image extent is what the channels need', () => {
    const description = io([channel(), channel({ id: 'DO8', address: '%QX1.0' }), analog(), analog({ id: 'AI1', address: '%IW5' })]);
    expect(imageExtent(description)).toEqual({ inputBytes: 12, outputBytes: 2 });
  });
  test('FNV-1a 32 matches the published vectors', () => {
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
  test('the hash changes with an address and ignores the order of the channels', () => {
    const a = channel();
    const b = channel({ id: 'DO1', address: '%QX0.1' });
    expect(descriptionHash('t', io([a, b]))).toBe(descriptionHash('t', io([b, a])));
    expect(descriptionHash('t', io([a]))).not.toBe(descriptionHash('t', io([channel({ address: '%QX0.1' })])));
  });
});

describe('LRN-029 the Spanish twins of the human text of a channel', () => {
  const twins = { pin_es: 'GP0 (botón)', location: 'header pin 1', location_es: 'pin 1 del conector', electrical_es: 'Lógica de 3.3 V' };

  test('a channel reads its Spanish twins and shows them in Spanish, English otherwise', () => {
    const [read] = io([channel(twins)]).channels;
    expect(channelIn(read!, 'es')).toMatchObject({
      pin: 'GP0 (botón)',
      location: 'pin 1 del conector',
      electrical: 'Lógica de 3.3 V',
      address: '%QX0.0',
    });
    expect(channelIn(read!, 'en')).toMatchObject({ pin: 'GP0', location: 'header pin 1', electrical: '3.3 V logic' });
  });

  test('a channel without twins keeps its English text in Spanish', () => {
    const [read] = io([analog({ scaling: 'V = raw x 3.3 / 4095' })]).channels;
    expect(channelIn(read!, 'es')).toMatchObject({ electrical: '0 V to 3.3 V', scaling: 'V = raw x 3.3 / 4095' });
  });

  test('an empty twin or a twin without its English text makes the description unreadable, as the Python validator says', () => {
    expect(readBoardIo({ schema_version: 1, channels: [channel({ electrical_es: ' ' })], unmapped: [] })).toBeUndefined();
    expect(readBoardIo({ schema_version: 1, channels: [channel({ location_es: 'pin 1 del conector' })], unmapped: [] })).toBeUndefined();
  });
});

describe('the manifest read by Studio is the one the docs are generated from (IO-012)', () => {
  const docs = readFileSync(join(import.meta.dir, '../../../../docs/docs/reference/boards.md'), 'utf8');

  test('every board has a description and its hash is the one printed in the generated reference', () => {
    for (const entry of manifest as Array<{ board_id: string; display_name: string; io: unknown }>) {
      const description = readBoardIo(entry.io);
      expect(description, entry.board_id).toBeDefined();
      const section = docs.split(/^### /m).find((block) => block.startsWith(`${entry.display_name}\n`));
      expect(section, entry.board_id).toBeDefined();
      const printed = /I\/O description hash:\*\* `([0-9a-f]{8})`/.exec(section!)?.[1];
      expect(descriptionHash(entry.board_id, description!), entry.board_id).toBe(printed ?? '');
    }
  });

  test('the generated reference prints the footprint of every board from the size budget (IO-014)', () => {
    const budget = JSON.parse(readFileSync(join(import.meta.dir, '../../../../tools/firmware-test/size-budget.json'), 'utf8'))
      .boards as Record<string, { measured: { flash: number; ram: number } }>;
    for (const entry of manifest as Array<{ board_id: string }>) {
      const row = docs
        .split('\n')
        .find((line) => line.startsWith(`| \`${entry.board_id}\` | `) && line.includes(' | ') && /\| [0-9.]+ \| [0-9.]+ \|/.test(line));
      expect(row, entry.board_id).toBeDefined();
      const measured = budget[entry.board_id]!.measured;
      expect(row!.startsWith(`| \`${entry.board_id}\` | ${(measured.flash / 1024).toFixed(1)} | `), entry.board_id).toBe(true);
    }
  });

  test('the generated reference prints the image bytes the channels need', () => {
    for (const entry of manifest as Array<{ board_id: string; display_name: string; io: unknown }>) {
      const { inputBytes, outputBytes } = imageExtent(readBoardIo(entry.io)!);
      const section = docs.split(/^### /m).find((block) => block.startsWith(`${entry.display_name}\n`))!;
      expect(section).toContain(`Process image used (input, output):** ${inputBytes} B, ${outputBytes} B`);
    }
  });
});
