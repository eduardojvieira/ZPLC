import type { MenuItemConstructorOptions } from 'electron';

/**
 * What the menu needs of a registered command (the registry's `menuEntry.ts` builds the list; this file imports nothing from the renderer).
 */
export interface MenuCommand {
  id: string;
  titleKey: string;
  category: string;
  accelerator: string | null;
}
export interface MenuCategory {
  id: string;
  titleKey: string;
}
export type MenuTranslate = (key: string) => string;

export interface MenuBuildOptions {
  isPackaged: boolean;
  appName: string;
  /** The menus in order; each holds the commands of its category. */
  categories: readonly MenuCategory[];
  /** A menu item was chosen: the id goes to the window, which runs the command behind the same gates as its button. */
  run: (id: string) => void;
  /** Reload of a development build; the caller routes it through the unsaved-work guard. */
  requestReload: () => void;
}

const SEPARATOR: MenuItemConstructorOptions = { type: 'separator' };

/**
 * The application menu (UX-014, UX-015), built from the command registry: File, Edit, View, Project, Build, Online, Debug
 * and Help on every operating system, with macOS adding its application menu and a Window menu. It replaces Electron's
 * default menu, so there is no reload or developer-tools item in a packaged build, while page zoom (zoom in, out, actual size) stays; a
 * development build keeps reload
 * (through the unsaved-work guard) and the developer tools. Every item that is not a standard role carries only a command
 * id. On Windows and Linux the accelerators are shown but not registered, so the window's own key handler stays the one
 * place that reacts to a key (it ignores text fields, as before); macOS has no such option and routes the key through the
 * menu.
 */
export function buildMenuTemplate(
  platform: NodeJS.Platform,
  commands: readonly MenuCommand[],
  t: MenuTranslate,
  options: MenuBuildOptions,
): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin';
  const itemsOf = (category: string): MenuItemConstructorOptions[] =>
    commands
      .filter((command) => command.category === category)
      .map((command) => ({
        label: t(command.titleKey),
        ...(command.accelerator ? { accelerator: command.accelerator, registerAccelerator: isMac } : {}),
        click: () => options.run(command.id),
      }));
  const withTail = (items: MenuItemConstructorOptions[], tail: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
    items.length > 0 && tail.length > 0 ? [...items, SEPARATOR, ...tail] : [...items, ...tail];

  const tails: Record<string, MenuItemConstructorOptions[]> = {
    file: [isMac ? { role: 'close', label: t('menu.closeWindow') } : { role: 'quit', label: t('menu.quit') }],
    edit: [
      { role: 'undo', label: t('menu.undo') },
      { role: 'redo', label: t('menu.redo') },
      SEPARATOR,
      { role: 'cut', label: t('menu.cut') },
      { role: 'copy', label: t('menu.copy') },
      { role: 'paste', label: t('menu.paste') },
      { role: 'selectAll', label: t('menu.selectAll') },
    ],
    view: [
      ...(options.isPackaged
        ? []
        : [
            { label: t('menu.reload'), accelerator: 'CmdOrCtrl+R', click: options.requestReload },
            { label: t('menu.forceReload'), accelerator: 'CmdOrCtrl+Shift+R', click: options.requestReload },
            { role: 'toggleDevTools', label: t('menu.developerTools') } satisfies MenuItemConstructorOptions,
            SEPARATOR,
          ]),
      // Page zoom is a keyboard path of its own (Ctrl/Cmd +, -, 0): the roles carry the accelerators (UX-025).
      { role: 'zoomIn', label: t('menu.zoomIn') },
      { role: 'zoomOut', label: t('menu.zoomOut') },
      { role: 'resetZoom', label: t('menu.resetZoom') },
      SEPARATOR,
      { role: 'togglefullscreen', label: t('menu.fullScreen') },
    ],
    help: [{ label: options.appName, enabled: false }],
  };
  const menus = options.categories.map((category): MenuItemConstructorOptions => ({
    label: t(category.titleKey),
    submenu: withTail(itemsOf(category.id), tails[category.id] ?? []),
  }));
  if (!isMac) return menus;
  const windowMenu: MenuItemConstructorOptions = {
    label: t('menu.window'),
    submenu: [{ role: 'minimize', label: t('menu.minimize') }, { role: 'zoom', label: t('menu.zoomWindow') }, SEPARATOR, { role: 'front' }],
  };
  const appMenu: MenuItemConstructorOptions = {
    label: options.appName,
    submenu: [
      { role: 'about' },
      SEPARATOR,
      { role: 'services' },
      SEPARATOR,
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      SEPARATOR,
      { role: 'quit' },
    ],
  };
  // The Window menu comes before Help, the last menu, as on macOS applications.
  const helpAt = options.categories.findIndex((category) => category.id === 'help');
  const before = helpAt < 0 ? menus.length : helpAt;
  return [appMenu, ...menus.slice(0, before), windowMenu, ...menus.slice(before)];
}

/** The part of an Electron `Input` that decides whether it is a reload chord. */
export interface InputLike {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
}

/**
 * Ctrl+R and Ctrl+Shift+R (Cmd on macOS): the chords that reload a page. The main process catches them before the page
 * and the menu see them, so that a packaged build cannot reload by keyboard and a development host reloads only
 * through the unsaved-work guard, whatever the menu holds (IDE-005). F5 is not one: Studio uses it for Resume.
 */
export function isReloadShortcut(input: InputLike): boolean {
  return input.type === 'keyDown' && input.key.toLowerCase() === 'r' && (input.control || input.meta) && !input.alt;
}

interface MenuLike {
  items: ReadonlyArray<{ role?: string; accelerator?: unknown; submenu?: MenuLike | null }>;
}

/**
 * One log line with the roles and explicit accelerators the running app registered. The smoke
 * tests read it, because key events injected over the DevTools protocol never reach native menus.
 */
export function describeApplicationMenu(menu: MenuLike): string {
  const roles: string[] = [];
  const accelerators: string[] = [];
  const visit = (current: MenuLike): void => {
    for (const item of current.items) {
      if (item.role) roles.push(item.role);
      if (item.accelerator) accelerators.push(String(item.accelerator));
      if (item.submenu) visit(item.submenu);
    }
  };
  visit(menu);
  return `[zplc] application menu roles=${roles.join(',')} accelerators=${accelerators.join(',')}`;
}
