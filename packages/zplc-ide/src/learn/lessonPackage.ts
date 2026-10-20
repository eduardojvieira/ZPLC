/**
 * The lesson package format (LRN-009, LRN-010, LRN-027, LRN-028). A lesson is data: a directory of
 * `packages/zplc-ide/lessons/<id>/` holding
 *
 *   lesson.json     the manifest (this file's `LessonManifest`)
 *   text.en.json    the text of the lesson in English            (`LessonText`)
 *   text.es.json    the same structure in Spanish                (`LessonText`)
 *   scenario.json   the reference scenario the lesson is graded by; its content hash is in the manifest
 *   plant-map.json  a lesson that names a plant: the explicit binding of the plant's signals to the starter's I/O (LRN-021)
 *   wiring.json     a lesson on the hardware track: the parts and the board channels they connect to (src/boards/wiring)
 *   checks.json     optional: wrong programs that must stay RED and other correct programs that must be GREEN
 *
 * The starter and the reference solution are example projects of `projects/` that the manifest names, because the
 * example loader and the workspace copy already serve them from there.
 *
 * This module has no Node import, so the generator, the tests and the application share one validator. Nothing here
 * reads a file: `lessonPackageFiles.ts` does.
 *
 * Quoted facts. The source text marks every time and value a lesson quotes, so that CI can check them against the
 * reference scenario (LRN-025). The generator expands the markup once, at build time, into the plain strings of the
 * generated index: no lesson string is replaced when the application runs (LRN-038).
 *
 *   {{t:250}}                      the time 250 ms; it must lie on the scenario's timeline (a multiple of tickMs, at most durationMs)
 *   {{assertions}}                 the number of assertions of the reference scenario
 *   {{v:Sig=true,Sig2=false@30|X}} shows X; the scenario must assert those values at 30 ms (an AT assertion at 30 ms,
 *                                  or a FOR or ALWAYS assertion that covers it)
 */
import type { PlantMap } from '../plants/plantMap';
import { WIRING_FILE, type WiringFile } from '../boards/wiring/wiring';
import type { CourseDefinition } from './courseDefinition';

export const LESSON_SCHEMA_VERSION = 1 as const;
export const LESSON_STAGE_KEYS = ['objective', 'predict', 'edit', 'run', 'observe', 'reflect'] as const;
export const LESSON_LEVELS = ['foundation', 'intermediate', 'advanced'] as const;
export const LESSON_TRACKS = ['simulation', 'hardware'] as const;
export const LESSON_LANGUAGES = ['ST', 'LD', 'FBD', 'SFC', 'IL'] as const;
export const LESSON_PLANTS = ['motor-v1', 'conveyor-v1', 'tank-v1', 'pedestrian-v1'] as const;
export const LESSON_LOCALES = ['en', 'es'] as const;
/** The two hint levels every lesson offers (LRN-010). */
export const LESSON_HINT_LEVELS = [1, 2] as const;

export type LessonStageKey = typeof LESSON_STAGE_KEYS[number];
export type LessonLevel = typeof LESSON_LEVELS[number];
export type LessonLocale = typeof LESSON_LOCALES[number];

export type LessonLocalizedText = Record<LessonLocale, string>;
export interface LessonUnsupportedTrack { reason: LessonLocalizedText; instead: LessonLocalizedText }

/**
 * The hardware block of a lesson on the hardware track (LRN-013, LRN-024). `timeMs` is how far, in either direction, a
 * sample of a trace recorded from a board may sit from the scenario time an assertion names; `analogPercent` is the
 * deviation an analog value may have, as a percentage of its full scale.
 */
export interface LessonHardware {
  wiring: typeof WIRING_FILE;
  tolerances: { timeMs: number; analogPercent: number };
}
/** The largest time tolerance a lesson may declare: a second is far beyond any scan, and a looser check proves nothing. */
export const MAX_HARDWARE_TIME_TOLERANCE_MS = 1000;
/**
 * The sampling period of the hardware check (LRN-024), derived rather than measured: no board was attached where it was
 * written. The recorder reads the lesson's signals through the Watch read of the serial session, waiting
 * `HARDWARE_SAMPLE_INTERVAL_MS` between reads (Studio's own Watch polling default, `DEFAULT_DEBUG_POLLING_INTERVAL_MS`).
 * One read is at most two `zplc dbg peek` round trips, the input image and the output image, of about 96 characters each
 * at 115200 baud: 2 x 96 x 10 bits / 115200 bit/s = 16.7 ms, budgeted as `HARDWARE_READ_BUDGET_MS`. So a sample follows
 * the one before it by at most `HARDWARE_SAMPLE_PERIOD_MS`.
 */
