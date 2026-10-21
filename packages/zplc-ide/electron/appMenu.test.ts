import { describe, expect, it } from 'bun:test';
import type { MenuItemConstructorOptions } from 'electron';
import { INITIAL_COMMAND_STATE, commandById, isCommandEnabled } from '../src/commands/registry';
import { menuCategories, menuCommands, menuTranslator } from '../src/commands/menuEntry';
import { buildMenuTemplate, describeApplicationMenu, isReloadShortcut, type InputLike, type MenuBuildOptions, type MenuCategory, type MenuCommand } from './appMenu';

const RELOAD_ACCELERATORS = ['F5', 'CmdOrCtrl+R', 'CmdOrCtrl+Shift+R', 'Ctrl+R', 'Ctrl+Shift+R', 'Cmd+R', 'F12', 'CmdOrCtrl+Shift+I', 'Ctrl+Shift+I', 'CmdOrCtrl+Alt+I', 'Alt+Cmd+I'];
const DEBUG_ROLES = ['reload', 'forceReload', 'toggleDevTools'];
const ZOOM_ROLES = ['zoomIn', 'zoomOut', 'resetZoom'];

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])]);
}

function topLevelLabels(template: MenuItemConstructorOptions[]): string[] {
  return template.map((item) => String(item.label));
}

const CATEGORIES: MenuCategory[] = ['file', 'edit', 'view', 'project', 'build', 'online', 'debug', 'help'].map((id) => ({ id, titleKey: `menu.${id}` }));
const COMMANDS: MenuCommand[] = [
  { id: 'file.save', titleKey: 'command.file.save', category: 'file', accelerator: 'CmdOrCtrl+S' },
  { id: 'build.compile', titleKey: 'command.build.compile', category: 'build', accelerator: 'CmdOrCtrl+B' },
  { id: 'online.deploy', titleKey: 'command.online.deploy', category: 'online', accelerator: null },
  { id: 'debug.run', titleKey: 'command.debug.run', category: 'debug', accelerator: 'F5' },
];
const t = (key: string): string => `«${key}»`;
const noop = () => undefined;
const build = (platform: NodeJS.Platform, overrides: Partial<MenuBuildOptions> = {}) => buildMenuTemplate(platform, COMMANDS, t, {
  isPackaged: true, appName: 'ZPLC', categories: CATEGORIES, run: noop, requestReload: noop, ...overrides,
});

describe('application menu (UX-014)', () => {
  for (const platform of ['linux', 'win32', 'darwin'] as const) {
    it(`UX-014 has no reload or developer-tools entry in a packaged ${platform} build`, () => {
      const items = flatten(build(platform));
      expect(items.filter((item) => DEBUG_ROLES.includes(String(item.role)))).toEqual([]);
      expect(items.filter((item) => RELOAD_ACCELERATORS.includes(String(item.accelerator)) && item.registerAccelerator !== false && item.label !== t('command.debug.run'))).toEqual([]);
    });
  }

  for (const platform of ['linux', 'win32', 'darwin'] as const) {
    it(`UX-025 keeps page zoom (zoom in, zoom out, actual size) in the View menu of a packaged ${platform} build`, () => {
      const view = build(platform).find((menu) => menu.label === t('menu.view'))!;
      const zoom = (view.submenu as MenuItemConstructorOptions[]).filter((item) => ZOOM_ROLES.includes(String(item.role)));
      expect<string[]>(zoom.map((item) => String(item.role))).toEqual(ZOOM_ROLES);
      expect(zoom.map((item) => item.label)).toEqual([t('menu.zoomIn'), t('menu.zoomOut'), t('menu.resetZoom')]);
    });
  }

  it('UX-014 holds File, Edit, View, Project, Build, Online, Debug and Help on Windows and Linux', () => {
    for (const platform of ['linux', 'win32'] as const) {
      expect(topLevelLabels(build(platform))).toEqual(CATEGORIES.map((category) => t(category.titleKey)));
    }
  });

  it('UX-014 puts the application menu first and a Window menu before Help on macOS', () => {
    expect(topLevelLabels(build('darwin'))).toEqual(['ZPLC', ...CATEGORIES.slice(0, 7).map((c) => t(c.titleKey)), t('menu.window'), t('menu.help')]);
  });

  it('UX-014 gives the macOS application menu the standard roles', () => {
    const app = build('darwin')[0]!;
    const roles = (app.submenu as MenuItemConstructorOptions[]).map((item) => item.role).filter(Boolean);
    expect(roles).toEqual(['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit']);
  });

  it('UX-014 keeps the clipboard and undo roles the editor needs, labelled in the language of the menu', () => {
    const edit = flatten(build('linux')).filter((item) => ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].includes(String(item.role)));
    expect(edit.map((item) => item.role)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
    expect(edit.every((item) => typeof item.label === 'string' && item.label.startsWith('«menu.'))).toBe(true);
  });

  it('UX-015 builds every command item from the registry: label from the translator, accelerator, and a click that sends only its id', () => {
    const sent: string[] = [];
    const items = flatten(build('linux', { run: (id) => { sent.push(id); } }));
    const run = items.find((item) => item.label === t('command.debug.run'))!;
    expect(run.accelerator).toBe('F5');
    run.click?.({} as never, undefined, {} as never);
    const save = items.find((item) => item.label === t('command.file.save'))!;
    save.click?.({} as never, undefined, {} as never);
    expect(sent).toEqual(['debug.run', 'file.save']);
  });

  it('UX-015 lists a physical command like the button it stands for, with no accelerator it does not have', () => {
    const deploy = flatten(build('win32')).find((item) => item.label === t('command.online.deploy'))!;
    expect(deploy.accelerator).toBeUndefined();
  });

  it('UX-015 leaves the key to the window on Windows and Linux (shown, not registered) and to the menu on macOS', () => {
    const accelerated = (platform: NodeJS.Platform) => flatten(build(platform)).filter((item) => item.accelerator === 'F5').map((item) => item.registerAccelerator);
    expect(accelerated('linux')).toEqual([false]);
    expect(accelerated('win32')).toEqual([false]);
    expect(accelerated('darwin')).toEqual([true]);
  });

  it('UX-014 translates every menu label with the translator it is given', () => {
    const labels = flatten(build('linux')).map((item) => item.label).filter((label): label is string => label !== undefined && label !== 'ZPLC');
    expect(labels.every((label) => label.startsWith('«'))).toBe(true);
  });

  it('UX-014 adds the developer items only to a development build, and routes its reload through the unsaved-work guard', () => {
    let reloads = 0;
    const items = flatten(build('linux', { isPackaged: false, requestReload: () => { reloads += 1; } }));
    expect(items.filter((item) => DEBUG_ROLES.includes(String(item.role))).map((item) => item.role)).toEqual(['toggleDevTools']);
    const reload = items.find((item) => item.accelerator === 'CmdOrCtrl+R');
    expect(reload?.role).toBeUndefined();
    reload?.click?.({} as never, undefined, {} as never);
    expect(reloads).toBe(1);
    expect(items.find((item) => item.accelerator === 'CmdOrCtrl+Shift+R')?.role).toBeUndefined();
  });
});

