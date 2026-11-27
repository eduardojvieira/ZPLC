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

  test('registers WebGL journeys when the runtime probe finds WebGL 2', () => {
    const result = selectJourneys(base, webgl, { webglAvailable: true });
    expect(result.selected.map((j) => j.name)).toEqual(['12 Restore the session', 'VIS-002 framing', 'VIS-016 look']);
    expect(result.skippedWebgl).toEqual([]);
  });

  test('excludes WebGL journeys with a reason when WebGL 2 is unavailable', () => {
    const result = selectJourneys(base, webgl, {
      webglAvailable: false,
      webglReason: 'WebGL 2 is not available on this runner',
    });
    expect(result.selected.map((j) => j.name)).toEqual(['12 Restore the session']);
    expect(result.skippedWebgl.map((j) => j.name)).toEqual(['VIS-002 framing', 'VIS-016 look']);
    expect(result.reason).toBe('WebGL 2 is not available on this runner');
  });
});
