import { afterEach, describe, expect, it } from 'bun:test';
import type { MenuItemConstructorOptions } from 'electron';
import { buildMenuTemplate } from '../../electron/appMenu';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import {
  bindCommands,
  getCommandState,
  isCommandBound,
  listedCommands,
  publishCommandState,
  resetCommandsForTest,
  runCommand,
} from './bus';
import { menuCategories, menuCommands, menuTranslator } from './menuEntry';
import { filterEntries, fuzzyScore, nextIndex } from './palette';
import { COMMAND_CATEGORIES, COMMAND_LIST, INITIAL_COMMAND_STATE, commandById, isCommandEnabled, isCommandId } from './registry';
import { AI_COMMAND_PROPOSALS } from '../ai/proposals';
import { studioCommandsEn, studioCommandsEs } from '../i18n/catalog/studioCommands';
import { u2CommandsEn, u2CommandsEs } from '../i18n/catalog/u2Commands';
import { u3FaceplateEn, u3FaceplateEs } from '../i18n/catalog/u3Faceplate';
import { u3GuideEn, u3GuideEs } from '../i18n/catalog/u3Guide';
import { u3IoModeEn, u3IoModeEs } from '../i18n/catalog/u3IoMode';
import { u3LearnEn, u3LearnEs } from '../i18n/catalog/u3Learn';
import { u3PlantEn, u3PlantEs } from '../i18n/catalog/u3Plant';
import { u3ReadingEn, u3ReadingEs } from '../i18n/catalog/u3Reading';
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

  it('FLW-014 offers Run in simulation with a project open and no session, and a board only when connected', () => {
    const run = commandById('debug.run');
    const simulation = { ...INITIAL_COMMAND_STATE, projectOpen: true, mode: 'simulate' as const };
    expect(isCommandEnabled(run, simulation)).toBe(true);
    expect(isCommandEnabled(run, { ...simulation, projectOpen: false })).toBe(false);
    expect(isCommandEnabled(run, { ...simulation, vmState: 'running' })).toBe(false);
    expect(isCommandEnabled(run, { ...simulation, busy: true })).toBe(false);
    const board = { ...simulation, mode: 'hardware' as const };
    expect(isCommandEnabled(run, board)).toBe(false);
    expect(isCommandEnabled(run, { ...board, connected: true })).toBe(true);
    expect(isCommandEnabled(run, { ...board, connected: true, vmState: 'running' })).toBe(false);
    expect(run.physical).toBe(true);
  });

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
      'debug.rebuildAndRestart',
      'debug.reset',
      'debug.run',
      'debug.step',
      'debug.stop',
      'online.connect',
      'online.deploy',
      'online.disconnect',
      'online.feedBoardFromPlant',
      'online.restartSimulator',
      'plant.feedBoard',
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
    expect([...clicks].sort()).toEqual(
      COMMAND_LIST.filter((command) => !command.pending)
        .map((command) => command.id)
        .sort(),
    );
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

  it('FND-006 an arrow shortcut matches the keydown that names the arrow key, and no other chord changes', () => {
    expect(chordMatches(parseChord('Alt+Left'), key('ArrowLeft', { altKey: true }))).toBe(true);
    expect(chordMatches(parseChord('Alt+Right'), key('ArrowRight', { altKey: true }))).toBe(true);
    expect(chordMatches(parseChord('Alt+Left'), key('ArrowRight', { altKey: true }))).toBe(false);
    expect(chordMatches(parseChord('Alt+Left'), key('ArrowLeft'))).toBe(false);
    expect(parseChord('F5').key).toBe('F5');
    expect(parseChord('Enter').key).toBe('Enter');
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

/** The ids of the contract of lane W (plan-m1.md, "Command ids"), each with its category. */
const LANE_W_COMMANDS = {
  'file.saveAll': 'file',
  'view.splitRight': 'view',
  'view.moveToOtherGroup': 'view',
  'view.focusOtherGroup': 'view',
  'view.maximiseDocument': 'view',
  'view.plant': 'view',
  'view.interlocks': 'view',
  'view.changes': 'view',
  'view.agent': 'view',
  'view.terminal': 'view',
  'project.tasks': 'project',
  'project.io': 'project',
  'project.network': 'project',
  'project.communication': 'project',
  'project.target': 'project',
  'online.restartSimulator': 'online',
  'debug.rebuildAndRestart': 'debug',
  'view.statusDetails': 'view',
} as const;

describe('lane W command contract (FND-002)', () => {
  it('FND-002 every id of the lane W contract is registered with a title in English and Spanish', () => {
    for (const [id, category] of Object.entries(LANE_W_COMMANDS)) {
      expect([id, isCommandId(id)]).toEqual([id, true]);
      const command = commandById(id as never);
      expect([id, command.category]).toEqual([id, category]);
      expect(typeof (en as Record<string, string>)[command.titleKey]).toBe('string');
      expect(typeof (es as Record<string, string>)[command.titleKey]).toBe('string');
      expect((en as Record<string, string>)[command.titleKey]).not.toBe((es as Record<string, string>)[command.titleKey]);
    }
  });

  it('FND-002 gives the new titles to the studioCommands catalog, with the same keys in both languages', () => {
    expect(Object.keys(studioCommandsEs).sort()).toEqual(Object.keys(studioCommandsEn).sort());
    expect(Object.keys(studioCommandsEn).length).toBe(Object.keys(LANE_W_COMMANDS).length);
    for (const key of Object.keys(studioCommandsEn)) {
      const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders((studioCommandsEs as Record<string, string>)[key]!)).toEqual(
        placeholders((studioCommandsEn as Record<string, string>)[key]!),
      );
    }
  });

  it('FND-002 the palette does not list a command that has no handler', () => {
    publishCommandState({ projectOpen: true });
    const titles = () => listedCommands(COMMAND_LIST, isCommandBound).map((command) => command.id);
    expect(titles()).not.toContain('view.plant');
    const unbind = bindCommands({ 'view.plant': () => undefined });
    expect(titles()).toContain('view.plant');
    unbind();
    expect(titles()).not.toContain('view.plant');
    expect(isCommandBound('view.plant')).toBe(false);
  });

  it('a registered command with no handler is refused as unavailable', () => {
    for (const id of Object.keys(LANE_W_COMMANDS)) expect([id, runCommand(id)]).toEqual([id, 'unavailable']);
    expect(runCommand('view.plant', { respectEnabled: true })).toBe('unavailable');
  });

  it('FND-002 keeps the 38 commands of 2.0 and the plant I/O one, in their order, ahead of the new ones', () => {
    const ids = COMMAND_LIST.map((command) => command.id);
    const old = ids.filter(
      (id) => !(id in LANE_W_COMMANDS) && !(id in U2_COMMANDS) && !(id in PLANT_VIEW_COMMANDS) && !(id in U3_COMMANDS),
    );
    expect(old.length).toBe(39);
    expect(old.slice(0, 5)).toEqual(['file.save', 'file.open', 'file.new', 'file.export', 'view.commandPalette']);
    expect(old.at(-1)).toBe('help.learn');
    expect(runCommand('file.save')).toBe('unavailable');
  });
});

/** The ids of the contract of milestone U2 (plan-u2.md, "C-X"), each with its category and default shortcut. */
const U2_COMMANDS = {
  'view.testResults': ['view'],
  'view.resetLayout': ['view'],
  'view.showInspector': ['view'],
  'file.closeProject': ['file'],
  'file.preferences': ['file', 'Mod+Comma'],
  'file.exportProjectJson': ['file'],
  'build.runAllTests': ['build', 'Mod+Alt+T'],
  'build.runFailedTests': ['build'],
  'build.runTestAtCursor': ['build'],
  'build.newTest': ['build'],
  'build.checkInterlocks': ['build'],
  'edit.goToDefinition': ['edit', 'F12'],
  'edit.findAllReferences': ['edit', 'Shift+F12'],
  'edit.goBack': ['edit', 'Alt+Left'],
  'edit.goForward': ['edit', 'Alt+Right'],
  'project.newProgram': ['project'],
  'project.newFunctionBlock': ['project'],
  'project.newFunction': ['project'],
  'project.newDataType': ['project'],
  'project.newGlobals': ['project'],
  'project.newTask': ['project'],
  'project.rename': ['project'],
  'project.moveFile': ['project'],
  'project.duplicate': ['project'],
  'project.delete': ['project'],
} as const satisfies Record<string, readonly [string, string?]>;

/** The commands of the 3D plant view (spec 012), registered after those of milestone U2. */
const PLANT_VIEW_COMMANDS = { 'view.fitPlantScene': ['view', 'Fit scene', 'Encuadrar la escena'] } as const;

/** The ids of the contract of milestone U3 (plan-u3.md, "Contract extensions"), with their category. */
const U3_COMMANDS = {
  'view.guide': 'view',
  'view.lessonLayout': 'view',
  'view.focusCommandBar': 'view',
  'learn.guide.next': 'help',
  'learn.guide.back': 'help',
  'learn.check': 'build',
  'plant.edit': 'edit',
  'plant.endEdit': 'edit',
  'plant.createDeclarations': 'project',
  'edit.undo': 'edit',
  'edit.redo': 'edit',
  'plant.feedBoard': 'online',
  'view.showPlant': 'view', // bound by X1b: the Plant activity of the rail
} as const;

describe('milestone U3 command contract (FND-002)', () => {
  it('FND-002 every command id declared by U3 has a title in English and Spanish', () => {
    for (const [id, category] of Object.entries(U3_COMMANDS)) {
      expect([id, isCommandId(id)]).toEqual([id, true]);
      const command = commandById(id as never);
      expect([id, command.category]).toEqual([id, category]);
      const english = (en as Record<string, string>)[command.titleKey];
      const spanish = (es as Record<string, string>)[command.titleKey];
      expect([id, typeof english, typeof spanish]).toEqual([id, 'string', 'string']);
      expect(english).not.toBe(spanish);
    }
    expect(commandById('view.focusCommandBar').shortcut).toBeUndefined();
  });

  it('FND-002 a command declared for a later task stays out of the menu until it is bound', () => {
    const pending = COMMAND_LIST.filter((command) => command.pending).map((command) => command.id);
    expect(pending.sort()).toEqual(
      Object.keys(U3_COMMANDS)
        .filter((id) => id !== 'view.showPlant')
        .sort(),
    );
    const listed = menuCommands.map((command) => command.id);
    for (const id of pending) expect([id, listed.includes(id)]).toEqual([id, false]);
  });

  it('FND-002 plant.feedBoard is physical and is absent from the AI and MCP command list', () => {
    expect(commandById('plant.feedBoard').physical).toBe(true);
    expect(COMMAND_LIST.filter((command) => command.id in U3_COMMANDS && command.physical).map((command) => command.id)).toEqual([
      'plant.feedBoard',
    ]);
    expect(Object.values(AI_COMMAND_PROPOSALS)).not.toContain('plant.feedBoard');
    expect(Object.keys(AI_COMMAND_PROPOSALS)).not.toContain('plant.feedBoard');
  });

  it('FND-002 the six U3 catalogs have the same keys in both languages', () => {
    const pairs = [
      [u3GuideEn, u3GuideEs],
      [u3LearnEn, u3LearnEs],
      [u3ReadingEn, u3ReadingEs],
      [u3PlantEn, u3PlantEs],
      [u3FaceplateEn, u3FaceplateEs],
      [u3IoModeEn, u3IoModeEs],
    ] as const;
    for (const [english, spanish] of pairs) expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
  });
});

describe('plant view command contract (FND-002, VIS-002)', () => {
  it('VIS-002 Fit scene is a registered view command, not a physical one, with its title in English and Spanish', () => {
    for (const [id, [category, english, spanish]] of Object.entries(PLANT_VIEW_COMMANDS)) {
      expect([id, isCommandId(id)]).toEqual([id, true]);
      const command = commandById(id as never);
      expect([id, command.category, command.physical]).toEqual([id, category, undefined]);
      expect([(en as Record<string, string>)[command.titleKey], (es as Record<string, string>)[command.titleKey]]).toEqual([
        english,
        spanish,
      ]);
    }
  });
});

describe('milestone U2 command contract (FND-002)', () => {
  it('FND-002 every id of the U2 contract is registered with a title in English and Spanish', () => {
    expect(Object.keys(U2_COMMANDS).length).toBe(25);
    for (const [id, [category, shortcut]] of Object.entries(U2_COMMANDS) as Array<[string, readonly [string, string?]]>) {
      expect([id, isCommandId(id)]).toEqual([id, true]);
      const command = commandById(id as never);
      expect([id, command.category, command.shortcut]).toEqual([id, category, shortcut]);
      expect(typeof (en as Record<string, string>)[command.titleKey]).toBe('string');
      expect(typeof (es as Record<string, string>)[command.titleKey]).toBe('string');
      expect((en as Record<string, string>)[command.titleKey]).not.toBe((es as Record<string, string>)[command.titleKey]);
    }
    expect(Object.keys(u2CommandsEs).sort()).toEqual(Object.keys(u2CommandsEn).sort());
    expect(Object.keys(u2CommandsEn).length).toBe(25);
  });

  it('UX-015 keeps the commands of 2.0 and of lane W, in their order, ahead of the U2 ones', () => {
    const ids = COMMAND_LIST.map((command) => command.id as string);
    const firstU2 = ids.findIndex((id) => id in U2_COMMANDS);
    expect(ids.slice(0, firstU2).length).toBe(39 + Object.keys(LANE_W_COMMANDS).length);
    expect(ids.slice(firstU2)).toEqual([...Object.keys(U2_COMMANDS), ...Object.keys(PLANT_VIEW_COMMANDS), ...Object.keys(U3_COMMANDS)]);
    expect(ids[firstU2 - 1]).toBe('help.learn');
    expect(ids.slice(0, 5)).toEqual(['file.save', 'file.open', 'file.new', 'file.export', 'view.commandPalette']);
  });

  it('UX-014 lists every U2 command in the menu of its category once, and keeps the Edit menu roles after them', () => {
    const template = buildMenuTemplate('linux', menuCommands, menuTranslator('en'), {
      isPackaged: true,
      appName: 'ZPLC',
      categories: menuCategories,
      run: () => undefined,
      requestReload: () => undefined,
    });
    for (const [id, [category]] of Object.entries(U2_COMMANDS) as Array<[string, readonly [string, string?]]>) {
      const holders = template.filter((menu) => {
        const items = (menu.submenu ?? []) as MenuItemConstructorOptions[];
        return items.some((item) => item.label === (en as Record<string, string>)[commandById(id as never).titleKey]);
      });
      expect([id, holders.map((menu) => menu.label)]).toEqual([id, [(en as Record<string, string>)[`menu.${category}`]]]);
    }
    const edit = (template[1]!.submenu ?? []) as MenuItemConstructorOptions[];
    expect(edit.slice(0, 4).map((item) => item.label)).toEqual(['Go to definition', 'Find all references', 'Go back', 'Go forward']);
    expect(edit.slice(5).map((item) => item.role)).toEqual(['undo', 'redo', undefined, 'cut', 'copy', 'paste', 'selectAll']);
  });

  it('UX-015 gives the new shortcuts no clash', () => {
    for (const [id, [, shortcut]] of Object.entries(U2_COMMANDS) as Array<[string, readonly [string, string?]]>) {
      if (!shortcut) continue;
      expect(COMMAND_LIST.filter((command) => command.shortcut === shortcut).map((command) => command.id)).toEqual([id]);
    }
  });

  it('UX-015 no U2 command is physical, and the ones that need a project are offered only with one open', () => {
    expect(COMMAND_LIST.filter((command) => command.id in U2_COMMANDS && command.physical)).toEqual([]);
    const closed = INITIAL_COMMAND_STATE;
    const open = { ...closed, projectOpen: true };
    const always = ['file.preferences', 'edit.goBack', 'edit.goForward'];
    for (const id of Object.keys(U2_COMMANDS)) {
      expect([id, isCommandEnabled(commandById(id as never), open)]).toEqual([id, true]);
      expect([id, isCommandEnabled(commandById(id as never), closed)]).toEqual([id, always.includes(id)]);
    }
  });
});
