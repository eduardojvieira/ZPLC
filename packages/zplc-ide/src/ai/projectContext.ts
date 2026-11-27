/**
 * The context of the open project that the Studio assistant (`electron/aiProvider.ts`) and the MCP read tools (`src/mcp`) share
 * (AIX-001, AIX-002, AI-07): the scene and its plant map, the scenarios and their expectations, after a run the failed checks and
 * the plant facts, the diagnostics with their message, and in a lesson its goal, stage and hints. The caller reads the saved files
 * with its own bounded reader and hands over their parsed values; this module only picks the fields an assistant may see.
 *
 * It never passes on a credential (the manifest goes through `manifestForAssistant`, a scene part's configuration is left out)
 * nor a lesson's solution. Whether solutions are hidden is the second argument, which the caller reads in the main process from
 * `<userData>` (`electron/learnPolicy.ts`); nothing in the input can change it.
 *
 * Pure host module: no store, no i18n, no Electron; relative imports carry `.js` so the main process can load it.
 */
import path from 'node:path';

import { isLessonId } from '../../shared/learnProgressModel.js';
import { visibleHints } from '../../shared/lessonHints.js';
import { manifestForAssistant } from './manifestPrivacy.js';

export interface FailedCheck {
  signal: string;
  expected: unknown;
  observed: unknown;
}
export interface FailedAssertion {
  index: number;
  kind: string;
  atMs: number;
  checks: FailedCheck[];
}
export interface FailedScenario {
  id: string;
  assertions: FailedAssertion[];
}
export interface ContextDiagnostic {
  code?: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
  element?: string;
}

export interface ProjectContextInput {
  /** The parsed `zplc.json`. */
  manifest?: unknown;
  /** The parsed `scene.json` and `plant-map.json`, and the binding problems the caller found against the compiled program. */
  scene?: unknown;
  plantMap?: unknown;
  bindingProblems?: string[];
  /** The scenario files of `tests/`, as `readWorkspaceScenarios` returns them. */
  scenarios?: Array<{ path: string; input: unknown }>;
  /** From the latest run, when the renderer has one. */
  failedScenarios?: FailedScenario[];
  facts?: Record<string, unknown>;
  diagnostics?: ContextDiagnostic[];
  /** The lesson's entry of `LESSON_INDEX`, its text in the interface locale, and the learner's stage. */
  lesson?: { manifest: unknown; text: unknown; stage?: string };
}

export interface ProjectContext {
  manifest?: unknown;
  plant?: {
    scene?: { name: string; parts: Array<{ id: string; name: string; part: string }> };
    signals: Array<Record<string, unknown>>;
    problems: string[];
  };
  scenarios: Array<Record<string, unknown>>;
  failedScenarios?: FailedScenario[];
  facts?: Record<string, unknown>;
  diagnostics: ContextDiagnostic[];
  lesson?: {
    lessonId: string;
    title: string;
    languages: string[];
    goal: string;
    objectives: string[];
    stage?: { key: string; title: string };
    hints: Array<{ level: number; text: string }>;
    solutionsHidden: boolean;
  };
}

/** The bounds of what an assistant or an MCP client is handed: the same on both sides (`MCP_CONTEXT_CAPS`, held equal by a test). */
export const CONTEXT_CAPS = { listItems: 64, textChars: 256, objectKeys: 64, depth: 8 } as const;

/** The value with every list, text, object and depth cut to CONTEXT_CAPS. */
export function capContext(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.slice(0, CONTEXT_CAPS.textChars);
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= CONTEXT_CAPS.depth) return null;
  if (Array.isArray(value)) return value.slice(0, CONTEXT_CAPS.listItems).map((item) => capContext(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, CONTEXT_CAPS.objectKeys)
      .map(([key, item]) => [key.slice(0, CONTEXT_CAPS.textChars), capContext(item, depth + 1)]),
  );
}

const MAX_FAILED_SCENARIOS = 4;
const MAX_FAILED_ASSERTIONS = 8;
const MAX_FAILED_CHECKS = 8;
const MAX_MESSAGE = 256;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
/** Only the listed keys that hold a value. */
const pick = (value: Json, keys: readonly string[]): Json =>
  Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));

/** The lesson id of a workspace that is `<learnWorkspaceRoot>/<lessonId>` itself; undefined for any other folder. */
export function lessonIdOfWorkspace(projectRoot: string, learnWorkspaceRoot: string): string | undefined {
  const relative = path.relative(path.resolve(learnWorkspaceRoot), path.resolve(projectRoot));
  return isLessonId(relative) ? relative : undefined;
}

