// The progress the renderer shows (LRN-031, LRN-032) over the real store of the main process: what the learner did is there
// after a restart, an old progress file is migrated, and an import is validated and merged without losing what was kept.
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LEARN_PROGRESS_LEGACY_FILENAME, type GradeRecord } from '../../electron/learnProgressModel';
import { createLearnProgressStore } from '../../electron/learnProgressStore';
import { createProgressState } from './progressState';
import type { ProgressBridge } from './progressClient';

const HASH = 'b'.repeat(64);
const grade = (lessonId: string, time: string): GradeRecord => ({
  schemaVersion: 1, lessonId, lessonVersion: 1, track: 'simulation', scenarioId: 'Scenario', scenarioSha256: HASH, programSha256: HASH,
  runtimeVersion: '1.0.0', time, result: 'passed', assertions: { total: 2, passed: 2 }, failedAssertions: [],
});

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const userData = async (): Promise<string> => { const directory = await mkdtemp(join(tmpdir(), 'zplc-progress-')); directories.push(directory); return directory; };

/** The typed operations of the preload, answered by the store of the main process over a directory. */
const bridgeOver = (directory: string): ProgressBridge => {
  const store = createLearnProgressStore(directory);
  return {
    read: async () => [...await store.read()], merge: async (ids: string[]) => [...await store.merge(ids)], readProgress: () => store.readProgress(),
    recordGrade: (record: unknown) => store.recordGrade(record), noteLesson: (note: never) => store.noteLesson(note), exportProgress: () => store.exportProgress(),
    importProgress: (text: string) => store.importProgress(text),
  } as unknown as ProgressBridge;
};
const stateOver = (directory: string) => createProgressState(() => bridgeOver(directory));

