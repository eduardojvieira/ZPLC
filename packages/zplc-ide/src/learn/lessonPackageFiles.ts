/**
 * Reads the lesson packages of `packages/zplc-ide/lessons/` from disk (Node only; the application reads the generated
 * index instead). Shared by the generator `tools/ci/generate-lesson-index.ts` and by the lesson CI.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeAddress } from '../boards/boardIoMapping';
import { joinLearnerBoards, validateKit, type LearnerKit } from '../boards/wiring/kit';
import { WIRING_FILE, programWiringProblems, validateWiring, wiringBoardProblems, wiringSafetyProblems, type WiringBoard, type WiringFile } from '../boards/wiring/wiring';
import { validatePlantMap, type PlantMap } from '../plants/plantMap';
import { validateCourseDefinition, validateCoursePlacement, type CourseDefinition } from './courseDefinition';
import {
  canonicalJson,
  expandText,
  parseScenarioFile,
  textShape,
  validateChecks,
  validateManifest,
  validateText,
  type LessonChecks,
  type LessonIndex,
  type LessonIndexEntry,
  type LessonLocale,
  type LessonManifest,
  type LessonText,
  type ScenarioFile,
} from './lessonPackage';

export const LESSONS_DIRECTORY = join(import.meta.dir, '..', '..', 'lessons');
export const PROJECTS_DIRECTORY = join(import.meta.dir, '..', '..', 'projects');
/** The board I/O manifest of the firmware: the one source of the pins of the learner boards (IO-001). */
export const BOARDS_FILE = join(import.meta.dir, '..', '..', '..', '..', 'firmware', 'app', 'boards', 'boards.json');
const LOCALES: readonly LessonLocale[] = ['en', 'es'];

export const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
/** The hash the manifest carries: SHA-256 of the canonical JSON of the scenario. */
export const scenarioHash = (scenario: unknown): string => sha256Hex(canonicalJson(scenario));

export interface LessonPackage {
  id: string;
  directory: string;
  manifest: LessonManifest;
  scenario: ScenarioFile;
  scenarioBytes: string;
  texts: Record<LessonLocale, LessonText>;
  checks: LessonChecks | undefined;
  /** The plant's mapping to the starter's I/O (LRN-021); null for a lesson without a plant. */
  plantMap: PlantMap | null;
  /** The parts of a lesson on the hardware track (LRN-014); null for any other lesson. */
  wiring: WiringFile | null;
}

/**
 * The learner boards of the course: the boards `kit.json` beside the lessons names, with the pins of their supply and
 * ground, and their I/O description from boards.json. A broken kit or board entry is reported and leaves no board.
 */
export function loadLearnerBoards(lessonsDirectory = LESSONS_DIRECTORY, boardsFile = BOARDS_FILE): { kit?: LearnerKit; boards: WiringBoard[]; problems: string[] } {
  const problems: string[] = [];
  const kit = readJson(join(lessonsDirectory, 'kit.json'), problems);
  const manifest = readJson(boardsFile, problems);
  if (problems.length > 0) return { boards: [], problems };
  const invalid = validateKit(kit).map((problem) => `kit.json: ${problem}`);
  if (invalid.length > 0) return { boards: [], problems: invalid };
  return { kit: kit as LearnerKit, ...joinLearnerBoards(kit as LearnerKit, manifest) };
}

/** `AT %QX0.0` of Structured Text and Instruction List, `"address": "%I0.0"` of the Ladder, FBD and SFC documents. */
const LOCATED = /\bAT\s+(%[IQ][XWB]?\d+(?:\.\d)?)|"address"\s*:\s*"(%[IQ][XWB]?\d+(?:\.\d)?)"/gi;

