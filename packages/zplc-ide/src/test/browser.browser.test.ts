import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { Cdp } from '../../scripts/cdpHarness';
import { BrowserApp, browserApp, closeBrowserApp } from './browser';

// The click of the browser driver: the workbench lays its panels out for a moment after the editor is drawn, and a click that
// aimed at the box it measured landed on the sidebar separator instead, so the editor never got the focus and every key of
// the test went to the separator (the flake of "Ctrl+Space lists the declared variable").
setDefaultTimeout(60_000);
afterAll(closeBrowserApp);

describe('the click of the browser driver', () => {
  test('lands on an element that is still moving when the click is asked for', async () => {
    const app = await browserApp();
    await app.reload();
    // a layout that settles for 400 ms: the element moves 20 px every 5 ms until it is 1000 px away
    await app.eval(`(() => {
      document.body.innerHTML = '';
      const target = document.createElement('div');
      target.id = 'moving';
      target.style.cssText = 'position:fixed;top:100px;left:0;width:4px;height:40px;background:red';
      target.addEventListener('mousedown', () => { window.__hit = true; });
      document.body.append(target);
      let left = 0;
      const timer = setInterval(() => { left += 20; target.style.left = left + 'px'; if (left >= 1000) clearInterval(timer); }, 5);
      return true;
    })()`);
    await app.click('#moving');
    expect(await app.eval<boolean>('window.__hit === true')).toBe(true);
  });
});

describe('the page load of the browser driver', () => {
  // Chromium aborts every request in flight when an interface of the host comes or goes (a container that restarts adds and
  // drops one): the page then never draws, and the test used to wait 60 s for it and fail. A stand-in for DevTools: the first
  // load meets that change, the second one draws.
  test('loads the page again when a change of the host network aborted the load', async () => {
    const navigations: unknown[] = [];
    const cdp = {
      errors: [] as string[],
      command: async (method: string, params: { url?: string } = {}) => {
        if (method === 'Page.navigate') {
          navigations.push(params.url);
          if (navigations.length === 1) cdp.errors.push('Failed to load resource: net::ERR_NETWORK_CHANGED');
        }
        return {};
      },
      evaluate: async () => navigations.length === 2,
    };
    await new BrowserApp(cdp as unknown as Cdp, 'http://127.0.0.1:9/').reload();
    expect(navigations).toEqual(['http://127.0.0.1:9/', 'http://127.0.0.1:9/']);
  }, 5_000);
});
