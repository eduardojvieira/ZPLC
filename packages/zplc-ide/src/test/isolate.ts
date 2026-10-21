import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * Bun runs every test file in one process. A render test file that fails while it loads never reaches its `afterAll`,
 * and happy-dom stays registered: the next file then sees a `window` it never asked for. The browser tests send their
 * DevTools requests through the happy-dom `fetch` (cross-origin refused) and the string-render tests mount portals into
 * a `document`. This puts the process back to "no DOM" so one broken file fails alone.
 */
export async function releaseStaleDom(): Promise<boolean> {
  if (!GlobalRegistrator.isRegistered) return false;
  await GlobalRegistrator.unregister();
  return true;
}
