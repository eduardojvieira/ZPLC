import { readFileSync } from 'node:fs';
import { es } from '../i18n/es';
import { withEnglishMessages } from '../i18n/inlineMessages';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { learnLessonContentEnV1 } from './learnContent.en.v1';
import { learnLessonContentEsV1 } from './learnContent.es.v1';
import * as learnLesson from './learnLesson';

describe('Learn panel failures', () => {
  it('shows why the exercise could not be copied, in the panel where the action started, and nothing for a cancelled dialog', () => {
    const source = withEnglishMessages(readFileSync(join(import.meta.dir, 'LearnPanel.tsx'), 'utf8'));
    expect(source).toContain("const projectOpenError = useIDEStore((state) => state.projectOpenError);");
    expect(source).toContain("else if (useIDEStore.getState().projectOpenError) setCopyStatus('failed');");
    expect(source).toContain("copyStatus === 'failed' && projectOpenError && <p role=\"alert\" data-learn-copy-error");
    expect(source).toContain('{projectOpenError}</p>');
  });
});

describe('Learn panel contract', () => {
  it('selects either canonical example, copies it only through the folder action, and opens Tests without running anything', () => {
    const source = withEnglishMessages(readFileSync(join(import.meta.dir, 'LearnPanel.tsx'), 'utf8'));
    expect(source).toContain('copyExampleProjectToFolder(lesson.starterExampleId)');
    expect(source).toContain("setActiveConsoleTab('tests')");
    expect(source).toContain('copyingRef.current');
    expect(source).toContain('isFileSystemAccessSupported()');
    // The two choices are the kit's ToggleGroup (aria-pressed, roving focus: ui/kit.test.tsx): one value per lesson, locked while copying.
    expect(source).toContain('<ToggleGroup');
    expect(source).toContain('value={lesson.id}');
    // A locked lesson cannot be chosen (LRN-005); the lesson list is the course order, not the catalog order.
    expect(source).toContain("disabled: candidate.state === 'locked' || copyStatus === 'copying'");
    // The progress is the state shared with the Learn home: a passed run of the recorded scenario passes the lesson once, and nothing is read from storage here.
    expect(source).toContain('useLearnProgress.getState().markPassed(lesson.id)');
    expect(source).toContain('useLearnProgress.getState().recordGrade(record)');
    expect(source).toContain('gradeRecordedScenarioLesson(lesson, workspaceTestPresentation)');
    expect(source).not.toContain('text-white');
    expect(source).not.toContain('<button');
    expect(source).not.toContain('<input');
    expect((source.match(/<ToggleGroup/g) ?? [])).toHaveLength(2);
    expect(source).not.toContain('setTimeout');
    expect(source).not.toContain('clearTimeout');
    expect(es['learn.previouslyCompleted']).toBe('Completada anteriormente');
    expect(source).toContain('Previously completed');
    expect(source).toContain('data-learn-grade={shownGrade.kind}');
    expect(source).toContain('{lesson.scope}');
    expect(source).toContain('aria-live="polite"');
    expect(es['learn.exportProgress']).toBe('Exportar progreso');
    expect(es['learn.importProgress']).toBe('Importar progreso');
    expect(es['learn.faultToCorrect']).toBe('Falla por corregir:');
    expect(es['learn.includedRegressions']).toBe('Regresiones incluidas:');
    expect(source).not.toMatch(/localStorage|workspaceTests\.|runWorkspaceTests|flash|deploy|force|RUN\/STOP|local-first|LLM|mark complete|reset mastery/i);
    // LRN-038: the panel shows the package text as it is; no lesson string goes through a replacement.
    expect(source).not.toMatch(/\.replace(?:All)?\(/);
  });
});

describe('Learn lesson content modules', () => {
  const EXAMPLE_OF_LESSON = {
    'motor-start-stop-safe': 'motor_start_stop',
    'pedestrian-crossing-states': 'pedestrian_crossing',
    'tank-level-fault-reset': 'tank_level',
    'conveyor-classification-jam': 'conveyor_01',
    'blinky-ladder-timer-feedback': 'blinky',
    'motor-plant-feedback': 'motor_plant',
    'edge-counter-pulses': 'edge_counter',
    'scan-cycle-one-scan-memory': 'scan_snapshot',
    'temporal-assertions-jam-fault': 'conveyor_01',
    'conveyor-two-parts-diagnosis': 'conveyor_01',
  };

  it.each([['Spanish', learnLessonContentEsV1], ['English', learnLessonContentEnV1]] as const)('starts each lesson of the %s content from its canonical example', (_language, content) => {
    expect(Object.fromEntries(content.map((lesson): [string, string] => [lesson.id, lesson.exampleId]))).toEqual<Record<string, string>>(EXAMPLE_OF_LESSON);
  });

  it('names the recorded scenario and the title of the two lessons that share the conveyor, in both languages', () => {
    const lesson = (content: typeof learnLessonContentEsV1, id: string) => content.find((candidate) => candidate.id === id);
    expect(lesson(learnLessonContentEsV1, 'temporal-assertions-jam-fault')?.title).toBe('Assertions temporales y falla por atasco');
    expect(lesson(learnLessonContentEnV1, 'temporal-assertions-jam-fault')?.title).toBe('Temporal assertions and jam fault');
    expect(lesson(learnLessonContentEsV1, 'conveyor-two-parts-diagnosis')).toMatchObject({ requiredScenario: 'ConveyorTwoParts', scenarioPath: 'tests/conveyor-two-parts.scenario.json', title: 'Diagnóstico reproducible: dos piezas, una decisión' });
    expect(lesson(learnLessonContentEnV1, 'conveyor-two-parts-diagnosis')).toMatchObject({ requiredScenario: 'ConveyorTwoParts', scenarioPath: 'tests/conveyor-two-parts.scenario.json', title: 'Reproducible diagnosis: two parts, one decision' });
  });

  it('keeps the lesson text in the content modules: the catalog is built from them and no raw catalog is exported', () => {
    expect(Object.keys(learnLesson)).not.toContain('rawLearnLessonCatalog');
    expect(learnLesson.learnLessonCatalog.es.map((lesson) => lesson.title)).toEqual(learnLessonContentEsV1.map((lesson) => lesson.title));
    expect(learnLesson.learnLessonCatalog.en.map((lesson) => lesson.title)).toEqual(learnLessonContentEnV1.map((lesson) => lesson.title));
    expect(learnLessonContentEsV1.find((lesson) => lesson.id === 'motor-start-stop-safe')?.title).toBe('Arranque y parada seguros');
    expect(learnLessonContentEnV1.find((lesson) => lesson.id === 'motor-start-stop-safe')?.title).toBe('Safe motor start-stop');
  });
});
