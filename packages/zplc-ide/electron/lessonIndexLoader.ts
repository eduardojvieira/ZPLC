/**
 * The lesson text for the assistant (AIX-002), read in the main process from the generated lesson index. The main process cannot
 * import `src/generated/lessonIndex.ts` (its JSON import fails under Node ESM), so the JSON file is read at run time: from
 * `<resources>/lessons/lessonIndex.json` in a packaged build (electron-builder `extraResources`), from the source tree otherwise.
 *
 * Only what the assistant may see leaves here: the id and languages, the title, goal, objectives, the title of each stage (never its
 * body) and the hints. The reference solution is not copied. Whether the last hint is shown is decided by `buildProjectContext`.
 * Any failure (a missing, linked, oversized or malformed file, an unknown lesson) answers undefined: no lesson block.
 */
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isLessonId } from '../shared/learnProgressModel.js';

const MAX_INDEX_BYTES = 16 * 1024 * 1024;
type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The index file of a build: next to the application's resources when packaged, in the source tree when not. */
export function lessonIndexPath(options: { isPackaged: boolean; resourcesPath: string; mainDirectory: string }): string {
  return options.isPackaged
    ? path.join(options.resourcesPath, 'lessons', 'lessonIndex.json')
    : path.join(options.mainDirectory, '..', '..', 'src', 'generated', 'lessonIndex.json');
}

export function createLessonLoader(file: string) {
  let index: Promise<Json[] | undefined> | undefined;
  async function load(): Promise<Json[] | undefined> {
    try {
      const status = await lstat(file);
      if (status.isSymbolicLink() || !status.isFile() || status.size > MAX_INDEX_BYTES) return undefined;
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      return isObject(parsed) && Array.isArray(parsed.lessons) ? parsed.lessons.filter(isObject) : undefined;
    } catch {
      return undefined;
    }
  }
  return async (lessonId: string, locale: 'en' | 'es'): Promise<{ manifest: unknown; text: unknown } | undefined> => {
    if (!isLessonId(lessonId)) return undefined;
    index ??= load();
    const entry = (await index)?.find((lesson) => lesson.id === lessonId);
    const texts = entry && isObject(entry.text) ? entry.text : undefined;
    const text = texts && (isObject(texts[locale]) ? texts[locale] : texts.en);
    if (!entry || !isObject(text)) return undefined;
    return {
      manifest: { id: entry.id, languages: entry.languages },
      text: {
        title: text.title,
        summary: text.summary,
        objectives: text.objectives,
        stages: Array.isArray(text.stages) ? text.stages.filter(isObject).map(({ key, title }) => ({ key, title })) : [],
        hints: text.hints,
      },
    };
  };
}
