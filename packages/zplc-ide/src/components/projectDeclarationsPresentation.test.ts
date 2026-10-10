import { describe, expect, it } from 'bun:test';

import type { FileTreeNode } from '../types';
import { declarationKindLabel, libraryChoices, libraryRows } from './projectDeclarationsPresentation';

const file = (path: string, language: FileTreeNode['language'] = 'ST'): FileTreeNode => ({ id: `file:${path}`, name: path.split('/').at(-1)!, type: 'file', path, language });
const folder = (path: string, children: FileTreeNode[]): FileTreeNode => ({ id: `dir:${path}`, name: path.split('/').at(-1)!, type: 'directory', path, children });
const tree: FileTreeNode = folder('', [
  folder('src', [file('src/Main.st')]),
  folder('lib', [file('lib/Debounce.st'), file('lib/pump.ld.json', 'LD'), folder('lib/math', [file('lib/math/Scale.st')])]),
  folder('vendor', [folder('vendor/acme', [])]),
]);

describe('libraryRows', () => {
  it('counts the Structured Text files under each library and marks a folder that is not in the project', () => {
    expect(libraryRows(['lib', 'gone'], tree)).toEqual([
      { path: 'lib', missing: false, files: 2 },
      { path: 'gone', missing: true, files: 0 },
    ]);
  });
});

describe('libraryChoices', () => {
  it('offers every folder except the root, the libraries and what is inside them', () => {
    expect(libraryChoices(tree, ['lib']).map((choice) => choice.path)).toEqual(['src', 'vendor', 'vendor/acme']);
    expect(libraryChoices(tree, []).map((choice) => choice.path)).toEqual(['src', 'lib', 'lib/math', 'vendor', 'vendor/acme']);
  });
});

describe('declarationKindLabel', () => {
  it('names each kind in the words of the standard', () => {
    expect(declarationKindLabel('FUNCTION_BLOCK')).toBe('Function block');
    expect(declarationKindLabel('FUNCTION')).toBe('Function');
    expect(declarationKindLabel('STRUCT')).toBe('Structure');
    expect(declarationKindLabel('ENUM')).toBe('Enumeration');
  });
});