describe('application menu description', () => {
  it('lists the roles and explicit accelerators of nested items', () => {
    const menu = {
      items: [
        { role: undefined, accelerator: undefined, submenu: { items: [{ role: 'quit', accelerator: undefined, submenu: null }] } },
        { role: undefined, accelerator: undefined, submenu: { items: [{ role: undefined, accelerator: 'CmdOrCtrl+R', submenu: null }, { role: 'toggleDevTools', accelerator: undefined, submenu: null }] } },
      ],
    };
    expect(describeApplicationMenu(menu)).toBe('[zplc] application menu roles=quit,toggleDevTools accelerators=CmdOrCtrl+R');
  });

  it('describes a packaged menu without any reload entry', () => {
    const toMenuLike = (items: MenuItemConstructorOptions[]): { items: Array<{ role?: string; accelerator?: unknown; submenu?: unknown }> } => ({
      items: items.map((item) => ({ role: item.role, accelerator: item.accelerator, submenu: Array.isArray(item.submenu) ? toMenuLike(item.submenu) : null })),
    });
    const line = describeApplicationMenu(toMenuLike(build('linux')) as never);
    expect(line).toContain('roles=quit,undo,redo,cut,copy,paste,selectAll,zoomIn,zoomOut,resetZoom,togglefullscreen');
    expect(line).toEndWith('accelerators=CmdOrCtrl+S,CmdOrCtrl+B,F5');
  });
});

describe('reload shortcuts (IDE-005): which keys are reload chords', () => {
  const input = (overrides: Partial<InputLike>): InputLike => ({ type: 'keyDown', key: 'r', control: false, meta: false, alt: false, ...overrides });

  it('recognises Ctrl+R, Ctrl+Shift+R and Cmd+R, whatever the case of the key', () => {
    expect(isReloadShortcut(input({ control: true }))).toBe(true);
    expect(isReloadShortcut(input({ control: true, key: 'R' }))).toBe(true);
    expect(isReloadShortcut(input({ meta: true }))).toBe(true);
  });

  it('leaves every other key to the page: typing r, Alt+Ctrl+R, key releases, and F5 (Resume in the debugger)', () => {
    expect(isReloadShortcut(input({}))).toBe(false);
    expect(isReloadShortcut(input({ control: true, alt: true }))).toBe(false);
    expect(isReloadShortcut(input({ control: true, type: 'keyUp' }))).toBe(false);
    expect(isReloadShortcut(input({ key: 'F5' }))).toBe(false);
    expect(isReloadShortcut(input({ control: true, key: 's' }))).toBe(false);
  });
});

describe('the Learn entry of the Help menu (LRN-001)', () => {
  for (const [locale, label] of [['en', 'Open the Learn home'], ['es', 'Abrir el inicio del curso']] as const) {
    it(`LRN-001 offers "${label}" in the Help menu of the registry, and choosing it sends the command id to the window (${locale})`, () => {
      const sent: string[] = [];
      const template = buildMenuTemplate('linux', menuCommands, menuTranslator(locale), { isPackaged: true, appName: 'ZPLC', categories: menuCategories, run: (id) => { sent.push(id); }, requestReload: noop });
      const help = template.find((menu) => menu.label === menuTranslator(locale)('menu.help'));
      const entry = flatten(help?.submenu as MenuItemConstructorOptions[]).find((item) => item.label === label);
      expect(entry).toBeDefined();
      (entry!.click as () => void)();
      expect(sent).toEqual(['help.learn']);
    });
  }

  it('LRN-001 is available with no project open, because the Learn home opens before a project does', () => {
    expect(isCommandEnabled(commandById('help.learn'), INITIAL_COMMAND_STATE)).toBe(true);
    expect(INITIAL_COMMAND_STATE.projectOpen).toBe(false);
  });
});