export const HARDWARE_SAMPLE_INTERVAL_MS = 100;
export const HARDWARE_READ_BUDGET_MS = 20;
export const HARDWARE_SAMPLE_PERIOD_MS = HARDWARE_SAMPLE_INTERVAL_MS + HARDWARE_READ_BUDGET_MS;

/**
 * LRN-024: the time tolerance of a hardware lesson covers one sampling period of the check and one scan of the lesson's
 * program (the interval of its slowest task), or the check can fail a correct program: an output can change up to a scan
 * after its input, and be read up to a period later still.
 */
export function hardwareToleranceProblems(timeMs: number, scanMs: number): string[] {
  const least = HARDWARE_SAMPLE_PERIOD_MS + scanMs;
  return timeMs >= least ? [] : [`manifest.hardware.tolerances.timeMs: ${timeMs} ms is less than one sampling period of the hardware check (${HARDWARE_SAMPLE_PERIOD_MS} ms) plus one scan of the program (${scanMs} ms); it must be at least ${least} ms`];
}

export interface LessonManifest {
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  id: string;
  /** Raised by the author when anything a learner sees or is graded by changes. */
  version: number;
  /** Position in the flat list Learn shows today; the course outline (LRN-007) places lessons by module. */
  order: number;
  module: number;
  level: LessonLevel;
  prerequisites: string[];
  languages: string[];
  tracks: string[];
  /** For each track of the course the lesson does not list: why, and what to do instead, in both languages (LRN-011). */
  unsupported: Partial<Record<string, LessonUnsupportedTrack>>;
  plant: string | null;
  estimatedMinutes: number;
  /** The example project copied into the learner's workspace, and the program of it the learner edits. */
  starter: { project: string; program: string };
  /** The example project that solves the lesson, and the file of it that replaces the starter program. */
  solution: { project: string; program: string };
  scenario: { file: string; id: string; path: string; sha256: string };
  /** Ids of other scenarios the starter ships that stay a regression check. */
  regressionScenarios: string[];
  /** Present exactly when `tracks` lists hardware. */
  hardware?: LessonHardware;
}

export interface LessonStageText { key: string; title: string; body: string; checkpoint: string }
export interface LessonHintText { level: number; text: string }
export interface LessonText {
  schemaVersion: typeof LESSON_SCHEMA_VERSION;
  title: string;
  summary: string;
  scope: string;
  objectives: string[];
  stages: LessonStageText[];
  hints: LessonHintText[];
  faultCases: string[];
}

/** A program the lesson CI replaces files with: `files` maps a project-relative path to its full content. */
export interface LessonProgramCheck { intent: string; files: Record<string, string>; remove?: string[] }
export interface LessonChecks { schemaVersion: typeof LESSON_SCHEMA_VERSION; alsoGreen: LessonProgramCheck[]; wrong: LessonProgramCheck[] }

export interface ScenarioExpectation {
  kind: string;
  atMs?: number;
  fromMs?: number;
  withinMs?: number;
  forMs?: number;
  condition: Record<string, boolean>;
  until?: Record<string, boolean>;
}
export interface ScenarioFile {
  schemaVersion: 1;
  id: string;
  plant?: string;
  tickMs: number;
  durationMs: number;
  events: Array<{ atMs: number; set: Record<string, boolean> }>;
  expectations: ScenarioExpectation[];
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
const isNonNegativeInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isPositiveInt = (value: unknown): value is number => isNonNegativeInt(value) && value > 0;
const ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PROJECT = /^[a-z0-9][a-z0-9_]{0,63}$/;
const PROJECT_PATH = /^(?:src|tests)\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function exactKeys(value: Json, keys: readonly string[], path: string, problems: string[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) problems.push(`${path}: unknown key "${key}"`);
  for (const key of keys) if (!(key in value)) problems.push(`${path}: missing key "${key}"`);
}

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);

