import { describe, expect, test } from 'bun:test';
import { getBoardIo } from '../config/boardProfiles';
import { channelsFor, mappingProblem, nextFreeChannel, normalizeAddress } from './boardIoMapping';

const pico = getBoardIo('rpi_pico')!;

describe('addresses as projects write them', () => {
  test('the bit form without a size letter is the same address', () => {
    expect(normalizeAddress('%Q0.1')).toBe('%QX0.1');
    expect(normalizeAddress('%qx0.1')).toBe('%QX0.1');
    expect(normalizeAddress('%IW8')).toBe('%IW8');
  });

  test('text that is not a process-image address has no normal form', () => {
    for (const bad of ['', 'Q0.1', '%M0.1', '%Q0', '%QX0.9']) expect(normalizeAddress(bad)).toBeUndefined();
  });
});

describe('the rows of the I/O mapping editor against the channels of the board (IO-003)', () => {
  test('inputs and outputs list the channels of the board by direction', () => {
    expect(channelsFor(pico, 'outputs').map((c) => c.id)).toEqual(['DO0', 'DO1', 'DO2', 'DO3', 'DO4']);
    expect(channelsFor(pico, 'inputs').map((c) => c.id)).toEqual(['DI0', 'DI1', 'DI2', 'DI3', 'AI0', 'AI1', 'AI2', 'AI3', 'AI4']);
  });

  test('a row on a channel of the board has no problem', () => {
    expect(mappingProblem(pico, 'Raspberry Pi Pico (RP2040)', 'outputs', { address: '%Q0.4' })).toBeUndefined();
    expect(mappingProblem(pico, 'Raspberry Pi Pico (RP2040)', 'inputs', { address: '%IW8' })).toBeUndefined();
  });

  test('a row on a channel the board does not have names the board and the channels it has', () => {
    const message = mappingProblem(pico, 'Raspberry Pi Pico (RP2040)', 'outputs', { address: '%QX0.6' })!;
    expect(message).toContain('%QX0.6');
    expect(message).toContain('Raspberry Pi Pico (RP2040)');
    expect(message).toContain('DO4 %QX0.4');
  });

  test('an input address in the outputs section has the wrong direction', () => {
    const message = mappingProblem(pico, 'Raspberry Pi Pico (RP2040)', 'outputs', { address: '%IX0.0' })!;
    expect(message).toContain('output');
  });

  test('the next free channel skips the ones the rows already use', () => {
    const rows = [{ address: '%Q0.0' }, { address: '%QX0.1' }];
    expect(nextFreeChannel(pico, 'outputs', 'digital', rows)?.id).toBe('DO2');
    expect(nextFreeChannel(pico, 'inputs', 'analog', [{ address: '%IW4' }])?.id).toBe('AI1');
  });

  test('there is no next channel when the board has no more', () => {
    const all = channelsFor(pico, 'outputs').map((c) => ({ address: c.address }));
    expect(nextFreeChannel(pico, 'outputs', 'digital', all)).toBeUndefined();
  });
});
