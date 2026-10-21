import { describe, expect, it } from 'bun:test';

import type { FileTreeNode } from '../types';
import {
  collectFolders,
  copyName,
  entryNameProblem,
  expandPath,
  joinPath,
  nameClash,
  parentPath,
  preserveExpansion,
  remapOpenFiles,
  remapPath,
  removeOpenFiles,
  renameTaskPrograms,
  taskProgramName,
  type OpenFilesState,
} from './treeOperations';

const file = (path: string): FileTreeNode => ({ id: `file:${path}`, name: path.split('/').at(-1)!, type: 'file', path });
const folder = (path: string, children: FileTreeNode[]): FileTreeNode => ({
  id: `dir:${path || '/'}`,
  name: path.split('/').at(-1) || 'project',
  type: 'directory',
  path,
  children,
});

describe('names in the project tree (IDE-004)', () => {
  it('accepts one plain name and says why it refuses anything else', () => {
    expect(entryNameProblem('Motor.st')).toBeNull();
    expect(entryNameProblem('  Motor.st  ')).toBeNull();
    for (const bad of ['', '   ', '.', '..', 'a/b.st', 'a\\b.st', 'a:b.st', 'name.', 'x'.repeat(256)])
      expect(entryNameProblem(bad)).toEqual(expect.any(String));
  });

  it('joins and splits project paths', () => {
    expect(joinPath('src', 'Motor.st')).toBe('src/Motor.st');
    expect(joinPath('', 'src')).toBe('src');
    expect(parentPath('src/lib/Motor.st')).toBe('src/lib');
    expect(parentPath('src')).toBe('');
  });

  it('moves a path with its folder: only the entry itself and what is under it', () => {
    expect(remapPath('src/lib', 'src/lib', 'old/lib')).toBe('old/lib');
    expect(remapPath('src/lib/Motor.st', 'src/lib', 'old/lib')).toBe('old/lib/Motor.st');
    expect(remapPath('src/library/Motor.st', 'src/lib', 'old/lib')).toBeNull();
    expect(remapPath('src/Motor.st', 'src/lib', 'old/lib')).toBeNull();
  });
});

describe('a copy of a file (IDE-004)', () => {
  it('is named after the file with _copy before the extension, and numbered until the name is free', () => {
    const taken = new Set<string>();
    const free = (candidate: string) => !taken.has(candidate.toLowerCase());
    expect(copyName('Motor.st', free)).toBe('Motor_copy.st');
    taken.add('motor_copy.st');
    expect(copyName('Motor.st', free)).toBe('Motor_copy2.st');
    taken.add('motor_copy2.st');
    expect(copyName('Motor.st', free)).toBe('Motor_copy3.st');
  });

  it('keeps a double extension together, and a name with no extension whole', () => {
    expect(copyName('Boiler.ld.json', () => true)).toBe('Boiler_copy.ld.json');
    expect(copyName('Notes', () => true)).toBe('Notes_copy');
    expect(copyName('Globals.gvl', () => true)).toBe('Globals_copy.gvl');
  });
});

describe('names that the build reads as one (IDE-004)', () => {
  const tree = folder('', [
    folder('src', [file('src/Motor.st'), file('src/Boiler.ld.json'), folder('src/lib', [file('src/lib/Pump.st')])]),
    file('zplc.json'),
  ]);

  it('finds a program of another folder or another case under the same name', () => {
    expect(nameClash(tree, 'motor.ST', null)?.path).toBe('src/Motor.st');
    expect(nameClash(tree, 'Pump.st', null)?.path).toBe('src/lib/Pump.st');
    expect(nameClash(tree, 'Boiler.ld', null)?.path).toBe('src/Boiler.ld.json');
  });

  it('does not count the entry being renamed or moved, nor files the build does not read', () => {
    expect(nameClash(tree, 'Motor.st', 'src/Motor.st')).toBeNull();
    expect(nameClash(tree, 'zplc.json', null)).toBeNull();
    expect(nameClash(tree, 'Other.st', null)).toBeNull();
  });
});