const isLocalized = (value: unknown): boolean => isObject(value) && LESSON_LOCALES.every((locale) => isString(value[locale])) && Object.keys(value).length === LESSON_LOCALES.length;

/** LRN-011: a lesson says why, and what to do instead, for exactly the tracks it does not list. */
function validateUnsupported(manifest: Json, problems: string[]): void {
  if (!('unsupported' in manifest)) return;
  const unsupported = manifest.unsupported;
  if (!isObject(unsupported)) { problems.push('manifest.unsupported: must be an object'); return; }
  const listed = isStringArray(manifest.tracks) ? manifest.tracks : [];
  for (const track of LESSON_TRACKS) {
    const entry = unsupported[track];
    if (listed.includes(track)) { if (entry !== undefined) problems.push(`manifest.unsupported: track "${track}" is supported, so it must not have a reason`); continue; }
    if (entry === undefined) { problems.push(`manifest.unsupported: track "${track}" is not supported, so it needs a reason and an instead`); continue; }
    if (!isObject(entry)) { problems.push(`manifest.unsupported.${track}: must be an object`); continue; }
    exactKeys(entry, ['reason', 'instead'], `manifest.unsupported.${track}`, problems);
    for (const key of ['reason', 'instead'] as const) if (key in entry && !isLocalized(entry[key])) problems.push(`manifest.unsupported.${track}.${key}: must be a non-empty string in ${LESSON_LOCALES.join(' and ')}`);
  }
  for (const key of Object.keys(unsupported)) if (!(LESSON_TRACKS as readonly string[]).includes(key)) problems.push(`manifest.unsupported: unknown track "${key}"`);
}

/** LRN-013: a lesson on the hardware track names its wiring and the tolerances of its board check; no other lesson does. */
function validateHardware(manifest: Json, problems: string[]): void {
  const listed = isStringArray(manifest.tracks) && manifest.tracks.includes('hardware');
  const hardware = manifest.hardware;
  if (hardware === undefined) {
    if (listed) problems.push('manifest.hardware: a lesson on the hardware track needs the hardware block (wiring and tolerances)');
    return;
  }
  if (!listed) { problems.push('manifest.hardware: only a lesson on the hardware track has a hardware block'); return; }
  if (!isObject(hardware)) { problems.push('manifest.hardware: must be an object'); return; }
  exactKeys(hardware, ['wiring', 'tolerances'], 'manifest.hardware', problems);
  if ('wiring' in hardware && hardware.wiring !== WIRING_FILE) problems.push(`manifest.hardware.wiring: must be "${WIRING_FILE}"`);
  const tolerances = hardware.tolerances;
  if (!('tolerances' in hardware)) return;
  if (!isObject(tolerances)) { problems.push('manifest.hardware.tolerances: must be an object'); return; }
  exactKeys(tolerances, ['timeMs', 'analogPercent'], 'manifest.hardware.tolerances', problems);
  if ('timeMs' in tolerances && (!isPositiveInt(tolerances.timeMs) || (tolerances.timeMs as number) > MAX_HARDWARE_TIME_TOLERANCE_MS)) problems.push(`manifest.hardware.tolerances.timeMs: must be an integer from 1 to ${MAX_HARDWARE_TIME_TOLERANCE_MS}`);
  const percent = tolerances.analogPercent;
  if ('analogPercent' in tolerances && (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0 || percent > 100)) problems.push('manifest.hardware.tolerances.analogPercent: must be a number above 0 and at most 100');
}

const MANIFEST_KEYS = ['schemaVersion', 'id', 'version', 'order', 'module', 'level', 'prerequisites', 'languages', 'tracks', 'unsupported', 'plant', 'estimatedMinutes', 'starter', 'solution', 'scenario', 'regressionScenarios'];

