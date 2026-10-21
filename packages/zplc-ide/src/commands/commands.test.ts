import { afterEach, describe, expect, it } from 'bun:test';
import type { MenuItemConstructorOptions } from 'electron';
import { buildMenuTemplate } from '../../electron/appMenu';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { bindCommands, getCommandState, publishCommandState, resetCommandsForTest, runCommand } from './bus';
import { menuCategories, menuCommands, menuTranslator } from './menuEntry';
import { filterEntries, fuzzyScore, nextIndex } from './palette';
import { COMMAND_CATEGORIES, COMMAND_LIST, INITIAL_COMMAND_STATE, commandById, isCommandEnabled, isCommandId } from './registry';
import {
  CHORD_TIMEOUT_MS,
  chordMatches,
  createShortcutMatcher,
  formatShortcut,
  parseChord,
  parseShortcut,
  toAccelerator,
} from './shortcuts';

const key = (name: string, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: name,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

afterEach(() => resetCommandsForTest());

describe('command registry (UX-015)', () => {
  it('UX-015 gives no two commands the same shortcut, nor a shortcut that is the first step of another', () => {
    const shortcuts = COMMAND_LIST.flatMap((command) => (command.shortcut ? [command.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    const firstSteps = shortcuts.filter((shortcut) => shortcut.includes(' ')).map((shortcut) => shortcut.split(' ')[0]!);
    for (const step of firstSteps) expect(shortcuts).not.toContain(step);
  });

  it('UX-015 declares every id once, in a category the menu has', () => {
    const ids = COMMAND_LIST.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of COMMAND_LIST) expect(COMMAND_CATEGORIES).toContain(command.category);
  });

  it('UX-015 has a title in the English and the Spanish catalog for every command and every menu', () => {
    const catalogEn = en as Record<string, string>;
    const catalogEs = es as Record<string, string>;
    const keys = [...COMMAND_LIST.map((command) => command.titleKey), ...menuCategories.map((category) => category.titleKey)];
    for (const titleKey of keys) {
      expect({ titleKey, en: typeof catalogEn[titleKey] }).toEqual({ titleKey, en: 'string' });
      expect({ titleKey, es: typeof catalogEs[titleKey] }).toEqual({ titleKey, es: 'string' });
    }
  });

  it('UX-015 keeps every shortcut that existed before the registry', () => {
    const before: Array<[string, string]> = [
      ['Mod+S', 'file.save'],
      ['Mod+B', 'build.compile'],
      ['F5', 'debug.run'],
      ['Shift+F5', 'debug.stop'],
      ['F6', 'debug.pause'],
      ['F10', 'debug.step'],
      ['F8', 'debug.reset'],
    ];
    for (const [shortcut, id] of before) expect(COMMAND_LIST.find((command) => command.shortcut === shortcut)?.id).toBe(id);
  });

  it(
    'UX-015 puts the command palette on Ctrl or Cmd+Shift+P and the shortcut reference on the two-step Ctrl or Cmd+K Ctrl or ' + 'Cmd+S',
    () => {
      expect(commandById('view.commandPalette').shortcut).toBe('Mod+Shift+P');
      expect(commandById('help.shortcuts').shortcut).toBe('Mod+K Mod+S');
    },
  );

  it('UX-015 offers a command only in a state where it can work', () => {
    const state = { ...INITIAL_COMMAND_STATE, projectOpen: true, connected: true, vmState: 'running' };
    expect(isCommandEnabled(commandById('debug.pause'), state)).toBe(true);
    expect(isCommandEnabled(commandById('debug.run'), state)).toBe(false);
    expect(isCommandEnabled(commandById('debug.stop'), state)).toBe(true);
    expect(isCommandEnabled(commandById('online.deploy'), { ...state, mode: 'hardware', compiled: false })).toBe(false);
    expect(isCommandEnabled(commandById('online.deploy'), { ...state, mode: 'hardware', compiled: true })).toBe(true);
    expect(isCommandEnabled(commandById('online.deploy'), { ...state, mode: 'hardware', compiled: true, busy: true })).toBe(false);
    expect(isCommandEnabled(commandById('file.save'), INITIAL_COMMAND_STATE)).toBe(false);
    expect(isCommandEnabled(commandById('file.open'), INITIAL_COMMAND_STATE)).toBe(true);
  });

  it('UX-015 marks every command that acts on the device or the running program as physical', () => {
    const physical = COMMAND_LIST.filter((command) => command.physical)
      .map((command) => command.id)
      .sort();
    expect(physical).toEqual([
      'debug.pause',
      'debug.reset',
      'debug.run',
      'debug.step',
      'debug.stop',
      'online.connect',
      'online.deploy',
      'online.disconnect',
    ]);
  });

  it('UX-015 reaches every command from the keyboard: by its shortcut or by the palette, which lists them all', () => {
    const entries = COMMAND_LIST.map((command) => ({ id: command.id, title: en[command.titleKey], category: command.category }));
    expect(filterEntries('', entries).map((entry) => entry.id)).toEqual(COMMAND_LIST.map((command) => command.id));
    for (const entry of entries) expect(filterEntries(entry.title, entries).map((candidate) => candidate.id)).toContain(entry.id);
  });
});

describe('application menu from the registry (UX-014, UX-015)', () => {
  const clicks: string[] = [];
  const template = buildMenuTemplate('linux', menuCommands, menuTranslator('en'), {
    isPackaged: true,
    appName: 'ZPLC',
    categories: menuCategories,
    run: (id) => {
      clicks.push(id);
    },
    requestReload: () => undefined,
  });
  const flat = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
    items.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? flat(item.submenu) : [])]);

  it('UX-014 lists every registered command in the menu of its category, once', () => {
    clicks.length = 0;
    for (const item of flat(template).filter((entry) => entry.click !== undefined)) item.click?.({} as never, undefined, {} as never);
    expect([...clicks].sort()).toEqual(COMMAND_LIST.map((command) => command.id).sort());
    expect(clicks.every(isCommandId)).toBe(true);
  });

  it('UX-014 titles the menus and the commands in the language of the setting', () => {
    const spanish = buildMenuTemplate('linux', menuCommands, menuTranslator('es'), {
      isPackaged: true,
      appName: 'ZPLC',
      categories: menuCategories,
      run: () => undefined,
      requestReload: () => undefined,
    });
    expect(template.map((menu) => menu.label)).toEqual(['File', 'Edit', 'View', 'Project', 'Build', 'Online', 'Debug', 'Help']);
    expect(spanish.map((menu) => menu.label)).toEqual([
      'Archivo',
      'Edición',
      'Ver',
      'Proyecto',
      'Compilación',
      'En línea',
      'Depuración',
      'Ayuda',
    ]);
  });

  it('UX-015 shows the shortcut of a command as the accelerator of its item; a two-step shortcut has none', () => {
    const accelerators = Object.fromEntries(menuCommands.map((command) => [command.id, command.accelerator]));
    expect(accelerators['file.save']).toBe('CmdOrCtrl+S');
    expect(accelerators['debug.stop']).toBe('Shift+F5');
    expect(accelerators['view.commandPalette']).toBe('CmdOrCtrl+Shift+P');
    expect(accelerators['help.shortcuts']).toBeNull();
  });
});

