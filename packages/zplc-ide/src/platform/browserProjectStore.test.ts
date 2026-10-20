import { describe, expect, test } from 'bun:test';
import { createStoredFolder, forgetStoredFolder, listStoredProjects, openStoredFolder, storedFolderName } from './browserProjectStore';

/** The part of a directory handle that the store uses, in memory. */
class FakeDirectory {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeDirectory | { kind: 'file'; name: string; lastModified: number }>();
  constructor(readonly name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectory> {
    const found = this.children.get(name);
    if (found?.kind === 'directory') return found;
    if (found || !options?.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    const made = new FakeDirectory(name);
    this.children.set(name, made);
    return made;
  }
  async getFileHandle(name: string) {
    const found = this.children.get(name);
    if (found?.kind !== 'file') throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    return { getFile: async () => ({ lastModified: found.lastModified }) };
  }
  async removeEntry(name: string) { this.children.delete(name); }
  async *values() { for (const child of this.children.values()) yield child; }
  keep(name: string, lastModified: number) { this.children.set(name, { kind: 'file', name, lastModified }); }
}
const asRoot = (directory: FakeDirectory) => directory as unknown as FileSystemDirectoryHandle;

describe('the project store of the web build (REL-037, IDE-001)', () => {
  test('REL-037: a folder name is made safe and never empty', () => {
    expect(storedFolderName('Tank level / v2')).toBe('Tank-level-v2');
    expect(storedFolderName('../..')).toBe('project');
    expect(storedFolderName('')).toBe('project');
    expect(storedFolderName('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });

  test('REL-037: a second project with the same name gets its own folder, and the list shows the projects that have a zplc.json', async () => {
    const root = new FakeDirectory('projects');
    const first = await createStoredFolder(asRoot(root), 'Pump') as unknown as FakeDirectory;
    const second = await createStoredFolder(asRoot(root), 'Pump') as unknown as FakeDirectory;
    expect([first.name, second.name]).toEqual(['Pump', 'Pump-2']);
    first.keep('zplc.json', 1_700_000_000_000);
    expect(await listStoredProjects(asRoot(root))).toEqual([{ recentId: 'Pump', displayName: 'Pump', lastOpenedAt: 1_700_000_000_000, available: true }]);
  });

  test('REL-037: a stored project opens by its id and is forgotten by it; an unknown id is refused', async () => {
    const root = new FakeDirectory('projects');
    const made = await createStoredFolder(asRoot(root), 'Tank') as unknown as FakeDirectory;
    expect(await openStoredFolder(asRoot(root), 'Tank') as unknown).toBe(made);
    await expect(openStoredFolder(asRoot(root), '../escape')).rejects.toThrow();
    await forgetStoredFolder(asRoot(root), 'Tank');
    expect(root.children.size).toBe(0);
  });
});
