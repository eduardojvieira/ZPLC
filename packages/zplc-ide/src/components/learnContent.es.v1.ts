import { LESSON_INDEX } from '../generated/lessonIndex';
import type { LearnLesson, LearnLessonId } from './learnLesson';
import { learnLessonOf } from './learnContent.v1';

/** The Spanish lessons, read from the generated lesson index; the text lives in `lessons/<id>/text.es.json`. */
export const learnLessonContentEsV1: readonly LearnLesson[] = Object.freeze(LESSON_INDEX.lessons.map((entry) => learnLessonOf(entry, 'es')));

export const learnFaultCasesEsV1: Readonly<Record<LearnLessonId, readonly string[]>> = Object.freeze(
  Object.fromEntries(LESSON_INDEX.lessons.map((entry) => [entry.id, entry.text.es.faultCases])) as unknown as Record<LearnLessonId, readonly string[]>,
);
