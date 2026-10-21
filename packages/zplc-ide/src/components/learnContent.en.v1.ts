import { LESSON_INDEX } from '../generated/lessonIndex';
import type { LearnLesson, LearnLessonId } from './learnLesson';
import { learnLessonOf } from './learnContent.v1';

/** The English lessons, read from the generated lesson index; the text lives in `lessons/<id>/text.en.json`. */
export const learnLessonContentEnV1: readonly LearnLesson[] = Object.freeze(
  LESSON_INDEX.lessons.map((entry) => learnLessonOf(entry, 'en')),
);

export const learnFaultCasesEnV1: Readonly<Record<LearnLessonId, readonly string[]>> = Object.freeze(
  Object.fromEntries(LESSON_INDEX.lessons.map((entry) => [entry.id, entry.text.en.faultCases])) as unknown as Record<
    LearnLessonId,
    readonly string[]
  >,
);
