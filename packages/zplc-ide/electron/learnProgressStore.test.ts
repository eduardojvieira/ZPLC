import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { LEARN_PROGRESS_FILENAME, LEARN_PROGRESS_LEGACY_FILENAME, createLearnProgressStore } from './learnProgressStore';
import { exportProgress, parseProgress, type GradeRecord } from '../shared/learnProgressModel';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-learn-progress-'));
  directories.push(directory);
  return directory;
}

const HASH = 'c'.repeat(64);
function grade(lessonId: string, time: string, overrides: Partial<GradeRecord> = {}): GradeRecord {
  return {
    schemaVersion: 1,
    lessonId,
    lessonVersion: 1,
    track: 'simulation',
    scenarioId: 'Scenario',
    scenarioSha256: HASH,
    programSha256: HASH,
    runtimeVersion: '1.0.0',
    time,
    result: 'passed',
    assertions: { total: 3, passed: 3 },
    failedAssertions: [],
    ...overrides,
  };
}
const at = (iso: string) => () => new Date(iso);

describe('Learn progress main-process store (LRN-031, LRN-032)', () => {
  test('keeps the first release operations: pass lessons by id and read them back', async () => {
    const directory = await fixture();
    const store = createLearnProgressStore(directory);
    await expect(store.read()).resolves.toEqual(new Set());
    await expect(store.merge(['motor-start-stop-safe', 'conveyor-two-parts-diagnosis'])).resolves.toEqual(
      new Set(['motor-start-stop-safe', 'conveyor-two-parts-diagnosis']),
    );
    await expect(store.merge(['conveyor-two-parts-diagnosis', 'edge-counter-pulses'])).resolves.toEqual(
      new Set(['motor-start-stop-safe', 'conveyor-two-parts-diagnosis', 'edge-counter-pulses']),
    );
    await expect(store.merge(['Not An Id'])).rejects.toThrow('Invalid Learn progress');
    await expect(store.merge(['x'.repeat(200)])).rejects.toThrow('Invalid Learn progress');
  });

  test('survives a restart: a new store over the same directory reads the grade records, hints and last lesson', async () => {
    const directory = await fixture();
    const first = createLearnProgressStore(directory, at('2026-10-10T10:00:00.000Z'));
    await first.noteLesson({ lessonId: 'motor-start-stop-safe', started: true });
    await first.noteLesson({ lessonId: 'motor-start-stop-safe', hint: 2 });
    await first.recordGrade(grade('motor-start-stop-safe', '2026-10-10T10:30:00.000Z'));
    await first.noteLesson({ lessonId: 'edge-counter-pulses', solution: true });
    const second = createLearnProgressStore(directory);
    const progress = await second.readProgress();
    expect(progress.last).toEqual({ lessonId: 'edge-counter-pulses', at: '2026-10-10T10:00:00.000Z' });
    expect(progress.lessons['motor-start-stop-safe']).toMatchObject({
      state: 'passed',
      hintsShown: [2],
      solutionShown: false,
      startedAt: '2026-10-10T10:00:00.000Z',
      passedAt: '2026-10-10T10:30:00.000Z',
    });
    expect(progress.lessons['motor-start-stop-safe']!.grade!.programSha256).toBe(HASH);
    expect(progress.lessons['edge-counter-pulses']).toMatchObject({ state: 'in-progress', solutionShown: true });
    expect(parseProgress(await readFile(join(directory, LEARN_PROGRESS_FILENAME), 'utf8'))).toEqual(progress);
  });

  test('migrates the progress file of the first release on upgrade and leaves that file alone', async () => {
    const directory = await fixture();
    const legacy = '{"schemaVersion":1,"mastered":["motor-start-stop-safe","pedestrian-crossing-states"]}';
    await writeFile(join(directory, LEARN_PROGRESS_LEGACY_FILENAME), legacy);
    const store = createLearnProgressStore(directory);
    // Before any change the new file does not exist, and the migrated lessons are already visible.
    expect([...(await store.read())]).toEqual(['motor-start-stop-safe', 'pedestrian-crossing-states']);
    expect((await readdir(directory)).includes(LEARN_PROGRESS_FILENAME)).toBe(false);
    await store.recordGrade(grade('edge-counter-pulses', '2026-10-10T10:30:00.000Z'));
    const progress = await store.readProgress();
    expect(Object.keys(progress.lessons).sort()).toEqual(['edge-counter-pulses', 'motor-start-stop-safe', 'pedestrian-crossing-states']);
    expect(progress.lessons['motor-start-stop-safe']).toMatchObject({ state: 'passed', grade: null });
    expect(await readFile(join(directory, LEARN_PROGRESS_LEGACY_FILENAME), 'utf8')).toBe(legacy);
    // A pass that has a grade record replaces the migrated one without losing it.
    await store.recordGrade(grade('motor-start-stop-safe', '2026-10-11T08:00:00.000Z'));
    expect((await store.readProgress()).lessons['motor-start-stop-safe']!.grade!.time).toBe('2026-10-11T08:00:00.000Z');
  });

  test('merges existing and concurrent progress monotonically without overwriting corruption', async () => {
    const directory = await fixture();
    const file = join(directory, LEARN_PROGRESS_FILENAME);
    const store = createLearnProgressStore(directory);
    await store.merge(['conveyor-two-parts-diagnosis']);
    const merged = await store.merge(['motor-start-stop-safe']);
    expect([...merged].sort()).toEqual(['conveyor-two-parts-diagnosis', 'motor-start-stop-safe']);
    await Promise.all([
      store.merge(['pedestrian-crossing-states']),
      store.merge(['tank-level-fault-reset']),
      store.recordGrade(grade('edge-counter-pulses', '2026-10-10T10:30:00.000Z')),
    ]);
    expect([...(await store.read())].sort()).toEqual([
      'conveyor-two-parts-diagnosis',
      'edge-counter-pulses',
      'motor-start-stop-safe',
      'pedestrian-crossing-states',
      'tank-level-fault-reset',
    ]);
    await writeFile(file, '{broken');
    await expect(store.merge(['motor-start-stop-safe'])).rejects.toThrow('Invalid Learn progress');
    await expect(readFile(file, 'utf8')).resolves.toBe('{broken');
  });

  test('fails closed for linked, malformed, and oversized progress files', async () => {
    const directory = await fixture();
    const file = join(directory, LEARN_PROGRESS_FILENAME);
    const store = createLearnProgressStore(directory);
    await expect(store.read()).resolves.toEqual(new Set());
    await writeFile(file, '{"schemaVersion":2,"last":null,"lessons":{"Unknown Lesson":{}}}');
    await expect(store.read()).rejects.toThrow('Invalid Learn progress');
    await writeFile(file, 'x'.repeat(300 * 1024));
    await expect(store.read()).rejects.toThrow('Invalid Learn progress');
    await rm(file);
    await symlink('/etc/passwd', file);
    await expect(store.read()).rejects.toThrow('Invalid Learn progress');
    await rm(file);
    await writeFile(join(directory, LEARN_PROGRESS_LEGACY_FILENAME), '{"schemaVersion":1,"mastered":["Bad Id"]}');
    await expect(store.read()).rejects.toThrow('Invalid Learn progress');
  });

  test('refuses a forged grade record and writes nothing', async () => {
    const directory = await fixture();
    const store = createLearnProgressStore(directory);
    await expect(
      store.recordGrade(grade('motor-start-stop-safe', '2026-10-10T10:30:00.000Z', { assertions: { total: 3, passed: 1 } })),
    ).rejects.toThrow('Invalid Learn progress');
    await expect(store.recordGrade({ lessonId: 'motor-start-stop-safe' })).rejects.toThrow('Invalid Learn progress');
    await expect(store.noteLesson({ lessonId: 'motor-start-stop-safe', hint: 3 as 1 })).rejects.toThrow('Invalid Learn progress');
    expect(await readdir(directory)).toEqual([]);
  });

  test('exports progress to a file and imports it into another profile with validation and merge', async () => {
    const source = createLearnProgressStore(await fixture(), at('2026-10-10T10:00:00.000Z'));
    await source.recordGrade(grade('motor-start-stop-safe', '2026-10-10T12:00:00.000Z', { programSha256: 'd'.repeat(64) }));
    await source.noteLesson({ lessonId: 'edge-counter-pulses', hint: 1 });
    await source.merge(['lesson-from-a-newer-build']);
    const exported = await source.exportProgress();

    const target = createLearnProgressStore(await fixture(), at('2026-10-11T10:00:00.000Z'));
    await target.recordGrade(grade('motor-start-stop-safe', '2026-10-09T09:00:00.000Z'));
    await target.noteLesson({ lessonId: 'edge-counter-pulses', hint: 2 });
    const result = await target.importProgress(exported);
    expect(result.lessons).toBe(3);
    const progress = await target.readProgress();
    // The newest grade wins, the larger hint level wins, and the lesson this build does not know is kept.
    expect(progress.lessons['motor-start-stop-safe']!.grade!.programSha256).toBe('d'.repeat(64));
    expect(progress.lessons['edge-counter-pulses']!.hintsShown).toEqual([1, 2]);
    expect(progress.lessons['lesson-from-a-newer-build']).toMatchObject({ state: 'passed', grade: null });
    // A file of the first release is accepted too; a damaged one changes nothing.
    await target.importProgress('{"schemaVersion":1,"mastered":["tank-level-fault-reset"]}');
    expect((await target.readProgress()).lessons['tank-level-fault-reset']).toMatchObject({ state: 'passed' });
    const before = JSON.stringify(await target.readProgress());
    await expect(target.importProgress(exported.replace('"state":"passed"', '"state":"bogus"'))).rejects.toThrow(
      'Invalid Learn progress file',
    );
    await expect(target.importProgress('not json')).rejects.toThrow('Invalid Learn progress file');
    expect(JSON.stringify(await target.readProgress())).toBe(before);
    expect(exported).toBe(exportProgress(await source.readProgress()));
  });
});
