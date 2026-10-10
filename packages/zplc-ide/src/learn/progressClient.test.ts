import { describe, expect, it } from 'bun:test';

import { emptyProgress, exportProgress as exportDocument, withGrade, withNote, type GradeRecord } from '../../electron/learnProgressModel';
import { exportProgress, importProgress, noteLesson, readProgress, recordGrade, type ProgressBridge } from './progressClient';

const HASH = 'a'.repeat(64);
const record: GradeRecord = {
  schemaVersion: 1, lessonId: 'motor-start-stop-safe', lessonVersion: 1, track: 'simulation', scenarioId: 'MotorStartStop', scenarioSha256: HASH, programSha256: HASH,
  runtimeVersion: '1.0.0', time: '2026-10-10T12:00:00.000Z', result: 'passed', assertions: { total: 3, passed: 3 }, failedAssertions: [],
};
const document = withNote(withGrade(emptyProgress(), record), { lessonId: 'edge-counter-pulses', hint: 1 }, '2026-10-10T12:05:00.000Z');

const bridge = (answers: Partial<Record<keyof ProgressBridge, unknown>>): { bridge: ProgressBridge; sent: unknown[] } => {
  const sent: unknown[] = [];
  const answer = (name: keyof ProgressBridge) => async (...args: unknown[]) => { sent.push([name, ...args]); const value = answers[name]; if (value instanceof Error) throw value; return value; };
  return {
    sent,
    bridge: {
      read: answer('read'), merge: answer('merge'), readProgress: answer('readProgress'), recordGrade: answer('recordGrade'),
      noteLesson: answer('noteLesson'), exportProgress: answer('exportProgress'), importProgress: answer('importProgress'),
    } as unknown as ProgressBridge,
  };
};

describe('the Learn progress client validates what the main process answers (LRN-031, LRN-032)', () => {
  it('returns a document only when it is exactly one', async () => {
    expect(await readProgress(bridge({ readProgress: document }).bridge)).toEqual(document);
    expect(await readProgress(bridge({ readProgress: { ...document, extra: 1 } }).bridge)).toBeUndefined();
    expect(await readProgress(bridge({ readProgress: 'x' }).bridge)).toBeUndefined();
    expect(await readProgress(bridge({ readProgress: new Error('denied') }).bridge)).toBeUndefined();
  });

  it('does not send a record or a note that is not exactly one', async () => {
    const { bridge: fake, sent } = bridge({ recordGrade: document, noteLesson: document });
    expect(await recordGrade(fake, { ...record, result: 'failed' })).toBeUndefined();
    expect(await noteLesson(fake, { lessonId: 'motor-start-stop-safe', hint: 3 as 1 })).toBeUndefined();
    expect(sent).toEqual([]);
    expect(await recordGrade(fake, record)).toEqual(document);
    expect(await noteLesson(fake, { lessonId: 'edge-counter-pulses', hint: 1 })).toEqual(document);
    expect(sent).toHaveLength(2);
  });

  it('exports text that is an export and imports only files that are one, with the merged document validated', async () => {
    const text = exportDocument(document);
    expect(await exportProgress(bridge({ exportProgress: text }).bridge)).toBe(text);
    expect(await exportProgress(bridge({ exportProgress: '{"nope":1}' }).bridge)).toBeUndefined();
    const { bridge: fake, sent } = bridge({ importProgress: { progress: document, lessons: 2 } });
    expect(await importProgress(fake, 'not json')).toBeUndefined();
    expect(sent).toEqual([]);
    expect(await importProgress(fake, text)).toEqual({ progress: document, lessons: 2 });
    expect(await importProgress(bridge({ importProgress: { progress: { ...document, last: 7 }, lessons: 2 } }).bridge, text)).toBeUndefined();
    expect(await importProgress(bridge({ importProgress: { progress: document, lessons: -1 } }).bridge, text)).toBeUndefined();
  });
});
