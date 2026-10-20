/**
 * The handlers of the Learn progress channels (LRN-031, LRN-032), as entries of the table in `ipcHandlers.ts`.
 *
 * Each channel takes exactly the shape the store keeps: ids, one exact grade record, one exact lesson note, or the text of
 * a file the learner chose (at most the size the store holds). The store validates again and answers only with the
 * documents of `learnProgressModel.ts`; the renderer validates what it receives the same way. Pure TypeScript over the
 * store handed in, so the table runs under a test with a stand-in.
 */
import { LEARN_PROGRESS_CHANNEL } from './ipcContract.js';
import type { IpcHandler } from './ipcRegistry.js';
import { IPC_DENIED } from './ipcRegistry.js';
import { LEARN_PROGRESS_MAX_BYTES, LEARN_PROGRESS_MAX_LESSONS, isLessonId, parseGradeRecord, parseLessonNote } from '../shared/learnProgressModel.js';
import type { createLearnProgressStore } from './learnProgressStore.js';

type Store = ReturnType<typeof createLearnProgressStore>;

const noArguments = (args: readonly unknown[]): boolean => args.length === 0;
const oneArgument = (check: (value: unknown) => boolean) => (args: readonly unknown[]): boolean => args.length === 1 && check(args[0]);
const isIdList = (value: unknown): boolean => Array.isArray(value) && value.length <= LEARN_PROGRESS_MAX_LESSONS && value.every(isLessonId);
const isImportText = (value: unknown): boolean => typeof value === 'string' && value.length > 0 && new TextEncoder().encode(value).byteLength <= LEARN_PROGRESS_MAX_BYTES;

export function createLearnProgressHandlers<Owner>(getStore: () => Store | null): Record<string, IpcHandler<Owner>> {
  const store = (): Store => {
    const active = getStore();
    if (!active) throw new Error(IPC_DENIED);
    return active;
  };
  return {
    [LEARN_PROGRESS_CHANNEL.READ]: { accepts: noArguments, run: async () => [...await store().read()] },
    [LEARN_PROGRESS_CHANNEL.MERGE]: { accepts: oneArgument(isIdList), run: async (_owner, [ids]) => [...await store().merge(ids as string[])] },
    [LEARN_PROGRESS_CHANNEL.READ_PROGRESS]: { accepts: noArguments, run: () => store().readProgress() },
    [LEARN_PROGRESS_CHANNEL.RECORD_GRADE]: { accepts: oneArgument((record) => parseGradeRecord(record) !== undefined), run: (_owner, [record]) => store().recordGrade(record) },
    [LEARN_PROGRESS_CHANNEL.NOTE_LESSON]: { accepts: oneArgument((note) => parseLessonNote(note) !== undefined), run: (_owner, [note]) => store().noteLesson(parseLessonNote(note)!) },
    [LEARN_PROGRESS_CHANNEL.EXPORT]: { accepts: noArguments, run: () => store().exportProgress() },
    [LEARN_PROGRESS_CHANNEL.IMPORT]: { accepts: oneArgument(isImportText), run: (_owner, [text]) => store().importProgress(text as string) },
  };
}
