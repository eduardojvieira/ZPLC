import { afterEach, describe, expect, it, mock } from 'bun:test';
import { projectLoaderStub } from '../test/projectLoaderStub';

await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { checkOpenFiles, followExternalChange, restoreExternal, showChanges, useExternalConflicts } = await import('./externalChangeWatch');
const { useIDEStore } = await import('./useIDEStore');
const { useProjectSources } = await import('./projectSources');
const { useProjectTests } = await import('../projectTests/useProjectTests');
const { usePlantDocument } = await import('./usePlantDocument');
const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');

// A reading of the disk that ends when the test says, with the text the test gives.
function slowHandle() {
  let release!: (text: string) => void;
  const text = new Promise<string>((resolve) => {
    release = resolve;
  });
  const handle = { getFile: async () => ({ text: () => text }) } as unknown as FileSystemFileHandle;
  return { handle, release };
}

const ID = 'file:src/Drive.st';
const open = (handle: FileSystemFileHandle, content: string) =>
  useIDEStore.setState({
    loadedFiles: new Map([
      [ID, { id: ID, name: 'Drive.st', language: 'ST', path: 'src/Drive.st', content, isModified: false, diskContent: content, handle }],
    ]) as never,
  });
const drive = () => useIDEStore.getState().loadedFiles.get(ID);

afterEach(() => {
  useIDEStore.setState({ loadedFiles: new Map() });
  useExternalConflicts.setState({ conflicts: [], notices: [], review: null });
});

describe('checking the open files against the disk', () => {
  // The save writes beside the file and renames over it, and the watcher reports that before the save has updated
  // the workspace: a reading taken before the save must not bring the text from before it back into the editor.
  it('keeps a save that happened while the disk was read', async () => {
    const { handle, release } = slowHandle();
    open(handle, 'before');
    const check = checkOpenFiles();
    useIDEStore.setState({
      loadedFiles: new Map([[ID, { ...drive()!, content: 'saved', diskContent: 'saved', isModified: false }]]),
    });
    release('before');
    await check;

    expect(drive()?.content).toBe('saved');
    expect(drive()?.diskContent).toBe('saved');
    expect(drive()?.isModified).toBe(false);
  });

  it('reloads an unmodified file that changed outside Studio', async () => {
    const { handle, release } = slowHandle();
    open(handle, 'before');
    const check = checkOpenFiles();
    release('changed outside');
    await check;

    expect(drive()?.content).toBe('changed outside');
    expect(drive()?.diskContent).toBe('changed outside');
    expect(drive()?.isModified).toBe(false);
  });
});

// A file on a fake disk: what it holds can be read, written by Studio, and replaced from outside by the test.
function diskFile(initial: string) {
  const file = { text: initial, writes: [] as string[] };
  const handle = {
    getFile: async () => ({ text: async () => file.text, size: file.text.length }),
    createWritable: async () => ({
      write: async (text: string) => {
        file.text = text;
        file.writes.push(text);
      },
      close: async () => undefined,
    }),
  } as unknown as FileSystemFileHandle;
  return { file, handle };
}

const loaded = (id: string, path: string, content: string, handle: FileSystemFileHandle, extra: Record<string, unknown> = {}) =>
  [
    id,
    { id, name: path.split('/').at(-1)!, language: 'ST', path, content, isModified: false, diskContent: content, handle, ...extra },
  ] as const;

