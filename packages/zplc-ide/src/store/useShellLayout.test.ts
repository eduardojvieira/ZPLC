import { describe, expect, it } from 'bun:test';
import { stubProjectLoader } from '../test/dom';

await stubProjectLoader();
// The runner has no window storage: an in-memory one, installed before the stores read it.
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return memory.size;
    },
    key: (index: number) => [...memory.keys()][index] ?? null,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  },
});
const { DEFAULT_SHELL_STATE, SHELL_STATE_VERSION, parseShellState, serializeShellState, resetLayout, useShellLayout } =
  await import('./useShellLayout');
const { useIDEStore } = await import('./useIDEStore');
const { useEditorGroups } = await import('./useEditorGroups');
const { useEditorView } = await import('./editorViewSettings');
const { SHELL_LAYOUT_ID, WORKSPACE_LAYOUT_ID } = await import('../utils/layoutStorage');

describe('what the shell remembers (UX-011, UX-012, UX-017)', () => {
  it('UX-012 keeps the navigator mode and the visibility of the sidebars through a save and a read', () => {
    const state = { activityView: 'search', navigatorMode: 'files', primaryVisible: false, secondaryVisible: false } as const;
    expect(parseShellState(serializeShellState(state))).toEqual(state);
  });

  it('UX-017 opens with the navigator by objects, the primary sidebar shown and the secondary one hidden when nothing was saved', () => {
    expect(parseShellState(null)).toEqual(DEFAULT_SHELL_STATE);
    expect(DEFAULT_SHELL_STATE).toEqual({
      activityView: 'project',
      navigatorMode: 'objects',
      primaryVisible: true,
      secondaryVisible: false,
    });
  });

  it('UX-017 does not use a document of another version, or one that does not read', () => {
    expect(parseShellState(JSON.stringify({ version: SHELL_STATE_VERSION + 1, navigatorMode: 'files' }))).toEqual(DEFAULT_SHELL_STATE);
    expect(parseShellState('{"version":')).toEqual(DEFAULT_SHELL_STATE);
    expect(parseShellState('[]')).toEqual(DEFAULT_SHELL_STATE);
  });

  it('UX-017 replaces only the field that is wrong', () => {
    const saved = JSON.stringify({
      version: SHELL_STATE_VERSION,
      activityView: 'nowhere',
      navigatorMode: 'files',
      primaryVisible: 'yes',
      secondaryVisible: false,
    });
    expect(parseShellState(saved)).toEqual({
      activityView: 'project',
      navigatorMode: 'files',
      primaryVisible: true,
      secondaryVisible: false,
    });
  });

  it('SHL-015 a state of another version gives the defaults', () => {
    const other = JSON.stringify({
      version: SHELL_STATE_VERSION - 1,
      activityView: 'search',
      navigatorMode: 'files',
      primaryVisible: false,
    });
    expect(parseShellState(other)).toEqual(DEFAULT_SHELL_STATE);
    expect(parseShellState(JSON.stringify({ ...JSON.parse(serializeShellState(DEFAULT_SHELL_STATE)), version: undefined }))).toEqual(
      DEFAULT_SHELL_STATE,
    );
  });

  it('SHL-015 a wrong field of the current version gives its default and keeps the others', () => {
    const saved = JSON.stringify({
      version: SHELL_STATE_VERSION,
      activityView: 'tests',
      navigatorMode: 7,
      primaryVisible: false,
      secondaryVisible: null,
    });
    expect(parseShellState(saved)).toEqual({ ...DEFAULT_SHELL_STATE, activityView: 'tests', primaryVisible: false });
  });

  it('SHL-015 an unknown activity gives Project', () => {
    const saved = JSON.stringify({ version: SHELL_STATE_VERSION, activityView: 'plant-from-the-future', navigatorMode: 'files' });
    expect(parseShellState(saved)).toEqual({ ...DEFAULT_SHELL_STATE, navigatorMode: 'files' });
  });

  it('SHL-015 reset layout restores the defaults and keeps preferences', () => {
    localStorage.setItem(`react-resizable-panels:${SHELL_LAYOUT_ID}`, '{"primary":40}');
    localStorage.setItem(`react-resizable-panels:${WORKSPACE_LAYOUT_ID}`, '{"editor":50}');
    localStorage.setItem('unrelated-preference', 'kept');
    useEditorView.getState().setMinimap(true);
    useShellLayout.setState({ activityView: 'tests', navigatorMode: 'files', primaryVisible: false, secondaryVisible: true });
    useIDEStore.setState({ activeConsoleTab: 'problems', isConsoleCollapsed: true });
    useEditorGroups.setState({ groups: { second: ['file:a.st'], activeSecond: 'file:a.st', focused: 'second', ratio: 0.3 } as never });

    resetLayout();

    const { activityView, navigatorMode, primaryVisible, secondaryVisible, maximised } = useShellLayout.getState();
    expect({ activityView, navigatorMode, primaryVisible, secondaryVisible }).toEqual(DEFAULT_SHELL_STATE);
    expect(maximised).toBe(false);
    expect(useIDEStore.getState().activeConsoleTab).toBe('output');
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(false);
    expect(useEditorGroups.getState().groups.second).toEqual([]);
    expect(localStorage.getItem(`react-resizable-panels:${SHELL_LAYOUT_ID}`)).toBeNull();
    expect(localStorage.getItem(`react-resizable-panels:${WORKSPACE_LAYOUT_ID}`)).toBeNull();
    expect(localStorage.getItem('unrelated-preference')).toBe('kept');
    expect(useEditorView.getState().minimap).toBe(true);
    useEditorView.getState().setMinimap(false);
  });
});
