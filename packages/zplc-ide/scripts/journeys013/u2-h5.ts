import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { findTextOutOfBox } from '../textFit';
import { pause } from '../journeyTiming';

const PUMP = ['PROGRAM Pump', 'VAR', '  Running : BOOL;', 'END_VAR', 'Running := TRUE;', 'END_PROGRAM', ''].join('\n');
const SETTINGS_KEY = 'zplc-ide-settings';

type Locale = 'en' | 'es';
const open = (locale: Locale) => button(translate(locale, 'welcome.open.title'), 'contains');
const primaryWidth = (app: App) => app.eval<number>(`document.getElementById('primary')?.getBoundingClientRect().width ?? -1`);

/** Runs a command the way a keyboard user does: the palette, a few letters of its name, Enter. */
async function runFromPalette(app: App, command: string, filter: string): Promise<void> {
  const isOpen = () => app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);
  await app.press('Ctrl+Shift+P');
  await app.until('the command palette to open', async () => (await isOpen()) || undefined);
  await app.type(filter);
  await app.until(
    `the palette to list ${command}`,
    async () => (await app.eval<boolean>(`Boolean(document.querySelector('[role="option"][data-command="${command}"]'))`)) || undefined,
  );
  await app.press('Enter');
  await app.until('the palette to close', async () => !(await isOpen()) || undefined);
}

async function openProject(app: App, project: string, locale: Locale): Promise<void> {
  await app.until('the Welcome screen', async () => (await app.visible(open(locale))) || undefined);
  app.answer(project);
  await app.click(open(locale), 'the Open project button');
  await app.until('the workbench', async () => (await app.visible(css('[data-activity="project"]'))) || undefined);
}

/** Every control of a region of the main path lies inside the region's box; the regions are given by selector. */
const controlsInside = (regions: string[]) =>
  `(${(selectors: string[]) => {
    const problems: string[] = [];
    for (const selector of selectors) {
      const regionsFound = [...document.querySelectorAll(selector)];
      if (regionsFound.length === 0) problems.push(`missing: ${selector}`);
      for (const region of regionsFound) {
        const box = region.getBoundingClientRect();
        if (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1)
          problems.push(`${selector} is outside the window`);
        for (const control of region.querySelectorAll<HTMLElement>('button, [role="tab"], a, select, input')) {
          const at = control.getBoundingClientRect();
          if (at.width === 0 || at.height === 0 || getComputedStyle(control).visibility !== 'visible') continue;
          if (control.closest('[aria-hidden="true"], .sr-only')) continue;
          if (at.left < box.left - 1 || at.right > box.right + 1 || at.top < box.top - 1 || at.bottom > box.bottom + 1)
            problems.push(
              `${selector}: "${(control.getAttribute('aria-label') ?? control.textContent ?? '').trim().slice(0, 40)}" is outside`,
            );
        }
      }
    }
    return problems;
  }})(${JSON.stringify(regions)})`;

