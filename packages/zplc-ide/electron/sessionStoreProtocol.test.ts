import { describe, expect, test } from 'bun:test';

import { SESSION_LIMITS, isSessionPath, parseSessionState, type SessionState } from './sessionStoreProtocol';

const valid = (): SessionState => ({
  schemaVersion: 1,
  tabs: [
    { path: 'src/Motor.st', line: 21, column: 5, scrollTop: 120 },
    { path: 'src/Pump.st', line: 1, column: 1, scrollTop: 0 },
  ],
  activePath: 'src/Motor.st',
  panels: { editor: 60, console: 40, consoleCollapsed: false },
});

describe('session state format (IDE-008)', () => {
  test('accepts the exact document and returns an equal, fresh copy', () => {
    const input = valid();
    const parsed = parseSessionState(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed!.tabs[0]).not.toBe(input.tabs[0]);
  });

  test('accepts no tab, no active tab and no panel layout', () => {
    expect(parseSessionState({ schemaVersion: 1, tabs: [], activePath: null, panels: null })).toEqual({ schemaVersion: 1, tabs: [], activePath: null, panels: null });
  });

  test('rejects anything that is not a plain object with exactly the known keys, at every level', () => {
    for (const value of [null, undefined, 'x', 7, [], new Map(), Object.create(null), Object.assign(Object.create({ schemaVersion: 1 }), {})]) expect(parseSessionState(value)).toBeNull();
    const base = valid();
    expect(parseSessionState({ ...base, extra: true })).toBeNull();
    expect(parseSessionState({ ...base, schemaVersion: 2 })).toBeNull();
    for (const key of Object.keys(base)) {
      const { [key]: _omitted, ...without } = base as unknown as Record<string, unknown>;
      void _omitted;
      expect(parseSessionState(without)).toBeNull();
    }
    expect(parseSessionState({ ...base, tabs: [{ ...base.tabs[0], extra: 1 }] })).toBeNull();
    expect(parseSessionState({ ...base, tabs: [{ path: 'a.st', line: 1, column: 1 }] })).toBeNull();
    expect(parseSessionState({ ...base, panels: { editor: 60, console: 40, consoleCollapsed: false, extra: 1 } })).toBeNull();
    expect(parseSessionState({ ...base, panels: { editor: 60, console: 40 } })).toBeNull();
  });

  test('keeps tab paths inside the project: relative, no dot segments, no drive, no backslash', () => {
    for (const path of ['/etc/passwd', '../outside.st', 'src/../../outside.st', 'src/./a.st', 'src//a.st', 'src\\a.st', 'C:/a.st', 'a:b.st', 'src/a.st\0', '', 'src/', 'src/name.', 'src/name ']) {
      expect(isSessionPath(path)).toBe(false);
      expect(parseSessionState({ ...valid(), tabs: [{ path, line: 1, column: 1, scrollTop: 0 }], activePath: null })).toBeNull();
    }
    for (const path of ['Motor.st', 'src/Motor.st', 'a/b/c/d.fbd.json', 'src/温度.st']) expect(isSessionPath(path)).toBe(true);
    expect(isSessionPath('x'.repeat(SESSION_LIMITS.maxPathChars))).toBe(true);
    expect(isSessionPath('x'.repeat(SESSION_LIMITS.maxPathChars + 1))).toBe(false);
    expect(isSessionPath(7)).toBe(false);
  });

  test('allows at most the tab limit, without repeats, and the active tab must be one of them', () => {
    const tab = (index: number) => ({ path: `src/p${index}.st`, line: 1, column: 1, scrollTop: 0 });
    const tabs = Array.from({ length: SESSION_LIMITS.maxTabs }, (_, index) => tab(index));
    expect(parseSessionState({ ...valid(), tabs, activePath: tabs[3]!.path })).not.toBeNull();
    expect(parseSessionState({ ...valid(), tabs: [...tabs, tab(99)], activePath: null })).toBeNull();
    expect(parseSessionState({ ...valid(), tabs: [tab(1), tab(1)], activePath: null })).toBeNull();
    expect(parseSessionState({ ...valid(), activePath: 'src/Other.st' })).toBeNull();
    expect(parseSessionState({ ...valid(), activePath: 7 })).toBeNull();
  });

  test('bounds the cursor, the scroll position and the panel sizes to finite numbers in range', () => {
    const tab = (changes: object) => ({ ...valid(), tabs: [{ path: 'a.st', line: 1, column: 1, scrollTop: 0, ...changes }], activePath: null });
    expect(parseSessionState(tab({ line: SESSION_LIMITS.maxLine, column: SESSION_LIMITS.maxColumn, scrollTop: SESSION_LIMITS.maxScrollTop }))).not.toBeNull();
    for (const changes of [{ line: 0 }, { line: 1.5 }, { line: SESSION_LIMITS.maxLine + 1 }, { line: '1' }, { column: 0 }, { column: SESSION_LIMITS.maxColumn + 1 }, { scrollTop: -1 }, { scrollTop: Number.NaN }, { scrollTop: Number.POSITIVE_INFINITY }, { scrollTop: SESSION_LIMITS.maxScrollTop + 1 }]) {
      expect(parseSessionState(tab(changes))).toBeNull();
    }
    for (const panels of [{ editor: -1, console: 40 }, { editor: 101, console: 40 }, { editor: Number.NaN, console: 40 }, { editor: '60', console: 40 }, { editor: 60, console: Number.POSITIVE_INFINITY }]) {
      expect(parseSessionState({ ...valid(), panels: { ...panels, consoleCollapsed: false } })).toBeNull();
    }
    expect(parseSessionState({ ...valid(), panels: { editor: 60, console: 40, consoleCollapsed: 'no' } })).toBeNull();
  });

  test('stays far under the byte limit when every limit is used at once', () => {
    const tabs = Array.from({ length: SESSION_LIMITS.maxTabs }, (_, index) => ({ path: `${String(index).padStart(2, '0')}${'x'.repeat(SESSION_LIMITS.maxPathChars - 2)}`, line: SESSION_LIMITS.maxLine, column: SESSION_LIMITS.maxColumn, scrollTop: SESSION_LIMITS.maxScrollTop }));
    const parsed = parseSessionState({ ...valid(), tabs, activePath: tabs[0]!.path });
    expect(parsed).not.toBeNull();
    expect(new TextEncoder().encode(JSON.stringify(parsed)).length).toBeLessThan(SESSION_LIMITS.maxBytes);
  });
});
