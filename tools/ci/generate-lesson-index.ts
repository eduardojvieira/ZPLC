// Generates the one index of lessons (LRN-028) from the lesson packages (LRN-027).
//
//   bun tools/ci/generate-lesson-index.ts                  write packages/zplc-ide/src/generated/lessonIndex.ts and lessonIndex.json
//   bun tools/ci/generate-lesson-index.ts --check          fail when those files are not what the packages produce
//   bun tools/ci/generate-lesson-index.ts --update-hashes  after editing a scenario.json: pin its new hash in the
//                                                          manifest and raise the lesson version by one
//
// Exit 0 when the packages are valid and the file is (or was made) current, 1 otherwise. Every problem is printed.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { canonicalJson } from '../../packages/zplc-ide/src/learn/lessonPackage';
import {
  LESSONS_DIRECTORY,
  buildIndex,
  loadCourse,
  loadLessonPackages,
  renderIndexData,
  renderIndexModule,
  scenarioHash,
  validateCourse,
} from '../../packages/zplc-ide/src/learn/lessonPackageFiles';

const ROOT = resolve(import.meta.dir, '../..');
export const INDEX_FILE = join(ROOT, 'packages/zplc-ide/src/generated/lessonIndex.ts');
export const INDEX_DATA_FILE = join(ROOT, 'packages/zplc-ide/src/generated/lessonIndex.json');

/** Pins the hash of every changed scenario and raises its lesson version. Returns the ids it changed. */
export function updateHashes(lessonsDirectory = LESSONS_DIRECTORY): string[] {
  const changed: string[] = [];
  for (const id of readdirSync(lessonsDirectory)) {
    const directory = join(lessonsDirectory, id);
    if (!statSync(directory).isDirectory() || !existsSync(join(directory, 'lesson.json'))) continue;
    const manifest = JSON.parse(readFileSync(join(directory, 'lesson.json'), 'utf8')) as { version: number; scenario: { file: string; sha256: string } };
    const hash = scenarioHash(JSON.parse(readFileSync(join(directory, manifest.scenario.file), 'utf8')));
    if (hash === manifest.scenario.sha256) continue;
    manifest.scenario.sha256 = hash;
    manifest.version += 1;
    writeFileSync(join(directory, 'lesson.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    changed.push(id);
  }
  return changed;
}

/** The problems of the packages and the text the two index files must hold. */
export function generate(lessonsDirectory = LESSONS_DIRECTORY): { problems: string[]; source: string; data: string } {
  const loaded = loadLessonPackages(lessonsDirectory);
  const { course, problems: courseProblems } = loadCourse(lessonsDirectory);
  const problems = [...loaded.problems, ...courseProblems, ...validateCourse(loaded.packages, course)];
  if (!course) return { problems, source: '', data: '' };
  const built = buildIndex(loaded.packages, course);
  problems.push(...built.problems);
  return { problems, source: renderIndexModule(built.index), data: renderIndexData(built.index) };
}

function main(): number {
  const { values } = parseArgs({ options: { check: { type: 'boolean' }, 'update-hashes': { type: 'boolean' } }, strict: true });
  if (values['update-hashes']) for (const id of updateHashes()) console.log(`pinned the new scenario hash of ${id} and raised its version`);
  const { problems, source, data } = generate();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`lesson packages: ${problem}`);
    return 1;
  }
  const files = [[INDEX_FILE, source], [INDEX_DATA_FILE, data]] as const;
  const stale = files.filter(([path, text]) => !existsSync(path) || readFileSync(path, 'utf8') !== text);
  if (values.check) {
    if (stale.length === 0) { console.log('lesson index is current'); return 0; }
    console.error(`${stale.map(([path]) => relative(ROOT, path)).join(' and ')} out of date with the lesson packages: run \`bun tools/ci/generate-lesson-index.ts\``);
    return 1;
  }
  for (const [path, text] of stale) writeFileSync(path, text);
  console.log(stale.length === 0 ? 'lesson index already current' : `written: ${stale.map(([path]) => relative(ROOT, path)).join(', ')}`);
  return 0;
}

if (import.meta.main) process.exit(main());
// `canonicalJson` is re-exported so the hash rule has one visible definition for other tools.
export { canonicalJson };
