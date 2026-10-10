import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import type { ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { chooseProjectFolder } from '../ipc/projectFilesHandles';

// The store reads the example projects with a Vite-only glob; the example list does not matter here.
mock.module('./projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
const { useIDEStore } = await import('../store/useIDEStore');
const { canLinkProjectWorkspace, linkProjectWorkspace } = await import('./workspaceTestLink');

const NOT_REACHED = async () => { throw new Error('the bridge must not be called'); };
const bridge: ProjectFilesBridge = {
  chooseFolder: async () => ({ ok: true, value: { rootId: 'root-1', name: 'plant' } }),
  list: NOT_REACHED, stat: NOT_REACHED, read: NOT_REACHED, write: NOT_REACHED, mkdir: NOT_REACHED, remove: NOT_REACHED, rename: NOT_REACHED,
  listRecent: NOT_REACHED, openRecent: NOT_REACHED, forgetRecent: NOT_REACHED, markOpened: NOT_REACHED,
};

let requests: unknown[];
let registration: (request: unknown) => Promise<{ workspaceId: string } | null>;
const original = Object.getOwnPropertyDescriptor(globalThis, 'window');

function installWindow(workspaceTests: Record<string, unknown> | undefined): void {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { isElectron: true, workspaceTests } } });
}

async function openProject(session = 3): Promise<void> {
  const directoryHandle = await chooseProjectFolder(bridge);
  useIDEStore.setState({ isProjectOpen: true, projectSession: session, directoryHandle, workspaceScenarioLink: null });
}

beforeEach(async () => {
  requests = [];
  registration = async () => ({ workspaceId: 'workspace-1' });
  installWindow({ registerProjectRoot: (request: unknown) => { requests.push(request); return registration(request); } });
  await openProject();
});

afterEach(() => {
  useIDEStore.setState({ isProjectOpen: false, directoryHandle: null, workspaceScenarioLink: null });
  if (original) Object.defineProperty(globalThis, 'window', original);
  else delete (globalThis as { window?: unknown }).window;
});

describe('linking the open project to its workspace without choosing a file (IDE-001)', () => {
  it('sends the id of the project folder and nothing else, and links the answer to the open project', async () => {
    expect(await linkProjectWorkspace()).toEqual({ workspaceId: 'workspace-1', projectSession: 3 });
    expect(requests).toEqual([{ rootId: 'root-1' }]);
    expect(useIDEStore.getState().workspaceScenarioLink).toEqual({ workspaceId: 'workspace-1', projectSession: 3 });
  });

  it('replaces an earlier link and clears the build evidence that belonged to it', async () => {
    useIDEStore.setState({ workspaceScenarioLink: { workspaceId: 'old', projectSession: 3 } });
    expect(await linkProjectWorkspace()).toEqual({ workspaceId: 'workspace-1', projectSession: 3 });
    expect(useIDEStore.getState().workspaceScenarioLink?.workspaceId).toBe('workspace-1');
    expect(useIDEStore.getState().canonicalWorkspaceBuildEvidence).toBeNull();
  });

  it('is available only on a host that registers a project root, for a project opened through the main process', async () => {
    expect(canLinkProjectWorkspace()).toBe(true);
    installWindow({ registerProjectFile: async () => null });
    expect(canLinkProjectWorkspace()).toBe(false);
    expect(await linkProjectWorkspace()).toBeNull();
    installWindow(undefined);
    expect(canLinkProjectWorkspace()).toBe(false);
    delete (globalThis as { window?: unknown }).window;
    expect(canLinkProjectWorkspace()).toBe(false);
    expect(await linkProjectWorkspace()).toBeNull();
  });

  it('does nothing for a folder the main process does not own, or when no project is open', async () => {
    useIDEStore.setState({ directoryHandle: { name: 'plant', kind: 'directory' } as unknown as FileSystemDirectoryHandle });
    expect(canLinkProjectWorkspace()).toBe(false);
    expect(await linkProjectWorkspace()).toBeNull();
    await openProject();
    useIDEStore.setState({ isProjectOpen: false });
    expect(canLinkProjectWorkspace()).toBe(false);
    expect(await linkProjectWorkspace()).toBeNull();
    expect(requests).toEqual([]);
    expect(useIDEStore.getState().workspaceScenarioLink).toBeNull();
  });

  it('leaves the project unlinked when the main process refuses, answers nothing, or fails', async () => {
    for (const answer of [() => Promise.reject(new Error('Workspace operation failed')), async () => null, async () => ({ workspaceId: '' })]) {
      registration = answer as typeof registration;
      expect(await linkProjectWorkspace()).toBeNull();
      expect(useIDEStore.getState().workspaceScenarioLink).toBeNull();
    }
  });

  it('shares one registration between callers that ask for the same project at the same time', async () => {
    let answer: (value: { workspaceId: string }) => void = () => undefined;
    registration = () => new Promise((resolve) => { answer = resolve; });
    const opening = linkProjectWorkspace();
    const build = linkProjectWorkspace();
    answer({ workspaceId: 'workspace-1' });
    expect(await Promise.all([opening, build])).toEqual([{ workspaceId: 'workspace-1', projectSession: 3 }, { workspaceId: 'workspace-1', projectSession: 3 }]);
    expect(requests).toHaveLength(1);
    // Once it has settled the next call registers the folder again, so that it matches the folder as it is then.
    registration = async () => ({ workspaceId: 'workspace-2' });
    expect(await linkProjectWorkspace()).toEqual({ workspaceId: 'workspace-2', projectSession: 3 });
    expect(requests).toHaveLength(2);
  });

  it('does not hand a registration for a replaced project to a caller of the new one', async () => {
    const answers: Array<(value: { workspaceId: string }) => void> = [];
    registration = () => new Promise((resolve) => { answers.push(resolve); });
    const first = linkProjectWorkspace();
    useIDEStore.setState({ projectSession: 4 });
    const second = linkProjectWorkspace();
    answers.forEach((answer, index) => answer({ workspaceId: `workspace-${index + 1}` }));
    expect(await first).toBeNull();
    expect(await second).toEqual({ workspaceId: 'workspace-2', projectSession: 4 });
    expect(requests).toHaveLength(2);
  });

  it('drops an answer that arrives after another project replaced the one it was asked for', async () => {
    let answer: (value: { workspaceId: string }) => void = () => undefined;
    registration = () => new Promise((resolve) => { answer = resolve; });
    const pending = linkProjectWorkspace();
    useIDEStore.setState({ projectSession: 4 });
    answer({ workspaceId: 'workspace-1' });
    expect(await pending).toBeNull();
    expect(useIDEStore.getState().workspaceScenarioLink).toBeNull();
  });
});
