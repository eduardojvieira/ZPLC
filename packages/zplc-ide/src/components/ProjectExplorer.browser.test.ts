import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { browserApp, closeBrowserApp } from '../test/browser';

// The header of the navigator (its mode switch and Project settings) ran out of the primary sidebar at 1024 by 768 in
// English and at every width in Spanish (journeys 65 and SHL-016). Only a browser engine lays the header out, so this
// measures it in headless Chromium.
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);

const ST = 'PROGRAM Main\nEND_PROGRAM\n';
const SIDEBAR = '[data-sidebar-kind="primary"]';

/** What lies outside the primary sidebar: its content scrolled sideways, a control or a text past its edges. */
const outOfSidebar = (selector: string): string[] => {
  const aside = document.querySelector(selector);
  if (!aside) return ['no primary sidebar'];
  const problems: string[] = [];
  const edge = aside.getBoundingClientRect();
  for (const body of aside.querySelectorAll<HTMLElement>(':scope > div'))
    if (body.scrollWidth > body.clientWidth + 1) problems.push(`the content is ${body.scrollWidth} px wide in ${body.clientWidth} px`);
  const walker = document.createTreeWalker(aside, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim();
    if (!text || node.parentElement?.closest('.sr-only, [aria-hidden="true"]')) continue;
    range.selectNodeContents(node);
    for (const line of range.getClientRects())
      if (line.width > 0.5 && (line.left < edge.left - 1 || line.right > edge.right + 1)) {
        problems.push(`"${text.slice(0, 40)}" runs ${Math.round(Math.max(line.right - edge.right, edge.left - line.left))} px out`);
        break;
      }
  }
  return problems;
};

describe('the project navigator in a browser (SHL-016)', () => {
  for (const locale of ['en', 'es'] as const) {
    test(`SHL-016 the header of the navigator stays inside the narrowest primary sidebar at 1024 and 1440 wide in ${locale}`, async () => {
      const app = await browserApp();
      const size = (width: number, height: number) =>
        app.cdp.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await size(1440, 900);
      await app.open({ name: 'main.st', language: 'ST', content: ST }, locale);
      await app.until('the navigator', `document.querySelector('${SIDEBAR} [data-command="project.settings"]') !== null`);
      // the narrowest the person can make the sidebar, by the keyboard on its separator: every wider one has more room
      await app.eval(`document.getElementById('primary-separator').focus()`);
      const width = () => app.eval<number>(`Math.round(document.getElementById('primary').getBoundingClientRect().width)`);
      for (let step = 0; step < 20 && (await width()) > 200; step++) await app.press('ArrowLeft');
      expect(await width()).toBe(200);
      const found: string[] = [];
      for (const density of ['comfortable', 'compact'] as const) {
        await app.eval(
          `import('/src/store/useAppSettings.ts').then(({ useAppSettings }) => ` +
            `useAppSettings.getState().update({ density: '${density}' }))`,
        );
        for (const [width, height] of [
          [1440, 900],
          [1024, 768],
        ] as const) {
          await size(width, height);
          await app.until(`the window to be ${width} wide`, `window.innerWidth === ${width}`);
          await Bun.sleep(400); // the layout that follows a resize or a density
          for (const problem of await app.eval<string[]>(`(${outOfSidebar.toString()})(${JSON.stringify(SIDEBAR)})`))
            found.push(`${density} ${width}: ${problem}`);
        }
      }
      expect(found).toEqual([]);
    });
  }
});
