import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { learnLessonCatalog, parseLearnMasteryImport, serializeLearnMastery } from '../src/components/learnLesson';
import { LEARN_PROGRESS_FILENAME, createLearnProgressStore, parseLearnProgress } from './learnProgressStore';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function fixture(): Promise<string> { const directory = await mkdtemp(join(tmpdir(), 'zplc-learn-progress-')); directories.push(directory); return directory; }

describe('Learn progress main-process store', () => {
  test('writes and reads only the canonical ordered mastery envelope', async () => {
    const directory = await fixture(); const store = createLearnProgressStore(directory);
    await expect(store.merge(['motor-start-stop-safe', 'conveyor-two-parts-diagnosis'])).resolves.toEqual(new Set(['motor-start-stop-safe', 'conveyor-two-parts-diagnosis']));
    await expect(store.read()).resolves.toEqual(new Set(['motor-start-stop-safe', 'conveyor-two-parts-diagnosis']));
    await expect(store.merge(['conveyor-two-parts-diagnosis', 'motor-start-stop-safe'])).rejects.toThrow('Invalid Learn progress');
  });

  test('merges existing and concurrent progress monotonically without overwriting corruption', async () => {
    const directory = await fixture(); const file = join(directory, LEARN_PROGRESS_FILENAME); const store = createLearnProgressStore(directory);
    await writeFile(file, '{"schemaVersion":1,"mastered":["conveyor-two-parts-diagnosis"]}');
    const merged = await store.merge(['motor-start-stop-safe']); expect([...merged]).toEqual(['motor-start-stop-safe', 'conveyor-two-parts-diagnosis']);
    await Promise.all([store.merge(['pedestrian-crossing-states']), store.merge(['tank-level-fault-reset'])]);
    await expect(store.read()).resolves.toEqual(new Set(['motor-start-stop-safe', 'pedestrian-crossing-states', 'tank-level-fault-reset', 'conveyor-two-parts-diagnosis']));
    await writeFile(file, '{broken'); await expect(store.merge(['motor-start-stop-safe'])).rejects.toThrow('Invalid Learn progress');
    await expect(readFile(file, 'utf8')).resolves.toBe('{broken');
  });

  test('fails closed for linked, malformed, and oversized progress files', async () => {
    const directory = await fixture(); const file = join(directory, LEARN_PROGRESS_FILENAME); const store = createLearnProgressStore(directory);
    await expect(store.read()).resolves.toEqual(new Set());
    await writeFile(file, '{"schemaVersion":1,"mastered":["unknown"]}'); await expect(store.read()).rejects.toThrow('Invalid Learn progress');
    await writeFile(file, 'x'.repeat(4097)); await expect(store.read()).rejects.toThrow('Invalid Learn progress');
    await rm(file); await symlink('/etc/passwd', file); await expect(store.read()).rejects.toThrow('Invalid Learn progress');
  });

  test('accepts the renderer envelope for every canonical lesson and rejects the same malformed shapes', () => {
    const ids = learnLessonCatalog.en.map((lesson) => lesson.id);
    const serialized = serializeLearnMastery(new Set(ids));
    expect(parseLearnProgress(serialized)).toEqual(new Set(ids));
    for (const raw of [
      '{"schemaVersion":1,"mastered":["unknown"]}',
      '{"schemaVersion":1,"mastered":["motor-start-stop-safe","motor-start-stop-safe"]}',
      '{"schemaVersion":1,"mastered":["pedestrian-crossing-states","motor-start-stop-safe"]}',
    ]) {
      expect(parseLearnMasteryImport(raw)).toBeUndefined();
      expect(parseLearnProgress(raw)).toBeUndefined();
    }
  });
});
