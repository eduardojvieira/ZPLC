import { describe, expect, test } from 'bun:test';
import {
  allJourneys,
  capJourney,
  failureLine,
  journeyCapSeconds,
  judge,
  parseShard,
  PLATFORM_NOT_POSSIBLE,
  selectJourneys,
  shardJourneys,
} from './run-journeys';
import { bypassingWaits } from './journeysWaitScan';
import { JOURNEY_TIME_FACTOR, journeyFactor, scaleWait, waiting } from './journeyTiming';
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

  // owner L868: a journey that cannot run on a platform is a visible skip there, never a silent one, and a failure still fails
  test('a journey registered as not possible on this platform is a skip there, and its failure still fails the run', () => {
    const limits = { 'only on linux': 'reads /proc' };
    expect(judge([{ name: 'only on linux', outcome: { status: 'not-possible' } }], {}, limits)).toEqual([]);
    expect(judge([{ name: 'only on linux', outcome: fail }], {}, limits)).toEqual(['"only on linux" failed and is not a known gap']);
    expect(judge([{ name: 'only on linux', outcome: pass }], {}, limits)).toEqual([]);
  });

  test('35 and 53 are not possible on Windows and macOS, VIS-002 and VIS-016 on macOS, each with its reason, none on Linux', () => {
    const names = new Set(allJourneys().map((journey) => journey.name));
    const short = (platform: NodeJS.Platform) => Object.keys(PLATFORM_NOT_POSSIBLE[platform] ?? {}).map((name) => name.split(' ')[0]);
    expect(short('win32')).toEqual(['35', '53']);
    expect(short('darwin')).toEqual(['35', '53', 'VIS-002', 'VIS-016']);
    expect(PLATFORM_NOT_POSSIBLE.linux).toBeUndefined();
    for (const limits of Object.values(PLATFORM_NOT_POSSIBLE))
      for (const [name, reason] of Object.entries(limits ?? {})) {
        expect(names.has(name)).toBe(true);
        expect(reason.length).toBeGreaterThan(20);
      }
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

describe('journey shards', () => {
  const names = (journeys: Array<{ name: string }>) => journeys.map((j) => j.name);

  test('the shards of any count cover every journey exactly once', () => {
    const all = names(allJourneys());
    expect(new Set(all).size).toBe(all.length);
    for (const count of [1, 2, 3, 4, 6, 8]) {
      const covered = Array.from({ length: count }, (_, index) => names(shardJourneys(allJourneys(), `${index + 1}/${count}`))).flat();
      expect(covered.slice().sort()).toEqual(all.slice().sort());
    }
  });

  test('a shard is stable for a given list, and keeps the order of the list', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map(stubJourney);
    expect(names(shardJourneys(list, '1/2'))).toEqual(['a', 'c', 'e']);
    expect(names(shardJourneys(list, '2/2'))).toEqual(['b', 'd']);
    expect(names(shardJourneys(list, '2/2'))).toEqual(names(shardJourneys(list, '2/2')));
    expect(names(shardJourneys(list, undefined))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('a malformed shard, or one with no journey, is an error and never a silent skip', () => {
    for (const bad of ['', '0/4', '5/4', '1/0', 'x/4', '1/2/3', '1.5/4', '-1/4'])
      expect(() => parseShard(bad)).toThrow(/ZPLC_JOURNEY_SHARD/);
    expect(() => shardJourneys([stubJourney('a')], '2/3')).toThrow(/no journey/);
  });
});

describe('journey time factor', () => {
  test('Linux waits as written; the other systems wait the declared factor longer', () => {
    expect(JOURNEY_TIME_FACTOR.linux).toBe(1);
    expect(scaleWait(45_000, 'linux')).toBe(45_000);
    expect(scaleWait(1_000, 'darwin')).toBe(1_000 * JOURNEY_TIME_FACTOR.darwin);
    expect(scaleWait(1_000, 'win32')).toBe(1_000 * JOURNEY_TIME_FACTOR.win32);
    expect(journeyFactor('freebsd')).toBe(1);
  });

  // see journeysWaitScan.ts
  test('no wait of a journey bypasses the factor', () => {
    expect(bypassingWaits()).toEqual([]);
  });
});

describe('the cap of one journey', () => {
  test('is the factor times 75 s rounded up to 50 s on macOS and Windows, and none on Linux', () => {
    expect(journeyCapSeconds('linux')).toBeUndefined();
    expect(journeyCapSeconds('darwin')).toBe(200);
    expect(journeyCapSeconds('win32')).toBe(300);
  });

  test('a journey that hangs is cut at the cap and reported as a TIME failure naming the step it waited on', async () => {
    waiting.what = 'the Welcome screen';
    const outcome = await capJourney('11 A journey', new Promise<never>(() => {}), 20);
    expect(outcome.status).toBe('fail');
    expect(outcome.detail).toBe('TIME: "11 A journey" ran past its cap of 0.02 s while waiting for the Welcome screen');
  });

  test('a journey that ends before the cap keeps its own result', async () => {
    expect(await capJourney('a', Promise.resolve({ status: 'pass', detail: '', notes: [] }), 1_000)).toEqual({
      status: 'pass',
      detail: '',
      notes: [],
    });
    expect(await capJourney('a', Promise.resolve({ status: 'pass', detail: '', notes: [] }), undefined)).toMatchObject({ status: 'pass' });
  });

  test('a failure is written as it happens, with the first line of its error only', () => {
    expect(failureLine('7 Name', { status: 'fail', detail: 'Timed out waiting for X\n    at a.ts:1\n--- app output ---', notes: [] })).toBe(
      '  FAILED 7 Name: Timed out waiting for X',
    );
    expect(failureLine('7 Name', { status: 'not-possible', detail: 'no way', notes: [] })).toBe('  NOT POSSIBLE 7 Name: no way');
    expect(failureLine('7 Name', { status: 'pass', detail: '', notes: [] })).toBeUndefined();
  });
});
