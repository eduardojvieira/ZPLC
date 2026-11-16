import { translate } from '../../src/i18n/translate';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { runFromPalette } from './w3';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
const SECONDARY = '[data-sidebar-kind="secondary"]';

/** Journeys of task U2-H3 (plan-u2.md): the views of the secondary sidebar (SHL-008) and the Inspector (SHL-009). */
export const journeysU2H3: Journey[] = [
  {
    name: 'SHL-008 the Inspector opens from its command by keyboard, and the Assistant is absent without an AI provider',
    example: 'seal_in_ladder',
    proves: ['SHL-008', 'SHL-009'],
    partly: [],
    run: async (app: App, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);

      // the command shows the Inspector in the secondary sidebar, reached by the palette, with no pointer
      await runFromPalette(app, 'view.showInspector', 'show the inspector');
      await app.until('the secondary sidebar', async () => (await app.visible(css(SECONDARY))) || undefined);
      await app.until(
        'the Inspector',
        async () =>
          (await app.eval<boolean>(
            `Boolean(document.querySelector('${SECONDARY} aside[aria-label="${en('workbench.inspector.region')}"]'))`,
          )) || undefined,
      );

      // no provider is configured in a journey: the secondary sidebar offers one view, so it has no switch, and no Assistant view
      const assistant = await app.eval<boolean>(
        `Boolean(document.querySelector('${SECONDARY} [role="region"][aria-label="${en('assistant.region')}"]'))`,
      );
      if (assistant) throw new Error('The Assistant is shown although no AI provider is configured.');
    },
  },
];
