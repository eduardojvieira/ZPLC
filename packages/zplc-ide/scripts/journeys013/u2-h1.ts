import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { runFromPalette } from './w3';

const toolbar = css('[role="toolbar"]');
const reviewTab = css('[role="tab"][id="editor-tab-review:changes"]');

/** The journeys of task H1 of the U2 plan (spec 013): a proposed change opens as a review document of the editor area. */
export const journeysU2H1: Journey[] = [
  {
    name: 'U2-H1 view.changes opens the review document by its command and by the palette',
    example: 'first_blink',
    proves: ['SHL-004'],
    partly: ['IDE-030'],
    run: async (app: App, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the project workbench to appear', async () => (await app.visible(toolbar)) || undefined);
      assert(!(await app.visible(reviewTab)), 'The review document must not be open before it is asked for');

      await runFromPalette(app, 'view.changes', 'show the changes');
      await app.until('the review document tab', async () => (await app.visible(reviewTab)) || undefined);
      assert(
        (await app.eval<string>(`document.querySelector('[id="editor-tab-review:changes"]')?.getAttribute('aria-selected') ?? ''`)) ===
          'true',
        'The review document must be the selected view',
      );
      await app.until('the list of pending changes', async () => ((await app.text()).includes('No pending changes.') ? true : undefined));
      // it is a document of the editor area, not a tab of the results panel
      assert(
        (await app.eval<boolean>(`Boolean(document.querySelector('[data-review-document]')?.closest('[role="tabpanel"]'))`)) === true,
        'The review document must be shown as the panel of its editor tab',
      );
    },
  },
];
