import { describe, expect, it } from 'bun:test';

import {
  DEVICE_TRACE_JITTER_MS,
  HARDWARE_SAMPLE_PERIOD_MS,
  canonicalJson,
  citedFiles,
  expandQuotes,
  hardwareToleranceProblems,
  pollingTimeToleranceMs,
  unmarkedTimes,
  validateChecks,
  validateManifest,
  validateText,
  type ScenarioFile,
} from './lessonPackage';

const scenario: ScenarioFile = {
  schemaVersion: 1,
  id: 'S',
  tickMs: 10,
  durationMs: 100,
  events: [],
  expectations: [
    { kind: 'AT', atMs: 20, condition: { 'P.A': true, 'P.B': false } },
    { kind: 'FOR', fromMs: 40, forMs: 30, condition: { 'P.C': true } },
    { kind: 'NEVER', condition: { 'P.D': true } },
  ],
};

describe('lesson text markup (LRN-025)', () => {
  it('expands the count of assertions and the times of the scenario into plain text', () => {
    expect(expandQuotes('At {{t:20}} ms of {{assertions}} assertions.', scenario)).toEqual({
      text: 'At 20 ms of 3 assertions.',
      problems: [],
    });
  });

  it('refuses a time that is off the timeline of the scenario', () => {
    expect(expandQuotes('{{t:25}}', scenario).problems).toEqual([
      'time 25 ms is not on the timeline of scenario S (tick 10 ms, duration 100 ms)',
    ]);
    expect(expandQuotes('{{t:110}}', scenario).problems).toHaveLength(1);
  });

  it('checks a quoted value against what the scenario asserts at that time', () => {
    expect(expandQuotes('{{v:P.A=true,P.B=false@20|A on, B off}}', scenario)).toEqual({ text: 'A on, B off', problems: [] });
    // A FOR window covers every time it spans.
    expect(expandQuotes('{{v:P.C=true@60|C}}', scenario).problems).toEqual([]);
    expect(expandQuotes('{{v:P.C=true@80|C}}', scenario).problems).toHaveLength(1);
    expect(expandQuotes('{{v:P.A=false@20|A}}', scenario).problems).toHaveLength(1);
    expect(expandQuotes('{{v:P.A=true@30|A}}', scenario).problems).toHaveLength(1);
    expect(expandQuotes('{{v:P.A@20|A}}', scenario).problems).toHaveLength(1);
  });

  it('finds quoted times that carry no markup, and files a text cites', () => {
    expect(unmarkedTimes('predict at {{t:20}} ms and at 40 ms; PT T#500ms is a literal')).toEqual(['40 ms']);
    expect(citedFiles('Edit src/Motor.st, run tests/m.scenario.json, then src/Motor.st again')).toEqual([
      'src/Motor.st',
      'tests/m.scenario.json',
    ]);
  });

  it('flags markup it does not know', () => {
    expect(expandQuotes('{{x:1}}', scenario).problems).toHaveLength(1);
  });
});

