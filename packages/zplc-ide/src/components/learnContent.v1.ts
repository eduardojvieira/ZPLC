import type { LearnLesson, LearnLessonId, LearnLocale } from './learnLesson';
import { learnFaultCasesEsV1 } from './learnContent.es.v1';
import { learnFaultCasesEnV1 } from './learnContent.en.v1';

/** Stable technical contract shared by the Spanish and English Learn copy. */
export const LEARN_CONTENT_SCHEMA_VERSION = 1 as const;

type TechnicalLesson = Readonly<{
  starterExampleId: LearnLesson['exampleId'] | 'motor_start_stop_starter' | 'pedestrian_crossing_starter' | 'tank_level_starter' | 'conveyor_01_starter' | 'blinky_starter' | 'motor_plant_starter' | 'edge_counter_starter' | 'scan_snapshot_starter' | 'conveyor_two_parts_starter';
  referenceExampleId: LearnLesson['exampleId'];
  authorScenarioIds: readonly LearnLesson['requiredScenario'][];
  faultCaseId: LearnLessonId;
}>;

export const learnTechnicalContentV1: Readonly<Record<LearnLessonId, TechnicalLesson>> = Object.freeze({
  'motor-start-stop-safe': { starterExampleId: 'motor_start_stop_starter', referenceExampleId: 'motor_start_stop', authorScenarioIds: [], faultCaseId: 'motor-start-stop-safe' },
  'pedestrian-crossing-states': { starterExampleId: 'pedestrian_crossing_starter', referenceExampleId: 'pedestrian_crossing', authorScenarioIds: [], faultCaseId: 'pedestrian-crossing-states' },
  'tank-level-fault-reset': { starterExampleId: 'tank_level_starter', referenceExampleId: 'tank_level', authorScenarioIds: [], faultCaseId: 'tank-level-fault-reset' },
  'conveyor-classification-jam': { starterExampleId: 'conveyor_01_starter', referenceExampleId: 'conveyor_01', authorScenarioIds: ['ConveyorTwoParts'], faultCaseId: 'conveyor-classification-jam' },
  'blinky-ladder-timer-feedback': { starterExampleId: 'blinky_starter', referenceExampleId: 'blinky', authorScenarioIds: [], faultCaseId: 'blinky-ladder-timer-feedback' },
  'motor-plant-feedback': { starterExampleId: 'motor_plant_starter', referenceExampleId: 'motor_plant', authorScenarioIds: [], faultCaseId: 'motor-plant-feedback' },
  'edge-counter-pulses': { starterExampleId: 'edge_counter_starter', referenceExampleId: 'edge_counter', authorScenarioIds: [], faultCaseId: 'edge-counter-pulses' },
  'scan-cycle-one-scan-memory': { starterExampleId: 'scan_snapshot_starter', referenceExampleId: 'scan_snapshot', authorScenarioIds: [], faultCaseId: 'scan-cycle-one-scan-memory' },
  'temporal-assertions-jam-fault': { starterExampleId: 'conveyor_01_starter', referenceExampleId: 'conveyor_01', authorScenarioIds: ['ConveyorTwoParts'], faultCaseId: 'temporal-assertions-jam-fault' },
  'conveyor-two-parts-diagnosis': { starterExampleId: 'conveyor_two_parts_starter', referenceExampleId: 'conveyor_01', authorScenarioIds: [], faultCaseId: 'conveyor-two-parts-diagnosis' },
});

export type VersionedLearnLesson = LearnLesson & Readonly<{
  schemaVersion: typeof LEARN_CONTENT_SCHEMA_VERSION;
  locale: LearnLocale;
  starterExampleId: TechnicalLesson['starterExampleId'];
  referenceExampleId: LearnLesson['exampleId'];
  visibleScenarioIds: readonly LearnLesson['requiredScenario'][];
  authorScenarioIds: readonly LearnLesson['requiredScenario'][];
  faultCases: readonly string[];
  rubric: Readonly<{ requiredScenarioId: LearnLesson['requiredScenario']; minimumAssertions: number; requireSavedEvidence: true }>;
}>;

function freezeLesson(locale: LearnLocale, lesson: LearnLesson): VersionedLearnLesson {
  const technical = learnTechnicalContentV1[lesson.id];
  const faultCases = locale === 'es' ? learnFaultCasesEsV1[lesson.id] : learnFaultCasesEnV1[lesson.id];
  if (!technical || !lesson.sourcePath.startsWith('src/') || !lesson.scenarioPath.startsWith('tests/') || faultCases.length === 0) {
    throw new Error(`Invalid Learn content v${LEARN_CONTENT_SCHEMA_VERSION}: ${lesson.id}`);
  }
  return Object.freeze({
    ...lesson,
    stages: Object.freeze(lesson.stages.map((stage) => Object.freeze((stage.title === 'Editá' || stage.title === 'Edit')
      ? { ...stage, body: locale === 'es' ? `Corregí esta omisión del starter y guardá antes de ejecutar: ${faultCases[0]}` : `Correct this starter omission, save it, then run: ${faultCases[0]}`, checkpoint: locale === 'es' ? 'El escenario visible debe pasar con evidencia host guardada.' : 'The visible scenario must pass with saved host evidence.' }
      : { ...stage }))),
    schemaVersion: LEARN_CONTENT_SCHEMA_VERSION,
    locale,
    ...technical,
    visibleScenarioIds: Object.freeze([lesson.requiredScenario]),
    authorScenarioIds: Object.freeze([...technical.authorScenarioIds]),
    faultCases: Object.freeze([...faultCases]),
    rubric: Object.freeze({ requiredScenarioId: lesson.requiredScenario, minimumAssertions: 1, requireSavedEvidence: true }),
  });
}

/** Validates catalog shape and creates immutable locale content at module load. */
export function createLearnContentV1(locale: LearnLocale, lessons: readonly LearnLesson[]): readonly VersionedLearnLesson[] {
  if (lessons.length !== 10 || new Set(lessons.map((lesson) => lesson.id)).size !== 10) throw new Error(`Invalid Learn ${locale} lesson IDs`);
  const content = lessons.map((lesson) => freezeLesson(locale, lesson));
  const ids = Object.keys(learnTechnicalContentV1);
  if (ids.length !== content.length || content.some((lesson, index) => lesson.id !== ids[index])) throw new Error(`Invalid Learn ${locale} lesson order`);
  return Object.freeze(content);
}

/** Rejects any locale drift in technical references, rubric, and fault metadata. */
export function validateLearnContentV1(catalog: Readonly<Record<LearnLocale, readonly VersionedLearnLesson[]>>): boolean {
  const [es, en] = [catalog.es, catalog.en];
  if (es.length !== 10 || en.length !== 10) return false;
  return es.every((lesson, index) => {
    const peer = en[index];
    return Boolean(peer
      && lesson.schemaVersion === LEARN_CONTENT_SCHEMA_VERSION && peer.schemaVersion === LEARN_CONTENT_SCHEMA_VERSION
      && lesson.locale === 'es' && peer.locale === 'en'
      && lesson.id === peer.id && lesson.sourcePath === peer.sourcePath && lesson.scenarioPath === peer.scenarioPath
      && lesson.starterExampleId === peer.starterExampleId && lesson.referenceExampleId === peer.referenceExampleId
      && JSON.stringify(lesson.visibleScenarioIds) === JSON.stringify(peer.visibleScenarioIds)
      && JSON.stringify(lesson.authorScenarioIds) === JSON.stringify(peer.authorScenarioIds)
      && JSON.stringify(lesson.rubric) === JSON.stringify(peer.rubric));
  });
}
