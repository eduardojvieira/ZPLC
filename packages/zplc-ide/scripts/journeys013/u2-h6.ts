import { translate } from '../../src/i18n/translate';
import { COMMANDS } from '../../src/commands/registry';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

type Locale = 'en' | 'es';
const SETTINGS_KEY = 'zplc-ide-settings';
const isOpen = (app: App) => app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);
/** A value of a store of the page: `pick` is an expression over its state `s`. */
const read = <T>(app: App, module: string, name: string, pick: string) =>
  app.eval<T>(`import('/src/${module}.ts').then(({ ${name} }) => { const s = ${name}.getState(); return ${pick}; })`);

async function openProject(app: App, project: string, locale: Locale): Promise<void> {
  const open = button(translate(locale, 'welcome.open.title'), 'contains');
  await app.until('the Welcome screen', async () => (await app.visible(open)) || undefined);
  app.answer(project);
  await app.click(open, 'the Open project button');
  await app.until('the workbench', async () => (await app.visible(css('#console-tab-output'))) || undefined);
}

/** Runs a command the way a keyboard user does: the palette, its title, the arrow keys to its row, Enter. */
async function runFromPalette(app: App, command: string): Promise<void> {
  const title = translate('en', COMMANDS.find((entry) => entry.id === command)!.titleKey);
  await app.press('Ctrl+Shift+P');
  await app.until('the command palette to open', async () => (await isOpen(app)) || undefined);
  await app.type(title);
  const row = `[role="option"][data-command="${command}"]`;
  await app.until(
    `the palette to list ${command}`,
    async () => (await app.eval<boolean>(`Boolean(document.querySelector('${row}'))`)) || undefined,
  );
  for (let step = 0; step < 12; step++) {
    if (await app.eval<boolean>(`document.querySelector('${row}')?.getAttribute('aria-selected') === 'true'`)) break;
    await app.press('ArrowDown');
  }
  await app.press('Enter');
  await app.until(`the palette to close after ${command}`, async () => !(await isOpen(app)) || undefined);
}

const testsActivity = async (app: App) => (await read<string>(app, 'store/useShellLayout', 'useShellLayout', 's.activityView')) === 'tests';

/** The places of section 7 that U2 moved out of the results panel, each with the check that it is on screen. */
const MOVED: Array<{ command: string; tab?: 'interlocks' | 'changes' | 'agent'; shown: (app: App) => Promise<boolean> }> = [
  { command: 'view.tests', shown: testsActivity },
  {
    command: 'view.testResults',
    shown: (app) => app.eval<boolean>(`document.getElementById('console-tab-tests')?.getAttribute('aria-selected') === 'true'`),
  },
  {
    command: 'view.interlocks',
    tab: 'interlocks',
    shown: async (app) =>
      (await testsActivity(app)) && (await read<string>(app, 'projectTests/useProjectTests', 'useProjectTests', 's.view')) === 'interlocks',
  },
  {
    command: 'view.changes',
    tab: 'changes',
    shown: (app) =>
      app.eval<boolean>(
        `document.querySelector('[id="editor-tab-review:changes"]')?.getAttribute('aria-selected') === 'true' && ` +
          `Boolean(document.querySelector('[data-review-document]'))`,
      ),
  },
  {
    // no AI provider in the journey: the command opens Preferences at the section where one is configured (SHL-011)
    command: 'view.agent',
    tab: 'agent',
    shown: (app) => read<boolean>(app, 'store/usePreferencesDocument', 'usePreferencesDocument', `s.open && s.anchor === 'assistant'`),
  },
];

/**
 * A place is left only once it has settled, as the journey of the View menu does (u2-p1.ts): Preferences (`view.agent` with no
 * provider) is a lazily loaded document that takes the focus when it is ready.
 */
const settle = (command: string) => Bun.sleep(command === 'view.agent' ? 2000 : 300);

/** Puts every place back, so that each way of opening one starts from the same screen. */
async function reset(app: App): Promise<void> {
  await app.eval(
    `Promise.all([import('/src/store/useReviewDocument.ts'), import('/src/store/usePreferencesDocument.ts'), ` +
      `import('/src/store/useShellLayout.ts'), import('/src/store/useIDEStore.ts')]).then(([review, preferences, layout, ide]) => { ` +
      `review.useReviewDocument.getState().close(); preferences.usePreferencesDocument.getState().close(); ` +
      `layout.useShellLayout.getState().showActivity('project'); ide.useIDEStore.getState().setActiveConsoleTab('problems'); })`,
  );
  await Bun.sleep(300);
}