describe('the programs a task names (IDE-004)', () => {
  it('names a visual program the way a task does', () => {
    expect(taskProgramName('Motor.st')).toBe('Motor.st');
    expect(taskProgramName('Boiler.ld.json')).toBe('Boiler.ld');
  });

  it('follows a renamed file in every task that runs it, whatever the case, and says how many changed', () => {
    const tasks = [
      { name: 'A', programs: ['motor.st', 'Pump.st'] },
      { name: 'B', programs: ['Boiler.ld'] },
      { name: 'C', programs: ['Pump.st'] },
    ];
    const result = renameTaskPrograms(tasks, 'Motor.st', 'Drive.st');
    expect(result.tasks.map((task) => task.programs)).toEqual([['Drive.st', 'Pump.st'], ['Boiler.ld'], ['Pump.st']]);
    expect(result.changed).toBe(1);
    const visual = renameTaskPrograms(tasks, 'Boiler.ld.json', 'Furnace.ld.json');
    expect(visual.tasks[1]!.programs).toEqual(['Furnace.ld']);
    expect(renameTaskPrograms(tasks, 'Absent.st', 'Other.st').changed).toBe(0);
  });
});

describe('open files when their path changes (IDE-004)', () => {
  const entry = (path: string, content: string, isModified: boolean) => ({
    id: `file:${path}`,
    name: path.split('/').at(-1)!,
    language: 'ST' as const,
    content,
    isModified,
    path,
    parentPath: parentPath(path),
  });
  const state = (): OpenFilesState => ({
    loadedFiles: new Map([
      ['file:src/Motor.st', entry('src/Motor.st', 'motor', true)],
      ['file:src/lib/Pump.st', entry('src/lib/Pump.st', 'pump', false)],
      ['file:src/Other.st', entry('src/Other.st', 'other', false)],
    ]),
    openTabs: ['file:src/Motor.st', 'file:src/lib/Pump.st', 'file:src/Other.st'],
    activeFileId: 'file:src/lib/Pump.st',
    breakpoints: new Map([
      ['file:src/Motor.st', new Set([3])],
      ['file:src/Other.st', new Set([9])],
    ]),
  });
  const handleOf = (path: string) => ({ name: path.split('/').at(-1)! }) as unknown as FileSystemFileHandle;

  it('keeps the content, the modified flag, the tab position and the active tab of a renamed file under its new identity', () => {
    const next = remapOpenFiles(state(), 'src/Motor.st', 'src/Drive.st', (path) => ({
      id: `file:${path}`,
      name: path.split('/').at(-1)!,
      type: 'file',
      path,
      handle: handleOf(path),
    }));
    const moved = next.loadedFiles.get('file:src/Drive.st')!;
    expect(next.loadedFiles.has('file:src/Motor.st')).toBe(false);
    expect([moved.name, moved.path, moved.content, moved.isModified, moved.id]).toEqual([
      'Drive.st',
      'src/Drive.st',
      'motor',
      true,
      'file:src/Drive.st',
    ]);
    expect((moved.handle as unknown as { name: string }).name).toBe('Drive.st');
    expect(next.openTabs).toEqual(['file:src/Drive.st', 'file:src/lib/Pump.st', 'file:src/Other.st']);
    expect(next.activeFileId).toBe('file:src/lib/Pump.st');
    expect([...next.breakpoints.keys()]).toEqual(['file:src/Drive.st', 'file:src/Other.st']);
    expect([...next.breakpoints.get('file:src/Drive.st')!]).toEqual([3]);
  });

  it('moves every open file under a renamed folder, and follows the active tab', () => {
    const next = remapOpenFiles(state(), 'src/lib', 'src/shared', (path) => ({
      id: `file:${path}`,
      name: path.split('/').at(-1)!,
      type: 'file',
      path,
      handle: handleOf(path),
    }));
    expect(next.loadedFiles.get('file:src/shared/Pump.st')?.parentPath).toBe('src/shared');
    expect(next.openTabs).toContain('file:src/shared/Pump.st');
    expect(next.activeFileId).toBe('file:src/shared/Pump.st');
    expect(next.loadedFiles.has('file:src/lib/Pump.st')).toBe(false);
  });

  it('leaves a file with no node in the new tree out of the result, rather than pointing at a handle that does not exist', () => {
    const next = remapOpenFiles(state(), 'src/Motor.st', 'src/Drive.st', () => null);
    expect(next.loadedFiles.has('file:src/Drive.st')).toBe(false);
    expect(next.openTabs).toEqual(['file:src/lib/Pump.st', 'file:src/Other.st']);
  });

  it('removes the open files under a deleted entry, and picks another tab when the active one goes', () => {
    const next = removeOpenFiles(state(), 'src/lib');
    expect([...next.loadedFiles.keys()]).toEqual(['file:src/Motor.st', 'file:src/Other.st']);
    expect(next.openTabs).toEqual(['file:src/Motor.st', 'file:src/Other.st']);
    expect(next.activeFileId).toBe('file:src/Other.st');
    expect([...next.breakpoints.keys()]).toEqual(['file:src/Motor.st', 'file:src/Other.st']);
  });
});

