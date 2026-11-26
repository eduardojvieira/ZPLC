import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';
import { compileMultiTaskProject, type DebugMap } from '../compiler';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { getLanguageFromFilename } from '../types';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
// Monaco needs a browser engine; a text view is a plain element here. The real module comes back when this file is done.
const realCodeEditor = { ...(await import('../components/CodeEditor')) };
await mock.module('../components/CodeEditor', () => ({
  ...realCodeEditor,
  CodeEditor: ({ fileId }: { fileId: string }) => <div data-code-editor={fileId} />,
}));
afterAll(async () => {
  await mock.module('../components/CodeEditor', () => realCodeEditor);
});
const { PlantDocument } = await import('./PlantDocument');
const { TestResultsTab } = await import('../components/TestResultsTab');
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
  usePlantDocument.setState({ open: false, active: false, requests: 0, replayRequests: 0 });
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

  it('TST-007 Replay opens the plant document in the replay view, labelled as a replay', () => {
    useIDEStore.setState((state) => ({ debug: { ...state.debug, debugMap: motorLessonDebugMap() } }));
    useWorkspaceTestResult.setState({ presentation: recordedMotorRun });
    dom.render(<PlantDocument controller={undefined} visible />);
    // the live plant shows first; a Replay request from a result switches to the recording
    expect(dom.screen.queryByText(dom.t('lab.labRecordedScenario'))).toBeNull();
    dom.act(() => usePlantDocument.getState().showReplay());
    expect(usePlantDocument.getState()).toMatchObject({ open: true, active: true, replayRequests: 1 });
    expect(dom.screen.getByRole('heading', { name: dom.t('studio.plant.replay') })).toBeTruthy();
    expect(dom.screen.getByText(dom.t('lab.labRecordedScenario'))).toBeTruthy();
    expect(dom.screen.getByRole('slider', { name: dom.t('lab.recordedScenarioTimeline') })).toBeTruthy();
  });

  it('TST-007 a result that recorded a plant trace offers Replay, and it asks for the replay view', async () => {
    useWorkspaceTestResult.setState({ presentation: recordedMotorRun });
    const { user } = dom.render(<TestResultsTab workspaceScenarioLink={null} canonicalWorkspaceBuildEvidence={null} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.replay') }));
    expect(usePlantDocument.getState()).toMatchObject({ open: true, active: true, replayRequests: 1 });
    // a result with no plant trace has nothing to replay
    const withoutPlant = { ...(recordedMotorRun as object), preview: { scenarios: [] } } as never;
    dom.act(() => useWorkspaceTestResult.setState({ presentation: withoutPlant }));
    expect(dom.screen.queryByRole('button', { name: dom.t('u2Tests.replay') })).toBeNull();
  });

  it('PLS-003 the replay has no run controls', () => {
    useWorkspaceTestResult.setState({ presentation: recordedMotorRun });
    dom.act(() => usePlantDocument.getState().showReplay());
    dom.render(<PlantDocument controller={undefined} visible />);
    const text = dom.t as (key: string) => string;
    const names = ['debug.run', 'debug.pause', 'debug.stop', 'online.simulation'].map((id) => text(`command.${id}`));
    for (const name of names) expect(dom.screen.queryByRole('button', { name })).toBeNull();
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

  it('PLS-010 in a split, a plant document behind another view of its group is not visible, and beside a program it is', async () => {
    const { EditorArea } = await import('../components/EditorArea');
    const { useEditorGroups } = await import('../store/useEditorGroups');
    const { useReviewDocument } = await import('../store/useReviewDocument');
    const { useConfigEditors } = await import('../store/useConfigEditors');
    const { PLANT_VIEW_ID } = await import('../layout/documentKinds');
    window.innerWidth = 1400;
    const file = (name: string) => ({
      id: `file:src/${name}`,
      name,
      path: `src/${name}`,
      parentPath: 'src',
      language: 'ST' as const,
      content: `// ${name}`,
      isModified: false,
    });
    const files = [file('Motor.st'), file('Pump.st')];
    dom.patchStore(useIDEStore, {
      loadedFiles: new Map(files.map((f) => [f.id, f])),
      openTabs: files.map((f) => f.id),
      activeFileId: files[0]!.id,
      showSettings: false,
      projectSession: 1,
    } as never);
    dom.patchStore(useReviewDocument, { open: false, active: false } as never);
    dom.patchStore(useConfigEditors, { open: [], active: null } as never);
    usePlantDocument.setState({ open: true, active: false });
    const split = (activeSecond: string) =>
      dom.patchStore(useEditorGroups, {
        groups: { second: [PLANT_VIEW_ID, files[1]!.id], activeSecond, focused: 'first', ratio: 0.5 },
        activeFirst: files[0]!.id,
        pendingFor: -1,
      } as never);
    const shown = () => document.querySelector('[data-plant-document]')?.getAttribute('data-visible');
    dom.render(<EditorArea />);
    await dom.settle();
    await dom.act(async () => split(files[1]!.id));
    await dom.settle();
    expect(dom.screen.getByRole('group', { name: dom.t('studio.document.group.second') })).toBeTruthy();
    expect(shown()).toBe('false'); // Pump.st is the view of the second group
    await dom.act(async () => split(PLANT_VIEW_ID));
    await dom.settle();
    expect(shown()).toBe('true'); // the plant beside Motor.st
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
