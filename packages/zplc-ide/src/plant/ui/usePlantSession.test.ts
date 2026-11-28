import { createElement } from 'react';
import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await import('../core/plantCore'); // registers the shipped parts, as the application does
const { useIDEStore } = await import('../../store/useIDEStore');
const { saveAllDocuments } = await import('../../store/saveAll');
const { usePlantEdit } = await import('../editSession');
const { usePlantDocument } = await import('../../store/usePlantDocument');
const { usePlantSession } = await import('./usePlantSession');
import type { PlantEngine } from './loadPlantEngine';
import type { PlantSceneFile } from '../contracts';

const core = {
  stepMs: 5,
  signals: [],
  apply: () => undefined,
  advance: () => undefined,
  sense: () => ({}),
  facts: () => ({}),
  snapshot: () => ({ timeMs: 0, scans: 0, parts: [], items: [], facts: {} }),
  dispose: () => undefined,
};
const engine = { createPlantCore: async () => core, loadRenderer: async () => ({ unavailable: 'none' }) } as unknown as PlantEngine;
const deps = { loadEngine: async () => engine };

/** Only the hook: no plant panel and no editor panel is mounted, as when the plant document is not on screen. */
function Host() {
  usePlantSession(undefined, { kind: 'empty' }, deps);
  return null;
}

describe('the plant session (SCN-006, FLW-005)', () => {
  it('FLW-005 Save all saves an edited scene and no other document is affected', async () => {
    const written: string[] = [];
    const handle = {
      getDirectoryHandle: async () => ({
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({ write: async () => void written.push(name), close: async () => {} }),
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    const program = { id: 'a', name: 'Main.st', path: 'Main.st', content: 'PROGRAM Main', isModified: false };
    dom.patchStore(useIDEStore, { directoryHandle: handle, loadedFiles: new Map([['a', program]]) as never });
    dom.render(createElement(Host));
    await dom.settle();
    const scene: PlantSceneFile = { schemaVersion: 1, name: 'Empty floor', parts: [], cameras: [] };
    dom.act(() => usePlantEdit.getState().begin({ scene, map: null }, 'empty'));
    expect((await saveAllDocuments()).saved).toBe(0); // opened, not changed
    dom.act(() => void usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]));
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(written).toEqual(['Empty floor.scene.json']);
    expect(useIDEStore.getState().loadedFiles.get('a')).toEqual(program as never);
    expect((await saveAllDocuments()).saved).toBe(0);
    usePlantEdit.getState().end();
  });
  it('FLW-005 Save all still saves a scene edited and closed with Done', async () => {
    const written: string[] = [];
    const handle = {
      getDirectoryHandle: async () => ({
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({ write: async () => void written.push(name), close: async () => {} }),
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    dom.patchStore(useIDEStore, { directoryHandle: handle, loadedFiles: new Map() as never });
    const scene: PlantSceneFile = { schemaVersion: 1, name: 'Closed floor', parts: [], cameras: [] };
    const edit = usePlantEdit.getState;
    dom.act(() => edit().begin({ scene, map: null }, 'empty'));
    dom.act(() => void edit().editor!.place('belt-x', 'belt', [4, 0, 4]));
    dom.act(() => void edit().end()); // Done: the session is over, the scene is edited and not saved
    expect(edit().editor).toBeNull();
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(written).toEqual(['Closed floor.scene.json']);
    expect((await saveAllDocuments()).saved).toBe(0); // saved: no longer pending
    // an edit closed and then dropped by loading the scene from disk is not written over it
    dom.act(() => edit().begin({ scene, map: null }, 'empty'));
    dom.act(() => void edit().editor!.place('belt-y', 'belt', [4, 0, 4]));
    dom.act(() => void edit().end());
    dom.act(() => usePlantDocument.getState().notifyExternalPlantChange());
    expect((await saveAllDocuments()).saved).toBe(0);
  });
  it('FLW-005 a plant map binding edited in the session is saved with its scene', async () => {
    const written: string[] = [];
    const handle = {
      getDirectoryHandle: async () => ({
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({ write: async () => void written.push(name), close: async () => {} }),
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    dom.patchStore(useIDEStore, { directoryHandle: handle, loadedFiles: new Map() as never });
    const scene: PlantSceneFile = { schemaVersion: 1, name: 'Bound floor', parts: [], cameras: [] };
    const edit = usePlantEdit.getState;
    dom.act(() => edit().begin({ scene, map: null }, 'empty'));
    dom.act(() => void edit().editor!.place('pb-1', 'push-button', [4, 0, 4]));
    expect((await saveAllDocuments()).saved).toBe(1);
    written.length = 0;
    // the scene is saved; only a binding changes now, and it is not lost by the next save
    const signal = edit().editor!.signals()[0]!.name;
    dom.act(() => void edit().mapEditor!.bind(signal, 'Main.Start'));
    expect((await saveAllDocuments()).saved).toBe(1);
    expect(written.sort()).toEqual(['Bound floor.plant-map.json', 'Bound floor.scene.json']);
    usePlantEdit.getState().end();
  });
  it('FLW-005 a scene edited when another project opens is never written into it', async () => {
    const writes = { a: [] as string[], b: [] as string[] };
    const folder = (log: string[]) =>
      ({
        getDirectoryHandle: async () => ({
          getFileHandle: async (name: string) => ({
            createWritable: async () => ({ write: async () => void log.push(name), close: async () => {} }),
          }),
        }),
      }) as unknown as FileSystemDirectoryHandle;
    const [a, b] = [folder(writes.a), folder(writes.b)];
    const scene: PlantSceneFile = { schemaVersion: 1, name: 'A floor', parts: [], cameras: [] };
    const edit = usePlantEdit.getState;
    const before = useIDEStore.getState().directoryHandle;
    dom.patchStore(useIDEStore, { loadedFiles: new Map() as never });
    try {
      for (const live of [false, true]) {
        useIDEStore.setState({ directoryHandle: a });
        dom.act(() => edit().begin({ scene, map: null }, 'empty'));
        dom.act(() => void edit().editor!.place('belt-x', 'belt', [4, 0, 4]));
        useIDEStore.setState({ directoryHandle: b }); // another project opens: the panel of the scene closes the session
        if (!live) dom.act(() => void edit().end());
        expect((await saveAllDocuments()).saved).toBe(0);
        expect(writes.b).toEqual([]);
        dom.act(() => void edit().end());
        usePlantEdit.setState({ unsaved: {} });
      }
    } finally {
      useIDEStore.setState({ directoryHandle: before });
    }
  });
});
