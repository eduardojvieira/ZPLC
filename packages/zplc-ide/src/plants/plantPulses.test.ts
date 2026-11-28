import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createNativeScenarioSession } from '../cli/nativeScenarioRuntime';
import { itNative } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { compileScenario, runScenario } from '../test-engine';
import type { PlantKind } from './plantEngine';
import { PLANT_PULSES, shortestPulseMs } from './plantPulses';
import { scaleDefaultTimeout } from '../test/platformTime';

scaleDefaultTimeout(); // a test with no timeout of its own gets bun's 5 s scaled for the system (src/test/platformTime.ts)

const KINDS: readonly PlantKind[] = ['motor-v1', 'conveyor-v1', 'tank-v1', 'pedestrian-v1'];
const projects = fileURLToPath(new URL('../../projects', import.meta.url));

describe('the shortest sensor pulse of the four 2.0 plants (SCN-007, LNK-014)', () => {
  it('shortestPulseMs counts only the complete true runs of the plant sensor inputs', () => {
    const samples = [
      { kind: 'x', aInput: true, bInput: false, levelAfterTick: 1 },
      { kind: 'x', aInput: true, bInput: true, levelAfterTick: 0 },
      { kind: 'x', aInput: false, bInput: true, levelAfterTick: 0 },
      { kind: 'x', aInput: false, bInput: true, levelAfterTick: 0 },
      { kind: 'x', aInput: true, bInput: false, levelAfterTick: 0 },
      { kind: 'x', aInput: false, bInput: true, levelAfterTick: 0 },
    ];
    // aInput: the run at the start is cut by the trace, the one at index 4 is a whole 10 ms pulse; bInput: 30 ms, then cut
    expect(shortestPulseMs(samples, 10)).toBe(10);
    expect(shortestPulseMs(samples.slice(0, 4), 10)).toBeUndefined();
    expect(shortestPulseMs(samples.slice(0, 5), 10)).toBe(30);
    expect(shortestPulseMs([], 10)).toBeUndefined();
  });

  it('every 2.0 plant has a pulse', () => {
    expect(Object.keys(PLANT_PULSES).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) expect(PLANT_PULSES[kind]).toBeGreaterThan(0);
  });

  itNative('the four 2.0 plants have a measured pulse and no scenario, hash or grade changed', async () => {
    const measured = new Map<string, number>();
    const lessons = LESSON_INDEX.lessons.filter((lesson) => KINDS.includes(lesson.plant as PlantKind));
    expect(new Set(lessons.map((lesson) => lesson.plant))).toEqual(new Set(KINDS));
    for (const lesson of lessons) {
      // the graded scenario as the grader reads it: the canonical text whose hash the lesson pins
      expect(createHash('sha256').update(lesson.scenario.canonical).digest('hex')).toBe(lesson.scenario.sha256);
      const built = await compilerCompile(`${projects}/${lesson.solution.project}`);
      if (!built.ok || !built.debugMap) throw new Error(`${lesson.id}: ${JSON.stringify(built.evidence.diagnostics)}`);
      const scenario = compileScenario(JSON.parse(lesson.scenario.canonical), built.debugMap);
      const session = await createNativeScenarioSession(process.env);
      try {
        const result = await runScenario(scenario, built.zplcFile!, session.runtime);
        expect(result.passed, `${lesson.id}: the reference solution passes its graded scenario`).toBe(true);
        const plant = result.trace.map((sample) => sample.plant as Record<string, unknown>);
        const pulse = shortestPulseMs(plant, lesson.scenario.tickMs);
        if (pulse !== undefined) measured.set(lesson.plant!, Math.min(pulse, measured.get(lesson.plant!) ?? Infinity));
      } finally {
        await session.close();
      }
    }
    expect(Object.fromEntries([...measured].sort(([a], [b]) => (a < b ? -1 : 1)))).toEqual(
      Object.fromEntries(Object.entries(PLANT_PULSES).sort(([a], [b]) => (a < b ? -1 : 1))),
    );
  });
});
