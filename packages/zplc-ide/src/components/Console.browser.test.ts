import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { browserApp, closeBrowserApp } from '../test/browser';

// In the compact density the bar of the results panel was shorter than its tabs, so every named tab stood out of the strip at
// 1366 by 768 (journey SHL-016). Only a browser engine lays the bar out, so this measures it in headless Chromium.
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);

const ST = 'PROGRAM Main\nEND_PROGRAM\n';

/** The tabs of the results panel that lie outside the box of their strip. */
const tabsOutOfStrip = (): string[] => {
  const strip = document.getElementById('console-tab-output')?.closest('[role="tablist"]');
  if (!strip) return ['no tab strip'];
  const box = strip.getBoundingClientRect();
  return [...strip.querySelectorAll('[role="tab"]')].flatMap((tab) => {
    const at = tab.getBoundingClientRect();
    const out = at.left < box.left - 1 || at.right > box.right + 1 || at.top < box.top - 1 || at.bottom > box.bottom + 1;
    return out
      ? [
          `${tab.id} is ${Math.round(at.height)} px tall at ${Math.round(at.top)} in a strip of ${Math.round(box.height)} at ${Math.round(box.top)}`,
        ]
      : [];
  });
};

describe('the results panel in a browser (SHL-016)', () => {
  for (const locale of ['en', 'es'] as const) {
    test(`SHL-016 every tab of the results panel lies inside its strip at 1366 by 768 at both densities in ${locale}`, async () => {
      const app = await browserApp();
      await app.cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await app.open({ name: 'main.st', language: 'ST', content: ST }, locale);
      await app.eval(
        `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.setState({ isConsoleCollapsed: false, ` +
          `activeConsoleTab: 'output' }))`,
      );
      await app.until('the results panel', `document.getElementById('console-tab-output') !== null`);
      const found: string[] = [];
      for (const density of ['comfortable', 'compact'] as const) {
        await app.eval(
          `import('/src/store/useAppSettings.ts').then(({ useAppSettings }) => useAppSettings.getState().update({ density: '${density}' }))`,
        );
        await Bun.sleep(400); // the layout that follows a density
        for (const problem of await app.eval<string[]>(`(${tabsOutOfStrip.toString()})()`)) found.push(`${density}: ${problem}`);
      }
      expect(found).toEqual([]);
    });
  }
});