/** Every problem of a lesson manifest; an empty list means the manifest is valid. */
export function validateManifest(value: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(value)) return ['manifest: must be an object'];
  exactKeys(value, value.hardware === undefined ? MANIFEST_KEYS : [...MANIFEST_KEYS, 'hardware'], 'manifest', problems);
  if (value.schemaVersion !== LESSON_SCHEMA_VERSION) problems.push('manifest.schemaVersion: must be 1');
  if (typeof value.id !== 'string' || !ID.test(value.id)) problems.push('manifest.id: must be a lowercase slug of 3 to 64 characters');
  if (!isPositiveInt(value.version)) problems.push('manifest.version: must be a positive integer');
  if (!isPositiveInt(value.order)) problems.push('manifest.order: must be a positive integer');
  if (!isNonNegativeInt(value.module) || (value.module as number) > 11) problems.push('manifest.module: must be an integer from 0 to 11');
  if (!oneOf(LESSON_LEVELS, value.level)) problems.push(`manifest.level: must be one of ${LESSON_LEVELS.join(', ')}`);
  if (!isStringArray(value.prerequisites) || value.prerequisites.some((id) => !ID.test(id)) || new Set(value.prerequisites).size !== value.prerequisites.length) problems.push('manifest.prerequisites: must be a list of distinct lesson ids');
  if (!isStringArray(value.languages) || value.languages.length === 0 || value.languages.some((language) => !oneOf(LESSON_LANGUAGES, language))) problems.push(`manifest.languages: must list at least one of ${LESSON_LANGUAGES.join(', ')}`);
  if (!isStringArray(value.tracks) || value.tracks.length === 0 || value.tracks.some((track) => !oneOf(LESSON_TRACKS, track))) problems.push(`manifest.tracks: must list at least one of ${LESSON_TRACKS.join(', ')}`);
  validateUnsupported(value, problems);
  validateHardware(value, problems);
  if (value.plant !== null && !oneOf(LESSON_PLANTS, value.plant)) problems.push(`manifest.plant: must be null or one of ${LESSON_PLANTS.join(', ')}`);
  if (!isPositiveInt(value.estimatedMinutes) || (value.estimatedMinutes as number) > 480) problems.push('manifest.estimatedMinutes: must be an integer from 1 to 480');
  for (const part of ['starter', 'solution'] as const) {
    if (!(part in value)) continue;
    const entry = value[part];
    if (!isObject(entry)) { problems.push(`manifest.${part}: must be an object`); continue; }
    exactKeys(entry, ['project', 'program'], `manifest.${part}`, problems);
    if (typeof entry.project !== 'string' || !PROJECT.test(entry.project)) problems.push(`manifest.${part}.project: must be an example project folder name`);
    if (typeof entry.program !== 'string' || !PROJECT_PATH.test(entry.program) || !entry.program.startsWith('src/')) problems.push(`manifest.${part}.program: must be a path under src/`);
  }
  const scenario = value.scenario;
  if (!('scenario' in value)) { /* reported above as a missing key */ } else if (!isObject(scenario)) problems.push('manifest.scenario: must be an object');
  else {
    exactKeys(scenario, ['file', 'id', 'path', 'sha256'], 'manifest.scenario', problems);
    if (scenario.file !== 'scenario.json') problems.push('manifest.scenario.file: must be "scenario.json"');
    if (!isString(scenario.id) || (scenario.id as string).length > 128) problems.push('manifest.scenario.id: must be the scenario id');
    if (typeof scenario.path !== 'string' || !PROJECT_PATH.test(scenario.path) || !scenario.path.startsWith('tests/')) problems.push('manifest.scenario.path: must be a path under tests/');
    if (typeof scenario.sha256 !== 'string' || !SHA256.test(scenario.sha256)) problems.push('manifest.scenario.sha256: must be a lowercase SHA-256');
  }
  if (!isStringArray(value.regressionScenarios)) problems.push('manifest.regressionScenarios: must be a list of scenario ids');
  return problems;
}

