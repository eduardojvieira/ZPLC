import type { WorkspaceTestPresentation } from './workspaceTestPresentation';
import { createLearnContentV1, validateLearnContentV1, type VersionedLearnLesson } from './learnContent.v1';
import { learnLessonContentEsV1 } from './learnContent.es.v1';
import { learnLessonContentEnV1 } from './learnContent.en.v1';

export type LearnLocale = 'es' | 'en';
export type LearnLessonId = 'motor-start-stop-safe' | 'pedestrian-crossing-states' | 'tank-level-fault-reset' | 'conveyor-classification-jam' | 'blinky-ladder-timer-feedback' | 'motor-plant-feedback' | 'edge-counter-pulses' | 'scan-cycle-one-scan-memory' | 'temporal-assertions-jam-fault' | 'conveyor-two-parts-diagnosis';
const canonicalLessonIds: readonly LearnLessonId[] = ['motor-start-stop-safe', 'pedestrian-crossing-states', 'tank-level-fault-reset', 'conveyor-classification-jam', 'blinky-ladder-timer-feedback', 'motor-plant-feedback', 'edge-counter-pulses', 'scan-cycle-one-scan-memory', 'temporal-assertions-jam-fault', 'conveyor-two-parts-diagnosis'];
export const LEARN_MASTERY_STORAGE_KEY = 'zplc:learn-mastery:v1';
const LEARN_MASTERY_MAX_BYTES = 4096;

export type LearnStage = { title: string; body: string; checkpoint: string };

export type LearnLesson = {
  id: LearnLessonId;
  exampleId: 'motor_start_stop' | 'pedestrian_crossing' | 'tank_level' | 'conveyor_01' | 'blinky' | 'motor_plant' | 'edge_counter' | 'scan_snapshot';
  requiredScenario: 'MotorStartStop' | 'PedestrianCrossing' | 'TankLevel' | 'Conveyor01' | 'ConveyorTwoParts' | 'BlinkyVisual' | 'MotorPlant' | 'EdgeCounter' | 'ScanSnapshot';
  sourcePath: 'src/Motor.st' | 'src/PedestrianCrossing.st' | 'src/TankLevel.st' | 'src/Conveyor.st' | 'src/main.ld.json' | 'src/MotorPlant.st' | 'src/EdgeCounter.st' | 'src/ScanSnapshot.st';
  scenarioPath: 'tests/motor-start-stop.scenario.json' | 'tests/pedestrian-crossing.scenario.json' | 'tests/tank-level.scenario.json' | 'tests/conveyor-01.scenario.json' | 'tests/conveyor-two-parts.scenario.json' | 'tests/blinky-visual.scenario.json' | 'tests/motor-plant.scenario.json' | 'tests/edge-counter.scenario.json' | 'tests/scan-snapshot.scenario.json';
  title: string;
  summary: string;
  stages: readonly LearnStage[];
  scope: string;
};

export type LearnLessonGrade =
  | { kind: 'not-run' | 'unavailable' | 'unrelated' }
  | { kind: 'passed' | 'failed'; assertions: number };

const sha256 = /^[a-f0-9]{64}$/;
const savedInputFileCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 3 && value <= 193;

export type LearnMasteryStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function emptyMastery(): Set<LearnLessonId> { return new Set(); }

function isPlainDataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) return false;
    const actual = Object.getOwnPropertyNames(value);
    if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) return false;
    return keys.every((key) => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable); });
  } catch { return false; }
}

function isDenseStringArray(value: unknown): value is string[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) return false;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || !names.includes('length')) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string' || !descriptor.enumerable) return false;
    }
    return true;
  } catch { return false; }
}

function browserMasteryStorage(): LearnMasteryStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}

export function readLearnMastery(storage: LearnMasteryStorage | undefined = browserMasteryStorage()): Set<LearnLessonId> {
  try {
    const raw = storage?.getItem(LEARN_MASTERY_STORAGE_KEY);
    if (raw === null || typeof raw !== 'string' || raw.length > LEARN_MASTERY_MAX_BYTES || new TextEncoder().encode(raw).byteLength > LEARN_MASTERY_MAX_BYTES) return emptyMastery();
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainDataObject(parsed, ['schemaVersion', 'mastered']) || parsed.schemaVersion !== 1 || !isDenseStringArray(parsed.mastered)) return emptyMastery();
    const mastered = parsed.mastered as string[];
    let previousIndex = -1;
    if (mastered.some((id) => { const index = canonicalLessonIds.indexOf(id as LearnLessonId); const invalid = index < 0 || index <= previousIndex; previousIndex = index; return invalid; })) return emptyMastery();
    return new Set<LearnLessonId>(mastered as LearnLessonId[]);
  } catch { return emptyMastery(); }
}

/** Serializes mastery in the one bounded format accepted by storage and import. */
export function serializeLearnMastery(mastered: ReadonlySet<LearnLessonId>): string {
  return JSON.stringify({ schemaVersion: 1, mastered: canonicalLessonIds.filter((id) => mastered.has(id)) });
}