describe('lesson package validators (LRN-009, LRN-010, LRN-027)', () => {
  const manifest = {
    schemaVersion: 1,
    id: 'a-lesson',
    version: 1,
    order: 1,
    module: 1,
    level: 'foundation',
    prerequisites: [],
    languages: ['ST'],
    tracks: ['simulation'],
    plant: null,
    estimatedMinutes: 10,
    unsupported: {
      hardware: {
        reason: { en: 'No board check yet.', es: 'Todavía no hay verificación en placa.' },
        instead: { en: 'Use Simulation.', es: 'Use Simulación.' },
      },
    },
    starter: { project: 'a_starter', program: 'src/A.st' },
    solution: { project: 'a', program: 'src/A.st' },
    scenario: { file: 'scenario.json', id: 'S', path: 'tests/a.scenario.json', sha256: 'a'.repeat(64) },
    regressionScenarios: [],
  };

  it('accepts a complete manifest and names each missing or wrong field', () => {
    expect(validateManifest(manifest)).toEqual([]);
    const withoutStarter: Record<string, unknown> = { ...manifest };
    delete withoutStarter.starter;
    expect(validateManifest(withoutStarter)).toEqual(['manifest: missing key "starter"']);
    expect(validateManifest({ ...manifest, level: 'expert' })[0]).toContain('manifest.level');
    expect(validateManifest({ ...manifest, tracks: [] })[0]).toContain('manifest.tracks');
    expect(validateManifest({ ...manifest, plant: 'steam-v9' })[0]).toContain('manifest.plant');
    expect(validateManifest({ ...manifest, scenario: { ...manifest.scenario, sha256: 'xyz' } })[0]).toContain('manifest.scenario.sha256');
    expect(validateManifest({ ...manifest, unexpected: true })).toEqual(['manifest: unknown key "unexpected"']);
  });

  it('LRN-011 requires a reason and an instead, in both languages, for every track the lesson does not support', () => {
    const withoutReason: Record<string, unknown> = { ...manifest };
    delete withoutReason.unsupported;
    expect(validateManifest(withoutReason)).toEqual(['manifest: missing key "unsupported"']);
    expect(validateManifest({ ...manifest, unsupported: {} })).toEqual([
      'manifest.unsupported: track "hardware" is not supported, so it needs a reason and an instead',
    ]);
    const hardware = { wiring: 'wiring.json', tolerances: { timeMs: 200, analogPercent: 5 } };
    expect(validateManifest({ ...manifest, tracks: ['simulation', 'hardware'], hardware })).toEqual([
      'manifest.unsupported: track "hardware" is supported, so it must not have a reason',
    ]);
    expect(
      validateManifest({ ...manifest, unsupported: { hardware: { ...manifest.unsupported.hardware, instead: { en: 'x' } } } })[0],
    ).toContain('manifest.unsupported.hardware.instead');
    expect(validateManifest({ ...manifest, tracks: ['simulation', 'hardware'], unsupported: {}, hardware })).toEqual([]);
  });

  it('LRN-013 requires the hardware block exactly when the lesson lists the hardware track, with its wiring file and tolerances', () => {
    const hardware = { wiring: 'wiring.json', tolerances: { timeMs: 200, analogPercent: 5 } };
    const onBoard = { ...manifest, tracks: ['simulation', 'hardware'], unsupported: {}, hardware };
    expect(validateManifest(onBoard)).toEqual([]);
    const withoutBlock: Record<string, unknown> = { ...onBoard };
    delete withoutBlock.hardware;
    expect(validateManifest(withoutBlock)).toEqual([
      'manifest.hardware: a lesson on the hardware track needs the hardware block (wiring and tolerances)',
    ]);
    expect(validateManifest({ ...manifest, hardware })).toEqual([
      'manifest.hardware: only a lesson on the hardware track has a hardware block',
    ]);
    expect(validateManifest({ ...onBoard, hardware: { ...hardware, wiring: 'pins.json' } })).toEqual([
      'manifest.hardware.wiring: must be "wiring.json"',
    ]);
    expect(validateManifest({ ...onBoard, hardware: { ...hardware, tolerances: { timeMs: 0, analogPercent: 5 } } })).toEqual([
      'manifest.hardware.tolerances.timeMs: must be an integer from 1 to 1000',
    ]);
    expect(validateManifest({ ...onBoard, hardware: { ...hardware, tolerances: { timeMs: 200, analogPercent: 120 } } })).toEqual([
      'manifest.hardware.tolerances.analogPercent: must be a number above 0 and at most 100',
    ]);
    expect(validateManifest({ ...onBoard, hardware: { ...hardware, extra: 1 } })).toEqual(['manifest.hardware: unknown key "extra"']);
  });

  it('LRN-011 lets a hardware-only lesson say why it has no simulation grade, and what to do instead', () => {
    const reason = {
      reason: { en: 'It checks a real board.', es: 'Verifica una placa real.' },
      instead: { en: 'Use first blink.', es: 'Use el primer parpadeo.' },
    };
    const hardwareOnly = {
      ...manifest,
      tracks: ['hardware'],
      unsupported: { simulation: reason },
      hardware: { wiring: 'wiring.json', tolerances: { timeMs: 200, analogPercent: 5 } },
    };
    expect(validateManifest(hardwareOnly)).toEqual([]);
    expect(validateManifest({ ...hardwareOnly, unsupported: {} })).toEqual([
      'manifest.unsupported: track "simulation" is not supported, so it needs a reason and an instead',
    ]);
  });

  it('requires the six stages once each, two hint levels and at least two wrong programs', () => {
    const stage = (key: string) => ({ key, title: key, body: 'b', checkpoint: 'c' });
    const text = {
      schemaVersion: 1,
      title: 't',
      summary: 's',
      scope: 'x',
      objectives: ['o'],
      faultCases: ['f'],
      hints: [
        { level: 1, text: 'a' },
        { level: 2, text: 'b' },
      ],
      stages: ['objective', 'predict', 'edit', 'run', 'observe', 'reflect'].map(stage),
    };
    expect(validateText(text)).toEqual([]);
    expect(validateText({ ...text, stages: text.stages.filter((item) => item.key !== 'edit') })[0]).toContain('once each');
    expect(validateText({ ...text, stages: [...text.stages].reverse() })[0]).toContain('once each');
    expect(validateText({ ...text, hints: [text.hints[0]] })[0]).toContain('level 1 and level 2');
    const program = { intent: 'does nothing', files: { 'src/A.st': 'PROGRAM A END_PROGRAM' } };
    expect(validateChecks({ schemaVersion: 1, alsoGreen: [], wrong: [program, program] })).toEqual([]);
    expect(validateChecks({ schemaVersion: 1, alsoGreen: [], wrong: [program] })[0]).toContain('at least two wrong programs');
    expect(
      validateChecks({ schemaVersion: 1, alsoGreen: [], wrong: [program, { intent: 'x', files: { '../escape': 'x' } }] })[0],
    ).toContain('project path');
  });

  it('hashes the same bytes whatever the key order or whitespace of the file', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}');
  });
});

describe('the time tolerance of a hardware lesson (LRN-024)', () => {
  it('LRN-024 covers one scan of the program and the jitter margin of a device trace', () => {
    expect(DEVICE_TRACE_JITTER_MS).toBe(10);
    expect(hardwareToleranceProblems(20, 10)).toEqual([]);
    expect(hardwareToleranceProblems(200, 10)).toEqual([]);
    expect(hardwareToleranceProblems(19, 10)).toEqual([
      'manifest.hardware.tolerances.timeMs: 19 ms is less than one scan of the program (10 ms) plus the jitter margin of a device trace ' +
        '(10 ms); it must be at least 20 ms',
    ]);
    expect(hardwareToleranceProblems(30, 25)).toHaveLength(1);
  });

  it('LRN-024 keeps the polling rule for a board without a device trace: one sampling period plus one scan', () => {
    expect(HARDWARE_SAMPLE_PERIOD_MS).toBe(120);
    expect(pollingTimeToleranceMs(20)).toBe(130);
    expect(pollingTimeToleranceMs(50)).toBe(160);
  });
});
