import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { projectLoaderStub } from '../test/projectLoaderStub';
import { mock } from 'bun:test';
import type { ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { chooseProjectFolder } from '../ipc/projectFilesHandles';

await mock.module('../utils/projectLoader', () =>
  projectLoaderStub({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }),
);
const { useIDEStore } = await import('../store/useIDEStore');
const { useProjectTests, statusOf } = await import('./useProjectTests');
const { useWorkspaceTestResult } = await import('../shell/workspaceTestResult');

const sha = 'a'.repeat(64);
const evidence = (outcome: 'passed' | 'failed', diagnostics: unknown[] = []) => ({
  schemaVersion: 1,
  operation: 'test',
  outcome,
  diagnostics,
  artifacts: [
    { kind: 'zplc', sha256: sha, byteLength: 12 },
    { kind: 'trace', sha256: 'b'.repeat(64), byteLength: 34 },
  ],
});
const passedRun = (ids: string[]) => ({
  ok: true,
  summary: {
    backend: 'native-posix',
    mode: 'logical-cyclic-task-set-scan',
    scenarios: ids.map((id) => ({ id, path: `tests/${id}.scenario.json`, passed: true, traceSha256: sha, traceByteLength: 1 })),
  },
  evidence: evidence('passed'),
});
/** A project folder whose `tests` folder holds these files. */
const fakeRoot = (files: Record<string, string>) => ({
  getDirectoryHandle: async () => ({
    async *values() {
      for (const [name, text] of Object.entries(files)) yield { kind: 'file', name, getFile: async () => ({ text: async () => text }) };
    },
  }),
});
const NOT_REACHED = async () => {
  throw new Error('not reached');
};
const folderBridge: ProjectFilesBridge = {
  chooseFolder: async () => ({ ok: true, value: { rootId: 'root-1', name: 'plant' } }),
  list: NOT_REACHED,
  stat: NOT_REACHED,
  read: NOT_REACHED,
  write: NOT_REACHED,
  mkdir: NOT_REACHED,
  remove: NOT_REACHED,
  rename: NOT_REACHED,
  listRecent: NOT_REACHED,
  openRecent: NOT_REACHED,
  forgetRecent: NOT_REACHED,
  markOpened: NOT_REACHED,
};
const scenario = (id: string) => JSON.stringify({ id, expectations: [{ kind: 'AT', atMs: 10, condition: {} }] });

let requests: Array<{ workspaceId: string; scenarioId?: string; rootId?: string }>;
let manifestChoices: number;
const original = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(() => {
  requests = [];
  manifestChoices = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        isElectron: true,
        workspaceTests: {
          run: async (request: { workspaceId: string; scenarioId?: string }) => {
            requests.push(request);
            return passedRun(request.scenarioId ? [request.scenarioId] : ['Alpha', 'Beta']);
          },
          cancel: async () => undefined,
          registerProjectRoot: async () => ({ workspaceId: 'w1' }),
          registerProjectFile: async () => {
            manifestChoices += 1;
            return { workspaceId: 'w1' };
          },
        },
      },
    },
  });
  useIDEStore.setState({
    isProjectOpen: true,
    projectSession: 1,
    compilerRunId: 1,
    directoryHandle: fakeRoot({ 'a.scenario.json': scenario('Alpha'), 'b.scenario.json': scenario('Beta') }) as never,
    workspaceScenarioLink: { workspaceId: 'w1', projectSession: 1 },
    loadedFiles: new Map(),
    projectConfigDirty: false,
  });
  useProjectTests.setState({ tests: [], records: {}, running: null, cancelling: false, refusal: null });
  useWorkspaceTestResult.getState().publish(undefined);
});

afterEach(() => {
  useIDEStore.setState({ isProjectOpen: false, directoryHandle: null, workspaceScenarioLink: null });
  if (original) Object.defineProperty(globalThis, 'window', original);
  else delete (globalThis as { window?: unknown }).window;
});

const current = () => ({ projectSession: useIDEStore.getState().projectSession, compilerRunId: useIDEStore.getState().compilerRunId });

describe('project tests store', () => {
  it('TST-001 a record is not run, passed or failed after a run', async () => {
    await useProjectTests.getState().refresh();
    expect(useProjectTests.getState().tests.map((test) => statusOf(useProjectTests.getState().records[test.path], current()))).toEqual([
      'notRun',
      'notRun',
    ]);
    await useProjectTests.getState().run(['tests/a.scenario.json']);
    const { records } = useProjectTests.getState();
    expect(requests.map((request) => request.scenarioId)).toEqual(['Alpha']);
    expect(statusOf(records['tests/a.scenario.json'], current())).toBe('passed');
    expect(statusOf(records['tests/b.scenario.json'], current())).toBe('notRun');
    expect(useProjectTests.getState().running).toBeNull();
  });

  it('TST-001 a run of everything records every test and publishes the result for the lessons and the plant', async () => {
    await useProjectTests.getState().run();
    expect(requests.map((request) => request.scenarioId)).toEqual([undefined]);
    const { records } = useProjectTests.getState();
    expect(Object.values(records).map((record) => record.status)).toEqual(['passed', 'passed']);
    expect(useWorkspaceTestResult.getState().presentation?.kind).toBe('passed');
  });

  it('TST-005 after the sources change the record stays and is older', async () => {
    await useProjectTests.getState().run();
    useIDEStore.setState({ compilerRunId: 2 });
    const { records } = useProjectTests.getState();
    expect(statusOf(records['tests/a.scenario.json'], current())).toBe('older');
    expect(records['tests/a.scenario.json']?.status).toBe('passed');
    // what the lessons read is about the sources as they were
    expect(useWorkspaceTestResult.getState().presentation).toBeUndefined();
  });

  it('TST-005 a result of another project is not shown for this one', async () => {
    await useProjectTests.getState().run();
    useIDEStore.setState({ projectSession: 2 });
    expect(statusOf(useProjectTests.getState().records['tests/a.scenario.json'], current())).toBe('notRun');
  });

  it('TST-002 no step of a run asks for a manifest', async () => {
    useIDEStore.setState({ workspaceScenarioLink: null, directoryHandle: await chooseProjectFolder(folderBridge) });
    await useProjectTests.getState().run();
    expect(manifestChoices).toBe(0);
    expect(requests).toHaveLength(1);
    expect(useIDEStore.getState().workspaceScenarioLink).toEqual({ workspaceId: 'w1', projectSession: 1 });
  });

  it('TST-001 a test named by the id of a result runs on its own, even when the list is empty', async () => {
    useIDEStore.setState({ directoryHandle: null });
    await useProjectTests.getState().runScenario('Alpha');
    expect(requests.map((request) => request.scenarioId)).toEqual(['Alpha']);
    expect(useProjectTests.getState().running).toBeNull();
  });
});