/** Every problem of one text file; an empty list means the text is valid. */
export function validateText(value: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(value)) return ['text: must be an object'];
  exactKeys(value, ['schemaVersion', 'title', 'summary', 'scope', 'objectives', 'stages', 'hints', 'faultCases'], 'text', problems);
  if (value.schemaVersion !== LESSON_SCHEMA_VERSION) problems.push('text.schemaVersion: must be 1');
  for (const key of ['title', 'summary', 'scope'] as const) if (!isString(value[key])) problems.push(`text.${key}: must be a non-empty string`);
  if (!isStringArray(value.objectives) || value.objectives.length === 0) problems.push('text.objectives: must list at least one objective');
  if (!isStringArray(value.faultCases) || value.faultCases.length === 0) problems.push('text.faultCases: must list at least one fault');
  const stages = value.stages;
  if (!Array.isArray(stages)) problems.push('text.stages: must be a list');
  else {
    const keys: string[] = [];
    stages.forEach((stage, index) => {
      if (!isObject(stage)) { problems.push(`text.stages[${index}]: must be an object`); return; }
      exactKeys(stage, ['key', 'title', 'body', 'checkpoint'], `text.stages[${index}]`, problems);
      for (const field of ['key', 'title', 'body', 'checkpoint'] as const) if (!isString(stage[field])) problems.push(`text.stages[${index}].${field}: must be a non-empty string`);
      if (typeof stage.key === 'string') keys.push(stage.key);
    });
    if (new Set(keys).size !== keys.length) problems.push('text.stages: keys must be distinct');
    // LRN-010: the six stages, once each and in this order; further stages may sit between them.
    const canonical = keys.filter((key) => (LESSON_STAGE_KEYS as readonly string[]).includes(key));
    if (canonical.join(',') !== LESSON_STAGE_KEYS.join(',')) problems.push(`text.stages: must contain ${LESSON_STAGE_KEYS.join(', ')} once each, in that order`);
  }
  const hints = value.hints;
  if (!Array.isArray(hints)) problems.push('text.hints: must be a list');
  else {
    const levels = hints.map((hint) => isObject(hint) ? hint.level : undefined);
    if (levels.join(',') !== LESSON_HINT_LEVELS.join(',')) problems.push('text.hints: must offer level 1 and level 2, in that order');
    hints.forEach((hint, index) => {
      if (!isObject(hint)) { problems.push(`text.hints[${index}]: must be an object`); return; }
      exactKeys(hint, ['level', 'text'], `text.hints[${index}]`, problems);
      if (!isString(hint.text)) problems.push(`text.hints[${index}].text: must be a non-empty string`);
    });
  }
  return problems;
}

function validateCheckList(value: unknown, path: string, problems: string[]): void {
  if (!Array.isArray(value)) { problems.push(`${path}: must be a list`); return; }
  value.forEach((item, index) => {
    const here = `${path}[${index}]`;
    if (!isObject(item)) { problems.push(`${here}: must be an object`); return; }
    const keys = Object.keys(item).filter((key) => key !== 'remove');
    if (keys.sort().join(',') !== 'files,intent') problems.push(`${here}: must have intent, files and optionally remove`);
    if (!isString(item.intent)) problems.push(`${here}.intent: must be a non-empty string`);
    if (!isObject(item.files) || Object.keys(item.files).length === 0) problems.push(`${here}.files: must map at least one project path to its content`);
    else for (const [file, content] of Object.entries(item.files)) {
      if (!(file === 'zplc.json' || PROJECT_PATH.test(file)) || typeof content !== 'string') problems.push(`${here}.files: "${file}" must be a project path with text content`);
    }
    if ('remove' in item && (!isStringArray(item.remove) || item.remove.some((file) => !PROJECT_PATH.test(file)))) problems.push(`${here}.remove: must be a list of project paths`);
  });
}

export function validateChecks(value: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(value)) return ['checks: must be an object'];
  exactKeys(value, ['schemaVersion', 'alsoGreen', 'wrong'], 'checks', problems);
  if (value.schemaVersion !== LESSON_SCHEMA_VERSION) problems.push('checks.schemaVersion: must be 1');
  validateCheckList(value.alsoGreen, 'checks.alsoGreen', problems);
  validateCheckList(value.wrong, 'checks.wrong', problems);
  if (Array.isArray(value.wrong) && value.wrong.length < 2) problems.push('checks.wrong: at least two wrong programs prove the scenario tells right from wrong');
  return problems;
}

