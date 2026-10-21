import type { CloseGuard, GuardedAction } from './closeGuard.js';
import { isReloadShortcut, type InputLike } from './appMenu.js';

/** The part of an Electron event that the guards use. */
export interface VetoableEvent {
  preventDefault(): void;
}

/** The part of a BrowserWindow the close guard uses. */
export interface GuardedWindow {
  on(event: 'close', listener: (event: VetoableEvent) => void): unknown;
}

/** The part of webContents the reload guard uses. */
export interface GuardedContents {
  on(event: 'before-input-event', listener: (event: VetoableEvent, input: InputLike) => void): unknown;
}

/** A window close (also the one that quitting the application makes) is held back while files are modified; the renderer asks. */
export function guardWindowClose(window: GuardedWindow, guard: Pick<CloseGuard, 'request'>, ask: (action: GuardedAction) => void): void {
  window.on('close', (event) => {
    if (guard.request('close') === 'ask') {
      event.preventDefault();
      ask('close');
    }
  });
}

/** The reload chords never reach the page or the menu; a development host reloads only through the unsaved-work guard (IDE-005). */
export function guardReloadChord(contents: GuardedContents, options: { isPackaged: boolean; requestReload: () => void }): void {
  contents.on('before-input-event', (event, input) => {
    if (!isReloadShortcut(input)) return;
    event.preventDefault();
    if (!options.isPackaged) options.requestReload();
  });
}

/** A reload that asks first when files are modified. */
export function createReloadRequest(options: {
  guard: Pick<CloseGuard, 'request'>;
  reload: () => void;
  ask: (action: GuardedAction) => void;
}): () => void {
  return () => {
    if (options.guard.request('reload') === 'proceed') options.reload();
    else options.ask('reload');
  };
}

/** What the user's save or discard lets through: a reload reloads, a close destroys the window without asking again. */
export function completeGuardedAction(action: GuardedAction, effects: { reload: () => void; destroy: () => void }): void {
  if (action === 'reload') effects.reload();
  else effects.destroy();
}
