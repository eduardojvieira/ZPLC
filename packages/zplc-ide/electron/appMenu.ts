import type { MenuItemConstructorOptions } from 'electron';

interface ApplicationMenuOptions {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  appName: string;
  /** Reload of a development build; the caller routes it through the unsaved-work guard. */
  requestReload: () => void;
}

/**
 * The application menu replaces Electron's default one, whose View menu carries reload and
 * developer-tools accelerators. A packaged build has neither; a development build keeps them,
 * with reload going through the unsaved-work guard.
 */
export function buildApplicationMenu({ platform, isPackaged, appName, requestReload }: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin';
  const view: MenuItemConstructorOptions[] = [
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  if (!isPackaged) {
    view.unshift(
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: requestReload },
      { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: requestReload },
      { role: 'toggleDevTools' },
      { type: 'separator' },
    );
  }
  return [
    ...(isMac ? [{
      label: appName,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] satisfies MenuItemConstructorOptions[],
    } satisfies MenuItemConstructorOptions] : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    { label: 'View', submenu: view },
    { label: 'Window', submenu: isMac ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] : [{ role: 'minimize' }, { role: 'close' }] },
    { label: 'Help', submenu: [{ label: appName, enabled: false }] },
  ];
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
