import { describe, expect, it } from 'bun:test';

import { SESSION_LIMITS, parseSessionState, type SessionState } from '../../electron/sessionStoreProtocol';
import { editorModelPath } from '../components/editorModels';
import {
  DEFAULT_WORKSPACE_LAYOUT,
  captureSession,
  planRestore,
  projectPathFromModelPath,
  workspaceLayoutFrom,
  type ViewState,
} from './sessionState';

const files = (...paths: string[]) => new Map(paths.map((path) => [`file:${path}`, { path }]));
const views = (entries: Record<string, ViewState>) => new Map(Object.entries(entries));
const base = {
  openTabs: ['file:src/Motor.st', 'file:src/Pump.st'],
  activeFileId: 'file:src/Pump.st' as string | null,
  files: files('src/Motor.st', 'src/Pump.st'),
  viewStates: views({ 'src/Motor.st': { line: 21, column: 5, scrollTop: 120 } }),
  layout: null as { editor: number; console: number } | null,
  consoleCollapsed: false,
};

describe('capturing the session of an open project (IDE-008)', () => {
  it('keeps the tabs in order with the cursor and scroll of each, one at line 1 column 1 when none was seen', () => {
    const state = captureSession(base);
    expect(state.tabs).toEqual([
      { path: 'src/Motor.st', line: 21, column: 5, scrollTop: 120 },
      { path: 'src/Pump.st', line: 1, column: 1, scrollTop: 0 },
    ]);
    expect(state.activePath).toBe('src/Pump.st');
    expect(state.panels).toBeNull();
  });

  it('produces a document that the shared validator accepts, whatever the editor reported', () => {
    const state = captureSession({
      ...base,
      viewStates: views({
        'src/Motor.st': { line: 21.7, column: 0, scrollTop: 120.4 },
        'src/Pump.st': { line: Number.NaN, column: 3, scrollTop: -5 },
      }),
    });
    expect(parseSessionState(state)).toEqual(state);
    expect(state.tabs[0]).toEqual({ path: 'src/Motor.st', line: 22, column: 1, scrollTop: 120 });
    expect(state.tabs[1]).toEqual({ path: 'src/Pump.st', line: 1, column: 3, scrollTop: 0 });
  });

  it('leaves out a tab whose file is not loaded or whose path the document cannot hold, and the active tab if it is not a tab', () => {
    const state = captureSession({
      ...base,
      openTabs: ['file:src/Motor.st', 'file:src/Gone.st', 'file:../escape.st'],
      files: new Map([...files('src/Motor.st'), ['file:../escape.st', { path: '../escape.st' }]]),
      activeFileId: 'file:src/Gone.st',
    });
    expect(state.tabs.map((tab) => tab.path)).toEqual(['src/Motor.st']);
    expect(state.activePath).toBeNull();
    expect(captureSession({ ...base, activeFileId: null }).activePath).toBeNull();
  });

  it('keeps at most the tab limit', () => {
    const paths = Array.from({ length: SESSION_LIMITS.maxTabs + 5 }, (_, index) => `src/p${index}.st`);
    const state = captureSession({
      ...base,
      openTabs: paths.map((path) => `file:${path}`),
      files: files(...paths),
      activeFileId: `file:${paths[1]}`,
    });
    expect(state.tabs).toHaveLength(SESSION_LIMITS.maxTabs);
    expect(parseSessionState(state)).not.toBeNull();
    expect(state.activePath).toBe(paths[1]!);
  });

  it('records the panel split, and the collapsed lower panel with the default split when the user never resized', () => {
    expect(captureSession({ ...base, layout: { editor: 55, console: 45 } }).panels).toEqual({
      editor: 55,
      console: 45,
      consoleCollapsed: false,
    });
    expect(captureSession({ ...base, consoleCollapsed: true }).panels).toEqual({ ...DEFAULT_WORKSPACE_LAYOUT, consoleCollapsed: true });
    expect(captureSession({ ...base, layout: { editor: 55, console: 45 }, consoleCollapsed: true }).panels).toEqual({
      editor: 55,
      console: 45,
      consoleCollapsed: true,
    });
  });
});

describe('planning the restore of a saved session (IDE-008)', () => {
  const saved: SessionState = {
    schemaVersion: 1,
    tabs: [
      { path: 'src/Motor.st', line: 21, column: 5, scrollTop: 120 },
      { path: 'src/Pump.st', line: 3, column: 1, scrollTop: 0 },
      { path: 'src/Valve.st', line: 8, column: 2, scrollTop: 40 },
    ],
    activePath: 'src/Pump.st',
    panels: { editor: 60, console: 40, consoleCollapsed: true },
  };
  const all = () => true;

  it('restores every tab in order, the active one, the cursors and the panels', () => {
    const plan = planRestore(saved, all);
    expect(plan.tabPaths).toEqual(['src/Motor.st', 'src/Pump.st', 'src/Valve.st']);
    expect(plan.activePath).toBe('src/Pump.st');
    expect([...plan.viewStates]).toEqual([
      ['src/Motor.st', { line: 21, column: 5, scrollTop: 120 }],
      ['src/Pump.st', { line: 3, column: 1, scrollTop: 0 }],
      ['src/Valve.st', { line: 8, column: 2, scrollTop: 40 }],
    ]);
    expect(plan.layout).toEqual({ editor: 60, console: 40 });
    expect(plan.consoleCollapsed).toBe(true);
  });

  it('silently drops a tab whose file no longer exists and falls back to the last tab that does', () => {
    const plan = planRestore(saved, (path) => path !== 'src/Pump.st');
    expect(plan.tabPaths).toEqual(['src/Motor.st', 'src/Valve.st']);
    expect(plan.activePath).toBe('src/Valve.st');
    expect(plan.viewStates.has('src/Pump.st')).toBe(false);
    expect(planRestore(saved, (path) => path === 'src/Motor.st').activePath).toBe('src/Motor.st');
  });

  it('restores nothing, and no active tab, when no file is left', () => {
    const plan = planRestore(saved, () => false);
    expect(plan.tabPaths).toEqual([]);
    expect(plan.activePath).toBeNull();
    expect(plan.viewStates.size).toBe(0);
  });

  it('ignores a panel split outside what the panels allow, and a session with no panels', () => {
    for (const panels of [
      { editor: 10, console: 90 },
      { editor: 99, console: 1 },
      { editor: 0, console: 0 },
    ]) {
      const plan = planRestore({ ...saved, panels: { ...panels, consoleCollapsed: false } }, all);
      expect(plan.layout).toBeNull();
      expect(plan.consoleCollapsed).toBe(false);
    }
    const none = planRestore({ ...saved, panels: null }, all);
    expect(none.layout).toBeNull();
    expect(none.consoleCollapsed).toBeNull();
  });
});

