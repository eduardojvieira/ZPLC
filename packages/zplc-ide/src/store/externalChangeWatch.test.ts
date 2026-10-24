import { afterEach, describe, expect, it, mock } from 'bun:test';
import { projectLoaderStub } from '../test/projectLoaderStub';

await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { checkOpenFiles } = await import('./externalChangeWatch');
const { useIDEStore } = await import('./useIDEStore');

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

afterEach(() => useIDEStore.setState({ loadedFiles: new Map() }));

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