describe('shortcuts (UX-015)', () => {
  it('UX-015 parses a chord and a two-step shortcut', () => {
    expect(parseChord('Mod+Shift+P')).toEqual({ mod: true, shift: true, alt: false, key: 'p' });
    expect(parseChord('F5')).toEqual({ mod: false, shift: false, alt: false, key: 'F5' });
    expect(parseShortcut('Mod+K Mod+S')).toHaveLength(2);
    expect(() => parseChord('Mod+')).toThrow();
  });

  it('UX-015 matches Ctrl or Cmd as the command key and refuses a modifier that was not asked for', () => {
    const save = parseChord('Mod+S');
    expect(chordMatches(save, key('s', { ctrlKey: true }))).toBe(true);
    expect(chordMatches(save, key('s', { metaKey: true }))).toBe(true);
    // Caps lock gives an upper-case key without shift: the chord still matches.
    expect(chordMatches(save, key('S', { ctrlKey: true }))).toBe(true);
    expect(chordMatches(save, key('s', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(chordMatches(save, key('s', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(chordMatches(save, key('s'))).toBe(false);
    expect(chordMatches(parseChord('F5'), key('F5', { shiftKey: true }))).toBe(false);
    expect(chordMatches(parseChord('Shift+F5'), key('F5', { shiftKey: true }))).toBe(true);
    expect(chordMatches(parseChord('Mod+Shift+P'), key('P', { ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it('UX-015 writes a shortcut for the platform and for the menu', () => {
    expect(formatShortcut('Mod+Shift+P', 'linux')).toBe('Ctrl+Shift+P');
    expect(formatShortcut('Mod+Shift+P', 'darwin')).toBe('⇧⌘P');
    expect(formatShortcut('Shift+F5', 'win32', { ctrl: 'Ctrl', shift: 'Mayús', alt: 'Alt' })).toBe('Mayús+F5');
    expect(formatShortcut('Mod+K Mod+S', 'linux')).toBe('Ctrl+K Ctrl+S');
    expect(toAccelerator('Mod+S')).toBe('CmdOrCtrl+S');
    expect(toAccelerator('Mod+K Mod+S')).toBeNull();
  });

  const matcherFor = (now: () => number) =>
    createShortcutMatcher(
      COMMAND_LIST.flatMap((command) => (command.shortcut ? [{ id: command.id, chords: parseShortcut(command.shortcut) }] : [])),
      now,
    );

  it('UX-015 resolves every default shortcut to its command', () => {
    const matcher = matcherFor(() => 0);
    expect(matcher.handle(key('s', { ctrlKey: true }))).toEqual({ id: 'file.save', consumed: true });
    expect(matcher.handle(key('F5'))).toEqual({ id: 'debug.run', consumed: true });
    expect(matcher.handle(key('F5', { shiftKey: true }))).toEqual({ id: 'debug.stop', consumed: true });
    expect(matcher.handle(key('F10'))).toEqual({ id: 'debug.step', consumed: true });
    expect(matcher.handle(key('x', { ctrlKey: true }))).toEqual({ id: null, consumed: false });
  });

  it('UX-015 completes a two-step shortcut, and forgets it after a pause, another key or a modifier alone does not', () => {
    let time = 0;
    const matcher = matcherFor(() => time);
    expect(matcher.handle(key('k', { ctrlKey: true }))).toEqual({ id: null, consumed: true });
    expect(matcher.handle(key('Control', { ctrlKey: true }))).toEqual({ id: null, consumed: false });
    expect(matcher.handle(key('s', { ctrlKey: true }))).toEqual({ id: 'help.shortcuts', consumed: true });
    expect(matcher.handle(key('k', { ctrlKey: true }))).toEqual({ id: null, consumed: true });
    time += CHORD_TIMEOUT_MS + 1;
    expect(matcher.handle(key('s', { ctrlKey: true }))).toEqual({ id: 'file.save', consumed: true });
    expect(matcher.handle(key('k', { ctrlKey: true }))).toEqual({ id: null, consumed: true });
    expect(matcher.handle(key('F5'))).toEqual({ id: 'debug.run', consumed: true });
  });
});

describe('command palette filter (UX-015)', () => {
  const entries = [
    { id: 'build.compile', title: 'Compile the project', category: 'Build' },
    { id: 'file.save', title: 'Save', category: 'File' },
    { id: 'debug.step', title: 'Step one cycle', category: 'Debug' },
    { id: 'view.themeDark', title: 'Use the dark theme', category: 'View' },
  ];

  it('UX-015 matches the letters of a query in order, best match first', () => {
    expect(filterEntries('sav', entries).map((entry) => entry.id)[0]).toBe('file.save');
    expect(filterEntries('cmp', entries).map((entry) => entry.id)).toEqual(['build.compile']);
    expect(filterEntries('dark', entries).map((entry) => entry.id)).toEqual(['view.themeDark']);
  });

  it('UX-015 matches the category too, so that "build" lists the Build menu, and shows nothing for letters that are not there', () => {
    expect(filterEntries('build', entries).map((entry) => entry.id)).toContain('build.compile');
    expect(filterEntries('zzz', entries)).toEqual([]);
  });

  it('UX-015 scores a prefix above a scattered match, and keeps the order for equal scores', () => {
    expect(fuzzyScore('save', 'Save')).toBeGreaterThan(fuzzyScore('save', 'Use a very safe theme'));
    expect(fuzzyScore('abc', 'xyz')).toBe(-1);
    expect(filterEntries('  ', entries).map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
  });

  it('UX-015 moves the active row with the arrow keys and wraps at both ends', () => {
    expect(nextIndex(0, -1, 4)).toBe(3);
    expect(nextIndex(3, 1, 4)).toBe(0);
    expect(nextIndex(0, 1, 0)).toBe(0);
  });
});

describe('running a command (UX-015)', () => {
  it('UX-015 refuses an id outside the registry and a command nobody bound', () => {
    expect(runCommand('shell.exec')).toBe('unknown');
    expect(runCommand(42)).toBe('unknown');
    expect(runCommand('file.save')).toBe('unavailable');
  });

  it('UX-015 runs the bound handler, and the menu or palette (respectEnabled) only when the state offers the command', () => {
    const calls: string[] = [];
    bindCommands({
      'file.save': () => {
        calls.push('save');
      },
      'file.open': () => {
        calls.push('open');
      },
    });
    expect(runCommand('file.save', { respectEnabled: true })).toBe('unavailable');
    expect(runCommand('file.save')).toBe('ran');
    publishCommandState({ hasActiveFile: true });
    expect(runCommand('file.save', { respectEnabled: true })).toBe('ran');
    expect(runCommand('file.open', { respectEnabled: true })).toBe('ran');
    expect(calls).toEqual(['save', 'save', 'open']);
  });

  it('UX-015 unbinds exactly what a component bound, so a newer binding of the same id survives', () => {
    const calls: string[] = [];
    const first = bindCommands({
      'file.open': () => {
        calls.push('first');
      },
    });
    bindCommands({
      'file.open': () => {
        calls.push('second');
      },
    });
    first();
    runCommand('file.open');
    expect(calls).toEqual(['second']);
  });

  it('UX-015 publishes the command state and ignores a report that changes nothing', () => {
    publishCommandState({ projectOpen: true });
    const published = getCommandState();
    publishCommandState({ projectOpen: true });
    expect(getCommandState()).toBe(published);
    expect(published.projectOpen).toBe(true);
  });
});