describe('the progress state', () => {
  it('is not loaded before it is read, and an unreadable store is a failure that keeps an empty document', async () => {
    const state = createProgressState(() => ({ readProgress: async () => { throw new Error('denied'); } }) as unknown as ProgressBridge);
    expect(state.getState().loaded).toBe(false);
    await state.getState().load();
    expect(state.getState()).toMatchObject({ loaded: true, failed: true, document: { lessons: {}, last: null } });
  });

  it('keeps what the learner did across a restart: the lesson opened, the hints and the solution shown, and the last lesson', async () => {
    const directory = await userData();
    const first = stateOver(directory);
    await first.getState().load();
    await first.getState().note({ lessonId: 'scan-cycle-one-scan-memory', started: true, last: true });
    await first.getState().note({ lessonId: 'scan-cycle-one-scan-memory', hint: 1 });
    await first.getState().note({ lessonId: 'scan-cycle-one-scan-memory', hint: 2 });
    await first.getState().note({ lessonId: 'scan-cycle-one-scan-memory', solution: true });
    const restarted = stateOver(directory);
    await restarted.getState().load();
    expect(restarted.getState().document?.lessons['scan-cycle-one-scan-memory']).toMatchObject({ state: 'in-progress', hintsShown: [1, 2], solutionShown: true });
    expect(restarted.getState().document?.last?.lessonId).toBe('scan-cycle-one-scan-memory');
  });

  it('records a passing grade and shows the lesson passed, now and after a restart', async () => {
    const directory = await userData();
    const state = stateOver(directory);
    await state.getState().load();
    expect(await state.getState().recordGrade(grade('scan-cycle-one-scan-memory', '2026-10-19T10:00:00.000Z'))).toBe(true);
    expect(state.getState().document?.lessons['scan-cycle-one-scan-memory']?.state).toBe('passed');
    const restarted = stateOver(directory);
    await restarted.getState().load();
    expect(restarted.getState().document?.lessons['scan-cycle-one-scan-memory']?.grade?.time).toBe('2026-10-19T10:00:00.000Z');
  });

  it('migrates the progress file of the first release on its first read, and a corrupt one loses nothing and does not crash', async () => {
    const directory = await userData();
    await writeFile(join(directory, LEARN_PROGRESS_LEGACY_FILENAME), '{"schemaVersion":1,"mastered":["motor-start-stop-safe","tank-level-fault-reset"]}');
    const migrated = stateOver(directory);
    await migrated.getState().load();
    expect(Object.keys(migrated.getState().document!.lessons).sort()).toEqual(['motor-start-stop-safe', 'tank-level-fault-reset']);
    expect(migrated.getState().document?.lessons['motor-start-stop-safe']).toMatchObject({ state: 'passed', grade: null });
    const corrupt = await userData();
    await writeFile(join(corrupt, LEARN_PROGRESS_LEGACY_FILENAME), '{"schemaVersion":1,"mastered":[');
    const survivor = stateOver(corrupt);
    await survivor.getState().load();
    expect(survivor.getState().loaded).toBe(true);
    expect(survivor.getState().document?.lessons).toEqual({});
  });

  it('exports the whole document and merges an import of it: the newest grade is kept and hints are the larger', async () => {
    const source = stateOver(await userData());
    await source.getState().load();
    await source.getState().recordGrade(grade('scan-cycle-one-scan-memory', '2026-10-19T11:00:00.000Z'));
    await source.getState().note({ lessonId: 'blinky-ladder-timer-feedback', hint: 2 });
    const text = await source.getState().exportText();
    expect(typeof text).toBe('string');

    const target = stateOver(await userData());
    await target.getState().load();
    await target.getState().recordGrade(grade('scan-cycle-one-scan-memory', '2026-10-19T09:00:00.000Z'));
    await target.getState().note({ lessonId: 'blinky-ladder-timer-feedback', hint: 1 });
    expect(await target.getState().importText(text!)).toBe(true);
    expect(target.getState().transfer).toBe('imported');
    expect(target.getState().document?.lessons['scan-cycle-one-scan-memory']?.grade?.time).toBe('2026-10-19T11:00:00.000Z');
    expect(target.getState().document?.lessons['blinky-ladder-timer-feedback']?.hintsShown).toEqual([1, 2]);
  });

  it('refuses a malformed or unknown-version file with its reason and leaves the progress as it was', async () => {
    const directory = await userData();
    const state = stateOver(directory);
    await state.getState().load();
    await state.getState().recordGrade(grade('scan-cycle-one-scan-memory', '2026-10-19T10:00:00.000Z'));
    const before = state.getState().document;
    expect(await state.getState().importText('not json')).toBe(false);
    expect(state.getState().transfer).toEqual({ error: 'not-json', version: null });
    expect(await state.getState().importText('{"kind":"zplc-learn-progress","schemaVersion":5,"last":null,"lessons":{}}')).toBe(false);
    expect(state.getState().transfer).toEqual({ error: 'unknown-version', version: 5 });
    expect(state.getState().document).toEqual(before);
    const restarted = stateOver(directory);
    await restarted.getState().load();
    expect(restarted.getState().document).toEqual(before);
  });
});

describe('the progress state without the desktop store (a browser)', () => {
  it('starts empty, keeps the notes in memory, and passes a lesson through the injected local record', async () => {
    const remembered: string[] = [];
    const state = createProgressState(() => undefined, { read: () => new Set(['motor-start-stop-safe']), remember: (id) => { remembered.push(id); } });
    await state.getState().load();
    expect(state.getState().document?.lessons['motor-start-stop-safe']?.state).toBe('passed');
    await state.getState().note({ lessonId: 'blinky-ladder-timer-feedback', hint: 1 });
    expect(state.getState().document?.lessons['blinky-ladder-timer-feedback']?.hintsShown).toEqual([1]);
    expect(await state.getState().markPassed('scan-cycle-one-scan-memory')).toBe(true);
    expect(remembered).toEqual(['scan-cycle-one-scan-memory']);
    expect(state.getState().document?.lessons['scan-cycle-one-scan-memory']?.state).toBe('passed');
  });
});
