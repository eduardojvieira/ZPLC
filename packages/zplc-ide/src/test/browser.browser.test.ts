import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { browserApp, closeBrowserApp } from './browser';

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
    expect(await app.eval('window.__hit === true')).toBe(true);
  });
});
