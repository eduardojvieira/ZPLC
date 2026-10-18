import { describe, expect, it } from 'bun:test';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';
import { SEARCH_LIMITS, readSearchableFiles, searchProject } from './projectSearch';

const files = [
  { path: 'src/B.st', content: 'PROGRAM B\n  motor := TRUE;\nEND_PROGRAM' },
  { path: 'src/A.st', content: 'PROGRAM A\n    Motor := FALSE;\n  motor2 := motor;\nEND_PROGRAM' },
];

describe('search in the project (UX-011)', () => {
  it('UX-011 groups the matches by file in path order, with the line and column of each', () => {
    const found = searchProject(files, 'motor');
    expect(found.files.map((file) => file.path)).toEqual(['src/A.st', 'src/B.st']);
    expect(found.files[0]!.matches.map((match) => [match.line, match.column])).toEqual([[2, 5], [3, 3], [3, 13]]);
    expect(found.total).toBe(4);
    expect(found.truncated).toBe(false);
  });

  it('UX-011 ignores case unless asked not to, and finds nothing for a blank query', () => {
    expect(searchProject(files, 'MOTOR').total).toBe(4);
    expect(searchProject(files, 'Motor', { caseSensitive: true }).total).toBe(1);
    expect(searchProject(files, '   ').total).toBe(0);
    expect(searchProject(files, 'absent').files).toEqual([]);
  });

  it('UX-011 gives the line text without its indentation and where the match is in it', () => {
    const match = searchProject(files, 'Motor', { caseSensitive: true }).files[0]!.matches[0]!;
    expect(match.text).toBe('Motor := FALSE;');
    expect(match.text.slice(match.start, match.start + match.length)).toBe('Motor');
  });

  it('UX-011 stops at the match limit and says so', () => {
    const many = [{ path: 'src/Many.st', content: Array.from({ length: SEARCH_LIMITS.matches + 50 }, () => 'x').join('\n') }, { path: 'src/More.st', content: 'x\n'.repeat(600) }];
    const found = searchProject(many, 'x');
    expect(found.total).toBeLessThanOrEqual(SEARCH_LIMITS.matches);
    expect(found.truncated).toBe(true);
  });
});

const node = (path: string, language: FileTreeNode['language']): FileTreeNode => ({ id: path, name: path.split('/').at(-1)!, type: 'file', path, language });
const tree: FileTreeNode = { id: 'root', name: 'P', type: 'directory', path: '', children: [node('src/Open.st', 'ST'), node('src/Disk.st', 'ST'), node('src/List.il', 'IL'), node('src/Diagram.fbd.json', 'FBD')] };

describe('the files the search reads (UX-011)', () => {
  it('UX-011 reads the text of the open editor (unsaved edits included) before the disk, and leaves diagrams out', async () => {
    const loaded = new Map([['src/Open.st', { content: 'unsaved edit' } as ProjectFileWithHandle]]);
    const read = async (file: FileTreeNode): Promise<string> => `disk ${file.path}`;
    const found = await readSearchableFiles({ tree, loaded, read });
    expect(found).toEqual([
      { path: 'src/Open.st', content: 'unsaved edit' },
      { path: 'src/Disk.st', content: 'disk src/Disk.st' },
      { path: 'src/List.il', content: 'disk src/List.il' },
    ]);
  });

  it('UX-011 skips a file that cannot be read instead of failing the search', async () => {
    const read = async (file: FileTreeNode): Promise<string> => { if (file.path === 'src/Disk.st') throw new Error('gone'); return 'x'; };
    expect((await readSearchableFiles({ tree, loaded: new Map(), read })).map((file) => file.path)).toEqual(['src/Open.st', 'src/List.il']);
  });
});
