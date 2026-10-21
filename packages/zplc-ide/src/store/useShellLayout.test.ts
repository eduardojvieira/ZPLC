import { describe, expect, it } from 'bun:test';
import { DEFAULT_SHELL_STATE, SHELL_STATE_VERSION, parseShellState, serializeShellState } from './useShellLayout';

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
});
