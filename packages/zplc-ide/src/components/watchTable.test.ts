// IDE-019: what the Watch table does with a value and a list of rows, apart from drawing them.
import { describe, expect, it } from 'bun:test';
import { completeWatchSymbols, formatWatchValue, parseWatchDraft, sortWatchRows, WATCH_FORMAT } from './watchTable';

describe('the Watch display formats (IDE-019)', () => {
  it('shows an integer in decimal, hexadecimal and binary at the width of its type', () => {
    expect(formatWatchValue(255, 'INT', WATCH_FORMAT.DECIMAL)).toBe('255');
    expect(formatWatchValue(255, 'INT', WATCH_FORMAT.HEX)).toBe('16#00FF');
    expect(formatWatchValue(5, 'BYTE', WATCH_FORMAT.BINARY)).toBe('2#00000101');
    expect(formatWatchValue(-1, 'SINT', WATCH_FORMAT.HEX)).toBe('16#FF');
  });
  it('shows a REAL as real, an integer as real, and a time as a time', () => {
    expect(formatWatchValue(3, 'INT', WATCH_FORMAT.REAL)).toBe('3.0');
    expect(formatWatchValue(1.5, 'REAL', WATCH_FORMAT.REAL)).toBe('1.50000');
    expect(formatWatchValue(62300, 'DINT', WATCH_FORMAT.TIME)).toBe('T#1m2s300ms');
    expect(formatWatchValue(0, 'TIME', WATCH_FORMAT.TIME)).toBe('T#0ms');
  });
  it('leaves a BOOL, a STRING and a missing value as they are whatever the format', () => {
    expect(formatWatchValue(true, 'BOOL', WATCH_FORMAT.HEX)).toBe('TRUE');
    expect(formatWatchValue('ab', 'STRING', WATCH_FORMAT.BINARY)).toBe("'ab'");
    expect(formatWatchValue(null, 'INT', WATCH_FORMAT.HEX)).toBe('---');
  });
  it('keeps the type default under the automatic format', () => {
    expect(formatWatchValue(255, 'WORD', WATCH_FORMAT.AUTO)).toBe('16#00FF');
  });
});

describe('a value typed into the Watch table (IDE-019)', () => {
  it('reads decimal, 16#, 2#, 0x and T# text', () => {
    expect(parseWatchDraft('12', 'INT')).toBe(12);
    expect(parseWatchDraft('16#FF', 'INT')).toBe(255);
    expect(parseWatchDraft('2#101', 'INT')).toBe(5);
    expect(parseWatchDraft('0x10', 'INT')).toBe(16);
    expect(parseWatchDraft('T#1s500ms', 'TIME')).toBe(1500);
    expect(parseWatchDraft('T#2m', 'TIME')).toBe(120000);
  });
  it('refuses text that is not a number, and reads BOOL and STRING by their own rules', () => {
    expect(parseWatchDraft('abc', 'INT')).toBeNull();
    expect(parseWatchDraft('', 'INT')).toBeNull();
    expect(parseWatchDraft('true', 'BOOL')).toBe(true);
    expect(parseWatchDraft('0', 'BOOL')).toBe(false);
    expect(parseWatchDraft('hi', 'STRING')).toBe('hi');
  });
});

describe('sorting the Watch rows (IDE-019)', () => {
  const rows = [
    { path: 'b', result: { value: 2, type: 'INT', address: 20 } },
    { path: 'a', result: { value: 30, type: 'REAL', address: 30 } },
    { path: 'c', result: { value: null, type: 'BOOL', address: 10 } },
  ];
  const order = (key: Parameters<typeof sortWatchRows>[1], dir: Parameters<typeof sortWatchRows>[2]) => sortWatchRows(rows, key, dir).map((row) => row.path).join('');
  it('sorts by name, value, type and address, both ways, and leaves the order as added without a key', () => {
    expect(order('name', 'asc')).toBe('abc');
    expect(order('name', 'desc')).toBe('cba');
    expect(order('value', 'asc')).toBe('bac');
    expect(order('type', 'asc')).toBe('cba');
    expect(order('address', 'asc')).toBe('cba');
    expect(order(null, 'asc')).toBe('bac');
  });
});

describe('completing a symbol for the Watch table (IDE-019)', () => {
  const map = { pou: { Main: { vars: { Counter: { children: undefined }, Timer1: { children: { ET: {}, Q: {} } }, Cold: {} } } } } as never;
  it('offers variables and members that start with the typed text, ignoring case', () => {
    expect(completeWatchSymbols(map, 'co')).toEqual(['Cold', 'Counter']);
    expect(completeWatchSymbols(map, 'timer1.')).toEqual(['Timer1.ET', 'Timer1.Q']);
  });
  it('offers everything for an empty text, nothing without a map, and at most the limit', () => {
    expect(completeWatchSymbols(map, '')).toHaveLength(5);
    expect(completeWatchSymbols(null, 'c')).toEqual([]);
    expect(completeWatchSymbols(map, '', 2)).toHaveLength(2);
  });
});