/** The facts of a scenario file the package checks need; the engine validates the rest when it compiles it. */
export function parseScenarioFile(value: unknown): { scenario?: ScenarioFile; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(value)) return { problems: ['scenario: must be an object'] };
  if (value.schemaVersion !== 1) problems.push('scenario.schemaVersion: must be 1');
  if (!isString(value.id)) problems.push('scenario.id: must be a string');
  if (!isPositiveInt(value.tickMs)) problems.push('scenario.tickMs: must be a positive integer');
  if (!isPositiveInt(value.durationMs)) problems.push('scenario.durationMs: must be a positive integer');
  if (value.plant !== undefined && !oneOf(LESSON_PLANTS, value.plant)) problems.push('scenario.plant: unknown plant');
  if (!Array.isArray(value.events)) problems.push('scenario.events: must be a list');
  if (!Array.isArray(value.expectations) || value.expectations.length === 0) problems.push('scenario.expectations: must be a non-empty list');
  else value.expectations.forEach((expectation, index) => {
    if (!isObject(expectation) || typeof expectation.kind !== 'string' || !isObject(expectation.condition)) problems.push(`scenario.expectations[${index}]: must have a kind and a condition`);
  });
  return problems.length > 0 ? { problems } : { scenario: value as unknown as ScenarioFile, problems };
}

/** JSON with sorted keys and no whitespace: the bytes the scenario hash is taken over, the same on every platform. */
export function canonicalJson(value: unknown): string {
  const sorted = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sorted);
    if (isObject(item)) return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sorted(item[key])]));
    return item;
  };
  return JSON.stringify(sorted(value));
}

const MARKUP = /\{\{(assertions|t:\d+|v:[^|}]+\|[^}]*)\}\}/g;
const FILE_CITATION = /\b(?:src|tests)\/[\w.-]*\w/g;

/** Whether the scenario asserts all `pairs` at `at` ms: an AT there, or a FOR or ALWAYS that covers it. */
export function scenarioAssertsAt(scenario: ScenarioFile, pairs: ReadonlyArray<readonly [string, boolean]>, at: number): boolean {
  return scenario.expectations.some((expectation) => {
    const covers = expectation.kind === 'AT' ? expectation.atMs === at
      : expectation.kind === 'FOR' ? expectation.fromMs !== undefined && expectation.forMs !== undefined && at >= expectation.fromMs && at <= expectation.fromMs + expectation.forMs
        : expectation.kind === 'ALWAYS';
    return covers && pairs.every(([signal, value]) => expectation.condition[signal] === value);
  });
}

const onTimeline = (scenario: ScenarioFile, time: number): boolean => time <= scenario.durationMs && time % scenario.tickMs === 0;

/**
 * Expands the markup of one source string against the reference scenario. The plain text is what the generated index
 * carries. Problems name every quoted time or value the scenario does not contain, and any markup left unresolved.
 */
export function expandQuotes(source: string, scenario: ScenarioFile): { text: string; problems: string[] } {
  const problems: string[] = [];
  const text = source.replace(MARKUP, (_match, body: string) => {
    if (body === 'assertions') return String(scenario.expectations.length);
    if (body.startsWith('t:')) {
      const time = Number(body.slice(2));
      if (!onTimeline(scenario, time)) problems.push(`time ${time} ms is not on the timeline of scenario ${scenario.id} (tick ${scenario.tickMs} ms, duration ${scenario.durationMs} ms)`);
      return String(time);
    }
    const bar = body.indexOf('|');
    const spec = body.slice(2, bar);
    const shown = body.slice(bar + 1);
    const at = spec.lastIndexOf('@');
    const time = Number(spec.slice(at + 1));
    const pairs: Array<readonly [string, boolean]> = [];
    for (const part of (at < 0 ? '' : spec.slice(0, at)).split(',')) {
      const [signal, value] = part.split('=');
      if (!signal || (value !== 'true' && value !== 'false')) { problems.push(`value claim "${spec}" is malformed`); return shown; }
      pairs.push([signal, value === 'true']);
    }
    if (at < 0 || !Number.isInteger(time) || pairs.length === 0) problems.push(`value claim "${spec}" is malformed`);
    else if (!scenarioAssertsAt(scenario, pairs, time)) problems.push(`scenario ${scenario.id} does not assert ${pairs.map(([signal, value]) => `${signal}=${value}`).join(', ')} at ${time} ms`);
    return shown;
  });
  if (text.includes('{{') || text.includes('}}')) problems.push(`unresolved markup in "${source}"`);
  return { text, problems };
}