/** The process-image addresses the sources of a project locate, normalized and sorted, and the ones its io.virtual declares. */
export function programAddresses(projectDirectory: string): { addresses: string[]; virtual: string[] } {
  const sources = join(projectDirectory, 'src');
  const found = new Set<string>();
  for (const file of readdirSync(sources).sort()) {
    for (const match of readFileSync(join(sources, file), 'utf8').matchAll(LOCATED)) {
      const address = normalizeAddress(match[1] ?? match[2]!);
      if (address) found.add(address);
    }
  }
  const config = JSON.parse(readFileSync(join(projectDirectory, 'zplc.json'), 'utf8')) as { io?: { virtual?: Array<{ address: string }> } };
  const virtual = (config.io?.virtual ?? []).map((row) => normalizeAddress(row.address)).filter((address): address is string => address !== undefined);
  return { addresses: [...found].sort(), virtual: virtual.sort() };
}

/** Reads and validates `course.json` beside the lesson packages. A missing or broken file is reported and leaves no course. */
export function loadCourse(lessonsDirectory = LESSONS_DIRECTORY): { course: CourseDefinition | undefined; problems: string[] } {
  const file = join(lessonsDirectory, 'course.json');
  if (!existsSync(file)) return { course: undefined, problems: ['course.json: the course file is missing'] };
  const here: string[] = [];
  const raw = readJson(file, here);
  if (here.length > 0) return { course: undefined, problems: here };
  const problems = validateCourseDefinition(raw).map((problem) => `course.json: ${problem}`);
  return { course: problems.length === 0 ? (raw as CourseDefinition) : undefined, problems };
}

export interface LoadedPackages { packages: LessonPackage[]; problems: string[] }

