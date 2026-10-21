import { afterEach, describe, expect, it, mock } from 'bun:test';

import type { ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { chooseProjectFolder } from './projectFilesHandles';

// The store reads the example projects with a Vite-only glob; the example list does not matter here.
await mock.module('../utils/projectLoader', () => ({
  getAvailableProjects: () => [],
  loadProject: () => null,
  loadProjectAssets: () => null,
}));
const { useIDEStore } = await import('../store/useIDEStore');
const { shownProjectBridge } = await import('./shownProjectBridge');

const NOT_REACHED = async () => {
  throw new Error('the bridge must not be called');
};
const projectFiles = (rootId: string): ProjectFilesBridge => ({
  chooseFolder: async () => ({ ok: true, value: { rootId, name: 'plant' } }),
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
});

const sent: Array<{ operation: string; request: unknown }> = [];
const bridge = {
  registerProjectFile: async () => null,
  registerProjectRoot: async (request: unknown) => {
    sent.push({ operation: 'registerProjectRoot', request });
    return null;
  },
  cancel: async () => ({ requested: false }),
  run: async (request: unknown) => {
    sent.push({ operation: 'run', request });
    return null;
  },
  compile: async (request: unknown) => {
    sent.push({ operation: 'compile', request });
    return null;
  },
  safetyCheck: async (request: unknown) => {
    sent.push({ operation: 'safetyCheck', request });
    return null;
  },
  lessonCheck: async (request: unknown) => {
    sent.push({ operation: 'lessonCheck', request });
    return null;
  },
};

afterEach(() => {
  sent.length = 0;
  useIDEStore.setState({ isProjectOpen: false, directoryHandle: null });
});

describe('the workspace bridge of a window that shows one project (IDE-002)', () => {
  it('adds the id of the folder on screen to every build, safety check, test run and lesson check, and to nothing else', async () => {
    useIDEStore.setState({ isProjectOpen: true, directoryHandle: await chooseProjectFolder(projectFiles('folder-a')) });
    const shown = shownProjectBridge(bridge)!;
    await shown.compile({ workspaceId: 'w' });
    await shown.safetyCheck({ workspaceId: 'w' });
    await shown.run({ workspaceId: 'w', scenarioId: 'start-stop' });
    await shown.lessonCheck({ workspaceId: 'w', lessonId: 'edge-counter-pulses' });
    await shown.registerProjectRoot({ rootId: 'folder-a' });
    expect(sent).toEqual([
      { operation: 'compile', request: { workspaceId: 'w', rootId: 'folder-a' } },
      { operation: 'safetyCheck', request: { workspaceId: 'w', rootId: 'folder-a' } },
      { operation: 'run', request: { workspaceId: 'w', scenarioId: 'start-stop', rootId: 'folder-a' } },
      { operation: 'lessonCheck', request: { workspaceId: 'w', lessonId: 'edge-counter-pulses', rootId: 'folder-a' } },
      { operation: 'registerProjectRoot', request: { rootId: 'folder-a' } },
    ]);
  });

  it('follows the folder that is open now, and cannot be told another id by its caller', async () => {
    const shown = shownProjectBridge(bridge)!;
    useIDEStore.setState({ isProjectOpen: true, directoryHandle: await chooseProjectFolder(projectFiles('folder-a')) });
    await shown.compile({ workspaceId: 'w', rootId: 'folder-b' } as never);
    useIDEStore.setState({ directoryHandle: await chooseProjectFolder(projectFiles('folder-c')) });
    await shown.compile({ workspaceId: 'w' });
    useIDEStore.setState({ isProjectOpen: false, directoryHandle: null });
    await shown.compile({ workspaceId: 'w' });
    expect(sent.map((entry) => (entry.request as { rootId: string }).rootId)).toEqual(['folder-a', 'folder-c', '']);
  });

  it('is the same object for the same bridge, and nothing when the host has no bridge', () => {
    expect(shownProjectBridge(bridge)).toBe(shownProjectBridge(bridge));
    expect(shownProjectBridge(undefined)).toBeUndefined();
  });
});
