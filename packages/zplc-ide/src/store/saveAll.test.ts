import { afterEach, describe, expect, it, mock } from 'bun:test';

import { projectLoaderStub } from '../test/projectLoaderStub';
import type { ProjectFile } from '../types';

await mock.module('../utils/projectLoader', () => projectLoaderStub({ loadProject: () => null, loadProjectAssets: () => null }));
const { saveAllDocuments, registerSaveAllParticipant } = await import('./saveAll');
const { useIDEStore } = await import('./useIDEStore');

const original = useIDEStore.getState();
const file = (id: string, isModified: boolean) => ({ id, name: `${id}.st`, path: `src/${id}.st`, isModified }) as unknown as ProjectFile;

function stage(files: ProjectFile[], projectConfigDirty: boolean, failing: string[] = []) {
  const calls = { files: 0, config: 0 };
  useIDEStore.setState({
    loadedFiles: new Map(files.map((f) => [f.id, f])) as never,
    projectConfigDirty,
    saveAllFiles: async () => {
      calls.files += 1;
      const next = new Map(useIDEStore.getState().loadedFiles);
      for (const [id, f] of next) if (f.isModified && !failing.includes(id)) next.set(id, { ...f, isModified: false });
      useIDEStore.setState({ loadedFiles: next });
    },
    saveProjectConfig: async () => {
      calls.config += 1;
      useIDEStore.setState({ projectConfigDirty: false });
    },
  });
  return calls;
}

afterEach(() => {
  useIDEStore.setState({
    loadedFiles: original.loadedFiles,
    projectConfigDirty: original.projectConfigDirty,
    saveAllFiles: original.saveAllFiles,
    saveProjectConfig: original.saveProjectConfig,
  });
});

describe('Save all (FLW-005)', () => {
  it('FLW-005 Save all saves every modified file and the configuration, and names the ones that failed', async () => {
    const calls = stage([file('a', true), file('b', true), file('c', false)], true, ['b']);
    const result = await saveAllDocuments();
    expect(calls).toEqual({ files: 1, config: 1 });
    expect(result).toEqual({ saved: 2, failed: ['src/b.st'] });
    expect(useIDEStore.getState().projectConfigDirty).toBe(false);
  });

  it('with nothing modified it writes nothing', async () => {
    const calls = stage([file('a', false)], false);
    expect(await saveAllDocuments()).toEqual({ saved: 0, failed: [] });
    expect(calls).toEqual({ files: 0, config: 0 });
  });

  it('FLW-006 a plant scene joins Save all, and its failure is named without stopping the others', async () => {
    const calls = stage([file('a', true)], false);
    const leave = [
      registerSaveAllParticipant(async () => ({ saved: 1, failed: [] })),
      registerSaveAllParticipant(async () => ({ saved: 0, failed: ['scenes/line.scene.json'] })),
      registerSaveAllParticipant(async () => {
        throw new Error('plant map');
      }),
    ];
    try {
      expect(await saveAllDocuments()).toEqual({ saved: 2, failed: ['scenes/line.scene.json', 'plant map'] });
      expect(calls.files).toBe(1);
    } finally {
      for (const stop of leave) stop();
    }
    expect(await saveAllDocuments()).toEqual({ saved: 0, failed: [] });
  });
});