describe('which folders are open in the Explorer (IDE-004)', () => {
  const tree = (open: string[]): FileTreeNode => ({
    id: 'dir:/',
    name: 'plant',
    type: 'directory',
    path: '/',
    isExpanded: true,
    children: [
      {
        id: 'dir:src',
        name: 'src',
        type: 'directory',
        path: 'src',
        isExpanded: open.includes('src'),
        children: [
          { id: 'dir:src/lib', name: 'lib', type: 'directory', path: 'src/lib', isExpanded: open.includes('src/lib'), children: [] },
        ],
      },
    ],
  });
  const flags = (node: FileTreeNode): string[] => [
    `${node.path}:${node.isExpanded ? 'open' : 'closed'}`,
    ...(node.children ?? []).flatMap(flags),
  ];

  it('keeps the folders that were open when the tree is read again', () => {
    expect(flags(preserveExpansion(tree([]), tree(['src', 'src/lib'])))).toEqual(['/:open', 'src:open', 'src/lib:open']);
    expect(flags(preserveExpansion(tree([]), tree(['src'])))).toEqual(['/:open', 'src:open', 'src/lib:closed']);
    expect(flags(preserveExpansion(tree([]), null))).toEqual(['/:open', 'src:closed', 'src/lib:closed']);
  });

  it('opens a folder and everything above it', () => {
    expect(flags(expandPath(tree([]), 'src/lib'))).toEqual(['/:open', 'src:open', 'src/lib:open']);
    expect(flags(expandPath(tree([]), 'src'))).toEqual(['/:open', 'src:open', 'src/lib:closed']);
  });
});

describe('folders to choose from (IDE-004)', () => {
  const root: FileTreeNode = {
    id: 'dir:/',
    name: 'plant',
    type: 'directory',
    path: '/',
    children: [
      {
        id: 'dir:src',
        name: 'src',
        type: 'directory',
        path: 'src',
        children: [
          { id: 'dir:src/lib', name: 'lib', type: 'directory', path: 'src/lib', children: [] },
          { id: 'file:src/A.st', name: 'A.st', type: 'file', path: 'src/A.st' },
        ],
      },
      { id: 'dir:archive', name: 'archive', type: 'directory', path: 'archive', children: [] },
    ],
  };

  it('lists the project folder and every folder under it, in tree order, with the project folder first', () => {
    expect(collectFolders(root)).toEqual([
      { path: '', label: 'Project folder' },
      { path: 'src', label: 'src' },
      { path: 'src/lib', label: 'src/lib' },
      { path: 'archive', label: 'archive' },
    ]);
  });

  it('leaves out a folder and everything in it, so that a folder cannot be offered as its own destination', () => {
    expect(collectFolders(root, 'src').map((folder) => folder.path)).toEqual(['', 'archive']);
  });
});
