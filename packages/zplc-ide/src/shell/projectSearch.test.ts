import { describe, expect, it } from 'bun:test';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';
import { readFileSync } from 'node:fs';
import { SEARCHABLE_LANGUAGES, SEARCH_LIMITS, readSearchableFiles, searchProject, type SearchableFile } from './projectSearch';

const files = [
  { path: 'src/B.st', content: 'PROGRAM B\n  motor := TRUE;\nEND_PROGRAM' },
  { path: 'src/A.st', content: 'PROGRAM A\n    Motor := FALSE;\n  motor2 := motor;\nEND_PROGRAM' },
];

describe('search in the project (UX-011)', () => {
  it('UX-011 groups the matches by file in path order, with the line and column of each', () => {
    const found = searchProject(files, 'motor');
    expect(found.files.map((file) => file.path)).toEqual(['src/A.st', 'src/B.st']);
    expect(found.files[0]!.matches.map((match) => [match.line, match.column])).toEqual([
      [2, 5],
      [3, 3],
      [3, 13],
    ]);
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
    const many = [
      { path: 'src/Many.st', content: Array.from({ length: SEARCH_LIMITS.matches + 50 }, () => 'x').join('\n') },
      { path: 'src/More.st', content: 'x\n'.repeat(600) },
    ];
    const found = searchProject(many, 'x');
    expect(found.total).toBeLessThanOrEqual(SEARCH_LIMITS.matches);
    expect(found.truncated).toBe(true);
  });
});

const node = (path: string, language: FileTreeNode['language']): FileTreeNode => ({
  id: path,
  name: path.split('/').at(-1)!,
  type: 'file',
  path,
  language,
});
const tree: FileTreeNode = {
  id: 'root',
  name: 'P',
  type: 'directory',
  path: '',
  children: [node('src/Open.st', 'ST'), node('src/Disk.st', 'ST'), node('src/List.il', 'IL'), node('src/Diagram.fbd.json', 'FBD')],
};

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
    const read = async (file: FileTreeNode): Promise<string> => {
      if (file.path === 'src/Disk.st') throw new Error('gone');
      return 'x';
    };
    expect((await readSearchableFiles({ tree, loaded: new Map(), read })).map((file) => file.path)).toEqual(['src/Open.st', 'src/List.il']);
  });
});

const project = (path: string): string => readFileSync(new URL(`../../projects/${path}`, import.meta.url), 'utf8');
const diagram = (path: string, language: 'LD' | 'FBD' | 'SFC', source: string): SearchableFile => ({
  path,
  language,
  content: project(source),
});
const ladder = diagram('src/SealIn.ld.json', 'LD', 'seal_in_ladder/src/SealIn.ld.json');
const fbd = diagram('src/BatchCount.fbd.json', 'FBD', 'batch_count_fbd/src/BatchCount.fbd.json');
const sfc = diagram('src/PressCell.sfc.json', 'SFC', 'sfc_press_cell/src/PressCell.sfc.json');

describe('search in the diagrams (FND-003)', () => {
  it('FND-003 a variable used in a rung is found', () => {
    const found = searchProject([ladder], 'StartPB', { caseSensitive: true });
    const elements = found.files[0]!.matches.map((match) => match.element);
    expect(elements).toContain('rung:rung_1/cell:0,1');
  });

  it('FND-003 a variable used in an FBD block and in an SFC transition is found', () => {
    const inBlock = searchProject([fbd], 'PartSensor').files[0]!.matches;
    expect(inBlock.map((match) => [match.element, match.field])).toContainEqual(['block:var_sensor', 'variableName']);
    const inTransition = searchProject([sfc], 'Fault').files[0]!.matches;
    const condition = inTransition.find((match) => match.element === 'transition:t_start');
    expect(condition?.field).toBe('condition');
    expect(condition?.text.slice(condition.start, condition.start + condition.length)).toBe('Fault');
  });

  it('FND-003 a comment of a diagram is found', () => {
    const found = searchProject([ladder], 'seal-in').files[0]!.matches;
    expect(found.some((match) => match.element === 'rung:rung_1' && match.field === 'comment')).toBe(true);
  });

  it('FND-003 a match of a diagram carries its element and no line', () => {
    const match = searchProject([ladder], 'StopPB').files[0]!.matches.find((found) => found.field === 'variable')!;
    expect(match.element).toBe('rung:rung_1/cell:0,0');
    expect(match.line).toBe(1);
    expect(match.column).toBe(1);
  });

  it('FND-003 a row of a variable table is a match with its name and no element', () => {
    const rows = searchProject([ladder], 'Motor', { caseSensitive: true }).files[0]!.matches.filter((match) => match.table !== undefined);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.element).toBeUndefined();
  });

  it('FND-003 a document that is not valid contributes no match and does not fail the search', () => {
    const broken: SearchableFile = { path: 'src/Bad.ld.json', language: 'LD', content: '{ not json' };
    expect(searchProject([broken, ladder], 'StartPB').files.map((file) => file.path)).toEqual(['src/SealIn.ld.json']);
  });

  it('FND-003 the text search of Structured Text and Instruction List is unchanged beside diagrams', () => {
    const found = searchProject([...files, ladder], 'motor');
    expect(found.files[0]!.matches[0]).toEqual({ line: 2, column: 5, text: 'Motor := FALSE;', start: 0, length: 5 });
    expect(found.files.find((file) => file.path === 'src/B.st')!.matches[0]!.element).toBeUndefined();
  });

  it('FND-003 says how many files were searched', () => {
    expect(searchProject([...files, ladder], 'absent').searched).toBe(3);
  });

  it('FND-003 reads the diagrams too when asked, with the open buffer before the disk', async () => {
    const tree: FileTreeNode = {
      id: 'root',
      name: 'P',
      type: 'directory',
      path: '',
      children: [node('src/A.st', 'ST'), node('src/D.ld.json', 'LD'), node('src/E.sfc.json', 'SFC'), node('src/F.fbd.json', 'FBD')],
    };
    const loaded = new Map([['src/D.ld.json', { content: 'unsaved' } as ProjectFileWithHandle]]);
    const read = async (file: FileTreeNode): Promise<string> => `disk ${file.path}`;
    const found = await readSearchableFiles({ tree, loaded, read, languages: SEARCHABLE_LANGUAGES });
    expect(found.map((file) => [file.path, file.language, file.content])).toEqual([
      ['src/A.st', undefined, 'disk src/A.st'],
      ['src/D.ld.json', 'LD', 'unsaved'],
      ['src/E.sfc.json', 'SFC', 'disk src/E.sfc.json'],
      ['src/F.fbd.json', 'FBD', 'disk src/F.fbd.json'],
    ]);
  });
});
