/**
 * The state of the project's tests (plan-u2.md, C-T): the list, the last result of each, and the run. The Tests activity, the
 * results tab and the commands read it from here. The presentation of the latest run is still published for the lessons and the
 * plant document (`useWorkspaceTestResult`), and withdrawn when the sources or the project change.
 */
import { create } from 'zustand';
import { isWorkspaceTestRunCurrent, presentWorkspaceTestResult } from '../components/workspaceTestPresentation';
import { trackTestRun } from '../components/workspaceTestNotifications';
import { presentWorkspaceSafetyCheck, type WorkspaceSafetyPresentation } from '../components/workspaceSafetyPresentation';
import { t } from '../i18n';
import { useWorkspaceTestResult } from '../shell/workspaceTestResult';
import { useNotifications } from '../store/notifications';
import { useIDEStore } from '../store/useIDEStore';
import { findFileInTree, fileTreeFileId, loadFileFromTree } from '../utils/fileSystem';
import type { ProjectTest, TestRecord, TestStatus } from './contracts';
import { createTest, type NewTestContext } from './newTest';
import { prepareProjectTestRun, type RunRefusal } from './runProjectTests';
import { listProjectTests } from './scenarioList';

/** The interlock check of the project (IDE-032): before a check, while it runs, its answer, or that it could not be made. */
export type SafetyState = 'idle' | 'running' | 'unavailable' | { presentation: WorkspaceSafetyPresentation };

interface ProjectTestsState {
  tests: ProjectTest[];
  /** The view the Tests activity shows (TST-006): the tests, or the interlock coverage with its own run. */
  view: 'tests' | 'interlocks';
  setView: (view: 'tests' | 'interlocks') => void;
  /** The last interlock check; it is withdrawn when the sources or the project change, like the result of a test run. */
  safety: SafetyState;
  runSafety: () => Promise<void>;
  /** Runs the tests whose last result is a failure, one after another; says so, and runs nothing, when there are none. */
  runFailed: () => Promise<void>;
  /** TST-009: writes a test for the first program, opens it, and says what it did. */
  newTest: () => Promise<void>;
  records: Record<string, TestRecord>;
  /** 'all' while every test runs, the path of the test that runs, null when nothing runs. */
  running: 'all' | string | null;
  cancelling: boolean;
  /** Why the last run did not start; null when it started or nothing was asked. */
  refusal: RunRefusal | null;
  refresh: () => Promise<void>;
  run: (paths?: readonly string[]) => Promise<void>;
  /** Runs one test by the id its result names (the result lists ids, the list holds paths). */
  runScenario: (id: string) => Promise<void>;
  cancel: () => Promise<void>;
}

/** The status a person sees: a record of the same project whose sources changed since is older (TST-005). */
export function statusOf(record: TestRecord | undefined, current: { projectSession: number; compilerRunId: number }): TestStatus {
  if (!record || record.projectSession !== current.projectSession) return 'notRun';
  return record.compilerRunId === current.compilerRunId ? record.status : 'older';
}

function openScenarioBuffers(): Map<string, string> {
  const buffers = new Map<string, string>();
  for (const file of useIDEStore.getState().loadedFiles.values())
    if (/\.scenario\.json$/i.test(file.path)) buffers.set(file.path, file.content);
  return buffers;
}

/** What a new test reads of the open project and writes into it, through the store. */
export function newTestContext(): NewTestContext {
  const ide = () => useIDEStore.getState();
  return {
    config: ide().projectConfig,
    tree: ide().fileTree,
    read: async (path) => {
      const open = ide().loadedFiles.get(fileTreeFileId(path));
      if (open) return open.content;
      const node = ide().fileTree ? findFileInTree(ide().fileTree!, path) : null;
      return node?.type === 'file' ? ((await loadFileFromTree(node))?.content ?? null) : null;
    },
    createFolder: (parent, name) => ide().createFolder(parent, name),
    createFile: (name, language, parent, content) => ide().createFile(name, language, parent, content),
  };
}

export const sayTests = (status: 'success' | 'warning' | 'error', title: string, detail?: string): void =>
  useNotifications.getState().report({ kind: 'tests', status, title, ...(detail === undefined ? {} : { detail }), details: 'tests' });

