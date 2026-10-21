/**
 * How the application ends (IDE-008).
 *
 * The window going away makes the renderer send what it still holds (the session of the open project, with the last
 * cursor move) and the main process starts its write. `app.quit()` after the last window closes ends the process
 * as soon as the windows are gone, which is before an asynchronous write of that message has finished, so the last
 * move was lost whenever the machine was busy enough. The process now waits, a bounded time, for the writes it has
 * accepted before it exits.
 */

export interface LifecycleEvent {
  preventDefault(): void;
}

/** The part of Electron's `app` that the application lifecycle uses. */
export interface LifecycleApp {
  on(event: 'before-quit' | 'will-quit', listener: (event: LifecycleEvent) => void): unknown;
  on(event: 'window-all-closed', listener: () => void): unknown;
  quit(): void;
}

export interface LifecycleOptions {
  platform: NodeJS.Platform;
  /** Runs once the application starts to quit: ends what runs on its behalf. */
  onQuit(): void;
  /** Settles when every write that the main process accepted from the windows has reached the disk. Never rejects. */
  writesSettled(): Promise<unknown>;
  /** The longest the process waits for those writes before it exits anyway. */
  maxWaitMs?: number;
  /** A pause of `ms`; replaced by a test. */
  pause?(ms: number): Promise<void>;
}

/** How long the process waits for the writes of a closing window: a session is a few kilobytes. */
export const QUIT_WRITE_WAIT_MS = 2_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });

export function registerAppLifecycle(app: LifecycleApp, options: LifecycleOptions): void {
  const pause = options.pause ?? sleep;
  app.on('before-quit', () => options.onQuit());
  // Quit when all windows are closed (except on macOS)
  app.on('window-all-closed', () => {
    if (options.platform !== 'darwin') app.quit();
  });

  // Every window is gone and the process is about to exit: hold it until the accepted writes are on the disk, at most
  // `maxWaitMs`, and quit again. The message of a closing window is accepted before the window is reported closed, and
  // the wait begins one turn of the event loop later, so a message that is just being dispatched is counted as well.
  let waited = false;
  app.on('will-quit', (event) => {
    if (waited) return;
    event.preventDefault();
    const settled = new Promise<void>((resolve) => setImmediate(resolve)).then(() => options.writesSettled());
    void Promise.race([settled, pause(options.maxWaitMs ?? QUIT_WRITE_WAIT_MS)])
      .catch(() => undefined)
      .finally(() => {
        waited = true;
        app.quit();
      });
  });
}
