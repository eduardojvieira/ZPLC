import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupDom, stubProjectLoader } from '../test/dom';
import { compileMultiTaskProject, type DebugMap } from '../compiler';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { getLanguageFromFilename } from '../types';

const dom = await setupDom();
await stubProjectLoader();
const { PlantDocument } = await import('./PlantDocument');
const { useIDEStore } = await import('../store/useIDEStore');
const { useWorkspaceTestResult } = await import('./workspaceTestResult');
const { usePlantDocument } = await import('../store/usePlantDocument');
const { useShellCommands } = await import('../commands/useCommandHost');
const { runCommand, resetCommandsForTest } = await import('../commands/bus');

const Host = () => {
  useShellCommands();
  return null;
};

beforeAll(() => {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

/** The starter of the first lesson that names the motor plant, compiled as its project names it: the debug map the live plant binds to. */
function motorLessonDebugMap(): DebugMap {
  const lesson = LESSON_INDEX.lessons.find((item) => item.plant === 'motor-v1')!;
  const folder = join(import.meta.dir, '../../projects', lesson.starter.project);
  const source = readFileSync(join(folder, lesson.starter.program), 'utf8');
  const project = JSON.parse(readFileSync(join(folder, 'zplc.json'), 'utf8'));
  const program = project.tasks[0].programs[0] as string;
  return compileMultiTaskProject(project, [
    { name: program, content: source, language: getLanguageFromFilename(lesson.starter.program), sourceRef: lesson.starter.program },
  ]).debugMap as unknown as DebugMap;
}

const recordedMotorRun = {
  kind: 'passed',
  message: 'ok',
  diagnostics: [],
  artifacts: [],
  hasEvidence: true,
  preview: {
    scenarios: [
      {
        id: 'motor-run',
        passed: true,
        truncated: false,
        assertions: [],
        samples: [
          {
            atMs: 100,
            outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': true },
            plant: { kind: 'motor-v1', atSpeedInput: true, speedPermilleAfterTick: 1000 },
          },
        ],
      },
    ],
  },
} as never;

afterEach(() => {
  resetCommandsForTest();
  usePlantDocument.setState({ open: false, active: false, requests: 0 });
  useWorkspaceTestResult.setState({ presentation: undefined });
  useIDEStore.setState((state) => ({ debug: { ...state.debug, debugMap: null } }));
});

describe('the plant document (PLS-001, PLS-002)', () => {
  it('PLS-001 the plant document shows the live plant of a 2.0 plant lesson', () => {
    useIDEStore.setState((state) => ({ debug: { ...state.debug, debugMap: motorLessonDebugMap() } }));
    dom.render(<PlantDocument controller={undefined} visible />);
    expect(dom.screen.getByRole('region', { name: dom.t('plant.title') })).toBeTruthy();
    expect(dom.screen.queryByText(dom.t('studio.plant.empty'))).toBeNull();
  });

  it('PLS-001 with a recorded plant trace it offers the replay, labelled as a replay (LRN-020)', async () => {
    useIDEStore.setState((state) => ({ debug: { ...state.debug, debugMap: motorLessonDebugMap() } }));
    useWorkspaceTestResult.setState({ presentation: recordedMotorRun });
    const { user } = dom.render(<PlantDocument controller={undefined} visible />);
    const group = dom.screen.getByRole('group', { name: dom.t('studio.plant.views') });
    expect(group).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('studio.plant.replay') }));
    expect(dom.screen.getByText(dom.t('lab.labRecordedScenario'))).toBeTruthy();
    expect(dom.screen.getByText(dom.t('lab.recordedNativePosixHost'))).toBeTruthy();
  });

  it('PLS-001 with neither it shows an empty state that names the next action (UX-021)', () => {
    dom.render(<PlantDocument controller={undefined} visible />);
    expect(dom.screen.getByText(dom.t('studio.plant.empty'))).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: dom.t('studio.plant.showTests') })).toBeTruthy();
  });

  it(
    'SCN-001 with no scene and no plant lesson, "Open a scene" brings the scene panel with the shipped scenes to choose ' + 'from',
    async () => {
      const { user } = dom.render(<PlantDocument controller={undefined} visible />);
      await user.click(dom.screen.getByRole('button', { name: dom.t('studio.plant.openScene') }));
      expect(dom.screen.getByLabelText(dom.t('plant.panel.scene'))).toBeTruthy();
      expect(dom.screen.queryByRole('button', { name: dom.t('studio.plant.openScene') })).toBeNull();
    },
  );

  it('SCN-006 a project with scenes in its scenes folder shows the scene panel without a file among the open ones', async () => {
    const folder = {
      async *values() {
        yield { kind: 'file', name: 'line.scene.json' };
      },
    };
    useIDEStore.setState({ directoryHandle: { getDirectoryHandle: async () => folder } as unknown as FileSystemDirectoryHandle });
    try {
      dom.render(<PlantDocument controller={undefined} visible />);
      await dom.waitFor(() => expect(dom.screen.getByLabelText(dom.t('plant.panel.scene'))).toBeTruthy());
      expect(dom.screen.queryByRole('button', { name: dom.t('studio.plant.openScene') })).toBeNull();
    } finally {
      useIDEStore.setState({ directoryHandle: null });
    }
  });

  it('PLS-010 visible is false while another tab of the group is active', () => {
    const { container } = dom.render(<PlantDocument controller={undefined} visible={false} />);
    expect(container.querySelector('[data-plant-document]')?.getAttribute('data-visible')).toBe('false');
  });

  it('PLS-001 the document names itself for assistive technology as the plant', () => {
    const { container } = dom.render(<PlantDocument controller={undefined} visible />);
    expect(container.querySelector('[data-plant-document]')?.getAttribute('aria-label')).toBe(dom.t('studio.surface.plant'));
  });
});

describe('the command that opens the plant document (SHL-004, PLS-002)', () => {
  it('SHL-004 view.plant opens the plant document and makes it the active view, each time it is asked', () => {
    dom.render(<Host />);
    expect(runCommand('view.plant')).toBe('ran');
    expect(usePlantDocument.getState()).toMatchObject({ open: true, active: true, requests: 1 });
    usePlantDocument.getState().deselect();
    runCommand('view.plant');
    expect(usePlantDocument.getState()).toMatchObject({ open: true, active: true, requests: 2 });
  });
});
