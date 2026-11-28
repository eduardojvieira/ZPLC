/** FLW-005: an edited and unsaved plant scene is unsaved work for the project close, the window close and the lesson Check. */
import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { createElement, useEffect } from 'react';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
await import('../plant/core/plantCore'); // registers the shipped parts, as the application does

const written: string[] = [];
const dirtyCalls: boolean[] = [];
let onClose: ((action: 'close' | 'reload') => void) | undefined;
let closedNow = 0;
const host = window as unknown as { electronAPI?: Record<string, unknown> };
const hostBefore = host.electronAPI;
host.electronAPI = {
  ...hostBefore,
  closeGuard: {
    setDirty: async (value: boolean) => void dirtyCalls.push(value),
    onCloseRequested: (callback: (action: 'close' | 'reload') => void) => {
      onClose = callback;
      return () => undefined;
    },
    closeNow: async () => void (closedNow += 1),
  },
};
afterAll(() => {
  host.electronAPI = hostBefore;
});

const { useIDEStore } = await import('../store/useIDEStore');
const { usePlantEdit } = await import('../plant/editSession');
const { saveAllDocuments } = await import('../store/saveAll');
const { CloseGuard } = await import('./CloseGuard');
const { NavigatorDialogs } = await import('../navigator/NewObjectMenu');
const { closeProjectCommand, useNavigatorRequests } = await import('../navigator/navigatorRequests');
const { useLessonCheck } = await import('../learn/useLessonCheck');

const writable = (label: string, name: string) => ({
  createWritable: async () => ({ write: async () => void written.push(`${label}:${name}`), close: async () => undefined }),
});
const handle = (label: string) =>
  ({
    name: label,
    getDirectoryHandle: async () => ({ getFileHandle: async (name: string) => writable(label, name) }),
    getFileHandle: async (name: string) => writable(label, name),
  }) as unknown as FileSystemDirectoryHandle;
const modified = { id: 'f1', path: 'src/main.st', name: 'main.st', language: 'ST', content: 'x', isModified: true, diskContent: 'y' };
const scene = { schemaVersion: 1 as const, name: 'Probe floor', parts: [], cameras: [] };
const openProject = (files = new Map<string, never>()) =>
  useIDEStore.setState({
    isProjectOpen: true,
    directoryHandle: handle('A'),
    loadedFiles: files,
    projectConfigDirty: false,
    projectName: 'A',
  });
const editScene = () => {
  usePlantEdit.getState().begin({ scene, map: null }, 'empty');
  usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]);
};
const button = (name: string) => dom.screen.getByRole('button', { name });

afterEach(() => {
  usePlantEdit.getState().end();
  usePlantEdit.setState({ unsaved: {} });
  useNavigatorRequests.setState({ closing: false });
  written.length = 0;
  closedNow = 0;
  dirtyCalls.length = 0;
  useIDEStore.setState({ isProjectOpen: false, directoryHandle: null, loadedFiles: new Map(), projectConfigDirty: false });
});

