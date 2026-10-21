import { describe, expect, it } from 'bun:test';
import { filterOptions, comboKey } from './combobox';
import { flattenTree, treeKey, type TreeNodeSpec } from './tree';
import { sortRows, nextSort } from './dataGrid';

describe('combo box logic (UX-001)', () => {
  const options = [
    { value: 'a', label: 'Analog input' },
    { value: 'b', label: 'Boolean output' },
    { value: 'c', label: 'Analog output' },
  ];
  it('UX-001 filters the options by what was typed, ignoring case, and keeps all of them for an empty query', () => {
    expect(filterOptions(options, 'ANALOG').map((o) => o.value)).toEqual(['a', 'c']);
    expect(filterOptions(options, '').length).toBe(3);
  });
  it('UX-001 opens on ArrowDown, moves the active option, chooses on Enter and closes on Escape', () => {
    expect(comboKey('ArrowDown', { open: false, active: -1, count: 3 })).toEqual({ open: true, active: 0, action: 'none' });
    expect(comboKey('ArrowDown', { open: true, active: 2, count: 3 })).toEqual({ open: true, active: 0, action: 'none' });
    expect(comboKey('Enter', { open: true, active: 1, count: 3 })).toEqual({ open: false, active: 1, action: 'choose' });
    expect(comboKey('Escape', { open: true, active: 1, count: 3 })).toEqual({ open: false, active: -1, action: 'none' });
    expect(comboKey('Enter', { open: false, active: -1, count: 3 }).action).toBe('none');
  });
});

describe('tree logic (UX-001)', () => {
  const nodes: TreeNodeSpec[] = [
    {
      id: 'p',
      label: 'Project',
      children: [
        { id: 'p1', label: 'Main' },
        { id: 'p2', label: 'Lib', children: [{ id: 'p21', label: 'Util' }] },
      ],
    },
    { id: 'q', label: 'Boards' },
  ];
  it('UX-001 lists only the visible rows with their level, set size and position', () => {
    expect(flattenTree(nodes, new Set()).map((r) => r.id)).toEqual(['p', 'q']);
    const rows = flattenTree(nodes, new Set(['p', 'p2']));
    expect(rows.map((r) => [r.id, r.level, r.setSize, r.position])).toEqual([
      ['p', 1, 2, 1],
      ['p1', 2, 2, 1],
      ['p2', 2, 2, 2],
      ['p21', 3, 1, 1],
      ['q', 1, 2, 2],
    ]);
  });
  it('UX-001 expands with ArrowRight, collapses with ArrowLeft, goes to the parent and walks the rows with the arrows', () => {
    const open = new Set(['p']);
    const rows = flattenTree(nodes, open);
    expect(treeKey('ArrowRight', rows, 'q')).toEqual({ active: 'q', expand: null });
    expect(treeKey('ArrowRight', flattenTree(nodes, new Set()), 'p')).toEqual({ active: 'p', expand: { id: 'p', open: true } });
    expect(treeKey('ArrowRight', rows, 'p')).toEqual({ active: 'p1', expand: null });
    expect(treeKey('ArrowLeft', rows, 'p')).toEqual({ active: 'p', expand: { id: 'p', open: false } });
    expect(treeKey('ArrowLeft', rows, 'p2')).toEqual({ active: 'p', expand: null });
    expect(treeKey('ArrowDown', rows, 'p1')).toEqual({ active: 'p2', expand: null });
    expect(treeKey('End', rows, 'p')).toEqual({ active: 'q', expand: null });
  });
});

describe('data grid logic (UX-001)', () => {
  const rows = [
    { n: 'b', v: 10 },
    { n: 'a', v: 9 },
    { n: 'c', v: 100 },
  ];
  it('UX-001 sorts numbers as numbers and text by locale, leaving the input untouched, and cycles none, ascending, descending', () => {
    expect(sortRows(rows, (r) => r.v, 'ascending').map((r) => r.n)).toEqual(['a', 'b', 'c']);
    expect(sortRows(rows, (r) => r.n, 'descending').map((r) => r.n)).toEqual(['c', 'b', 'a']);
    expect(sortRows(rows, (r) => r.v, 'none')).toBe(rows);
    expect(rows[0]!.n).toBe('b');
    expect(['none', 'ascending', 'descending'].map((s) => nextSort(s as 'none'))).toEqual(['ascending', 'descending', 'none']);
  });
});
