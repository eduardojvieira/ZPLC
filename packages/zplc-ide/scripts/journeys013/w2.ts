import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const PUMP = ['PROGRAM Pump', 'VAR', '  Running : BOOL;', 'END_VAR', 'Running := TRUE;', 'END_PROGRAM', ''].join('\n');
const SECOND_GROUP = '[data-editor-group="editor-panel-second"]';
const tabId = (path: string) => `editor-tab-file:${path}`;
const activeId = (app: App) => app.eval<string>(`document.activeElement?.id ?? ''`);
const secondGroupOpen = (app: App) => app.eval<boolean>(`Boolean(document.querySelector(${JSON.stringify(SECOND_GROUP)}))`);
const primaryWidth = (app: App) => app.eval<number>(`document.getElementById('primary')?.getBoundingClientRect().width ?? -1`);

/** Runs a command the way a keyboard user does: the palette, a few letters of its name, Enter. */
async function runFromPalette(app: App, command: string, filter: string): Promise<void> {
  const open = () => app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);
  await app.press('Ctrl+Shift+P');
  await app.until('the command palette to open', async () => (await open()) || undefined);
  await app.type(filter);
  await app.until(
    `the palette to list ${command}`,
    async () => (await app.eval<boolean>(`Boolean(document.querySelector('[role="option"][data-command="${command}"]'))`)) || undefined,
  );
  await app.press('Enter');
  await app.until('the palette to close', async () => !(await open()) || undefined);
}

/** Opens a project file from the Explorer tree: the Files mode, the folder expanded, a click on the file. */
async function openFromTree(app: App, path: string): Promise<void> {
  await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
  const files = css(`[aria-label=${JSON.stringify(translate('en', 'navigator.mode.label'))}] button:nth-of-type(2)`);
  await app.click(files, 'the Files mode of the navigator');
  const item = (id: string) => `document.querySelector('[role="treeitem"][data-tree-node-id="${id}"]')`;
  const folder = `dir:${path.split('/')[0]}`;
  await app.until(`${folder} in the tree`, async () => (await app.visible(item(folder))) || undefined);
  if (await app.eval(`${item(folder)}.getAttribute('aria-expanded') === 'false'`)) await app.click(item(folder));
  await app.click(item(`file:${path}`));
  await app.until(
    `${path} selected`,
    async () => (await app.visible(`document.getElementById(${JSON.stringify(tabId(path))})`)) || undefined,
  );
}

/** The journeys of task W2 of the M1 plan (spec 013): the editor area with two groups, and maximise. */
export const journeysW2: Journey[] = [
  {
    name: 'W2 Split, move and maximise by keyboard',
    example: 'motor_start_stop',
    proves: ['SHL-006', 'SHL-007'],
    partly: [],
    run: async (app, { project }) => {
      writeFileSync(join(project, 'src', 'Pump.st'), PUMP);
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[data-activity="project"]'))) || undefined);
      await openFromTree(app, 'src/Motor.st');
      await openFromTree(app, 'src/Pump.st');
      assert(!(await secondGroupOpen(app)), 'The editor area showed two groups before any split');

      // split: the active view (Pump) moves to the second group, which takes the focus
      await runFromPalette(app, 'view.splitRight', 'split the editor');
      await app.until('the second group with Pump', async () => (await secondGroupOpen(app)) || undefined);
      await app.until('the focus on the tab of Pump', async () => (await activeId(app)) === tabId('src/Pump.st') || undefined);
      assert(
        await app.eval<boolean>(
          `Boolean(document.querySelector(${JSON.stringify(SECOND_GROUP)})?.querySelector('[role="tab"][aria-selected="true"]'))`,
        ),
        'The second group did not show its view',
      );

      // focus the other group, then move Motor across by keyboard: the second group holds both
      await runFromPalette(app, 'view.focusOtherGroup', 'focus the other group');
      await app.until('the focus on the tab of Motor', async () => (await activeId(app)) === tabId('src/Motor.st') || undefined);
      await runFromPalette(app, 'view.moveToOtherGroup', 'move the document');
      await app.until(
        'the split closed with the last view of the first group moved',
        async () => !(await secondGroupOpen(app)) || undefined,
      );

      // maximise: sidebars and results panel hide, Escape brings them back
      const before = await primaryWidth(app);
      assert(before > 100, `The primary sidebar was not shown before maximise: ${before}`);
      await runFromPalette(app, 'view.maximiseDocument', 'maximise');
      await app.until('the sidebar hidden', async () => (await primaryWidth(app)) < 5 || undefined);
      await app.press('Escape');
      await app.until('the sidebar back as it was', async () => (await primaryWidth(app)) > 100 || undefined);
    },
  },
];