/** The journeys of task H5 of the U2 plan (spec 013): Reset layout, and nothing clipped at 1366 by 768. */
export const journeysU2H5: Journey[] = [
  {
    name: 'SHL-016 no control of the main path is clipped at 1366 by 768 with the split open',
    example: 'motor_start_stop',
    proves: ['SHL-016'],
    partly: [],
    run: async (app, { project }) => {
      writeFileSync(join(project, 'src', 'Pump.st'), PUMP);
      const found = new Set<string>();
      for (const locale of ['en', 'es'] as const) {
        for (const density of ['comfortable', 'compact'] as const) {
          await app.eval(
            `(() => { const key = ${JSON.stringify(SETTINGS_KEY)}; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const ` +
              `target = ` +
              `stored.settings ?? stored; target.language = ${JSON.stringify(locale)}; target.density = ${JSON.stringify(density)}; ` +
              `localStorage.setItem(key, JSON.stringify(stored)); })()`,
          );
          await app.cdp.command('Page.reload');
          await app.cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
          await openProject(app, project, locale);
          // the primary sidebar open, two documents open and split, the results panel showing
          await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
          const files = css(`[aria-label=${JSON.stringify(translate(locale, 'navigator.mode.label'))}] button:nth-of-type(2)`);
          await app.click(files, 'the Files mode of the navigator');
          for (const path of ['src/Motor.st', 'src/Pump.st']) {
            const folder = `document.querySelector('[role="treeitem"][data-tree-node-id="dir:src"]')`;
            await app.until('the src folder', async () => (await app.visible(folder)) || undefined);
            if (await app.eval(`${folder}.getAttribute('aria-expanded') === 'false'`)) await app.click(folder);
            await app.click(`document.querySelector('[role="treeitem"][data-tree-node-id="file:${path}"]')`, path);
            await app.until(`${path} open`, async () => (await app.visible(css(`[id="editor-tab-file:${path}"]`))) || undefined);
          }
          await runFromPalette(app, 'view.splitRight', locale === 'en' ? 'split the editor' : translate(locale, 'command.view.splitRight'));
          await app.until(
            'the second group',
            async () =>
              (await app.eval<boolean>(`Boolean(document.querySelector('[data-editor-group="editor-panel-second"]'))`)) || undefined,
          );
          await app.click(css('#console-tab-output'), 'the Output tab');
          await pause(500);

          const regions = ['[role="toolbar"]', `[aria-label=${JSON.stringify(translate(locale, 'status.label'))}]`, '[role="tablist"]'];
          const problems = await app.eval<string[]>(
            controlsInside(regions) +
              `.concat([...document.querySelectorAll('[data-activity]')].flatMap((rail) => { const r = rail.getBoundingClientRect(); ` +
              `return r.left < 0 || r.right > innerWidth || r.bottom > innerHeight ? ['activity ' + rail.getAttribute('data-activity') + ` +
              `' is outside'] : []; }))`,
          );
          const strips = ['[role="tablist"]'];
          const text = await app.eval<string[]>(`(${findTextOutOfBox.toString()})(${JSON.stringify(strips)})`);
          for (const problem of [...problems, ...text]) found.add(`${locale} ${density}: ${problem}`);
          await app.cdp.command('Emulation.clearDeviceMetricsOverride');
        }
      }
      assert(found.size === 0, `Clipped or out-of-box controls at 1366 by 768:\n${[...found].join('\n')}`);
    },
  },
  {
    name: 'SHL-015 Reset layout restores the regions after the user moved them',
    example: 'motor_start_stop',
    proves: ['SHL-015'],
    partly: [],
    run: async (app, { project }) => {
      await openProject(app, project, 'en');
      const before = await primaryWidth(app);
      assert(before > 100, `The primary sidebar was not shown: ${before}`);
      // the user moves the divider with the keyboard (a user interaction, so the size is saved)
      await app.eval(`document.getElementById('primary-separator')?.focus()`);
      for (let step = 0; step < 6; step++) await app.press('ArrowRight');
      await app.until('the sidebar wider', async () => (await primaryWidth(app)) > before + 20 || undefined);
      await app.click(css('[data-activity="search"]'), 'the Search activity of the rail');
      await app.click(css('#console-tab-problems'), 'the Problems tab');

      await runFromPalette(app, 'view.resetLayout', 'reset the layout');
      await app.until('the sidebar at its default width', async () => Math.abs((await primaryWidth(app)) - before) < 4 || undefined);
      await app.until(
        'the Project activity selected',
        async () =>
          (await app.eval<boolean>(`document.querySelector('[data-activity="project"]')?.getAttribute('aria-pressed') !== 'false'`)) ||
          undefined,
      );
      await app.until(
        'Output shown',
        async () =>
          (await app.eval<boolean>(`document.getElementById('console-tab-output')?.getAttribute('aria-selected') === 'true'`)) || undefined,
      );
      const saved = await app.eval<string[]>(
        `Object.keys(localStorage).filter((key) => key.includes('zplc-ide-shell.v1') || key.includes('zplc-ide-workspace'))`,
      );
      assert(saved.length === 0, `Saved panel sizes remain after the reset: ${saved.join(', ')}`);
    },
  },
];