/** Times written as "N ms" in a source string without markup: a quoted time that CI could not check. */
export function unmarkedTimes(source: string): string[] {
  const bare = source.replace(MARKUP, ' ');
  return [...bare.matchAll(/(?<![\w#.])(\d+) ?ms\b/g)].map((match) => match[0]);
}

/** The project files a text cites (`src/...`, `tests/...`). */
export function citedFiles(text: string): string[] {
  return [...new Set(text.match(FILE_CITATION) ?? [])];
}

/** The structure of a text that has to be the same in every language: stage keys, hint levels, counts and markup. */
export function textShape(text: LessonText): string {
  const markup = (value: string): string => (value.match(MARKUP) ?? []).map((item) => item.replace(/\|.*$/, '')).join(' ');
  return JSON.stringify({
    objectives: text.objectives.length,
    faultCases: text.faultCases.length,
    stages: text.stages.map((stage) => [stage.key, markup(stage.body), markup(stage.checkpoint)]),
    hints: text.hints.map((hint) => [hint.level, markup(hint.text)]),
  });
}

export interface LessonTextExpanded {
  title: string;
  summary: string;
  scope: string;
  objectives: string[];
  stages: LessonStageText[];
  hints: LessonHintText[];
  faultCases: string[];
}

/** Expands every string of a text; the problems of all of them are returned together. */
export function expandText(text: LessonText, scenario: ScenarioFile): { text: LessonTextExpanded; problems: string[] } {
  const problems: string[] = [];
  const expand = (source: string): string => {
    const result = expandQuotes(source, scenario);
    problems.push(...result.problems);
    return result.text;
  };
  // Free strings may quote nothing; they may not carry unresolved markup.
  const expanded: LessonTextExpanded = {
    title: expand(text.title),
    summary: expand(text.summary),
    scope: expand(text.scope),
    objectives: text.objectives.map(expand),
    stages: text.stages.map((stage) => ({ key: stage.key, title: expand(stage.title), body: expand(stage.body), checkpoint: expand(stage.checkpoint) })),
    hints: text.hints.map((hint) => ({ level: hint.level, text: expand(hint.text) })),
    faultCases: text.faultCases.map(expand),
  };
  for (const source of [...text.objectives, ...text.stages.flatMap((stage) => [stage.body, stage.checkpoint]), ...text.hints.map((hint) => hint.text)]) {
    for (const time of unmarkedTimes(source)) problems.push(`quoted time "${time}" is not marked with {{t:N}}`);
  }
  return { text: expanded, problems };
}

/** One lesson of the generated index: everything the application reads, with the text already expanded. */
export interface LessonIndexEntry {
  id: string;
  version: number;
  order: number;
  module: number;
  level: LessonLevel;
  prerequisites: readonly string[];
  languages: readonly string[];
  tracks: readonly string[];
  unsupported: Readonly<Partial<Record<string, LessonUnsupportedTrack>>>;
  plant: string | null;
  /** The plant's mapping to the starter's I/O (LRN-021); null for a lesson without a plant. */
  plantMap: PlantMap | null;
  estimatedMinutes: number;
  starter: { readonly project: string; readonly program: string };
  solution: { readonly project: string; readonly program: string };
  scenario: {
    readonly id: string;
    readonly path: string;
    readonly sha256: string;
    readonly tickMs: number;
    readonly durationMs: number;
    readonly assertions: number;
    /** The canonical bytes the hash is taken over (see `canonicalJson`). */
    readonly canonical: string;
  };
  regressionScenarios: readonly string[];
  /** The wiring and the tolerances of the board check (LRN-013, LRN-024); null for a lesson without the hardware track. */
  hardware: { readonly wiring: WiringFile; readonly tolerances: LessonHardware['tolerances'] } | null;
  text: Readonly<Record<LessonLocale, LessonTextExpanded>>;
}

/** The generated index: every lesson, and the course (tracks and modules in order) the lessons are placed in (LRN-005). */
export interface LessonIndex { schemaVersion: typeof LESSON_SCHEMA_VERSION; lessons: readonly LessonIndexEntry[]; course: CourseDefinition }
