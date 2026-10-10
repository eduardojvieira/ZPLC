import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { learnLessonContentEnV1 } from './learnContent.en.v1';
import { learnLessonContentEsV1 } from './learnContent.es.v1';
import * as learnLesson from './learnLesson';

describe('Learn panel failures', () => {
  it('shows why the exercise could not be copied, in the panel where the action started, and nothing for a cancelled dialog', () => {
    const source = readFileSync(join(import.meta.dir, 'LearnPanel.tsx'), 'utf8');
    expect(source).toContain("const projectOpenError = useIDEStore((state) => state.projectOpenError);");
    expect(source).toContain("else if (useIDEStore.getState().projectOpenError) setCopyStatus('failed');");
    expect(source).toContain("copyStatus === 'failed' && projectOpenError && <p role=\"alert\" data-learn-copy-error");
    expect(source).toContain('{projectOpenError}</p>');
  });
});

describe('Learn panel contract', () => {
  it('selects either canonical example, copies it only through the folder action, and opens Tests without running anything', () => {
    const source = readFileSync(join(import.meta.dir, 'LearnPanel.tsx'), 'utf8');
    expect(source).toContain('copyExampleProjectToFolder(lesson.starterExampleId)');
    expect(source).toContain("setActiveConsoleTab('tests')");
    expect(source).toContain('copyingRef.current');
    expect(source).toContain('isFileSystemAccessSupported()');
    expect(source).toContain('aria-pressed={lessonId === candidate.id}');
    expect(source).toContain("disabled={copyStatus === 'copying'}");
    expect(source).toContain('{candidate.title}');
    expect(source).toContain("setCopyStatus('idle')");
    expect(source).toContain('gradeRecordedScenarioLesson(lesson, workspaceTestPresentation)');
    expect(source).toContain('readLearnMastery()');
    expect(source).toContain("recordLearnMastery(lesson.id, { kind: 'passed', assertions: 0 }, previous)");
    expect(source).toContain('text-[var(--color-surface-900)]');
    expect(source).not.toContain('text-white');
    expect((source.match(/role="group"/g) ?? [])).toHaveLength(2);
    expect(source).not.toContain('setTimeout');
    expect(source).not.toContain('clearTimeout');
    expect(source).toContain('Completada anteriormente');
    expect(source).toContain('Previously completed');
    expect(source).toContain('data-learn-grade={grade.kind}');
    expect(source).toContain('{lesson.scope}');
    expect(source).toContain('serializeLearnMastery(mastered)');
    expect(source).toContain('parseLearnMasteryImport(await file.text())');
    expect(source).toContain(".catch(() => { if (active) { setMasteryStatus('error'); setHydrated(true); } })");
    expect(source).toContain("if (grade.kind !== 'passed' || !hydrated) return;");
    expect(source).toContain('void desktopProgress.merge([...next])');
    expect(source).toContain('file.size > 4096');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('Exportar progreso');
    expect(source).toContain('Importar progreso');
    expect(source).toContain("'Falla a corregir:'");
    expect(source).toContain("'Regresiones incluidas:'");
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
