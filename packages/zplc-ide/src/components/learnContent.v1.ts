import type { LearnLesson, LearnLocale } from './learnLesson';
import type { LessonIndexEntry, LessonLevel, ScenarioFile } from '../learn/lessonPackage';

/**
 * The Learn content contract the panel reads. It is built from the generated lesson index (`src/generated/lessonIndex.ts`,
 * produced from the lesson packages in `lessons/`): this module holds no lesson text, id or scenario of its own, and
 * replaces no string when the application runs (LRN-028, LRN-038).
 */
export const LEARN_CONTENT_SCHEMA_VERSION = 1 as const;

export type VersionedLearnLesson = LearnLesson &
  Readonly<{
    schemaVersion: typeof LEARN_CONTENT_SCHEMA_VERSION;
    locale: LearnLocale;
    /** The example project the learner's workspace is copied from, and the one that holds the reference solution. */
    starterExampleId: string;
    referenceExampleId: string;
    /** The file of the reference solution project, as `src/<file>`. */
    solutionProgram: string;
    visibleScenarioIds: readonly string[];
    /** Scenarios of the same starter that stay a regression check. */
    authorScenarioIds: readonly string[];
    faultCases: readonly string[];
    rubric: Readonly<{ requiredScenarioId: string; minimumAssertions: number; requireSavedEvidence: true }>;
    /** Package metadata (LRN-009). `scenarioSha256` is the content hash the lesson is graded by (LRN-022). */
    version: number;
    scenarioSha256: string;
    module: number;
    level: LessonLevel;
    prerequisites: readonly string[];
    languages: readonly string[];
    tracks: readonly string[];
    plant: string | null;
    estimatedMinutes: number;
    objectives: readonly string[];
    /** Hint texts by level: `hints[0]` is level 1, `hints[1]` level 2. */
    hints: readonly string[];
    /** The key of each stage, parallel to `stages` (objective, predict, edit, run, observe, reflect, and any extra). */
    stageKeys: readonly string[];
    /** The reference scenario the lesson is graded by, as the package carries it (the content `scenarioSha256` names). */
    scenario: ScenarioFile;
  }>;

/** The lesson of one index entry in one language. */
export function learnLessonOf(entry: LessonIndexEntry, locale: LearnLocale): VersionedLearnLesson {
  const text = entry.text[locale];
  return Object.freeze({
    id: entry.id as VersionedLearnLesson['id'],
    exampleId: entry.solution.project,
    requiredScenario: entry.scenario.id,
    sourcePath: entry.starter.program,
    scenarioPath: entry.scenario.path,
    title: text.title,
    summary: text.summary,
    stages: Object.freeze(
      text.stages.map((stage) => Object.freeze({ title: stage.title, body: stage.body, checkpoint: stage.checkpoint })),
    ),
    scope: text.scope,
    schemaVersion: LEARN_CONTENT_SCHEMA_VERSION,
    locale,
    starterExampleId: entry.starter.project,
    referenceExampleId: entry.solution.project,
    solutionProgram: entry.solution.program,
    visibleScenarioIds: Object.freeze([entry.scenario.id]),
    authorScenarioIds: Object.freeze([...entry.regressionScenarios]),
    faultCases: Object.freeze([...text.faultCases]),
    rubric: Object.freeze({
      requiredScenarioId: entry.scenario.id,
      minimumAssertions: entry.scenario.assertions,
      requireSavedEvidence: true as const,
    }),
    version: entry.version,
    scenarioSha256: entry.scenario.sha256,
    module: entry.module,
    level: entry.level,
    prerequisites: Object.freeze([...entry.prerequisites]),
    languages: Object.freeze([...entry.languages]),
    tracks: Object.freeze([...entry.tracks]),
    plant: entry.plant,
    estimatedMinutes: entry.estimatedMinutes,
    objectives: Object.freeze([...text.objectives]),
    hints: Object.freeze(text.hints.map((hint) => hint.text)),
    stageKeys: Object.freeze(text.stages.map((stage) => stage.key)),
    scenario: JSON.parse(entry.scenario.canonical) as ScenarioFile,
  });
}

/** The immutable lessons of one language, in course-list order. */
export function createLearnContentV1(locale: LearnLocale, entries: readonly LessonIndexEntry[]): readonly VersionedLearnLesson[] {
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error(`Invalid Learn ${locale} lesson IDs`);
  return Object.freeze(entries.map((entry) => learnLessonOf(entry, locale)));
}

/** Rejects any locale drift in technical references, rubric, and fault metadata. */
export function validateLearnContentV1(catalog: Readonly<Record<LearnLocale, readonly VersionedLearnLesson[]>>): boolean {
  const [es, en] = [catalog.es, catalog.en];
  if (es.length === 0 || es.length !== en.length) return false;
  return es.every((lesson, index) => {
    const peer = en[index];
    return Boolean(
      peer &&
      lesson.schemaVersion === LEARN_CONTENT_SCHEMA_VERSION &&
      peer.schemaVersion === LEARN_CONTENT_SCHEMA_VERSION &&
      lesson.locale === 'es' &&
      peer.locale === 'en' &&
      lesson.id === peer.id &&
      lesson.sourcePath === peer.sourcePath &&
      lesson.scenarioPath === peer.scenarioPath &&
      lesson.starterExampleId === peer.starterExampleId &&
      lesson.referenceExampleId === peer.referenceExampleId &&
      lesson.version === peer.version &&
      lesson.scenarioSha256 === peer.scenarioSha256 &&
      lesson.stageKeys.join() === peer.stageKeys.join() &&
      lesson.hints.length === peer.hints.length &&
      JSON.stringify(lesson.visibleScenarioIds) === JSON.stringify(peer.visibleScenarioIds) &&
      JSON.stringify(lesson.authorScenarioIds) === JSON.stringify(peer.authorScenarioIds) &&
      JSON.stringify(lesson.rubric) === JSON.stringify(peer.rubric),
    );
  });
}
