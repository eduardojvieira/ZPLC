/**
 * Library folders (IDE-023): the folders `libraries` of zplc.json lists, whose files the build reads with `src`
 * (CMP-046). Studio keeps to the rules of the build: a folder is a plain relative path, not `src` and not under
 * `tests`; only the files directly in it are read; a folder is listed once, whatever its case.
 */
import { describe, expect, it } from 'bun:test';

import type { FileTreeNode } from '../types';
import { addLibrary, configuredLibraries, libraryProblem, projectSourceFiles, removeLibrary, unlistedSourceFiles } from './libraries';

const file = (path: string, language: FileTreeNode['language'] = 'ST'): FileTreeNode => ({ id: `file:${path}`, name: path.split('/').at(-1)!, type: 'file', path, language });
const folder = (path: string, children: FileTreeNode[]): FileTreeNode => ({ id: `dir:${path}`, name: path.split('/').at(-1)!, type: 'directory', path, children });
const tree: FileTreeNode = folder('', [
  file('zplc.json', 'LD'),
  folder('src', [file('src/Main.st'), file('src/pump.ld.json', 'LD'), folder('src/helpers', [file('src/helpers/Util.st')])]),
  folder('lib', [file('lib/Debounce.st'), file('lib/pump.ld.json', 'LD'), folder('lib/math', [file('lib/math/Scale.st')])]),
  folder('docs', [file('docs/Example.st')]),
  folder('tests', [file('tests/Helper.st')]),
]);

describe('configuredLibraries (IDE-023)', () => {
  it('reads the folders the project file lists, in order, as the build does', () => {
    expect(configuredLibraries({ name: 'P', version: '1.0.0', libraries: ['lib', 'vendor/acme'] })).toEqual(['lib', 'vendor/acme']);
  });

  it('leaves out what the build would refuse: not a list of folders, src, tests, a path that leaves the project, a repeat', () => {
    expect(configuredLibraries({ libraries: 'lib' })).toEqual([]);
    expect(configuredLibraries({ libraries: [3, null, '', '..', '../x', '/etc', 'a\\b', 'src', 'tests', 'tests/x', 'SRC'] })).toEqual([]);
    expect(configuredLibraries({ libraries: ['lib', 'LIB', 'Lib'] })).toEqual(['lib']);
    expect(configuredLibraries(null)).toEqual([]);
  });
});

describe('libraryProblem (IDE-023)', () => {
  it('accepts a folder of the project that is not a library yet', () => {
    expect(libraryProblem('lib', tree, [])).toBeNull();
    expect(libraryProblem('docs', tree, ['lib'])).toBeNull();
    expect(libraryProblem('lib/math', tree, ['lib'])).toBeNull();
  });

  it('says why a folder cannot be added, in the words of the build where it has them', () => {
    expect(libraryProblem('', tree, [])).toContain('root');
    expect(libraryProblem('src', tree, [])).toContain('source folder');
    expect(libraryProblem('tests', tree, [])).toContain('scenarios');
    expect(libraryProblem('../out', tree, [])).toContain('relative path');
    expect(libraryProblem('nowhere', tree, [])).toContain('not a folder of this project');
    expect(libraryProblem('src/Main.st', tree, [])).toContain('not a folder');
    expect(libraryProblem('lib', tree, ['lib'])).toContain('already');
    expect(libraryProblem('LIB', tree, ['lib'])).toContain('already');
  });
});

describe('addLibrary and removeLibrary (IDE-023)', () => {
  it('add a folder once, after the others, and keep a folder inside another', () => {
    expect(addLibrary(['vendor'], 'lib')).toEqual(['vendor', 'lib']);
    expect(addLibrary(['lib'], 'lib')).toEqual(['lib']);
    expect(addLibrary(['lib'], 'lib/math')).toEqual(['lib', 'lib/math']);
  });

  it('remove only the named folder', () => {
    expect(removeLibrary(['lib', 'vendor'], 'lib')).toEqual(['vendor']);
    expect(removeLibrary(['lib'], 'other')).toEqual(['lib']);
  });
});

describe('projectSourceFiles (IDE-023)', () => {
  const paths = (nodes: FileTreeNode[]) => nodes.map((node) => node.path);

  it('is the Structured Text files the build reads: the ones directly in src', () => {
    expect(paths(projectSourceFiles(tree, []))).toEqual(['src/Main.st']);
  });

  it('adds the Structured Text files directly in each library folder, and not those of its subfolders', () => {
    expect(paths(projectSourceFiles(tree, ['lib']))).toEqual(['src/Main.st', 'lib/Debounce.st']);
    expect(paths(projectSourceFiles(tree, ['lib', 'lib/math']))).toEqual(['src/Main.st', 'lib/Debounce.st', 'lib/math/Scale.st']);
  });

  it('skips a library that is not in the tree, and lists a file once', () => {
    expect(paths(projectSourceFiles(tree, ['gone']))).toEqual(['src/Main.st']);
    expect(paths(projectSourceFiles(tree, ['src/helpers']))).toEqual(['src/Main.st', 'src/helpers/Util.st']);
  });
});

describe('unlistedSourceFiles (IDE-023)', () => {
  it('are the Structured Text files the build leaves out, found with the rule of the Tool API', async () => {
    expect(await unlistedSourceFiles(tree, [])).toEqual(['docs/Example.st', 'lib/Debounce.st', 'lib/math/Scale.st']);
    expect(await unlistedSourceFiles(tree, ['lib'])).toEqual(['docs/Example.st']);
    expect(await unlistedSourceFiles(null, [])).toEqual([]);
  });
});
