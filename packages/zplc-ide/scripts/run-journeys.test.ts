import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allJourneys, judge, parseShard, selectJourneys, shardJourneys } from './run-journeys';
import { JOURNEY_TIME_FACTOR, journeyFactor, scaleWait } from './journeyTiming';
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
    for (const bad of ['', '0/4', '5/4', '1/0', 'x/4', '1/2/3', '1.5/4', '-1/4']) expect(() => parseShard(bad)).toThrow(/ZPLC_JOURNEY_SHARD/);
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

  // The waits of the journeys are written as plain numbers and scaled in one place (journeyTiming.ts). A wait that bypasses it
  // is found here: mark a measurement that must not scale with `// journey-time: <why>` on its line.
  test('no wait of a journey bypasses the factor', () => {
    const here = import.meta.dir;
    const files = [
      'journeyApp.ts',
      'journeys.ts',
      'journeys013.ts',
      ...['journeys', 'journeys013'].flatMap((dir) => readdirSync(join(here, dir)).map((file) => join(dir, file))),
    ].filter((file) => file.endsWith('.ts'));
    const raw = [
      /Bun\.sleep\(\s*(?!100\))[\d_]+/,
      /setTimeout\(\s*\w+,\s*[\d_]+/,
      /Date\.now\(\)\s*\+\s*[\d_]+/,
      /[<>]=?\s*[\d_]{5,}\s*\)/,
      /import\s*\{[^}]*\bwaitFor\b[^}]*\}\s*from\s*'[./]*run-desktop-smoke'/s,
    ];
    const found: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(here, file), 'utf8');
      text.split('\n').forEach((line, index) => {
        if (line.includes('journey-time:')) return;
        if (raw.slice(0, 4).some((pattern) => pattern.test(line))) found.push(`${file}:${index + 1}: ${line.trim()}`);
      });
      if (raw[4]!.test(text)) found.push(`${file}: imports waitFor from run-desktop-smoke; use journeyTiming`);
      for (const match of text.matchAll(/const until[^\n]*=>\s*\{\n[^\n]*\n/g))
        if (!match[0].includes('scaleWait(')) found.push(`${file}: an until() that does not scale its bound`);
    }
    expect(found).toEqual([]);
  });
});
