/** Steps of a person in Studio that the automated journeys of spec 014 share. */
import { translate } from '../../src/i18n/translate';
import { button, css, type App } from '../journeyApp';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);

/** The visible text of the first element a selector finds. */
export const text = (app: App, selector: string) =>
  app.eval<string>(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`);

/** Runs a command from the palette as a keyboard user does: its name, the arrow keys to its row, Enter. */
export async function runFromPalette(app: App, command: string, title: string): Promise<void> {
  const row = `document.querySelector('[role="option"][data-command="${command}"]')`;
  await app.press('Ctrl+Shift+P');
  await app.until('the palette field', async () => (await app.visible(css('[role="combobox"]'))) || undefined);
  await app.type(title);
  await app.until(`the palette to list ${command}`, async () => (await app.eval<boolean>(`Boolean(${row})`)) || undefined);
  for (let step = 0; step < 12 && !(await app.eval<boolean>(`${row}?.getAttribute('aria-selected') === 'true'`)); step++)
    await app.press('ArrowDown');
  await app.press('Enter');
  await app.until('the palette to close', async () => !(await app.visible(css('[role="combobox"]'))) || undefined);
}

/** Opens a folder through the Welcome screen, as a person does. */
export async function openFolder(app: App, folder: string): Promise<void> {
  app.answer(folder);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
}

/** Closes the project and waits for the Welcome screen. */
export async function closeProject(app: App): Promise<void> {
  await runFromPalette(app, 'file.closeProject', 'close the project');
  await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
}

/** Opens a program of src from the Files view of the navigator and waits for its tab. */
export async function openFileInEditor(app: App, path: string): Promise<void> {
  await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
  await app.click(
    css(`[aria-label=${JSON.stringify(en('navigator.mode.label'))}] button:nth-of-type(2)`),
    'the Files mode of the navigator',
  );
  const treeItem = (id: string) => css(`[role="treeitem"][data-tree-node-id="${id}"]`);
  await app.until('the src folder in the tree', async () => (await app.visible(treeItem('dir:src'))) || undefined);
  if (await app.eval(`${treeItem('dir:src')}.getAttribute('aria-expanded') === 'false'`)) await app.click(treeItem('dir:src'));
  await app.click(treeItem(`file:${path}`), `${path} in the tree`);
  // a file that is already open shows its tab again when another document (Preferences) took the editor area
  const openTab = css(`[id="editor-tab-file:${path}"]`);
  if (await app.visible(openTab)) await app.click(openTab, `the tab of ${path}`);
  // a diagram's tab is named without its extension
  const name = path.split('/').at(-1)!.split('.')[0]!;
  await app.until(
    `${name} to be the open document`,
    async () =>
      (await app.eval<boolean>(
        `[...document.querySelectorAll('[role="tab"][aria-selected="true"]')]` +
          `.some((item) => item.textContent?.includes(${JSON.stringify(name)}))`,
      )) || undefined,
  );
}

/** The Run button of the only test of the project, in the Tests activity. */
export async function runTests(app: App, id = 'belt-to-sensor'): Promise<void> {
  await app.click(css('[data-activity="tests"]'), 'the Tests activity');
  await app.until('the tests list', async () => (await app.visible(css('[data-test-row]'))) || undefined);
  const run = button(`Run ${id}`);
  await app.until(`Run ${id}`, async () => (await app.clickable(run)) || undefined);
  await app.click(run, `Run ${id}`);
}