/** Journeys of task U2-H6 (plan-u2.md): the results panel of five tabs, and the places of the tabs that left it. */
export const journeysU2H6: Journey[] = [
  {
    name: 'SHL-003 the tab strip shows every name at 1366 by 768 in English and Spanish at both densities',
    example: 'motor_start_stop',
    proves: ['SHL-003'],
    partly: [],
    run: async (app, { project }) => {
      const found: string[] = [];
      for (const locale of ['en', 'es'] as const) {
        for (const density of ['comfortable', 'compact'] as const) {
          await app.eval(
            `(() => { const key = ${JSON.stringify(SETTINGS_KEY)}; const stored = JSON.parse(localStorage.getItem(key) || '{}'); ` +
              `const target = stored.settings ?? stored; target.language = ${JSON.stringify(locale)}; ` +
              `target.density = ${JSON.stringify(density)}; localStorage.setItem(key, JSON.stringify(stored)); })()`,
          );
          await app.cdp.command('Page.reload');
          await app.cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
          await openProject(app, project, locale);
          await app.click(css('#console-tab-output'), 'the Output tab');
          await new Promise((resolve) => setTimeout(resolve, 500)); // the strip measures its names after the layout
          const tabs = await app.eval<Array<{ id: string; name: string; width: number; inside: boolean }>>(
            `(() => { const strip = document.getElementById('console-tab-output').closest('[role="tablist"]'); ` +
              `const box = strip.getBoundingClientRect(); return [...strip.querySelectorAll('[role="tab"]')].map((tab) => { ` +
              `const name = tab.querySelector('span'); const at = tab.getBoundingClientRect(); return { id: tab.id, ` +
              `name: name?.textContent ?? '', ` +
              `width: name && !name.classList.contains('sr-only') ? name.getBoundingClientRect().width : 0, ` +
              `inside: at.left >= box.left - 1 && at.right <= box.right + 1 }; }); })()`,
          );
          const where = `${locale} ${density}`;
          // simulation is the target here: the five tabs, and no Terminal until a board or the person asks for it
          if (tabs.length !== 5) found.push(`${where}: ${tabs.length} tabs (${tabs.map((tab) => tab.id).join(', ')})`);
          for (const tab of tabs) if (tab.width <= 4 || !tab.inside) found.push(`${where}: "${tab.name}" is not shown by its name`);
          await app.cdp.command('Emulation.clearDeviceMetricsOverride');
        }
      }
      assert(found.length === 0, `The results panel at 1366 by 768:\n${found.join('\n')}`);
    },
  },
  {
    name:
      'SHL-004 open every surface of the section 7 inventory that U2 moved by its command and by the palette on a session file ' +
      'written by 2.0',
    example: 'motor_start_stop',
    proves: ['SHL-004'],
    partly: [],
    run: async (app, { project }) => {
      await openProject(app, project, 'en');
      for (const place of MOVED) {
        // by its command, as the menu and a shortcut run it
        await reset(app);
        await app.eval(`import('/src/commands/bus.ts').then(({ runCommand }) => runCommand(${JSON.stringify(place.command)}))`);
        await app.until(`${place.command} by its command`, async () => (await place.shown(app)) || undefined);
        await settle(place.command);
        // by the palette
        await reset(app);
        await runFromPalette(app, place.command);
        await app.until(`${place.command} from the palette`, async () => (await place.shown(app)) || undefined);
        await settle(place.command);
        if (!place.tab) continue;
        // what a session of 2.0 stored: that tab as the active tab of the results panel
        await reset(app);
        await app.eval(
          `import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => ` +
            `useIDEStore.getState().setActiveConsoleTab(${JSON.stringify(place.tab)}))`,
        );
        await app.until(`the stored ${place.tab} tab in its new place`, async () => (await place.shown(app)) || undefined);
        await settle(place.command);
        const selected = await app.eval<string>(
          `document.querySelector('[role="tab"][id^="console-tab-"][aria-selected="true"]')?.id ?? ''`,
        );
        assert(selected === 'console-tab-problems', `The results panel shows ${selected || 'no tab'} after a stored ${place.tab} tab.`);
        assert(!(await app.eval<boolean>(`Boolean(document.getElementById('console-tab-${place.tab}'))`)), `The ${place.tab} tab is back.`);
      }
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
