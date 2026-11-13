import { describe, expect, test } from 'bun:test';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';
import { referenceIndexFor, readReferenceInputFrom } from './sources';

const file = (path: string, language?: FileTreeNode['language']): FileTreeNode => ({
  id: path,
  name: path.split('/').pop()!,
  type: 'file',
  path,
  ...(language ? { language } : {}),
});
const tree: FileTreeNode = {
  id: 'root',
  name: 'p',
  type: 'directory',
  path: '',
  children: [
    file('src/Main.st', 'ST'),
    file('src/List.il', 'IL'),
    file('src/Rung.ld.json', 'LD'),
    file('tests/a.scenario.json'),
    file('zplc.json'),
  ],
};
const disk = async (node: FileTreeNode): Promise<string> => `disk ${node.path}`;
const base = {
  tree,
  loaded: new Map<string, ProjectFileWithHandle>(),
  sources: [{ path: 'src/Main.st', content: 'PROGRAM Main END_PROGRAM' }],
  config: null,
  watch: [],
  read: disk,
};

describe('the sources of the reference index', () => {
  test('FND-004 reads the five kinds of file, the open buffer before the disk', async () => {
    const loaded = new Map([['src/List.il', { content: 'unsaved' } as ProjectFileWithHandle]]);
    const input = await readReferenceInputFrom({ ...base, loaded });
    expect(input.files.map((f) => [f.path, f.language, f.content])).toEqual([
      ['src/Main.st', 'ST', 'disk src/Main.st'],
      ['src/List.il', 'IL', 'unsaved'],
      ['src/Rung.ld.json', 'LD', 'disk src/Rung.ld.json'],
    ]);
    expect(input.scenarios).toEqual([{ path: 'tests/a.scenario.json', content: 'disk tests/a.scenario.json' }]);
    expect(input.st.files.has('src/Main.st')).toBe(true);
  });

  test('FND-004 a file that cannot be read is left out and the rest is read', async () => {
    const read = async (node: FileTreeNode): Promise<string> => {
      if (node.path === 'src/Rung.ld.json') throw new Error('gone');
      return 'x';
    };
    const input = await readReferenceInputFrom({ ...base, read });
    expect(input.files.map((f) => f.path)).toEqual(['src/Main.st', 'src/List.il']);
  });

  test('FND-004 a second query on the same strings is free and a changed buffer builds a new index', async () => {
    const first = referenceIndexFor(await readReferenceInputFrom(base));
    expect(referenceIndexFor(await readReferenceInputFrom(base))).toBe(first);
    const loaded = new Map([['src/List.il', { content: 'edited' } as ProjectFileWithHandle]]);
    expect(referenceIndexFor(await readReferenceInputFrom({ ...base, loaded }))).not.toBe(first);
  });
});