describe('reading the split the panel library reports (IDE-008)', () => {
  it('takes the editor and lower panel sizes of an expanded workbench', () => {
    expect(workspaceLayoutFrom({ editor: 72, console: 28 })).toEqual({ editor: 72, console: 28 });
    expect(workspaceLayoutFrom({ editor: 35, console: 65 })).toEqual({ editor: 35, console: 65 });
  });

  it('takes nothing from a collapsed lower panel, an unknown group or a size that is not a number', () => {
    expect(workspaceLayoutFrom({ editor: 97.5, console: 2.5 })).toBeNull();
    expect(workspaceLayoutFrom({ editor: 72 })).toBeNull();
    expect(workspaceLayoutFrom({ left: 50, right: 50 })).toBeNull();
    expect(workspaceLayoutFrom({ editor: Number.NaN, console: 28 })).toBeNull();
    expect(workspaceLayoutFrom({})).toBeNull();
  });
});

describe('finding the project file an editor model shows (IDE-008)', () => {
  /** Monaco reports the decoded path of a model's URI. */
  const reported = (projectSession: number, fileId: string) =>
    decodeURIComponent(new URL(editorModelPath(projectSession, fileId)).pathname);

  it('gives the project-relative path of the file behind the model, whatever the session', () => {
    expect(projectPathFromModelPath(reported(3, 'file:src/Motor.st'))).toBe('src/Motor.st');
    expect(projectPathFromModelPath(reported(12, 'file:Motor.st'))).toBe('Motor.st');
    expect(projectPathFromModelPath(reported(1, 'file:src/温度 sensor.st'))).toBe('src/温度 sensor.st');
  });

  it('gives nothing for a path that is not a project file model', () => {
    for (const path of ['', '/', '/3/src/Motor.st', '/x/file:src/Motor.st', '/3/file:', 'file:src/Motor.st'])
      expect(projectPathFromModelPath(path)).toBeNull();
  });
});

describe('the editor split in the session (SHL-006, IDE-008)', () => {
  const split = { second: ['file:src/Pump.st'], activeSecond: 'file:src/Pump.st' as string | null, ratio: 0.35 };
  const exists = () => true;

  it('SHL-006 the split and its ratio are restored with the session', () => {
    const state = captureSession({ ...base, split });
    expect(state.split).toEqual({ second: ['src/Pump.st'], activeSecond: 'src/Pump.st', ratio: 0.35 });
    expect(parseSessionState(state)).toEqual(state);
    expect(planRestore(state, exists).split).toEqual({ secondPaths: ['src/Pump.st'], activeSecondPath: 'src/Pump.st', ratio: 0.35 });
  });

  it('records no split key for one group, and leaves out views that are not recorded tabs', () => {
    expect('split' in captureSession(base)).toBe(false);
    expect('split' in captureSession({ ...base, split: null })).toBe(false);
    expect('split' in captureSession({ ...base, split: { ...split, second: ['settings', 'file:src/Gone.st'] } })).toBe(false);
  });

  it('a session saved by 2.0 restores as one group', () => {
    const saved2 = JSON.parse(
      '{"schemaVersion":1,"tabs":[{"path":"src/Motor.st","line":3,"column":1,"scrollTop":0}],"activePath":"src/Motor.st",' +
        '"panels":{"editor":72,"console":28,"consoleCollapsed":false}}',
    ) as unknown;
    const state = parseSessionState(saved2);
    expect(state).not.toBeNull();
    const plan = planRestore(state!, exists);
    expect(plan.split).toBeNull();
    expect(plan.tabPaths).toEqual(['src/Motor.st']);
  });

  it('files of the second group that no longer exist leave it, and an empty second group is no split', () => {
    const state = captureSession({ ...base, split });
    expect(planRestore(state, (path) => path !== 'src/Pump.st').split).toBeNull();
    const two = captureSession({
      ...base,
      openTabs: [...base.openTabs, 'file:src/Valve.st'],
      files: files('src/Motor.st', 'src/Pump.st', 'src/Valve.st'),
      split: { ...split, second: ['file:src/Pump.st', 'file:src/Valve.st'], activeSecond: 'file:src/Valve.st' },
    });
    expect(planRestore(two, (path) => path !== 'src/Valve.st').split).toEqual({
      secondPaths: ['src/Pump.st'],
      activeSecondPath: null,
      ratio: 0.35,
    });
  });
});