/** Parses a user-selected mastery export only; malformed or unknown data is rejected. */
export function parseLearnMasteryImport(raw: string): Set<LearnLessonId> | undefined {
  if (typeof raw !== 'string' || raw.length > LEARN_MASTERY_MAX_BYTES || new TextEncoder().encode(raw).byteLength > LEARN_MASTERY_MAX_BYTES) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainDataObject(parsed, ['schemaVersion', 'mastered']) || parsed.schemaVersion !== 1 || !isDenseStringArray(parsed.mastered)) return undefined;
    const mastered = parsed.mastered as string[];
    let previousIndex = -1;
    if (mastered.some((id) => { const index = canonicalLessonIds.indexOf(id as LearnLessonId); const invalid = index < 0 || index <= previousIndex; previousIndex = index; return invalid; })) return undefined;
    return new Set(mastered as LearnLessonId[]);
  } catch { return undefined; }
}

export function replaceLearnMastery(next: ReadonlySet<LearnLessonId>, previous: ReadonlySet<LearnLessonId>, storage: LearnMasteryStorage | undefined = browserMasteryStorage()): ReadonlySet<LearnLessonId> {
  if (!storage) return previous;
  const normalized = new Set(canonicalLessonIds.filter((id) => next.has(id)));
  try { storage.setItem(LEARN_MASTERY_STORAGE_KEY, serializeLearnMastery(normalized)); return normalized; } catch { return previous; }
}

export function recordLearnMastery(lessonId: LearnLessonId, grade: LearnLessonGrade, previous: ReadonlySet<LearnLessonId>, storage: LearnMasteryStorage | undefined = browserMasteryStorage()): ReadonlySet<LearnLessonId> {
  if (grade.kind !== 'passed' || previous.has(lessonId) || !storage) return previous;
  return replaceLearnMastery(new Set([...previous, lessonId]), previous, storage);
}

/** Grades only complete, recorded host scenario evidence for the selected lesson. */
export function gradeRecordedScenarioLesson(lesson: VersionedLearnLesson, presentation: WorkspaceTestPresentation | undefined): LearnLessonGrade {
  if (!lesson.rubric.requireSavedEvidence || lesson.rubric.requiredScenarioId !== lesson.requiredScenario) return { kind: 'unavailable' };
  if (!presentation) return { kind: 'not-run' };
  if (presentation.operation !== 'scenario-run') return presentation.operation ? { kind: 'unrelated' } : { kind: 'unavailable' };
  if (!presentation.hasEvidence || presentation.scenarioCount !== 1 || !presentation.preview || !presentation.savedTestInputIdentity) return { kind: 'unavailable' };

  const { preview, savedTestInputIdentity } = presentation;
  if (preview.totalScenarioCount !== 1 || preview.scenarios.length !== 1) return { kind: 'unavailable' };
  const scenario = preview.scenarios[0];
  if (!scenario || scenario.id !== lesson.requiredScenario || scenario.path !== lesson.scenarioPath) return { kind: 'unrelated' };
  if (scenario.truncated || scenario.totalAssertions !== scenario.assertions.length || scenario.totalAssertions < lesson.rubric.minimumAssertions || scenario.totalSamples !== scenario.samples.length || scenario.totalSamples < 1
    || savedTestInputIdentity.schemaVersion !== 1 || !sha256.test(savedTestInputIdentity.sha256) || !savedInputFileCount(savedTestInputIdentity.fileCount)
    || presentation.artifacts.length !== 2 || presentation.artifacts.filter((artifact) => artifact.kind === 'zplc').length !== 1 || presentation.artifacts.filter((artifact) => artifact.kind === 'trace').length !== 1
    || !presentation.artifacts.some((artifact) => artifact.kind === 'zplc' && sha256.test(artifact.sha256) && Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0)
    || !presentation.artifacts.some((artifact) => artifact.kind === 'trace' && artifact.sha256 === preview.traceEvidenceSha256 && sha256.test(artifact.sha256) && Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0)) return { kind: 'unavailable' };

  const assertionsPassed = scenario.passed && scenario.assertions.every((assertion) => assertion.passed);
  if (presentation.kind === 'passed') return presentation.diagnostics.length === 0 && assertionsPassed ? { kind: 'passed', assertions: scenario.assertions.length } : { kind: 'unavailable' };
  if (presentation.kind === 'assertion-failed') return presentation.diagnostics.some((diagnostic) => diagnostic.code === 'SCENARIO_ASSERTION_FAILED') && !assertionsPassed ? { kind: 'failed', assertions: scenario.assertions.length } : { kind: 'unavailable' };
  return { kind: 'unavailable' };
}

export const learnLessonCatalog: Readonly<Record<LearnLocale, readonly VersionedLearnLesson[]>> = Object.freeze({
  es: createLearnContentV1('es', learnLessonContentEsV1),
  en: createLearnContentV1('en', learnLessonContentEnV1),
});

if (!validateLearnContentV1(learnLessonCatalog)) throw new Error('Learn content v1 locale parity failed');