function plantOf(input: ProjectContextInput): ProjectContext['plant'] {
  if (input.scene === undefined && input.plantMap === undefined) return undefined;
  const scene = isObject(input.scene)
    ? {
        name: text(input.scene.name),
        parts: list(input.scene.parts).map((part) => ({ id: text(part.id), name: text(part.name), part: text(part.part) })),
      }
    : undefined;
  // A scene's map is schema 2 (`learn/sceneRun.ts`): its signals are keyed by name.
  const signals = isObject(input.plantMap) && isObject(input.plantMap.signals) ? input.plantMap.signals : {};
  return {
    ...(scene ? { scene } : {}),
    signals: Object.entries(signals)
      .filter((entry): entry is [string, Json] => isObject(entry[1]))
      .map(([name, signal]) => ({ name, ...pick(signal, ['direction', 'type', 'point', 'range']) })),
    problems: strings(input.bindingProblems),
  };
}

function scenarioOf({ path: file, input }: { path: string; input: unknown }): Json {
  const scenario = isObject(input) ? input : {};
  const scene = isObject(scenario.scene) ? text(scenario.scene.file) : '';
  return {
    ...pick(scenario, ['id']),
    path: file,
    ...pick(scenario, ['tickMs', 'durationMs', 'plant']),
    ...(scene ? { scene } : {}),
    events: Array.isArray(scenario.events) ? scenario.events.length : 0,
    expectations: list(scenario.expectations).map((expectation) => ({
      ...pick(expectation, ['kind', 'atMs', 'fromMs', 'withinMs', 'forMs']),
      signals: [
        ...new Set([
          ...Object.keys(isObject(expectation.condition) ? expectation.condition : {}),
          ...Object.keys(isObject(expectation.until) ? expectation.until : {}),
        ]),
      ],
    })),
  };
}

/** The hints by level, after that rule. */
function hintsOf(value: unknown, solutionsHidden: boolean): Array<{ level: number; text: string }> {
  const hints = list(value)
    .map((hint) => ({ level: typeof hint.level === 'number' ? hint.level : 0, text: text(hint.text) }))
    .sort((a, b) => a.level - b.level);
  return [...visibleHints(hints, solutionsHidden)];
}

function lessonOf(lesson: ProjectContextInput['lesson'], solutionsHidden: boolean): ProjectContext['lesson'] {
  if (!lesson || !isObject(lesson.manifest) || !isLessonId(lesson.manifest.id)) return undefined;
  const content = isObject(lesson.text) ? lesson.text : {};
  const stage = list(content.stages).find((entry) => entry.key === lesson.stage);
  // Whitelisted fields only: the manifest's `solution` and the text's stage bodies never reach the context.
  return {
    lessonId: lesson.manifest.id,
    title: text(content.title),
    languages: strings(lesson.manifest.languages),
    goal: text(content.summary),
    objectives: strings(content.objectives),
    ...(stage ? { stage: { key: text(stage.key), title: text(stage.title) } } : {}),
    hints: hintsOf(content.hints, solutionsHidden),
    solutionsHidden,
  };
}

export function buildProjectContext(input: ProjectContextInput, policy?: { solutionsHidden: boolean } | null): ProjectContext {
  const plant = plantOf(input);
  const lesson = lessonOf(input.lesson, policy?.solutionsHidden !== false);
  return {
    ...(input.manifest !== undefined ? { manifest: manifestForAssistant(input.manifest) } : {}),
    ...(plant ? { plant } : {}),
    scenarios: (input.scenarios ?? []).map(scenarioOf),
    ...(input.failedScenarios
      ? {
          failedScenarios: input.failedScenarios.slice(0, MAX_FAILED_SCENARIOS).map(({ id, assertions }) => ({
            id,
            assertions: assertions.slice(0, MAX_FAILED_ASSERTIONS).map(({ index, kind, atMs, checks }) => ({
              index,
              kind,
              atMs,
              checks: checks.slice(0, MAX_FAILED_CHECKS).map(({ signal, expected, observed }) => ({ signal, expected, observed })),
            })),
          })),
        }
      : {}),
    ...(input.facts ? { facts: Object.fromEntries(Object.entries(input.facts).filter(([name]) => name.startsWith('fact:'))) } : {}),
    diagnostics: (input.diagnostics ?? []).map((diagnostic) => ({
      ...(pick(diagnostic as unknown as Json, ['code', 'path', 'line', 'column', 'element']) as Omit<ContextDiagnostic, 'message'>),
      message: text(diagnostic.message).slice(0, MAX_MESSAGE),
    })),
    ...(lesson ? { lesson } : {}),
  };
}
