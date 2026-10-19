// UX-033: a context menu can be opened from the keyboard.
import { describe, expect, it } from 'bun:test';
import { isContextMenuKey } from './contextMenuKey';

describe('UX-033 the keys that open a context menu', () => {
  it('are the context-menu key and Shift+F10, and no other key', () => {
    expect(isContextMenuKey({ key: 'ContextMenu' })).toBe(true);
    expect(isContextMenuKey({ key: 'F10', shiftKey: true })).toBe(true);
    expect(isContextMenuKey({ key: 'F10' })).toBe(false);
    expect(isContextMenuKey({ key: 'F9', shiftKey: true })).toBe(false);
  });
});
