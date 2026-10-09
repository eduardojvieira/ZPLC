import { describe, expect, test } from 'bun:test';
import { judge } from './run-journeys';

const pass = { status: 'pass' } as const;
const fail = { status: 'fail' } as const;
const gaps = { 'known gap': 'IDE-001' };

describe('journey verdict', () => {
  test('passes when every journey passes and every listed gap still fails', () => {
    expect(judge([{ name: 'a', outcome: pass }, { name: 'known gap', outcome: fail }], gaps)).toEqual([]);
  });

  test('a listed gap that is not possible counts as the gap, not as a new failure', () => {
    expect(judge([{ name: 'known gap', outcome: { status: 'not-possible' } }], gaps)).toEqual([]);
  });

  test('names a failure that is not listed', () => {
    expect(judge([{ name: 'a', outcome: fail }, { name: 'b', outcome: { status: 'not-possible' } }], gaps)).toEqual([
      '"a" failed and is not a known gap',
      '"b" is not possible and is not a known gap',
    ]);
  });

  test('a listed gap that passes now must leave the list, so the list can only shrink', () => {
    expect(judge([{ name: 'known gap', outcome: pass }], gaps)).toEqual(['"known gap" passes now: remove its entry (IDE-001) from KNOWN_GAPS']);
  });
});
