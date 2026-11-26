/**
 * A generated course for the scale tests of the outline (GDE-002): 111 lessons over the modules of the real course, each one a copy
 * of a real entry under a new id titled "Synthetic lesson N", and the paths of lessons/course.json with as many lessons each, taken in
 * order from the generated ones. Every title and id holds "s", so one typed letter opens every path and module.
 */
import { LESSON_INDEX } from '../../generated/lessonIndex';
import type { LessonIndex } from '../../learn/lessonPackage';

export const SYNTHETIC_LESSONS = 111;

export function syntheticCourse(): LessonIndex {
  const template = LESSON_INDEX.lessons[0]!;
  const modules = LESSON_INDEX.course.modules;
  const ids = Array.from({ length: SYNTHETIC_LESSONS }, (_, index) => `synthetic-${index}`);
  let next = 0;
  return {
    ...LESSON_INDEX,
    course: {
      ...LESSON_INDEX.course,
      paths: (LESSON_INDEX.course.paths ?? []).map((path) => ({ ...path, lessons: path.lessons.map(() => ids[next++ % ids.length]!) })),
    },
    lessons: ids.map((id, index) => ({
      ...template,
      id,
      module: modules[index % modules.length]!.id,
      order: index,
      prerequisites: [],
      text: { en: { ...template.text.en, title: `Synthetic lesson ${index}` }, es: { ...template.text.es, title: `Synthetic ${index}` } },
    })),
  };
}

/** The lesson rows of the outline with every path and module open: the generated lessons plus those of the paths. */
export const allOpenLessonRows = (course: LessonIndex): number =>
  course.lessons.length + (course.course.paths ?? []).reduce((sum, path) => sum + path.lessons.length, 0);
