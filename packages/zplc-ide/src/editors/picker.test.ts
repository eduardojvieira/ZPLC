import { describe, expect, it } from 'bun:test';

import { filterItems, freeTextOf, INITIAL_PICKER, pickerKey, pickerQuery, visibleItems, type PickerItem } from './picker';

const items: PickerItem[] = [
  { id: 'a', label: 'Start', detail: 'BOOL · input' },
  { id: 'b', label: 'Stop', detail: 'BOOL · input' },
  { id: 'c', label: 'Lamp', detail: 'BOOL · output' },
  { id: 'd', label: 'Level', detail: 'INT · input' },
  { id: 'e', label: 'TON_1.Q', detail: 'BOOL · output of TON', keywords: ['timer'] },
];

describe('LNG-012 palettes are searchable from the keyboard', () => {
  it('lists every item for an empty query, in the order of the list', () => {
    expect(filterItems(items, '').map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps the items that every word of the query finds, best matches first', () => {
    expect(filterItems(items, 'st').map((item) => item.label)).toEqual(['Start', 'Stop']);
    expect(filterItems(items, 'int').map((item) => item.label)).toEqual(['Level']);
    expect(filterItems(items, 'bool out').map((item) => item.label)).toEqual(['Lamp', 'TON_1.Q']);
    // a word inside a name finds it, after the ones that start with it
    expect(filterItems(items, 'q').map((item) => item.label)).toEqual(['TON_1.Q']);
    expect(filterItems(items, 'timer').map((item) => item.label)).toEqual(['TON_1.Q']);
    expect(filterItems(items, 'zzz')).toEqual([]);
  });

  it('moves the active item with the arrows, wrapping, and chooses with Enter', () => {
    let state = INITIAL_PICKER;
    state = pickerKey(state, items, 'ArrowDown').state;
    state = pickerKey(state, items, 'ArrowDown').state;
    expect(state.active).toBe(2);
    expect(pickerKey(state, items, 'Enter').outcome).toEqual({ kind: 'choose', item: items[2] });
    expect(pickerKey({ ...state, active: 4 }, items, 'ArrowDown').state.active).toBe(0);
    expect(pickerKey({ ...state, active: 0 }, items, 'ArrowUp').state.active).toBe(4);
    expect(pickerKey(state, items, 'End').state.active).toBe(4);
    expect(pickerKey(state, items, 'Home').state.active).toBe(0);
    expect(pickerKey(state, items, 'Escape').outcome).toEqual({ kind: 'cancel' });
  });

  it('makes the first match active again when the query changes, and chooses nothing from an empty list', () => {
    const moved = pickerKey(INITIAL_PICKER, items, 'End').state;
    expect(pickerQuery(moved, 'st')).toEqual({ query: 'st', active: 0 });
    expect(pickerKey(INITIAL_PICKER, [], 'Enter').outcome).toEqual({ kind: 'none' });
  });

  it('offers the typed text as the last item only where the list allows it and no item has that name', () => {
    expect(visibleItems(items, 'Mx', { allowFreeText: false })).toEqual([]);
    const typed = visibleItems(items, 'Mx', { allowFreeText: true });
    expect(typed).toHaveLength(1);
    expect(freeTextOf(typed[0]!)).toBe('Mx');
    expect(freeTextOf(items[0]!)).toBeUndefined();
    // the name of an item is that item, not a second one
    expect(visibleItems(items, 'start', { allowFreeText: true }).map((item) => item.id)).toEqual(['a']);
  });
});