export const useProjectTests = create<ProjectTestsState>((set, get) => ({
  tests: [],
  view: 'tests',
  setView: (view) => set({ view }),
  safety: 'idle',

  runSafety: async () => {
    if (get().safety === 'running' || get().running !== null) return;
    set({ safety: 'running' });
    const prepared = await prepareProjectTestRun(() => void get().runSafety());
    if (!prepared.ok) return set({ safety: 'idle' });
    const { bridge, workspaceId, projectSession, compilerRunId } = prepared.run;
    const current = () => isWorkspaceTestRunCurrent(useIDEStore.getState(), { projectSession, compilerRunId, workspaceId });
    try {
      const result = await bridge.safetyCheck({ workspaceId });
      set({ safety: current() ? { presentation: presentWorkspaceSafetyCheck(result) } : 'idle' });
    } catch {
      set({ safety: current() ? 'unavailable' : 'idle' });
    }
  },

  runFailed: async () => {
    const { projectSession } = useIDEStore.getState();
    const failed = Object.values(get().records)
      .filter((record) => record.status === 'failed' && record.projectSession === projectSession)
      .map((record) => record.path);
    if (failed.length === 0) return sayTests('warning', t('u2Tests.runFailed.none'), t('u2Tests.runFailed.noneDetail'));
    await get().run(failed);
  },

  newTest: async () => {
    try {
      const result = await createTest(newTestContext());
      if (!result.ok) return sayTests('error', t('u2Tests.new.refused'), result.message);
      sayTests('success', t('u2Tests.new.created', { file: result.path, signal: result.signal }));
      await get().refresh();
    } catch (error) {
      sayTests('error', t('u2Tests.new.refused'), error instanceof Error ? error.message : String(error));
    }
  },

  records: {},
  running: null,
  cancelling: false,
  refusal: null,

  refresh: async () => {
    const expected = useIDEStore.getState().projectSession;
    const tests = await listProjectTests(useIDEStore.getState().directoryHandle, openScenarioBuffers());
    if (useIDEStore.getState().projectSession === expected) set({ tests });
  },

  run: (paths) =>
    execute(
      paths?.length === 1 ? paths[0]! : 'all',
      (tests) => (paths ? tests.filter((test) => paths.includes(test.path)) : [undefined]),
      () => void get().run(paths),
      set,
      get,
    ),

  runScenario: (id) =>
    execute(
      id,
      (tests) => [tests.find((test) => test.id === id) ?? { path: '', id, expectations: [], valid: true }],
      () => void get().runScenario(id),
      set,
      get,
    ),

  cancel: async () => {
    if (get().running === null || get().cancelling) return;
    set({ cancelling: true });
    try {
      await window.electronAPI?.workspaceTests?.cancel();
    } catch {
      /* the active run remains authoritative */
    }
  },
}));

/** The run of some tests (`undefined` is all of them): prepare, then one request to the runner per target. */
async function execute(
  running: string,
  targets: (tests: ProjectTest[]) => Array<ProjectTest | undefined>,
  retry: () => void,
  set: Set,
  get: () => ProjectTestsState,
): Promise<void> {
  if (get().running !== null || get().safety === 'running') return;
  set({ running, cancelling: false, refusal: null });
  try {
    const prepared = await prepareProjectTestRun(retry);
    if (!prepared.ok) {
      set({ refusal: prepared.refusal });
      return;
    }
    await get().refresh();
    for (const target of targets(get().tests)) {
      if (get().cancelling) break;
      await runOne(prepared.run, target, set, get);
    }
  } finally {
    set({ running: null, cancelling: false });
  }
}

type Set = (partial: Partial<ProjectTestsState> | ((state: ProjectTestsState) => Partial<ProjectTestsState>)) => void;

/** One request to the runner: every test (`target` undefined) or one. */
async function runOne(
  run: Extract<Awaited<ReturnType<typeof prepareProjectTestRun>>, { ok: true }>['run'],
  target: ProjectTest | undefined,
  set: Set,
  get: () => ProjectTestsState,
): Promise<void> {
  const { bridge, workspaceId, projectSession, compilerRunId } = run;
  if (target?.path) set({ running: target.path });
  const notice = trackTestRun(target?.id, () => void get().cancel());
  const expected = { projectSession, compilerRunId, workspaceId };
  try {
    const result = await bridge.run({ workspaceId, ...(target ? { scenarioId: target.id } : {}) });
    if (!isWorkspaceTestRunCurrent(useIDEStore.getState(), expected)) return notice.dismiss();
    const presentation = presentWorkspaceTestResult(result);
    useWorkspaceTestResult.getState().publish(presentation);
    if (presentation.kind !== 'cancelled' && presentation.kind !== 'infrastructure-unavailable') {
      const at = Date.now();
      const records = { ...get().records };
      for (const test of target ? [target] : get().tests.filter((item) => item.valid)) {
        if (!test.path) continue;
        const own = presentation.preview?.scenarios.find((scenario) => scenario.id === test.id);
        // the preview lists the failed tests first and at most a few: a test it does not list has no verdict of its own
        if (!own && presentation.preview && !target && presentation.kind !== 'passed') continue;
        const status: TestStatus = own ? (own.passed ? 'passed' : 'failed') : presentation.kind === 'passed' ? 'passed' : 'failed';
        records[test.path] = { path: test.path, status, presentation, compilerRunId, projectSession, at };
      }
      set({ records });
    }
    notice.done(result);
  } catch {
    if (isWorkspaceTestRunCurrent(useIDEStore.getState(), expected)) notice.unavailable();
    else notice.dismiss();
  }
}

// What the lessons and the plant document read is about the sources as they were: it goes when they change.
useIDEStore.subscribe((state, previous) => {
  if (state.projectSession !== previous.projectSession || state.compilerRunId !== previous.compilerRunId) {
    useWorkspaceTestResult.getState().publish(undefined);
    if (useProjectTests.getState().safety !== 'running') useProjectTests.setState({ safety: 'idle' });
  }
});
