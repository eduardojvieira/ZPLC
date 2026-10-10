/**
 * Library folders (IDE-023): folders of the project whose Structured Text files declare blocks and types that every
 * editor offers. A folder is named in `zplc.json` under `libraries`, as a path relative to the project root.
 */
import { describe, expect, it } from 'bun:test';

import type { FileTreeNode } from '../types';
import { addLibrary, configuredLibraries, libraryProblem, projectSourceFiles, removeLibrary } from './libraries';

const file = (path: string, language: FileTreeNode['language'] = 'ST'): FileTreeNode => ({ id: `file:${path}`, name: path.split('/').at(-1)!, type: 'file', path, language });
const folder = (path: string, children: FileTreeNode[]): FileTreeNode => ({ id: `dir:${path}`, name: path.split('/').at(-1)!, type: 'directory', path, children });
const tree: FileTreeNode = folder('', [
  file('zplc.json', undefined),
  folder('src', [file('src/Main.st'), file('src/pump.ld.json', 'LD'), folder('src/helpers', [file('src/helpers/Util.st')])]),
  folder('lib', [file('lib/Debounce.st'), folder('lib/math', [file('lib/math/Scale.st')])]),
  folder('docs', [file('docs/Example.st')]),
]);

describe('configuredLibraries (IDE-023)', () => {
  it('reads the folders named in the configuration, normalised, without repeats', () => {
    expect(configuredLibraries({ name: 'P', version: '1.0.0', libraries: ['lib', './lib/', 'vendor/acme', 'lib'] })).toEqual(['lib', 'vendor/acme']);
  });

  it('ignores a value that is not a list of paths', () => {
    expect(configuredLibraries({ name: 'P', version: '1.0.0', libraries: 'lib' })).toEqual([]);
    expect(configuredLibraries({ name: 'P', version: '1.0.0', libraries: [3, null, '', '..', '../x', '/etc', 'a\\b'] })).toEqual([]);
    expect(configuredLibraries(null)).toEqual([]);
  });
});

describe('libraryProblem', () => {
  it('accepts a folder of the project that is not a library yet', () => {
    expect(libraryProblem('lib', tree, [])).toBeNull();
    expect(libraryProblem('docs', tree, ['lib'])).toBeNull();
  });

  it('says why a folder cannot be added, in words', () => {
    expect(libraryProblem('', tree, [])).toContain('root');
    expect(libraryProblem('nowhere', tree, [])).toContain('not a folder of this project');
    expect(libraryProblem('src/Main.st', tree, [])).toContain('not a folder');
    expect(libraryProblem('lib', tree, ['lib'])).toContain('already');
    expect(libraryProblem('lib/math', tree, ['lib'])).toContain('inside');
  });
});

describe('addLibrary and removeLibrary', () => {
  it('add a folder once, and a library that holds others replaces them', () => {
    expect(addLibrary(['vendor'], 'lib')).toEqual(['vendor', 'lib']);
    expect(addLibrary(['vendor', 'lib/math'], 'lib')).toEqual(['vendor', 'lib']);
  });

  it('remove only the named folder', () => {
    expect(removeLibrary(['lib', 'vendor'], 'lib')).toEqual(['vendor']);
    expect(removeLibrary(['lib'], 'other')).toEqual(['lib']);
  });
});

describe('projectSourceFiles (IDE-023)', () => {
  const paths = (nodes: FileTreeNode[]) => nodes.map((node) => node.path);

  it('is the Structured Text files the build reads, the ones in src', () => {
    expect(paths(projectSourceFiles(tree, []))).toEqual(['src/Main.st']);
  });

  it('adds the Structured Text files of a library folder, at any depth, and nothing else', () => {
    expect(paths(projectSourceFiles(tree, ['lib']))).toEqual(['src/Main.st', 'lib/Debounce.st', 'lib/math/Scale.st']);
  });

  it('skips a library that is not in the tree, and counts a file once when a library lies under src', () => {
    expect(paths(projectSourceFiles(tree, ['gone']))).toEqual(['src/Main.st']);
    expect(paths(projectSourceFiles(tree, ['src/helpers']))).toEqual(['src/Main.st', 'src/helpers/Util.st']);
  });
});
