import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';

export const LEARN_PROGRESS_FILENAME = 'zplc-learn-mastery.v1.json';
const MAX_BYTES = 4096;
const LESSON_IDS = ['motor-start-stop-safe', 'pedestrian-crossing-states', 'tank-level-fault-reset', 'conveyor-classification-jam', 'blinky-ladder-timer-feedback', 'motor-plant-feedback', 'edge-counter-pulses', 'scan-cycle-one-scan-memory', 'temporal-assertions-jam-fault', 'conveyor-two-parts-diagnosis'] as const;
type LearnLessonId = typeof LESSON_IDS[number];
export function parseLearnProgress(raw: string): Set<LearnLessonId> | undefined {
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertyNames(value).sort().join(',') !== 'mastered,schemaVersion') return undefined;
    const record = value as Record<string, unknown>; if (record.schemaVersion !== 1 || !Array.isArray(record.mastered) || Object.getOwnPropertyNames(record.mastered).length !== record.mastered.length + 1) return undefined;
    let previous = -1;
    for (const id of record.mastered) { const index = LESSON_IDS.indexOf(id as LearnLessonId); if (typeof id !== 'string' || index <= previous) return undefined; previous = index; }
    return new Set(record.mastered as LearnLessonId[]);
  } catch { return undefined; }
}
function serialize(ids: ReadonlySet<LearnLessonId>): string { return JSON.stringify({ schemaVersion: 1, mastered: LESSON_IDS.filter((id) => ids.has(id)) }); }

/** Main-process owner for the exact, bounded per-user Learn progress record. */
export function createLearnProgressStore(userDataPath: string) {
  const file = join(userDataPath, LEARN_PROGRESS_FILENAME);
  let pending = Promise.resolve();
  const validDirectory = async (): Promise<boolean> => {
    try { const status = await lstat(userDataPath); return status.isDirectory() && !status.isSymbolicLink(); } catch { return false; }
  };
  const read = async (): Promise<ReadonlySet<LearnLessonId>> => {
    try {
      if (!await validDirectory()) throw new Error('Invalid Learn progress directory');
      const status = await lstat(file);
      if (status.isSymbolicLink() || !status.isFile() || status.size > MAX_BYTES) throw new Error('Invalid Learn progress');
      const raw = await readFile(file, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) throw new Error('Invalid Learn progress');
      const parsed = parseLearnProgress(raw); if (!parsed) throw new Error('Invalid Learn progress');
      return parsed;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return new Set();
      throw error;
    }
  };
  const merge = async (ids: readonly string[]): Promise<ReadonlySet<LearnLessonId>> => {
    const incoming = parseLearnProgress(JSON.stringify({ schemaVersion: 1, mastered: ids }));
    if (!incoming) throw new Error('Invalid Learn progress');
    const write = async () => {
      await mkdir(userDataPath, { recursive: true, mode: 0o700 });
      if (!await validDirectory()) throw new Error('Invalid Learn progress directory');
      const existing = await read();
      const next = new Set(LESSON_IDS.filter((id) => existing.has(id) || incoming.has(id)));
      const data = serialize(next);
      const temporary = join(userDataPath, `.${basename(file)}.${randomUUID()}`);
      try {
        await writeFile(temporary, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        await rename(temporary, file);
        return next;
      } finally { await unlink(temporary).catch(() => undefined); }
    };
    const result = pending.then(write, write); pending = result.then(() => undefined, () => undefined);
    return result;
  };
  return { read, merge };
}
