import { describe, expect, test } from 'bun:test';
import { createProjectFolder, readProjectFile, removeProjectEntry, renameProjectEntry, writeProjectFile } from './projectOps';

type Node = Dir | File;
class File {
  readonly kind = 'file' as const;
  constructor(
    readonly name: string,
    public bytes = new Uint8Array(),
  ) {}
  async getFile() {
    const bytes = this.bytes;
    return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }
  async createWritable() {
    return {
      write: async (data: Uint8Array) => {
        this.bytes = new Uint8Array(data);
      },
      close: async () => undefined,
    };
  }
}
class Dir {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, Node>();
  constructor(readonly name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const found = this.children.get(name);
    if (found?.kind === 'directory') return found;
    if (found || !options?.create) throw Object.assign(new Error('x'), { name: 'NotFoundError' });
    const made = new Dir(name);
    this.children.set(name, made);
    return made;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const found = this.children.get(name);
    if (found?.kind === 'file') return found;
    if (found || !options?.create) throw Object.assign(new Error('x'), { name: 'NotFoundError' });
    const made = new File(name);
    this.children.set(name, made);
    return made;
  }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    const found = this.children.get(name);
    if (!found) throw Object.assign(new Error('x'), { name: 'NotFoundError' });
    if (found.kind === 'directory' && found.children.size > 0 && !options?.recursive)
      throw Object.assign(new Error('x'), { name: 'InvalidModificationError' });
    this.children.delete(name);
  }
  async *values() {
    yield* this.children.values();
  }
}
const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('project operations on a browser folder (REL-037, IDE-001)', () => {
  test('REL-037: write and read a file in a new folder, and rename a folder with its files', async () => {
    const root = new Dir('p') as unknown as FileSystemDirectoryHandle;
    await createProjectFolder(root, 'lib/sub');
    await writeProjectFile(root, 'lib/sub/a.st', bytes('PROGRAM a END_PROGRAM'));
    expect(text(await readProjectFile(root, 'lib/sub/a.st'))).toBe('PROGRAM a END_PROGRAM');
    await renameProjectEntry(root, 'lib', 'code');
    expect(text(await readProjectFile(root, 'code/sub/a.st'))).toBe('PROGRAM a END_PROGRAM');
    await expect(readProjectFile(root, 'lib/sub/a.st')).rejects.toThrow();
  });

  test('REL-037: a path that leaves the folder, and a rename onto an existing name, are refused', async () => {
    const root = new Dir('p') as unknown as FileSystemDirectoryHandle;
    await writeProjectFile(root, 'a.st', bytes('1'));
    await writeProjectFile(root, 'b.st', bytes('2'));
    await expect(readProjectFile(root, '../x')).rejects.toThrow();
    await expect(writeProjectFile(root, '/etc/x', bytes('1'))).rejects.toThrow();
    await expect(renameProjectEntry(root, 'a.st', 'b.st')).rejects.toThrow();
    await expect(renameProjectEntry(root, 'a.st', 'a.st/inside')).rejects.toThrow();
    expect(text(await readProjectFile(root, 'b.st'))).toBe('2');
  });

  test('REL-037: a folder is removed with what is in it', async () => {
    const root = new Dir('p') as unknown as FileSystemDirectoryHandle;
    await writeProjectFile(root, 'd/x.st', bytes('1'));
    await removeProjectEntry(root, 'd', true);
    await expect(readProjectFile(root, 'd/x.st')).rejects.toThrow();
  });
});
