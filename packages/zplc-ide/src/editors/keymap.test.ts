import { describe, expect, it } from 'bun:test';

import { actionFor, actionsOf, chordOf, KEY_GROUPS, KEYMAP, parseChord, VISUAL_EDITORS } from './keymap';
import { LD_EDITOR_COMMANDS, LD_MODEL_COMMANDS } from './ld/keyboard';

describe('LNG-012 the key table of the visual editors', () => {
  it('writes the chord of a key event as the table does, with Ctrl standing for Cmd', () => {
    expect(chordOf({ key: 'ArrowLeft' })).toBe('ArrowLeft');
    expect(chordOf({ key: 'c' })).toBe('C');
    expect(chordOf({ key: 'C', shiftKey: true })).toBe('Shift+C');
    expect(chordOf({ key: 'Enter', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+Enter');
    expect(chordOf({ key: 'Enter', metaKey: true })).toBe('Ctrl+Enter');
    expect(chordOf({ key: 'ArrowUp', altKey: true })).toBe('Alt+ArrowUp');
    // shift that only made the character is not part of the chord
    expect(chordOf({ key: '?', shiftKey: true })).toBe('?');
  });

  it('turns a chord of the table back into the event that produces it', () => {
    for (const action of KEYMAP) {
      for (const chord of action.keys)
        expect([action.editor, action.id, chordOf(parseChord(chord))]).toEqual([action.editor, action.id, chord]);
    }
  });

  it('gives no chord to two actions of one editor, and a description in both languages to every action', () => {
    for (const editor of VISUAL_EDITORS) {
      const seen = new Map<string, string>();
      for (const action of actionsOf(editor)) {
        for (const chord of action.keys) {
          expect([editor, chord, seen.get(chord)]).toEqual([editor, chord, undefined]);
          seen.set(chord, action.id);
        }
        expect(action.description.en.length).toBeGreaterThan(10);
        expect(action.description.es.length).toBeGreaterThan(10);
        expect(KEY_GROUPS).toContain(action.group);
      }
    }
  });

  it('offers every editing action of each editor: cursor, insert, bind, delete in all three, and connect in the two that wire', () => {
    for (const editor of VISUAL_EDITORS) {
      const groups = new Set(actionsOf(editor).map((action) => action.group));
      for (const group of ['cursor', 'insert', 'bind', 'delete'] as const)
        expect([editor, group, groups.has(group)]).toEqual([editor, group, true]);
    }
    for (const editor of ['fbd', 'sfc'] as const)
      expect([editor, actionsOf(editor).some((action) => action.group === 'connect')]).toEqual([editor, true]);
  });

  it('finds the action of a key event by editor, and nothing for a key that is not bound', () => {
    expect(actionFor('ld', { key: 'F2' })).toBe('bindVariable');
    expect(actionFor('fbd', { key: 'c' })).toBe('connect');
    expect(actionFor('sfc', { key: 's', shiftKey: true })).toBe('insertInitialStep');
    expect(actionFor('ld', { key: 'q' })).toBeUndefined();
  });

  it('has in the ladder editor a command for every key of the table and a key for every command', () => {
    const ids = actionsOf('ld')
      .map((action) => action.id)
      .sort();
    const commands = [...LD_MODEL_COMMANDS, ...LD_EDITOR_COMMANDS].filter((id) => id !== 'insertElement').sort();
    expect(ids).toEqual(commands);
  });
});
