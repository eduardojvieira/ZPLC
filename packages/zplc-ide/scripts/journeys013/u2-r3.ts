import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const projects = (path: string): string => fileURLToPath(new URL(`../../projects/${path}`, import.meta.url));

async function search(app: App, text: string): Promise<void> {
  await app.click(css('[data-activity="search"]'), 'the Search activity');
  await app.until('the search field', async () => (await app.visible(css('#project-search'))) || undefined);
  await app.click(css('#project-search'), 'the search field');
  await app.press('Ctrl+A');
  await app.type(text);
}

async function open(app: App, label: string): Promise<void> {
  const row = css(`button[aria-label="${label}"]`);
  await app.until(`the match "${label}"`, async () => (await app.visible(row)) || undefined);
  await app.click(row, 'the match');
}

/** Journeys of task U2-R3 (plan-u2.md): project search across the five languages (FND-003). */
export const journeysU2R3: Journey[] = [
  {
    name: 'U2-R3 Search a variable used in a rung, a block and a transition, and open each match',
    example: 'seal_in_ladder',
    proves: ['FND-003'],
    partly: [],
    run: async (app, { project }) => {
      copyFileSync(projects('batch_count_fbd/src/BatchCount.fbd.json'), join(project, 'src', 'BatchCount.fbd.json'));
      copyFileSync(projects('sfc_press_cell/src/PressCell.sfc.json'), join(project, 'src', 'PressCell.sfc.json'));
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
      const selected = (id: string) =>
        app.until(
          `${id} selected`,
          async () =>
            (await app.eval<boolean>(`document.querySelector('.react-flow__node.selected')?.getAttribute('data-id') === '${id}'`)) ||
            undefined,
        );

      await search(app, 'StopPB');
      await open(app, "Open src/SealIn.ld.json, LD rung 'rung_1', cell 0,0");
      await app.until(
        'the cell of the match under the cursor',
        async () => (await app.visible(css('[data-ld-rung-id="rung_1"] [data-ld-cursor="0,0"]'))) || undefined,
      );

      await search(app, 'PartSensor');
      await open(app, "Open src/BatchCount.fbd.json, FBD block 'var_sensor'");
      await selected('var_sensor');

      await search(app, 'Fault');
      await open(app, "Open src/PressCell.sfc.json, SFC transition 't_start' condition");
      await app.until(
        'the transition selected',
        async () =>
          (await app.eval<boolean>(
            `document.querySelector('.react-flow__node.selected')?.getAttribute('data-id')?.includes('t_start') === true`,
          )) || undefined,
      );
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
