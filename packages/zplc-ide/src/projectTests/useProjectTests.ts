/**
 * The state of the project's tests (plan-u2.md, C-T): the list, the last result of each, and the run. The Tests activity, the
 * results tab and the commands read it from here. The presentation of the latest run is still published for the lessons and the
 * plant document (`useWorkspaceTestResult`), and withdrawn when the sources or the project change.
 */
import { create } from 'zustand';
import { isWorkspaceTestRunCurrent, presentWorkspaceTestResult } from '../components/workspaceTestPresentation';
import { trackTestRun } from '../components/workspaceTestNotifications';
import { useWorkspaceTestResult } from '../shell/workspaceTestResult';
import { useIDEStore } from '../store/useIDEStore';
import type { ProjectTest, TestRecord, TestStatus } from './contracts';
import { prepareProjectTestRun, type RunRefusal } from './runProjectTests';
import { listProjectTests } from './scenarioList';

interface ProjectTestsState {
  tests: ProjectTest[];
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

export const useProjectTests = create<ProjectTestsState>((set, get) => ({
  tests: [],
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
  if (get().running !== null) return;
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
  if (state.projectSession !== previous.projectSession || state.compilerRunId !== previous.compilerRunId)
    useWorkspaceTestResult.getState().publish(undefined);
});
