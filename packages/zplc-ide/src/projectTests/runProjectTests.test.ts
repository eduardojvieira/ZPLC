import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { projectLoaderStub } from '../test/projectLoaderStub';

await mock.module('../utils/projectLoader', () =>
  projectLoaderStub({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }),
);
const { useIDEStore } = await import('../store/useIDEStore');
const { useAppSettings } = await import('../store/useAppSettings');
const { useNotifications } = await import('../store/notifications');
const { answerConfirmation, currentConfirmation, mountConfirmHost } = await import('../store/actionConfirm');
const { prepareProjectTestRun } = await import('./runProjectTests');

const modifiedFile = { id: 'f1', path: 'src/main.st', name: 'main.st', language: 'ST', content: 'x', isModified: true, diskContent: 'y' };
let saved: number;
let unmount: (() => void) | null = null;
const original = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(() => {
  saved = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electronAPI: { isElectron: true, workspaceTests: { run: async () => ({}), cancel: async () => undefined } } },
  });
  useNotifications.getState().clear();
  useIDEStore.setState({
    isProjectOpen: true,
    projectSession: 4,
    projectConfigDirty: false,
    workspaceScenarioLink: { workspaceId: 'w', projectSession: 4 },
    loadedFiles: new Map([['f1', { ...modifiedFile } as never]]),
    saveAllFiles: async () => {
      saved += 1;
      useIDEStore.setState({ loadedFiles: new Map([['f1', { ...modifiedFile, isModified: false } as never]]) });
    },
  });
});

afterEach(() => {
  unmount?.();
  unmount = null;
  useAppSettings.setState({ settings: { ...useAppSettings.getState().settings, saveBeforeRun: 'always' } });
  useIDEStore.setState({ isProjectOpen: false, workspaceScenarioLink: null, loadedFiles: new Map() });
  if (original) Object.defineProperty(globalThis, 'window', original);
  else delete (globalThis as { window?: unknown }).window;
});

const preference = (saveBeforeRun: 'always' | 'ask') =>
  useAppSettings.setState({ settings: { ...useAppSettings.getState().settings, saveBeforeRun } });

describe('preparing a run of the tests', () => {
  it('FLW-006 running tests with a modified document saves it first when the preference is Always', async () => {
    preference('always');
    const prepared = await prepareProjectTestRun(() => undefined);
    expect(saved).toBe(1);
    expect(prepared.ok).toBe(true);
    expect(useIDEStore.getState().hasUnsavedChanges()).toBe(false);
  });

  it('FLW-006 with Ask the run waits for the answer and does nothing on Cancel', async () => {
    preference('ask');
    unmount = mountConfirmHost();
    const pending = prepareProjectTestRun(() => undefined);
    await Promise.resolve();
    expect(currentConfirmation()?.title).toBeTruthy();
    expect(saved).toBe(0);
    answerConfirmation(false);
    expect(await pending).toEqual({ ok: false, refusal: 'cancelled' });
    expect(saved).toBe(0);
    expect(useNotifications.getState().items).toEqual([]);
  });

  it('FLW-006 with Ask the answer Save saves and the run goes on', async () => {
    preference('ask');
    unmount = mountConfirmHost();
    const pending = prepareProjectTestRun(() => undefined);
    await Promise.resolve();
    answerConfirmation(true);
    expect((await pending).ok).toBe(true);
    expect(saved).toBe(1);
  });

  it('FLW-006 a project with nothing to save runs without saving or asking', async () => {
    useIDEStore.setState({ loadedFiles: new Map() });
    preference('ask');
    expect((await prepareProjectTestRun(() => undefined)).ok).toBe(true);
    expect(saved).toBe(0);
  });

  it('FLW-004 a refused run names the missing step and offers it', async () => {
    useIDEStore.setState({
      workspaceScenarioLink: null,
      loadedFiles: new Map(),
      directoryHandle: null,
    });
    let retried = 0;
    expect(await prepareProjectTestRun(() => (retried += 1))).toEqual({ ok: false, refusal: 'noLink' });
    const [notice] = useNotifications.getState().items;
    expect(notice?.status).toBe('error');
    expect(notice?.title).toBe('The tests did not start');
    expect(notice?.detail).toContain('Open it again');
    notice?.recover?.run();
    expect(retried).toBe(1);
  });

  it('FLW-004 a document that cannot be saved stops the run and says which one', async () => {
    useIDEStore.setState({ saveAllFiles: async () => undefined });
    expect(await prepareProjectTestRun(() => undefined)).toEqual({ ok: false, refusal: 'saveFailed' });
    expect(useNotifications.getState().items[0]?.title).toContain('src/main.st');
  });
});
