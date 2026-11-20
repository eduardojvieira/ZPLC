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
    name: 'U2-P2 With the keyboard only, open the I/O mapping, find a preference and open a lesson from the palette',
    example: 'seal_in_ladder',
    proves: [],
    partly: ['FND-001'],
    run: async (app, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);

      await choose(app, 'I/O mapping');
      await app.until('the I/O mapping editor', async () => (await app.visible(css('[data-config-editor="io"]'))) || undefined);

      // Choosing a preference runs `file.preferences`, which Task H2 (wave 3) binds: until then the palette can only list it.
      // H2 restores the leg that opens Preferences at the setting, and with it FND-001 moves back to `proves`.
      await app.press('Ctrl+Shift+P');
      await app.until('the palette field', async () => (await app.visible(css('[role="combobox"]'))) || undefined);
      await app.type('Editor font size');
      await app.until('the preference in the palette', async () => (await app.visible(css('[role="option"]'))) || undefined);
      assert((await app.text()).includes('Editor font size'), 'The palette does not list the Editor font size preference.');
      await app.press('Escape');

      await choose(app, 'Safe motor start-stop');
      await app.until(
        'the lesson started',
        async () => (await app.eval<boolean>(`document.querySelector('[data-learn-home]') === null`)) || undefined,
      );
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
