import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LESSON_INDEX } from '../../src/generated/lessonIndex';
import { translate } from '../../src/i18n/translate';
import { assert } from '../run-desktop-smoke';
import { button, css, menuItem, tab, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
const BUILT = en('toolbarMsg.builtSavedWorkspaceLocally').split('{')[0]!.replace(/\.$/, '');
const SECOND_GROUP = '[data-editor-group="editor-panel-second"]';
const FIRST_GROUP = '[data-editor-group="editor-panel"]';
const inGroup = (group: string, selector: string) =>
  `Boolean(document.querySelector(${JSON.stringify(group)})?.querySelector(${JSON.stringify(selector)}))`;

/** Runs a command the way a keyboard user does: the palette, a few letters of its name, Enter. */
export async function runFromPalette(app: App, command: string, filter: string): Promise<void> {
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

/** The journeys of task W3 of the M1 plan (spec 013): the plant is a document of the editor area and Lab leaves the results panel. */
export const journeysW3: Journey[] = [
  {
    name: 'W3 A 2.0 plant lesson with its program and its plant side by side',
    example: 'none',
    proves: ['PLS-001', 'PLS-002'],
    partly: ['SHL-003', 'SHL-004'],
    run: async (app, { root }) => {
      const lesson = LESSON_INDEX.lessons.find(({ plant }) => plant === 'motor-v1')!;
      const folder = join(root, 'plant-lesson-w3');
      mkdirSync(folder);
      await app.eval(
        `(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = ` +
          `stored.settings ?? stored; target.unlockAllLessons = true; localStorage.setItem(key, JSON.stringify(stored)); })()`,
      );
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
      await app.cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
      await app.cdp.command('Page.bringToFront');
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => (await app.visible(css('[data-learn-start]'))) || undefined);
      app.answer(folder);
      await app.click(css(`[data-learn-start="${lesson.id}"]`), 'the start of the motor plant lesson');
      await app.until('the workbench', async () => (await app.visible(css('[data-activity="project"]'))) || undefined);
      await app.click(button(en('toolbar.build.label')));
      await app.click(menuItem(en('toolbar.compile.text')));
      await app.click(tab(en('panel.output')), 'the Output tab');
      await app.until(
        'the build to succeed',
        async () =>
          (await app.eval<string>(`document.querySelector('[role="tabpanel"][id^="console-panel-"]')?.innerText ?? ''`)).includes(BUILT) ||
          undefined,
        60_000,
      );

      // the results panel has no Lab tab (SHL-003)
      assert(!(await app.eval<boolean>(`Boolean(document.getElementById('console-tab-lab'))`)), 'The results panel still has a Lab tab.');

      // the plant opens from its command in the second group, beside the program of the first (PLS-001, SHL-004)
      await runFromPalette(app, 'view.plant', 'show the plant');
      await app.until('the plant document', async () => (await app.visible(css('[data-plant-document]'))) || undefined);
      assert(
        await app.eval<boolean>(inGroup(SECOND_GROUP, '#editor-tab-plant[aria-selected="true"]')),
        'The plant is not in the second group.',
      );
      assert(
        await app.eval<boolean>(inGroup(FIRST_GROUP, '[role="tab"][id^="editor-tab-file:"]')),
        'The program is not in the first group.',
      );
      assert(
        (await app.eval<string>(`document.getElementById('editor-tab-plant')?.textContent ?? ''`)).includes('Plant'),
        'The plant tab does not say Plant.',
      );
      // the program runs in the simulation (Run starts the simulator itself), as the lesson does, and the plant binds to it
      await app.click(button(`${en('toolbar.run.label')} (F5)`, 'prefix'));
      await app.until(
        'the program to run',
        async () => (await app.visible(button(`${en('toolbar.pause.label')} (F6)`, 'prefix'))) || undefined,
      );
      await app.until('the live motor plant', async () => (await app.visible(css('[data-plant="motor-v1"]'))) || undefined, 45_000);
      assert(!/\bLab\b/.test(await app.eval<string>('document.body.innerText')), 'The window still says Lab.');
    },
  },
  {
    name: 'W3 A session saved with the Lab tab opens the plant document',
    example: 'motor_start_stop',
    proves: [],
    partly: ['SHL-004', 'PLS-002'],
    run: async (app, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[data-activity="project"]'))) || undefined);
      await app.click(tab('Problems', 'prefix'), 'the Problems tab');
      // what a session of 2.0 stored: the Lab tab as the active tab of the results panel
      await app.eval(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setActiveConsoleTab('lab'))`);
      await app.until('the plant document', async () => (await app.visible(css('[data-plant-document]'))) || undefined);
      assert(
        await app.eval<boolean>(`document.getElementById('editor-tab-plant')?.getAttribute('aria-selected') === 'true'`),
        'The plant tab is not selected.',
      );
      const panel = await app.eval<string>(`document.querySelector('[role="tab"][id^="console-tab-"][aria-selected="true"]')?.id ?? ''`);
      assert(panel !== '' && panel !== 'console-tab-lab', `The results panel kept ${panel}.`);
      // with no plant lesson and no recorded run the document says what to do next (UX-021)
      assert(
        (await app.eval<string>('document.body.innerText')).includes(en('studio.plant.empty')),
        'The empty plant does not name the next action.',
      );
    },
  },
];
