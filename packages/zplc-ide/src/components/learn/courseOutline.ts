/**
 * The rows of the course outline of the Learn activity (GDE-002): the paths, then the modules, each with its lessons, as the flat list
 * of visible rows the tree renders. Pure: the course view (`buildCourseView`) in, the rows out; the open state and the filter are
 * the caller's. While a filter is typed every container that holds a match is shown open and the others are hidden; the open state
 * passed in is left as it was, so clearing the filter puts it back.
 */
import type { CourseLessonView, CourseView, LessonState } from '../../learn/course';
import { flattenTree, type TreeNodeSpec, type TreeRow } from '../../ui/logic/tree';

export const pathNodeId = (id: string): string => `path:${id}`;
export const moduleNodeId = (id: number): string => `module:${id}`;
export const lessonNodeId = (parent: string, lessonId: string): string => `${parent}:lesson:${lessonId}`;

export interface OutlineRow extends TreeRow {
  kind: 'path' | 'module' | 'lesson';
  /** The lesson of a lesson row; null for a path or a module. */
  lessonId: string | null;
  /** The path the row is or sits in; null outside a path. */
  pathId: string | null;
  /** The module the row is or sits in; null inside a path. */
  moduleId: number | null;
  state: LessonState | null;
  /** The titles of the lessons that unlock a locked lesson: its prerequisites, or in a path the lesson before it. */
  unlockedBy: readonly string[];
  current: boolean;
}

export interface OutlineOptions {
  expanded: ReadonlySet<string>;
  filter: string;
  currentLessonId: string | null;
}

type Meta = Omit<OutlineRow, keyof TreeRow>;

export function buildCourseOutlineRows(view: CourseView, { expanded, filter, currentLessonId }: OutlineOptions): OutlineRow[] {
  const query = filter.trim().toLowerCase();
  const matches = (lesson: CourseLessonView) =>
    query === '' || lesson.title.toLowerCase().includes(query) || lesson.id.toLowerCase().includes(query);
  const meta = new Map<string, Meta>();
  const container = (
    id: string,
    kind: 'path' | 'module',
    label: string,
    lessons: readonly CourseLessonView[],
    at: Pick<Meta, 'pathId' | 'moduleId'>,
  ) => {
    meta.set(id, { kind, lessonId: null, ...at, state: null, unlockedBy: [], current: false });
    const children = lessons.filter(matches).map((lesson): TreeNodeSpec => {
      const child = lessonNodeId(id, lesson.id);
      meta.set(child, {
        kind: 'lesson',
        lessonId: lesson.id,
        ...at,
        state: lesson.state,
        unlockedBy: lesson.missing.map((missing) => view.titles[missing] ?? missing),
        current: lesson.id === currentLessonId,
      });
      return { id: child, label: lesson.title };
    });
    return { id, label, children };
  };
  const nodes = [
    ...view.paths.map((path) => container(pathNodeId(path.id), 'path', path.title, path.lessons, { pathId: path.id, moduleId: null })),
    ...view.modules.map((mod) => container(moduleNodeId(mod.id), 'module', mod.title, mod.lessons, { pathId: null, moduleId: mod.id })),
  ].filter((node) => query === '' || node.children.length > 0);
  const open = query === '' ? expanded : new Set(nodes.map((node) => node.id));
  return flattenTree(nodes, open).map((row) => ({ ...row, ...meta.get(row.id)! }));
}

/** What starts open: the module of the current lesson, so the learner sees where they are. */
export function initialExpanded(view: CourseView, currentLessonId: string | null): Set<string> {
  const mod = view.modules.find((candidate) => candidate.lessons.some((lesson) => lesson.id === currentLessonId));
  return new Set(mod ? [moduleNodeId(mod.id)] : []);
}