function readJson(path: string, problems: string[]): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { problems.push(`${path}: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
}

/** Loads and validates every package. A broken package is reported by its problems and left out. */
export function loadLessonPackages(lessonsDirectory = LESSONS_DIRECTORY, projectsDirectory = PROJECTS_DIRECTORY): LoadedPackages {
  const problems: string[] = [];
  const packages: LessonPackage[] = [];
  let learnerBoards: ReturnType<typeof loadLearnerBoards> | undefined;
  const directories = readdirSync(lessonsDirectory).filter((name) => statSync(join(lessonsDirectory, name)).isDirectory()).sort();
  for (const id of directories) {
    const directory = join(lessonsDirectory, id);
    const here: string[] = [];
    const manifest = readJson(join(directory, 'lesson.json'), here);
    const manifestProblems = validateManifest(manifest);
    here.push(...manifestProblems.map((problem) => `${id}/lesson.json: ${problem}`));
    if (manifestProblems.length > 0 || manifest === undefined) { problems.push(...here); continue; }
    const typed = manifest as LessonManifest;
    if (typed.id !== id) here.push(`${id}/lesson.json: id "${typed.id}" must equal the directory name`);
    const scenarioRaw = readJson(join(directory, typed.scenario.file), here);
    const scenarioParsed = parseScenarioFile(scenarioRaw);
    here.push(...scenarioParsed.problems.map((problem) => `${id}/${typed.scenario.file}: ${problem}`));
    const texts: Partial<Record<LessonLocale, LessonText>> = {};
    for (const locale of LOCALES) {
      const raw = readJson(join(directory, `text.${locale}.json`), here);
      const textProblems = validateText(raw);
      here.push(...textProblems.map((problem) => `${id}/text.${locale}.json: ${problem}`));
      if (textProblems.length === 0) texts[locale] = raw as LessonText;
    }
    let checks: LessonChecks | undefined;
    if (existsSync(join(directory, 'checks.json'))) {
      const raw = readJson(join(directory, 'checks.json'), here);
      const checkProblems = validateChecks(raw);
      here.push(...checkProblems.map((problem) => `${id}/checks.json: ${problem}`));
      if (checkProblems.length === 0) checks = raw as LessonChecks;
    }
    // LRN-021: a lesson that names a plant ships that plant's mapping next to its starter; one that does not ships none.
    let plantMap: PlantMap | null = null;
    const hasMap = existsSync(join(directory, 'plant-map.json'));
    if (typed.plant !== null && !hasMap) here.push(`${id}: the lesson names the plant "${typed.plant}" but has no plant-map.json`);
    if (typed.plant === null && hasMap) here.push(`${id}: plant-map.json belongs to a lesson that names a plant`);
    if (typed.plant !== null && hasMap) {
      const raw = readJson(join(directory, 'plant-map.json'), here);
      const mapProblems = validatePlantMap(raw);
      here.push(...mapProblems.map((problem) => `${id}/plant-map.json: ${problem}`));
      if (mapProblems.length === 0) {
        plantMap = raw as PlantMap;
        if (plantMap.plant !== typed.plant) here.push(`${id}/plant-map.json: plant "${plantMap.plant}" differs from the manifest plant "${typed.plant}"`);
      }
    }
    // LRN-013, LRN-014: a lesson on the hardware track ships its wiring, which fits both learner boards and its program.
    let wiring: WiringFile | null = null;
    const hasWiring = existsSync(join(directory, WIRING_FILE));
    if (typed.hardware && !hasWiring) here.push(`${id}: the lesson is on the hardware track but has no ${WIRING_FILE}`);
    if (!typed.hardware && hasWiring) here.push(`${id}: ${WIRING_FILE} belongs to a lesson on the hardware track`);
    if (typed.hardware && hasWiring) {
      const raw = readJson(join(directory, WIRING_FILE), here);
      const shape = validateWiring(raw);
      here.push(...shape.map((problem) => `${id}/${WIRING_FILE}: ${problem}`));
      learnerBoards ??= loadLearnerBoards(lessonsDirectory);
      here.push(...learnerBoards.problems);
      if (shape.length === 0 && learnerBoards.problems.length === 0) {
        wiring = raw as WiringFile;
        const solution = join(projectsDirectory, typed.solution.project);
        const fits = [...wiringBoardProblems(wiring, learnerBoards.boards), ...wiringSafetyProblems(wiring, learnerBoards.boards)];
        const program = existsSync(join(solution, 'zplc.json')) ? programAddresses(solution) : undefined;
        const used = fits.length === 0 && program ? programWiringProblems(wiring, learnerBoards.boards, program.addresses, program.virtual) : [];
        here.push(...[...fits, ...used].map((problem) => `${id}/${WIRING_FILE}: ${problem}`));
      }
    }
    const scenario = scenarioParsed.scenario;
    if (scenario) {
      if (scenario.id !== typed.scenario.id) here.push(`${id}: scenario id "${scenario.id}" differs from the manifest "${typed.scenario.id}"`);
      if ((scenario.plant ?? null) !== typed.plant) here.push(`${id}: manifest plant "${typed.plant}" differs from the scenario plant "${scenario.plant ?? null}"`);
      const hash = scenarioHash(scenarioRaw);
      if (hash !== typed.scenario.sha256) here.push(`${id}: scenario hash is ${hash} but the manifest pins ${typed.scenario.sha256}; bump the lesson version and pin the new hash`);
      for (const part of [typed.starter, typed.solution]) {
        const project = join(projectsDirectory, part.project);
        if (!existsSync(join(project, 'zplc.json'))) here.push(`${id}: example project "${part.project}" does not exist`);
        else if (!existsSync(join(project, part.program))) here.push(`${id}: "${part.program}" does not exist in example project "${part.project}"`);
      }
    }
    problems.push(...here);
    if (here.length === 0 && scenario && texts.en && texts.es) {
      packages.push({ id, directory, manifest: typed, scenario, scenarioBytes: canonicalJson(scenarioRaw), texts: { en: texts.en, es: texts.es }, checks, plantMap, wiring });
    }
  }
  return { packages, problems };
}

/** Cross-package rules: unique ids and order, existing and acyclic prerequisites, the same text structure in every language. */
export function validateCourse(packages: readonly LessonPackage[], course?: CourseDefinition): string[] {
  const problems: string[] = course ? validateCoursePlacement(course, packages.map(({ manifest }) => manifest)) : [];
  const ids = new Set(packages.map((item) => item.id));
  const orders = new Map<number, string>();
  for (const { id, manifest } of packages) {
    const other = orders.get(manifest.order);
    if (other) problems.push(`${id}: order ${manifest.order} is also used by ${other}`);
    orders.set(manifest.order, id);
    for (const prerequisite of manifest.prerequisites) if (!ids.has(prerequisite)) problems.push(`${id}: prerequisite "${prerequisite}" is not a lesson`);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) { problems.push(`${id}: prerequisites form a cycle`); return; }
    visiting.add(id);
    for (const prerequisite of packages.find((item) => item.id === id)?.manifest.prerequisites ?? []) if (ids.has(prerequisite)) visit(prerequisite);
    visiting.delete(id);
    done.add(id);
  };
  for (const { id } of packages) visit(id);
  for (const { id, texts } of packages) {
    if (textShape(texts.en) !== textShape(texts.es)) problems.push(`${id}: English and Spanish do not have the same structure (stage keys, hint levels, quoted facts)`);
  }
  return problems;
}

/** The generated index of the packages, in course order, with the text expanded. Problems of expansion are returned. */
export function buildIndex(packages: readonly LessonPackage[], course: CourseDefinition): { index: LessonIndex; problems: string[] } {
  const problems: string[] = [];
  const lessons: LessonIndexEntry[] = [...packages].sort((left, right) => left.manifest.order - right.manifest.order).map(({ id, manifest, scenario, scenarioBytes, texts, plantMap, wiring }) => {
    const expanded = Object.fromEntries(LOCALES.map((locale) => {
      const result = expandText(texts[locale], scenario);
      problems.push(...result.problems.map((problem) => `${id}/text.${locale}.json: ${problem}`));
      return [locale, result.text];
    })) as unknown as LessonIndexEntry['text'];
    return {
      id: manifest.id,
      version: manifest.version,
      order: manifest.order,
      module: manifest.module,
      level: manifest.level,
      prerequisites: manifest.prerequisites,
      languages: manifest.languages,
      tracks: manifest.tracks,
      unsupported: manifest.unsupported,
      plant: manifest.plant,
      plantMap,
      estimatedMinutes: manifest.estimatedMinutes,
      starter: manifest.starter,
      solution: manifest.solution,
      scenario: { id: manifest.scenario.id, path: manifest.scenario.path, sha256: manifest.scenario.sha256, tickMs: scenario.tickMs, durationMs: scenario.durationMs, assertions: scenario.expectations.length, canonical: scenarioBytes },
      regressionScenarios: manifest.regressionScenarios,
      hardware: manifest.hardware && wiring ? { wiring, tolerances: manifest.hardware.tolerances } : null,
      text: expanded,
    };
  });
  return { index: { schemaVersion: 1, lessons, course }, problems };
}

const HEADER = [
  '// GENERATED by tools/ci/generate-lesson-index.ts from packages/zplc-ide/lessons/*/. Do not edit.',
  '// `bun tools/ci/generate-lesson-index.ts --check` fails when this file or lessonIndex.json is out of date with the lesson packages.',
  '// It is the one source of lesson ids (LRN-028): Studio, the progress store and the MCP course resource read it.',
  '// The data is in lessonIndex.json so that this module stays small (IDE-014 measures modules, not data files).',
].join('\n');

/** The exact text of `src/generated/lessonIndex.ts`: the id list and the type, over the data of `lessonIndex.json`. */
export function renderIndexModule(index: LessonIndex): string {
  const ids = index.lessons.map((lesson) => JSON.stringify(lesson.id)).join(',\n  ');
  return `${HEADER}\nimport type { LessonIndex } from '../learn/lessonPackage';\nimport data from './lessonIndex.json';\n\nexport const LESSON_IDS = [\n  ${ids},\n] as const;\n\nexport type LessonId = typeof LESSON_IDS[number];\n\nexport const LESSON_INDEX = data as unknown as LessonIndex;\n`;
}

/** The exact text of `src/generated/lessonIndex.json`. */
export function renderIndexData(index: LessonIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}
