// Resetting a lesson puts its starter files back over the learner's edits (LRN-003) and writes nowhere else.
import { describe, expect, it } from 'bun:test';
import { restoreStarterFiles } from './restoreStarter';

class FakeFile { constructor(public text = '') {} async createWritable() { return { write: async (value: string) => { this.text = value; }, close: async () => undefined }; } }
class FakeDirectory {
  files = new Map<string, FakeFile>();
  directories = new Map<string, FakeDirectory>();
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (name === '..' || name.includes('/')) throw new Error('outside');
    let directory = this.directories.get(name);
    if (!directory && options?.create) { directory = new FakeDirectory(); this.directories.set(name, directory); }
    if (!directory) throw new Error('not found');
    return directory;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    let file = this.files.get(name);
    if (!file && options?.create) { file = new FakeFile(); this.files.set(name, file); }
    if (!file) throw new Error('not found');
    return file;
  }
}
const asHandle = (directory: FakeDirectory) => directory as unknown as FileSystemDirectoryHandle;

describe('restoring the starter of a lesson', () => {
  it('overwrites an edited program and a scenario', async () => {
    const root = new FakeDirectory();
    const src = await root.getDirectoryHandle('src', { create: true });
    (await src.getFileHandle('Main.st', { create: true })).text = 'EDITED BY THE LEARNER';
    await restoreStarterFiles(asHandle(root), [{ path: 'src/Main.st', content: 'STARTER' }, { path: 'tests/a.scenario.json', content: '{"id":"A"}' }]);
    expect(src.files.get('Main.st')!.text).toBe('STARTER');
    expect(root.directories.get('tests')!.files.get('a.scenario.json')!.text).toBe('{"id":"A"}');
  });

  it('keeps a file of the learner that the starter does not have', async () => {
    const root = new FakeDirectory();
    (await root.getFileHandle('notes.txt', { create: true })).text = 'mine';
    await restoreStarterFiles(asHandle(root), [{ path: 'src/Main.st', content: 'STARTER' }]);
    expect(root.files.get('notes.txt')!.text).toBe('mine');
  });

  it('refuses a path that leaves the workspace and writes nothing before it', async () => {
    const root = new FakeDirectory();
    await expect(restoreStarterFiles(asHandle(root), [{ path: 'src/Main.st', content: 'A' }, { path: '../escape.txt', content: 'B' }])).rejects.toThrow();
    expect(root.directories.size).toBe(0);
    expect(root.files.size).toBe(0);
  });
});
