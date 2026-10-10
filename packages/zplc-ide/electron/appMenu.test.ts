import { describe, expect, it } from 'bun:test';
import type { MenuItemConstructorOptions } from 'electron';
import { buildApplicationMenu, describeApplicationMenu, isReloadShortcut, type InputLike } from './appMenu';

const RELOAD_ACCELERATORS = ['F5', 'CmdOrCtrl+R', 'CmdOrCtrl+Shift+R', 'Ctrl+R', 'Ctrl+Shift+R', 'Cmd+R', 'F12', 'CmdOrCtrl+Shift+I', 'Ctrl+Shift+I', 'CmdOrCtrl+Alt+I', 'Alt+Cmd+I'];
const RELOAD_ROLES = ['reload', 'forceReload', 'toggleDevTools'];

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])]);
}

function topLevelLabels(template: MenuItemConstructorOptions[]): string[] {
  return template.map((item) => String(item.label));
}

const noop = () => undefined;

describe('application menu', () => {
  for (const platform of ['linux', 'win32', 'darwin'] as const) {
    it(`has no reload or developer-tools entry in a packaged ${platform} build`, () => {
      const items = flatten(buildApplicationMenu({ platform, isPackaged: true, appName: 'ZPLC IDE', requestReload: noop }));
      expect(items.filter((item) => RELOAD_ROLES.includes(String(item.role)))).toEqual([]);
      expect(items.filter((item) => RELOAD_ACCELERATORS.includes(String(item.accelerator)))).toEqual([]);
      expect(items.filter((item) => item.click !== undefined)).toEqual([]);
    });
  }

  it('keeps File, Edit, View, Window and Help in a packaged build', () => {
    const labels = topLevelLabels(buildApplicationMenu({ platform: 'linux', isPackaged: true, appName: 'ZPLC IDE', requestReload: noop }));
    expect(labels).toEqual(['File', 'Edit', 'View', 'Window', 'Help']);
  });

  it('puts the application menu first on macOS', () => {
    const labels = topLevelLabels(buildApplicationMenu({ platform: 'darwin', isPackaged: true, appName: 'ZPLC IDE', requestReload: noop }));
    expect(labels).toEqual(['ZPLC IDE', 'File', 'Edit', 'View', 'Window', 'Help']);
  });

  it('keeps the clipboard and undo accelerators the editor needs', () => {
    const roles: Array<string | undefined> = flatten(buildApplicationMenu({ platform: 'darwin', isPackaged: true, appName: 'ZPLC IDE', requestReload: noop })).map((item) => item.role);
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'quit']) expect(roles).toContain(role);
  });

  it('routes the reload of a development build through the unsaved-work guard', () => {
    let reloads = 0;
    const items = flatten(buildApplicationMenu({ platform: 'linux', isPackaged: false, appName: 'ZPLC IDE', requestReload: () => { reloads += 1; } }));
    expect(items.filter((item) => RELOAD_ROLES.includes(String(item.role))).map((item) => item.role)).toEqual(['toggleDevTools']);
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
    const line = describeApplicationMenu(toMenuLike(buildApplicationMenu({ platform: 'linux', isPackaged: true, appName: 'ZPLC IDE', requestReload: noop })) as never);
    expect(line).toContain('roles=quit,undo,redo,cut,copy,paste,selectAll,resetZoom,zoomIn,zoomOut,togglefullscreen,minimize,close');
    expect(line).toEndWith('accelerators=');
  });
});

describe('reload shortcuts (IDE-005)', () => {
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
