/**
 * The course as data (LRN-005, LRN-007, LRN-011, LRN-027): `lessons/course.json` holds the tracks and the modules in order,
 * each with a level, the module it requires and the tracks it offers. A lesson says which module it belongs to in its own
 * manifest, so adding a lesson changes no file of this one. The generator validates the file and the placement of every
 * lesson in it, and embeds it in the generated lesson index; the application reads it from there.
 *
 * No Node import: the generator, the tests and the application share this validator. Nothing here is repaired; a file that is
 * not exactly the format is reported by every problem it has.
 */
import { LESSON_LEVELS, LESSON_LOCALES, LESSON_TRACKS, type LessonLevel, type LessonLocale } from './lessonPackage';

export const COURSE_SCHEMA_VERSION = 1 as const;

export type LocalizedText = Readonly<Record<LessonLocale, string>>;
/** What a lesson that does not support the track shows: why, and what to do instead (LRN-011). */
export interface CourseTrack { id: string; title: LocalizedText; summary: LocalizedText; unsupported: { reason: LocalizedText; instead: LocalizedText } }
/** `why` says to the learner why the module sits where it does in the course (LRN-006). */
export interface CourseModule { id: number; level: LessonLevel; requires: number | null; tracks: readonly string[]; title: LocalizedText; why: LocalizedText }
/** `rationale` is the short "why this order" of the whole course that Learn and the course outline show (LRN-006). */
export interface CourseDefinition { schemaVersion: typeof COURSE_SCHEMA_VERSION; rationale: LocalizedText; tracks: readonly CourseTrack[]; modules: readonly CourseModule[] }
/** The part of a lesson manifest the placement rules read. */
export interface PlacedLesson { id: string; module: number; level: string; prerequisites: readonly string[]; tracks: readonly string[] }

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const unknownKeys = (value: Json, allowed: readonly string[]): string[] => Object.keys(value).filter((key) => !allowed.includes(key));

function checkText(value: unknown, where: string, problems: string[]): void {
  if (!isObject(value)) { problems.push(`${where}: must be an object with a text for each of ${LESSON_LOCALES.join(' and ')}`); return; }
  for (const key of unknownKeys(value, LESSON_LOCALES)) problems.push(`${where}: unknown language "${key}"`);
  for (const locale of LESSON_LOCALES) if (typeof value[locale] !== 'string' || value[locale].trim() === '') problems.push(`${where}: the ${locale} text is missing`);
}

/** Every problem of a course file as read from disk; empty when it is exactly the format. */
export function validateCourseDefinition(value: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(value)) return ['the course file must be an object'];
  for (const key of unknownKeys(value, ['schemaVersion', 'rationale', 'tracks', 'modules'])) problems.push(`unknown key "${key}"`);
  if (value.schemaVersion !== COURSE_SCHEMA_VERSION) problems.push(`schemaVersion must be ${COURSE_SCHEMA_VERSION}`);
  checkText(value.rationale, 'course rationale', problems);
  const trackIds: string[] = [];
  if (!Array.isArray(value.tracks) || value.tracks.length === 0) problems.push('tracks must be a non-empty list');
  else for (const track of value.tracks as unknown[]) {
    if (!isObject(track)) { problems.push('a track must be an object'); continue; }
    const id = track.id;
    const where = `track ${typeof id === 'string' ? id : '?'}`;
    for (const key of unknownKeys(track, ['id', 'title', 'summary', 'unsupported'])) problems.push(`${where}: unknown key "${key}"`);
    if (typeof id !== 'string' || !(LESSON_TRACKS as readonly string[]).includes(id)) problems.push(`${where}: id must be one of ${LESSON_TRACKS.join(', ')}`);
    else if (trackIds.includes(id)) problems.push(`${where}: defined twice`);
    else trackIds.push(id);
    checkText(track.title, `${where} title`, problems);
    checkText(track.summary, `${where} summary`, problems);
    const unsupported = track.unsupported;
    if (!isObject(unsupported)) { problems.push(`${where}: unsupported must hold a reason and an instead`); continue; }
    for (const key of unknownKeys(unsupported, ['reason', 'instead'])) problems.push(`${where}: unsupported has unknown key "${key}"`);
    checkText(unsupported.reason, `${where} reason`, problems);
    checkText(unsupported.instead, `${where} instead`, problems);
  }
  if (!Array.isArray(value.modules) || value.modules.length === 0) { problems.push('modules must be a non-empty list'); return problems; }
  const modules = value.modules as unknown[];
  const ids = modules.map((module) => (isObject(module) ? module.id : undefined));
  if (!ids.every((id, index) => id === index)) problems.push('module ids must be 0, 1, 2 ... in order, with none missing');
  let previousLevel = -1;
  modules.forEach((module, index) => {
    if (!isObject(module)) { problems.push(`module ${index}: must be an object`); return; }
    const where = `module ${index}`;
    for (const key of unknownKeys(module, ['id', 'level', 'requires', 'tracks', 'title', 'why'])) problems.push(`${where}: unknown key "${key}"`);
    const level = (LESSON_LEVELS as readonly unknown[]).indexOf(module.level);
    if (level < 0) problems.push(`${where}: level must be one of ${LESSON_LEVELS.join(', ')}`);
    else if (level < previousLevel) problems.push(`${where}: level ${String(module.level)} comes after a higher level; levels never go back`);
    else previousLevel = level;
    const requires = module.requires;
    if (requires !== null && !(typeof requires === 'number' && Number.isInteger(requires) && requires >= 0 && requires < index)) problems.push(`${where}: requires must be null or the number of an earlier module`);
    if (index === 0 && requires !== null) problems.push(`${where}: the first module requires none`);
    if (index > 0 && requires === null) problems.push(`${where}: requires an earlier module`);
    const offered = module.tracks;
    if (!Array.isArray(offered) || offered.length === 0) problems.push(`${where}: tracks must be a non-empty list`);
    else for (const track of offered) if (!trackIds.includes(track as string)) problems.push(`${where}: track "${String(track)}" is not defined by the course`);
    checkText(module.title, `${where} title`, problems);
    checkText(module.why, `${where} why`, problems);
  });
  return problems;
}

/** The rules that keep every lesson inside the course: its module exists, its level and tracks fit it, prerequisites do not look ahead. */
export function validateCoursePlacement(course: CourseDefinition, lessons: readonly PlacedLesson[]): string[] {
  const problems: string[] = [];
  const modules = new Map(course.modules.map((module) => [module.id, module]));
  const moduleOf = new Map(lessons.map((lesson) => [lesson.id, lesson.module]));
  for (const lesson of lessons) {
    const module = modules.get(lesson.module);
    if (!module) { problems.push(`${lesson.id}: module ${lesson.module} is not in the course`); continue; }
    if (lesson.level !== module.level) problems.push(`${lesson.id}: level ${lesson.level} differs from the level ${module.level} of module ${module.id}`);
    for (const track of lesson.tracks) if (!module.tracks.includes(track)) problems.push(`${lesson.id}: track ${track} is not offered by module ${module.id}`);
    for (const prerequisite of lesson.prerequisites) {
      const there = moduleOf.get(prerequisite);
      if (there !== undefined && there > lesson.module) problems.push(`${lesson.id}: prerequisite ${prerequisite} is in module ${there}, later than module ${lesson.module}`);
    }
  }
  return problems;
}
