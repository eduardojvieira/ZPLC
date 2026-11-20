import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { LESSON_INDEX } from '../../src/generated/lessonIndex';
import { assert } from '../run-desktop-smoke';
import { button, css, menuItem, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { runFromPalette } from './w3';

/** The journeys of task W4 of the M1 plan (spec 013): the command bar is the one transport. */

const scansOf = async (app: App) =>
  Number(/(\d+) scans/.exec(await app.eval<string>(`document.querySelector('[data-plant-scans]')?.textContent ?? ''`))?.[1] ?? 'NaN');

/** The learner turned on "Unlock all lessons" and the window starts again from it (as journey 52 does). */
async function unlockAllLessons(app: App): Promise<void> {
  await app.eval(
    `(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = ` +
      `stored.settings ?? stored; target.unlockAllLessons = true; localStorage.setItem(key, JSON.stringify(stored)); })()`,
  );
  await app.cdp.command('Page.reload');
  await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
  await app.cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await app.cdp.command('Page.bringToFront');
}

export const journeysW4: Journey[] = [
  {
    name: 'W4 The command bar drives a 2.0 plant',
    example: 'none',
    proves: ['PLS-003'],
    partly: [],
    run: async (app, { root }) => {
      const lesson = LESSON_INDEX.lessons.find(({ plant }) => plant === 'motor-v1')!;
      const folder = join(root, 'w4-plant');
      mkdirSync(folder);
      const patiently = <T>(description: string, check: () => Promise<T | undefined | false> | T | undefined | false) =>
        app.until(description, check, 45_000);
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const fact = () => app.eval<string>(`document.querySelector('[data-plant-fact]')?.getAttribute('data-plant-fact') ?? ''`);

      await unlockAllLessons(app);
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => (await app.visible(css('[data-learn-start]'))) || undefined);
      app.answer(folder);
      await app.click(css(`[data-learn-start="${lesson.id}"]`), 'the start of the motor plant lesson');
      await app.until('the project workbench', async () => (await app.visible(css('[data-activity="project"]'))) || undefined);

      // Build, connect, Run: the command bar, with no control of the plant involved.
      await app.click(button('Build', 'prefix'));
      await app.click(menuItem('Compile'));
      await patiently(
        'the build to succeed',
        async () => /Built the project/.test(await app.eval<string>(`document.body.innerText`)) || undefined,
      );
      await patiently('Run to be ready', async () => (await app.clickable(button('Run (F5)', 'prefix'))) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await patiently('the program to run', async () => (await app.visible(button('Pause (F6)', 'prefix'))) || undefined);
      await runFromPalette(app, 'view.plant', 'show the plant'); // the plant is a document of the editor area, not a Lab tab
      await patiently('the live motor plant', async () => (await app.visible(css('[data-plant="motor-v1"]'))) || undefined);

      // Run: the plant's facts change.
      await app.click(css('[data-input="MotorPlant.Start"] button[role="switch"]'), 'the Start switch');
      await patiently('the motor to reach speed', async () => (await fact()) === 'plant.motor.atSpeed' || undefined);
      await patiently('scans to count', async () => (await scansOf(app)) > 0 || undefined);

      // Pause: the program's scans and the plant's facts hold.
      await app.click(button('Pause (F6)', 'prefix'));
      await patiently('the plant to say it is paused', async () => (await app.text()).includes('Plant paused') || undefined).catch(
        async (error: Error) => {
          const bar = await app.eval<string>(
            `[...document.querySelectorAll('[role="toolbar"] button')].map((b) => b.getAttribute('aria-label')).join(' | ')`,
          );
          const scansText = await app.eval<string>(`document.querySelector('[data-plant-scans]')?.textContent ?? ''`);
          throw new Error(`${error.message}: the plant says ${JSON.stringify(scansText)}; the command bar has ${bar}`);
        },
      );
      await pause(400);
      const held = await scansOf(app);
      const heldFact = await fact();
      await pause(700);
      assert((await scansOf(app)) === held && (await fact()) === heldFact, 'The plant moved while the program was paused.');

      // Step: both advance by exactly one scan.
      await app.click(button('Step one cycle', 'prefix'));
      await patiently('one scan to be stepped', async () => (await scansOf(app)) === held + 1 || undefined);
      await pause(500);
      assert((await scansOf(app)) === held + 1, 'One step advanced the plant by more than one scan.');
    },
  },
];
