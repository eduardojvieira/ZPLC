// UX-009 / LNG-006: a variable is forced when the force table holds it at the address the debug map gives it in this
// file, and faulted when the poll could not read it; nothing is decided from a name alone.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { compileSingleFileWithTask } from '../compiler';
import { monitorKey, resolveVariable } from './debugVariables';
import { clearReadFaults, readFaultKeys, recordReadFaults, subscribeReadFaults } from './readFaults';
import { signalFlagsOf } from './signalFlags';

const path = 'projects/blinky_fbd/src/main.fbd.json';
const built = compileSingleFileWithTask(readFileSync(join(import.meta.dir, '../..', path), 'utf8'), 'FBD', {
  sourceRef: path,
  programName: 'Main',
  intervalMs: 10,
});
const led = resolveVariable(built.debugMap, path, 'LED_Output')!;

describe('which variables a diagram shows as forced or faulted (UX-009)', () => {
  it('flags a variable forced when the force table holds it at the address the map gives it', () => {
    const flagsOf = signalFlagsOf(built.debugMap, path, new Map([['LED_Output', { address: led.address }]]), new Set());
    expect(flagsOf('LED_Output')).toEqual({ forced: true });
    expect(flagsOf('OffTimer.ET')).toBeUndefined();
  });

  it('does not flag a variable of this file because a variable of the same name is forced elsewhere', () => {
    const flagsOf = signalFlagsOf(built.debugMap, path, new Map([['LED_Output', { address: led.address + 64 }]]), new Set());
    expect(flagsOf('LED_Output')).toBeUndefined();
  });

  it('flags a variable faulted when the poll of this file could not read it, and keeps a force beside it', () => {
    const faults = new Set([monitorKey(path, 'LED_Output'), monitorKey('other.fbd.json', 'OffTimer.ET')]);
    const flagsOf = signalFlagsOf(built.debugMap, path, new Map([['LED_Output', { address: led.address }]]), faults);
    expect(flagsOf('LED_Output')).toEqual({ forced: true, fault: true });
    // the key of another file is another variable
    expect(flagsOf('OffTimer.ET')).toBeUndefined();
  });

  it('flags nothing without a debug map', () => {
    expect(signalFlagsOf(null, path, new Map([['LED_Output', { address: led.address }]]), new Set())('LED_Output')).toBeUndefined();
  });
});

describe('the variables the poll could not read (UX-009)', () => {
  afterEach(clearReadFaults);

  it('marks a polled variable that came back without a value, and clears it when it is read again', () => {
    recordReadFaults(['a@X', 'a@Y'], ['a@Y']);
    expect([...readFaultKeys()]).toEqual(['a@X']);
    recordReadFaults(['a@X', 'a@Y'], ['a@X', 'a@Y']);
    expect(readFaultKeys().size).toBe(0);
  });

  it('keeps the same set, and tells nobody, when nothing changed', () => {
    let calls = 0;
    const stop = subscribeReadFaults(() => {
      calls += 1;
    });
    recordReadFaults(['a@X'], []);
    const first = readFaultKeys();
    recordReadFaults(['a@X'], []);
    expect(readFaultKeys()).toBe(first);
    expect(calls).toBe(1);
    clearReadFaults();
    expect(calls).toBe(2);
    stop();
  });

  it('marks every variable of a poll that failed as a whole', () => {
    recordReadFaults(['a@X', 'a@Y'], []);
    expect(readFaultKeys().size).toBe(2);
  });
});
