import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

/** Opens the palette with the keyboard, types the query and chooses the first match. */
async function choose(app: App, query: string): Promise<void> {
  await app.press('Ctrl+Shift+P');
  await app.until('the palette field', async () => (await app.visible(css('[role="combobox"]'))) || undefined);
  await app.type(query);
  await app.until(`a match for "${query}"`, async () => (await app.visible(css('[role="option"]'))) || undefined);
  await app.press('Enter');
}

/** Journeys of task U2-P2 (plan-u2.md): the palette finds eight kinds of thing (FND-001). */
export const journeysU2P2: Journey[] = [
  {
    name: 'U2-P2 With the keyboard only, open the I/O mapping, a preference and a lesson from the palette',
    example: 'seal_in_ladder',
    proves: ['FND-001'],
    partly: [],
    run: async (app, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);

      await choose(app, 'I/O mapping');
      await app.until('the I/O mapping editor', async () => (await app.visible(css('[data-config-editor="io"]'))) || undefined);

      await choose(app, 'Editor font size');
      await app.until('the preferences', async () => (await app.visible(css('[data-app-preferences]'))) || undefined);

      await choose(app, 'Safe motor start-stop');
      await app.until(
        'the lesson started',
        async () => (await app.eval<boolean>(`document.querySelector('[data-learn-home]') === null`)) || undefined,
      );
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