describe('Studio follows external edits (AIX-012)', () => {
  const refreshFileTree = async () => undefined;
  const realRefreshFileTree = useIDEStore.getState().refreshFileTree;
  afterEach(() => useIDEStore.setState({ refreshFileTree: realRefreshFileTree, directoryHandle: null, isProjectOpen: false }));
  const project = (directoryHandle: unknown, extra: Record<string, unknown> = {}) =>
    useIDEStore.setState({
      refreshFileTree,
      directoryHandle: directoryHandle as FileSystemDirectoryHandle,
      isProjectOpen: true,
      ...extra,
    } as never);

  it('reloads an open file without unsaved changes, and the notice names it with what changed and restore', async () => {
    const { file, handle } = diskFile('x := 1;');
    useIDEStore.setState({ loadedFiles: new Map([loaded(ID, 'src/Drive.st', 'x := 1;', handle)]) as never });
    project(null);
    file.text = 'x := 2;';
    await followExternalChange({ paths: ['src/Drive.st'], overflow: false });

    expect(drive()?.content).toBe('x := 2;');
    expect(drive()?.isModified).toBe(false);
    expect(useExternalConflicts.getState().notices).toEqual([
      { path: 'src/Drive.st', name: 'Drive.st', kind: 'file', before: 'x := 1;', after: 'x := 2;' },
    ]);

    showChanges('src/Drive.st');
    expect(useExternalConflicts.getState().review).toEqual({ path: 'src/Drive.st', name: 'Drive.st', before: 'x := 1;', after: 'x := 2;' });

    await restoreExternal('src/Drive.st');
    expect(file.writes).toEqual(['x := 1;']);
    expect(drive()?.content).toBe('x := 1;');
    expect(drive()?.diskContent).toBe('x := 1;');
    expect(drive()?.isModified).toBe(false);
    expect(useExternalConflicts.getState().notices).toEqual([]);
    expect(useExternalConflicts.getState().review).toBeNull();
    // The restore is Studio's own write: the watcher reports it, and nothing is said about it.
    await followExternalChange({ paths: ['src/Drive.st'], overflow: false });
    expect(useExternalConflicts.getState().notices).toEqual([]);
  });

  it('asks about an open file with unsaved changes, and does not reload it', async () => {
    const { file, handle } = diskFile('x := 1;');
    useIDEStore.setState({
      loadedFiles: new Map([loaded(ID, 'src/Drive.st', 'x := 9;', handle, { isModified: true, diskContent: 'x := 1;' })]) as never,
    });
    project(null);
    file.text = 'x := 2;';
    await followExternalChange({ paths: ['src/Drive.st'], overflow: false });

    expect(drive()?.content).toBe('x := 9;');
    expect(drive()?.isModified).toBe(true);
    expect(useExternalConflicts.getState().conflicts).toEqual([{ path: 'src/Drive.st', name: 'Drive.st', disk: 'x := 2;' }]);
    expect(useExternalConflicts.getState().notices).toEqual([]);
  });

  it('gives a notice with what changed for a file that was not open, when Studio knew its text', async () => {
    const { file, handle } = diskFile('y := 1;');
    const tree = {
      id: 'root',
      name: 'p',
      path: '',
      type: 'directory',
      children: [{ id: 'file:src/Pump.st', name: 'Pump.st', path: 'src/Pump.st', type: 'file', handle }],
    };
    project(null, { fileTree: tree });
    useProjectSources.setState({ sources: [{ path: 'src/Pump.st', name: 'Pump.st', content: 'y := 1;', language: 'ST' }] });
    try {
      file.text = 'y := 2;';
      await followExternalChange({ paths: ['src/Pump.st'], overflow: false });
      expect(useExternalConflicts.getState().notices).toEqual([
        { path: 'src/Pump.st', name: 'Pump.st', kind: 'file', before: 'y := 1;', after: 'y := 2;' },
      ]);
      expect(useIDEStore.getState().loadedFiles.size).toBe(0);

      await restoreExternal('src/Pump.st');
      expect(file.writes).toEqual(['y := 1;']);
      expect(useExternalConflicts.getState().notices).toEqual([]);
      await followExternalChange({ paths: ['src/Pump.st'], overflow: false });
      expect(useExternalConflicts.getState().notices).toEqual([]);
    } finally {
      useProjectSources.setState({ sources: [] });
      useIDEStore.setState({ fileTree: null });
    }
  });

  it('reloads the project model when zplc.json changes, and refreshes the tests when tests/ changes', async () => {
    const text = readFileSync(join(import.meta.dir, '../../projects/alarm_latch/zplc.json'), 'utf8');
    const config = JSON.parse(text);
    const renamed = JSON.stringify({ ...config, name: 'Renamed outside' });
    const { handle } = diskFile(renamed);
    const directory = {
      getFileHandle: async (name: string) =>
        name === 'zplc.json' ? handle : Promise.reject(Object.assign(new Error('x'), { name: 'NotFoundError' })),
    };
    const refresh = mock(async () => undefined);
    const realRefresh = useProjectTests.getState().refresh;
    useProjectTests.setState({ refresh });
    project(directory, { projectConfig: config, projectName: config.name, projectConfigDirty: false });
    try {
      await followExternalChange({ paths: ['zplc.json'], overflow: false });
      expect(useIDEStore.getState().projectConfig?.name).toBe('Renamed outside');
      expect(useIDEStore.getState().projectName).toBe('Renamed outside');
      expect(useExternalConflicts.getState().notices).toEqual([{ path: 'zplc.json', name: 'zplc.json', kind: 'project' }]);
      expect(refresh).toHaveBeenCalledTimes(0);

      await followExternalChange({ paths: ['tests/run.scenario.json'], overflow: false });
      expect(refresh).toHaveBeenCalledTimes(1);

      // Unsaved Project Settings are never replaced.
      useIDEStore.setState({ projectConfig: config, projectName: config.name, projectConfigDirty: true });
      await followExternalChange({ paths: ['zplc.json'], overflow: false });
      expect(useIDEStore.getState().projectConfig?.name).toBe(config.name);
    } finally {
      useProjectTests.setState({ refresh: realRefresh });
      useIDEStore.setState({ projectConfig: null, projectConfigDirty: false, directoryHandle: null, isProjectOpen: false });
    }
  });

  it('reloads the 3D plant view when scene.json or plant-map.json changes', async () => {
    project(null);
    const before = usePlantDocument.getState().sceneRevision;
    await followExternalChange({ paths: ['scene.json'], overflow: false });
    expect(usePlantDocument.getState().sceneRevision).toBe(before + 1);
    expect(useExternalConflicts.getState().notices).toEqual([{ path: 'scene.json', name: 'scene.json', kind: 'plant' }]);
    await followExternalChange({ paths: ['plant-map.json'], overflow: false });
    expect(usePlantDocument.getState().sceneRevision).toBe(before + 2);
  });

  it("Studio's own save raises no external-change notice", async () => {
    const { file, handle } = diskFile('x := 1;');
    useIDEStore.setState({ loadedFiles: new Map([loaded(ID, 'src/Drive.st', 'x := 1;', handle)]) as never });
    project(null);
    // A save writes the file and records what it wrote; the watcher then reports the write.
    file.text = 'x := 5;';
    useIDEStore.setState({ loadedFiles: new Map([[ID, { ...drive()!, content: 'x := 5;', diskContent: 'x := 5;' }]]) });
    await followExternalChange({ paths: ['src/Drive.st'], overflow: false });
    expect(useExternalConflicts.getState().notices).toEqual([]);
    expect(useExternalConflicts.getState().conflicts).toEqual([]);
    expect(drive()?.content).toBe('x := 5;');
  });
});
