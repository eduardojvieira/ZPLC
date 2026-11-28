import { createElement } from 'react';
import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await import('../core/plantCore'); // registers the shipped parts, as the application does
const { useIDEStore } = await import('../../store/useIDEStore');
const { saveAllDocuments } = await import('../../store/saveAll');
const { usePlantEdit } = await import('../editSession');
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
});
