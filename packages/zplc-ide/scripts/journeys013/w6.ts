import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assert, MONACO_MODULE } from '../run-desktop-smoke';
import { button, css, menuItem, tab, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { cyclesFromDetails } from './statusDetails';

/** The journeys of task W6 of the M1 plan (spec 013): Run in one action, the target, the implicit simulator session. */

const NOTICES = 'section[aria-label="Notifications"]';
const treeItem = (id: string) => css(`[role="treeitem"][data-tree-node-id="${id}"]`);
const monacoEval = <T>(app: App, body: string) =>
  app.eval<T>(`(async () => { const monaco = await ${MONACO_MODULE}; const editor = monaco.editor.getEditors()[0]; ${body} })()`);
const status = (app: App) => app.eval<string>(`document.querySelector('[aria-label="Operational status"]')?.innerText ?? ''`);
const cycles = async (app: App) => (await cyclesFromDetails(app)) || 0; // a session that has not started reports no count: zero
const noticeText = (app: App) => app.eval<string>(`document.querySelector(${JSON.stringify(NOTICES)})?.innerText ?? ''`);

async function openProject(app: App, project: string): Promise<void> {
  app.answer(project);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
}

/** Open a file of the Explorer tree and wait until its tab is the selected one. */
async function openFile(app: App, path: string): Promise<void> {
  await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
  await app
    .until('the Files tree', async () => (await app.visible(treeItem(`dir:${path.split('/')[0]}`))) || undefined)
    .catch(async () => {
      await app.click(css('[aria-label="Navigator view"] button:nth-of-type(2), [aria-label="Vista del navegador"] button:nth-of-type(2)'));
    });
  const folder = path.split('/')[0]!;
  if (await app.eval(`${treeItem(`dir:${folder}`)}?.getAttribute('aria-expanded') === 'false'`)) await app.click(treeItem(`dir:${folder}`));
  await app.click(treeItem(`file:${path}`));
  const name = path.split('/').at(-1)!;
  await app.until(
    `${name} in the editor`,
    async () =>
      (await app.eval<boolean>(
        `[...document.querySelectorAll('[role="tab"][aria-selected="true"]')]` +
          `.some((item) => item.textContent?.includes(${JSON.stringify(name)}))`,
      )) || undefined,
  );
}

/** Types a comment at the start of the active file, as an edit a person has not saved. */
async function editActiveFile(app: App, text: string): Promise<void> {
  await monacoEval(app, 'editor.focus(); editor.setPosition({ lineNumber: 1, column: 1 });');
  await app.type(text);
}

export const journeysW6: Journey[] = [
  {
    name: 'W6 Run with a build error ends in Problems and starts no simulator',
    example: 'motor_start_stop',
    proves: ['FLW-001'],
    partly: ['SHL-010'],
    run: async (app, { project }) => {
      const main = join(project, 'src', 'Motor.st');
      writeFileSync(main, `${readFileSync(main, 'utf8').replace('Reverse := FALSE;', 'Reverse := FALSE;\n  UndefinedVariable := 1;')}`);
      await openProject(app, project);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until(
        'Problems to be the shown tab',
        async () =>
          (await app.eval<boolean>(`document.getElementById('console-tab-problems')?.getAttribute('aria-selected') === 'true'`)) ||
          undefined,
      );
      await app.until('the notice to say the run stopped', async () => /Run stopped/.test(await noticeText(app)) || undefined);
      assert(!(await app.visible(button('Pause (F6)', 'prefix'))), 'The program runs although its build failed.');
      assert(
        /stopped|detenido/i.test(await status(app)) && Number.isNaN(await cyclesFromDetails(app)),
        `The simulator was started although the build failed: ${await status(app)}`,
      );
    },
  },
  {
    name: 'W6 Step from stopped holds before the first scan',
    example: 'blinky_st',
    proves: ['FLW-002'],
    partly: [],
    run: async (app, { project }) => {
      await openProject(app, project);
      await app.click(button('Step one cycle', 'prefix'));
      await app.until('the program to be ready to step', async () => /before the first scan/.test(await noticeText(app)) || undefined);
      assert((await cycles(app)) === 0, `The program scanned before the first Step was pressed again: cycles ${await cycles(app)}.`);
      assert(!(await app.visible(button('Pause (F6)', 'prefix'))), 'Step started the program instead of holding.');
      await app.click(button('Step one cycle', 'prefix'));
      await app.until('one scan after the second Step', async () => (await cycles(app)) === 1 || undefined);
    },
  },
  {
    name: 'W6 Save all, then Build, with two modified files and a changed task interval',
    example: 'motor_start_stop',
    proves: ['FLW-005', 'FLW-006'],
    partly: [],
    run: async (app, { project }) => {
      writeFileSync(join(project, 'src', 'Extra.st'), 'PROGRAM Extra\nVAR\n  Spare : BOOL;\nEND_VAR\nEND_PROGRAM\n');
      await openProject(app, project);
      await openFile(app, 'src/Motor.st');
      await editActiveFile(app, '(* first edit *) ');
      await openFile(app, 'src/Extra.st');
      await editActiveFile(app, '(* second edit *) ');

      // The task interval of the project configuration, changed in the Tasks editor (a tab of the editor area, opened from the
      // settings) and left unsaved.
      await app.click(button('Project settings'), 'the Project settings button');
      await app.click(css('[data-open-config-editor="tasks"]'), 'the Tasks configuration editor');
      const interval = css('input[type="number"][min="1"][max="10000"]');
      await app.until('the task interval field', async () => (await app.visible(interval)) || undefined);
      await app.click(interval);
      await app.press('Ctrl+A');
      await app.type('25');

      // Save all is offered because more than the active file is modified, and it saves the configuration too.
      await app.click(button('Save active file', 'prefix'));
      await app.click(menuItem('Save all'));
      await app.until('both files and the configuration on disk', () => {
        const motor = readFileSync(join(project, 'src', 'Motor.st'), 'utf8');
        const extra = readFileSync(join(project, 'src', 'Extra.st'), 'utf8');
        const config = readFileSync(join(project, 'zplc.json'), 'utf8');
        return (motor.includes('first edit') && extra.includes('second edit') && /"interval_ms": 25/.test(config)) || undefined;
      });

      // An edit after it, then Build: the build saves first and does not refuse.
      await app.click(tab('Extra.st', 'prefix'), 'the Extra.st tab'); // the Tasks editor is the shown tab now
      await editActiveFile(app, '(* third edit *) ');
      await app.click(button('Build options'));
      await app.click(menuItem('Compile'));
      await app.until('the build to succeed', async () => /Build succeeded/.test(await noticeText(app)) || undefined);
      assert(
        readFileSync(join(project, 'src', 'Extra.st'), 'utf8').includes('third edit'),
        'Build did not save the edit it was pressed after.',
      );
      assert(
        !(await app.visible(tab('Test results'))) || !/saved workspace/i.test(await noticeText(app)),
        'Build sent the user to the Tests tab.',
      );
    },
  },
];
