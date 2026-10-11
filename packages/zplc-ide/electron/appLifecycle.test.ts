import { describe, expect, test } from 'bun:test';

import { registerAppLifecycle, type LifecycleApp, type LifecycleEvent, type LifecycleOptions } from './appLifecycle';

/** The `app` of Electron reduced to what the lifecycle touches; `quit` runs the quit sequence the way Electron does. */
function fakeApp() {
  const listeners = new Map<string, Array<(event: LifecycleEvent) => void>>();
  const log: string[] = [];
  const app: LifecycleApp & { emit(name: string): { prevented: boolean }; quits: number } = {
    quits: 0,
    on(name: string, listener: (event: LifecycleEvent) => void) { listeners.set(name, [...(listeners.get(name) ?? []), listener]); return app; },
    quit() { app.quits += 1; log.push('quit'); },
    emit(name: string) {
      let prevented = false;
      for (const listener of listeners.get(name) ?? []) listener({ preventDefault: () => { prevented = true; } });
      log.push(`${name}${prevented ? ' (prevented)' : ''}`);
      return { prevented };
    },
  } as never;
  return { app, log };
}

/** A promise that the test settles by hand, which stands for a write that is still running. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const options = (overrides: Partial<LifecycleOptions> = {}): LifecycleOptions => ({
  platform: 'linux', onQuit: () => undefined, writesSettled: () => Promise.resolve(), ...overrides,
});

describe('application lifecycle (IDE-008)', () => {
  test('quits when the last window closes, except on macOS', () => {
    const linux = fakeApp();
    registerAppLifecycle(linux.app, options());
    linux.app.emit('window-all-closed');
    expect(linux.app.quits).toBe(1);

    const mac = fakeApp();
    registerAppLifecycle(mac.app, options({ platform: 'darwin' }));
    mac.app.emit('window-all-closed');
    expect(mac.app.quits).toBe(0);
  });

  test('ends what runs for the application when it starts to quit', () => {
    const { app } = fakeApp();
    let ended = 0;
    registerAppLifecycle(app, options({ onQuit: () => { ended += 1; } }));
    app.emit('before-quit');
    expect(ended).toBe(1);
  });

  test('does not let the process exit while a write accepted from the closing window is still running, and exits when it is done', async () => {
    const { app } = fakeApp();
    const write = deferred();
    registerAppLifecycle(app, options({ writesSettled: () => write.promise }));

    // the last window closed: the application quits, and Electron is about to exit
    app.emit('window-all-closed');
    expect(app.emit('will-quit').prevented).toBe(true);
    await Promise.resolve();
    expect(app.quits).toBe(1); // only the quit of the window, not the one that ends the wait

    write.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.quits).toBe(2);
    // the quit that follows the wait is not held again
    expect(app.emit('will-quit').prevented).toBe(false);
  });

  test('exits anyway when the write does not finish within the bound', async () => {
    const { app } = fakeApp();
    const never = deferred();
    const pauses: number[] = [];
    const elapsed = deferred();
    registerAppLifecycle(app, options({
      writesSettled: () => never.promise,
      maxWaitMs: 1_500,
      pause: (ms) => { pauses.push(ms); return elapsed.promise; },
    }));
    expect(app.emit('will-quit').prevented).toBe(true);
    expect(pauses).toEqual([1_500]);
    expect(app.quits).toBe(0);

    elapsed.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.quits).toBe(1);
  });
});
