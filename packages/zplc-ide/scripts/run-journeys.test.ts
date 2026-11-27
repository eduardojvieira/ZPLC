import { describe, expect, test } from 'bun:test';
import { judge, selectJourneys } from './run-journeys';
import type { Journey } from './journeys';

const pass = { status: 'pass' } as const;
const fail = { status: 'fail' } as const;
const gaps = { 'known gap': 'IDE-001' };

describe('journey verdict', () => {
  test('passes when every journey passes and every listed gap still fails', () => {
    expect(
      judge(
        [
          { name: 'a', outcome: pass },
          { name: 'known gap', outcome: fail },
        ],
        gaps,
      ),
    ).toEqual([]);
  });

  test('a listed gap that is not possible counts as the gap, not as a new failure', () => {
    expect(judge([{ name: 'known gap', outcome: { status: 'not-possible' } }], gaps)).toEqual([]);
  });

  test('names a failure that is not listed', () => {
    expect(
      judge(
        [
          { name: 'a', outcome: fail },
          { name: 'b', outcome: { status: 'not-possible' } },
        ],
        gaps,
      ),
    ).toEqual(['"a" failed and is not a known gap', '"b" is not possible and is not a known gap']);
  });

  test('a listed gap that passes now must leave the list, so the list can only shrink', () => {
    expect(judge([{ name: 'known gap', outcome: pass }], gaps)).toEqual([
      '"known gap" passes now: remove its entry (IDE-001) from KNOWN_GAPS',
    ]);
  });
});

const stubJourney = (name: string): Journey => ({
  name,
  example: 'none',
  proves: [],
  partly: [],
  run: async () => {},
});

describe('WebGL journey registration', () => {
  const base = [stubJourney('12 Restore the session')];
  const webgl = [stubJourney('VIS-002 framing'), stubJourney('VIS-016 look')];
  const names = (journeys: Array<{ name: string }>) => journeys.map((j) => j.name);

  test('registers WebGL journeys when the runtime probe finds WebGL 2', () => {
    const result = selectJourneys(base, webgl, { probe: { status: 'available' } });
    expect(names(result.selected)).toEqual(['12 Restore the session', 'VIS-002 framing', 'VIS-016 look']);
    expect(result.notPossible).toEqual([]);
  });

  test('a page that loaded without a WebGL 2 context is a not-possible result that fails the run', () => {
    const reason = 'WebGL 2 is not available on this runner';
    const result = selectJourneys(base, webgl, { probe: { status: 'absent', reason } });
    expect(names(result.selected)).toEqual(['12 Restore the session']);
    expect(names(result.notPossible)).toEqual(['VIS-002 framing', 'VIS-016 look']);
    for (const skipped of result.notPossible) expect(skipped.outcome).toEqual({ status: 'not-possible', detail: reason, notes: [] });
    expect(judge(result.notPossible, {})).toHaveLength(2);
  });

  test('a probe launch error, timeout or crash does not skip: the journeys run and pass or fail on their own', () => {
    const result = selectJourneys(base, webgl, { probe: { status: 'error' } });
    expect(names(result.selected)).toEqual(['12 Restore the session', 'VIS-002 framing', 'VIS-016 look']);
    expect(result.notPossible).toEqual([]);
  });
});
