import type { Journey } from '../journeys';
import { button, css, menuItem } from '../journeyApp';

const NOTICES = 'section[aria-label="Notifications"]';
const PANEL = '[role="tabpanel"][id^="console-panel-"]';

/** The journeys of task W8 of the M1 plan (spec 013). */
export const journeysW8: Journey[] = [
  {
    name: 'W8 Notices stay clear of the results panel at 1366 by 768',
    example: 'blinky_st',
    proves: ['FLW-013'],
    partly: [],
    run: async (app, { project }) => {
      await app.cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);

      // The notice list must not overlap the results panel, nor leave the window, nor be wider than 360 pixels.
      const assertClear = async (when: string) => {
        const found = await app.eval<string[]>(
          `(() => {
            const list = document.querySelector(${JSON.stringify(NOTICES)})?.getBoundingClientRect();
            const panel = document.querySelector(${JSON.stringify(PANEL)})?.getBoundingClientRect();
            if (!list || list.height === 0) return ['no notice list'];
            const problems = [];
            if (list.width > 360.5) problems.push('wider than 360: ' + list.width);
            if (list.right > innerWidth + 0.5 || list.bottom > innerHeight + 0.5) problems.push('outside the window');
            if (panel && panel.width > 0 && Math.min(list.right, panel.right) > Math.max(list.left, panel.left) &&
              Math.min(list.bottom, panel.bottom) > Math.max(list.top, panel.top)) problems.push('covers the results panel');
            return problems;
          })()`,
        );
        if (found.length > 0) throw new Error(`At ${when}: ${found.join('; ')}`);
      };

      await app.click(button('Build options'));
      await app.click(menuItem('Compile'));
      await app.until('the build notice', async () => (await app.visible(css(NOTICES))) || undefined);
      await app.click(css('#console-tab-output'));
      await assertClear('the build');

      await app.click(button('Run (F5)', 'prefix'));
      await app.until('a notice after Run', async () => (await app.visible(css(NOTICES))) || undefined);
      await assertClear('Run');
    },
  },
];