describe('an unsaved scene and the project close (FLW-005)', () => {
  it('FLW-005 Save and close of the project saves an unsaved scene and closes', async () => {
    openProject();
    editScene();
    const view = dom.render(createElement(NavigatorDialogs));
    closeProjectCommand();
    await dom.settle();
    await view.user.click(button(dom.t('closeProject.saveAll')));
    await dom.settle();
    expect(written).toEqual(['A:Probe floor.scene.json']);
    expect(useIDEStore.getState().isProjectOpen).toBe(false);
  });

  it('FLW-005 Discard and close of the project drops the unsaved scene and another project opens', async () => {
    openProject();
    editScene();
    const view = dom.render(createElement(NavigatorDialogs));
    closeProjectCommand();
    await dom.settle();
    await view.user.click(button(dom.t('closeProject.discard')));
    await dom.settle();
    expect(useIDEStore.getState().isProjectOpen).toBe(false);
    expect(useIDEStore.getState().hasUnsavedChanges()).toBe(false);
    expect(written).toEqual([]);
  });

  it('FLW-005 edit, Done, Save all, then closing the project asks nothing', async () => {
    openProject();
    editScene();
    usePlantEdit.getState().end();
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(useIDEStore.getState().hasUnsavedChanges()).toBe(false);
    closeProjectCommand();
    expect(useNavigatorRequests.getState().closing).toBe(false);
    expect(useIDEStore.getState().isProjectOpen).toBe(false);
  });

  it('FLW-005 closing a project with only modified files still prompts and saves as before', async () => {
    openProject(new Map([['f1', { ...modified } as never]]));
    dom.patchStore(useIDEStore, {
      saveAllFiles: async () => void useIDEStore.setState({ loadedFiles: new Map([['f1', { ...modified, isModified: false } as never]]) }),
    });
    const view = dom.render(createElement(NavigatorDialogs));
    closeProjectCommand();
    await dom.settle();
    expect(useNavigatorRequests.getState().closing).toBe(true);
    await view.user.click(button(dom.t('closeProject.saveAll')));
    await dom.settle();
    expect(useIDEStore.getState().isProjectOpen).toBe(false);
    expect(written).toEqual([]);
  });
});

describe('an unsaved scene and the window close (FLW-005)', () => {
  it('FLW-005 the window close guard is told dirty when only a scene is unsaved, and Save all and close saves it', async () => {
    openProject();
    const view = dom.render(createElement(CloseGuard));
    await dom.settle();
    expect(dirtyCalls.at(-1)).toBe(false);
    dom.act(() => editScene());
    await dom.settle();
    expect(dirtyCalls.at(-1)).toBe(true);
    dom.act(() => onClose?.('close'));
    await dom.settle();
    expect(document.querySelector('[data-unsaved-changes-dialog]')?.textContent).toContain('Probe floor');
    await view.user.click(button(dom.t('closeGuard.save.close')));
    await dom.settle();
    expect(written).toEqual(['A:Probe floor.scene.json']);
    expect(closedNow).toBe(1);
  });

  it('FLW-005 the window close with only modified files is told dirty and saves them as before', async () => {
    const saved: string[] = [];
    openProject(new Map([['f1', { ...modified } as never]]));
    dom.patchStore(useIDEStore, {
      saveAllFiles: async () => {
        saved.push('files');
        useIDEStore.setState({ loadedFiles: new Map() });
      },
    });
    const view = dom.render(createElement(CloseGuard));
    await dom.settle();
    expect(dirtyCalls.at(-1)).toBe(true);
    dom.act(() => onClose?.('close'));
    await dom.settle();
    await view.user.click(button(dom.t('closeGuard.save.close')));
    await dom.settle();
    expect(saved).toEqual(['files']);
    expect(closedNow).toBe(1);
  });
});

describe('an unsaved scene and the lesson Check (FLW-005)', () => {
  let unsaved: boolean | undefined;
  let canRun: boolean | undefined;
  function Probe() {
    const check = useLessonCheck(() => undefined);
    useEffect(() => {
      unsaved = check.unsaved;
      canRun = check.canRun;
    });
    return null;
  }

  it('FLW-005 the lesson Check sees an unsaved scene, and with only modified files it behaves as before', async () => {
    host.electronAPI = { ...host.electronAPI, workspaceTests: { cancel: async () => undefined, lessonCheck: async () => ({}) } };
    openProject();
    dom.render(createElement(Probe));
    await dom.settle();
    expect([unsaved, canRun]).toEqual([false, true]);
    dom.act(() => editScene());
    await dom.settle();
    expect([unsaved, canRun]).toEqual([true, false]);
    dom.act(() => void usePlantEdit.getState().end());
    usePlantEdit.setState({ unsaved: {} });
    useIDEStore.setState({ loadedFiles: new Map([['f1', { ...modified } as never]]) });
    await dom.settle();
    expect([unsaved, canRun]).toEqual([true, false]);
  });
});
