import { afterEach, describe, expect, it } from 'bun:test';
import { CONFIG_EDITOR_KINDS, configCloseNeedsConfirmation, configEditorViewId } from '../navigator/configEditors';
import { useConfigEditors } from './useConfigEditors';

afterEach(() => useConfigEditors.getState().reset());

describe('configuration editor tabs (UX-013)', () => {
  it('UX-013 has one editor for each of tasks, I/O mapping, network, communication and target', () => {
    expect([...CONFIG_EDITOR_KINDS]).toEqual(['tasks', 'io', 'network', 'communication', 'target']);
    expect(new Set(CONFIG_EDITOR_KINDS.map(configEditorViewId)).size).toBe(5);
  });

  it('UX-013 opens an editor as a tab, shows it, and does not open a second tab for the same editor', () => {
    const editors = useConfigEditors.getState();
    editors.show('tasks');
    editors.show('io');
    editors.show('tasks');
    expect(useConfigEditors.getState().open).toEqual(['tasks', 'io']);
    expect(useConfigEditors.getState().active).toBe('tasks');
  });

  it('UX-013 shows the last remaining tab when the shown one closes, and none when the last one closes', () => {
    const editors = useConfigEditors.getState();
    editors.show('tasks');
    editors.show('io');
    editors.close('io');
    expect(useConfigEditors.getState()).toMatchObject({ open: ['tasks'], active: 'tasks' });
    useConfigEditors.getState().close('tasks');
    expect(useConfigEditors.getState()).toMatchObject({ open: [], active: null });
  });

  it('UX-013 leaves the tab open but not selected when a file is shown', () => {
    useConfigEditors.getState().show('target');
    useConfigEditors.getState().deselect();
    expect(useConfigEditors.getState()).toMatchObject({ open: ['target'], active: null });
  });

  it('UX-013 asks about unsaved edits only when no other view of zplc.json stays open', () => {
    expect(configCloseNeedsConfirmation(true, 0)).toBe(true);
    expect(configCloseNeedsConfirmation(true, 1)).toBe(false);
    expect(configCloseNeedsConfirmation(false, 0)).toBe(false);
  });
});
