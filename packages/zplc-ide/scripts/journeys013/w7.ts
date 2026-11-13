import { assert } from '../run-desktop-smoke';
import { button, css } from '../journeyApp';
import { translate } from '../../src/i18n/translate';
import type { Journey } from '../journeys';

/** The journeys of task W7 of the M1 plan (spec 013): the status rail in one line, the state words, the details. */

const RAIL = '[aria-label="Operational status"], [aria-label="Estado operativo"]';

interface Rail {
  text: string;
  items: string[];
  /** The line does not wrap: every item sits at the same height. */
  oneLine: boolean;
  height: number;
}

export const journeysW7: Journey[] = [
  {
    name: 'W7 The status line at 1366 by 768 in English and Spanish',
    example: 'blinky_st',
    proves: ['FLW-011'],
    partly: ['MSG-007'],
    run: async (app, { project }) => {
      await app.cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      const rail = (): Promise<Rail> =>
        app.eval<Rail>(
          `(() => {
            const rail = document.querySelector(${JSON.stringify(RAIL)});
            const items = [...(rail?.querySelectorAll('[data-status-item]') ?? [])];
            const centres = items.map((item) => { const box = item.getBoundingClientRect(); return box.top + box.height / 2; });
            return { text: rail?.innerText ?? '', items: items.map((item) => item.textContent ?? ''), oneLine: centres.every((centre) => ` +
            `Math.abs(centre - centres[0]) < 6),
              height: Math.round(rail?.getBoundingClientRect().height ?? 0) };
          })()`,
        );

      for (const locale of ['en', 'es'] as const) {
        const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
        if (locale === 'es') {
          await app.eval(
            `(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = ` +
              `stored.settings ?? stored; target.language = 'es'; localStorage.setItem(key, JSON.stringify(stored)); })()`,
          );
          await app.cdp.command('Page.reload');
        }
        await app.until('the Welcome screen', async () => (await app.visible(button(t('welcome.open.title'), 'contains'))) || undefined);
        app.answer(project);
        await app.click(button(t('welcome.open.title'), 'contains'), 'the Open project button');
        await app.until('the status rail', async () => (await app.visible(css(RAIL))) || undefined);

        // Nothing is running: the simulator is implicit, so the rail never says the project is not connected (FLW-008, MSG-007).
        const stopped = await rail();
        assert(
          stopped.text.includes(t('studio.status.state.stopped')),
          `[${locale}] The stopped state is not worded Stopped: ${stopped.text}`,
        );
        assert(
          !/disconnected|desconectado|not connected|no conectado/i.test(stopped.text),
          `[${locale}] The rail says not connected: ${stopped.text}`,
        );
        assert(stopped.items.length <= 4, `[${locale}] ${stopped.items.length} items in the line: ${stopped.items.join(' | ')}`);
        assert(stopped.oneLine && stopped.height <= 48, `[${locale}] The line is not one line (${stopped.height} px): ${stopped.text}`);

        // Run: one line while it runs, the program state in the words of the table.
        await app.click(button(t('toolbar.run.label'), 'prefix'), 'Run');
        await app.until('the Running state', async () => (await rail()).text.includes(t('studio.status.state.running')) || undefined);
        const running = await rail();
        assert(running.items.length <= 4, `[${locale}] ${running.items.length} items while running: ${running.items.join(' | ')}`);
        assert(running.oneLine && running.height <= 48, `[${locale}] The line wraps while running (${running.height} px).`);
        assert(!/cycles|ciclos/i.test(running.text), `[${locale}] Cycles stayed in the line: ${running.text}`);

        // The details open by keyboard: focus the control and press Enter; they list runtime, cycles, tasks, firmware, protocol.
        await app.eval(
          `[...document.querySelectorAll('button')].find((b) => b.closest(${JSON.stringify(RAIL)}) && ` +
            `b.textContent?.includes(${JSON.stringify(t('studio.status.details'))}))?.focus()`,
        );
        await app.press('Enter');
        await app.until('the details', async () => (await app.visible(css('[role="dialog"]'))) || undefined);
        const details = await app.eval<string>(`document.querySelector('[role="dialog"]')?.innerText ?? ''`);
        for (const key of ['runtime', 'cycles', 'tasks', 'firmware', 'protocol'] as const)
          assert(details.includes(t(`studio.status.detail.${key}`)), `[${locale}] The details lack ${key}: ${details}`);
        await app.press('Escape');
        await app.until('the details closed', async () => !(await app.visible(css('[role="dialog"]'))) || undefined);
      }
    },
  },
];
