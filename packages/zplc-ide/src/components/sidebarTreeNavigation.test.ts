import { describe, expect, test } from 'bun:test';
import type { FileTreeNode } from '../types';
import { flattenVisibleTree, resolveTreeFocus, treeNavigation } from './sidebarTreeNavigation';

const tree: FileTreeNode[] = [{
  id: 'src', name: 'src', type: 'directory', path: 'src', isExpanded: true, children: [
    { id: 'motor', name: 'Motor.st', type: 'file', path: 'src/Motor.st' },
    { id: 'nested', name: 'nested', type: 'directory', path: 'src/nested', isExpanded: false, children: [
      { id: 'hidden', name: 'Hidden.st', type: 'file', path: 'src/nested/Hidden.st' },
    ] },
  ],
}, { id: 'readme', name: 'Readme.st', type: 'file', path: 'Readme.st' }];

describe('sidebar tree navigation', () => {
  test('flattens visible nodes in preorder and omits collapsed descendants', () => {
    expect(flattenVisibleTree(tree).map((entry) => `${entry.id}:${entry.depth}:${entry.parentId ?? ''}`)).toEqual([
      'src:1:', 'motor:2:src', 'nested:2:src', 'readme:1:',
    ]);
  });

  test('finds visible neighbours, boundaries, parent and first child', () => {
    const visible = flattenVisibleTree(tree);
    expect(treeNavigation(visible, 'motor')).toMatchObject({ previous: 'src', next: 'nested', first: 'src', last: 'readme', parent: 'src' });
    expect(treeNavigation(visible, 'src')).toMatchObject({ firstChild: 'motor' });
    expect(treeNavigation(visible, 'nested').firstChild).toBeNull();
  });

  test('is deterministic for an empty tree and unknown focus', () => {
    expect(treeNavigation([], 'missing')).toEqual({ previous: null, next: null, first: null, last: null, parent: null, firstChild: null });
    expect(treeNavigation(flattenVisibleTree(tree), 'missing').next).toBeNull();
  });

  test('falls back from a removed node to a visible ancestor, then active file, then first node', () => {
    const collapsed = flattenVisibleTree([{ ...tree[0], isExpanded: false }, tree[1]]);
    expect(resolveTreeFocus(collapsed, 'motor', ['src'], 'readme')).toBe('src');
    expect(resolveTreeFocus(collapsed, 'missing', [], 'readme')).toBe('readme');
    expect(resolveTreeFocus(collapsed, 'missing', [], 'missing')).toBe('src');
    expect(resolveTreeFocus([], 'motor', ['src'], 'readme')).toBeNull();
  });
});
