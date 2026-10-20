// A progress file the learner chose is refused with a precise reason (LRN-032): too large, not JSON, not a progress file,
// a version this build does not know, or a progress file with a damaged part. Only the right ones are accepted.
import { describe, expect, it } from 'bun:test';
import { emptyProgress, exportProgress, withNote } from '../../electron/learnProgressModel';
import { diagnoseProgressFile } from './progressFile';

const valid = exportProgress(withNote(emptyProgress(), { lessonId: 'motor-start-stop-safe', hint: 1 }, '2026-10-19T10:00:00.000Z'));

describe('diagnosing a progress file', () => {
  it('accepts an export of this version and the progress file of the first release', () => {
    expect(diagnoseProgressFile(valid)).toEqual({ ok: true });
    expect(diagnoseProgressFile('{"schemaVersion":1,"mastered":["motor-start-stop-safe"]}')).toEqual({ ok: true });
  });

  it('says a file is too large, or is not JSON', () => {
    expect(diagnoseProgressFile(`{"a":"${'x'.repeat(300 * 1024)}"}`)).toEqual({ ok: false, problem: 'too-large', version: null });
    expect(diagnoseProgressFile('lesson passed')).toEqual({ ok: false, problem: 'not-json', version: null });
  });

  it('says a JSON file is not a progress file', () => {
    expect(diagnoseProgressFile('{"name":"zplc.json"}')).toEqual({ ok: false, problem: 'not-progress', version: null });
    expect(diagnoseProgressFile('[1,2]')).toEqual({ ok: false, problem: 'not-progress', version: null });
  });

  it('names the version of a progress file this build does not know', () => {
    const future = JSON.stringify({ ...JSON.parse(valid), schemaVersion: 5 });
    expect(diagnoseProgressFile(future)).toEqual({ ok: false, problem: 'unknown-version', version: 5 });
    expect(diagnoseProgressFile('{"schemaVersion":9,"mastered":[]}')).toEqual({ ok: false, problem: 'unknown-version', version: 9 });
  });

  it('says a progress file of a known version with a damaged part is malformed', () => {
    const damaged = JSON.parse(valid) as { lessons: Record<string, { hintsShown: number[] }> };
    damaged.lessons['motor-start-stop-safe']!.hintsShown = [7];
    expect(diagnoseProgressFile(JSON.stringify(damaged))).toEqual({ ok: false, problem: 'malformed', version: 4 });
    expect(diagnoseProgressFile('{"kind":"zplc-learn-progress","schemaVersion":3,"last":null,"lessons":{"x":{}}}')).toEqual({ ok: false, problem: 'malformed', version: 3 });
    expect(diagnoseProgressFile('{"kind":"zplc-learn-progress","schemaVersion":2,"last":null,"lessons":{"x":{}}}')).toEqual({ ok: false, problem: 'malformed', version: 2 });
    expect(diagnoseProgressFile('{"schemaVersion":1,"mastered":["Bad Id"]}')).toEqual({ ok: false, problem: 'malformed', version: 1 });
  });
});
