import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, MONACO_MODULE } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const toolbar = css('[role="toolbar"]');
const editorTab = (id: string) => `document.getElementById(${JSON.stringify(`editor-tab-${id}`)})`;
const editorText = (app: App) =>
  app.eval<string>(
    `(async () => { const monaco = await ${MONACO_MODULE}; return monaco.editor.getEditors()[0]?.getModel()?.getValue() ?? ''; })()`,
  );
const activeTabId = (app: App) =>
  app.eval<string | null>(`document.querySelector('[role="tab"][aria-selected="true"][id^="editor-tab-"]')?.id ?? null`);
const openTabIds = (app: App) =>
  app.eval<string[]>(`[...document.querySelectorAll('[role="tab"][id^="editor-tab-"]')].map((item) => item.id).sort()`);
const treeItem = (id: string) => css(`[role="treeitem"][data-tree-node-id="${id}"]`);
const savedTabs = (root: string): { tabs: string[]; active: string | null }[] => {
  const directory = join(root, 'profile', 'sessions');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^[0-9a-f]{64}\.json$/.test(name))
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')))
    .map((session) => ({ tabs: session.tabs.map((item: { path: string }) => item.path), active: session.activePath }));
};

async function openFolder(app: App, folder: string): Promise<void> {
  app.answer(folder);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench to appear', async () => (await app.visible(toolbar)) || undefined);
}

/** The journeys of task W9 of the M1 plan (spec 013): the entry program on first open, and a restored session left alone. */
export const journeysW9: Journey[] = [
  {
    name: 'W9 A project opened for the first time shows its program',
    example: 'motor_start_stop',
    proves: ['SHL-014'],
    partly: [],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await app.until(
        'the first program of the first task in a tab',
        async () => (await app.visible(editorTab('file:src/Motor.st'))) || undefined,
      );
      await app.until('the program in the editor', async () => /^PROGRAM Motor\b/m.test(await editorText(app)) || undefined);
      assert((await activeTabId(app)) === 'editor-tab-file:src/Motor.st', 'The entry program is not the active tab.');
      assert(
        JSON.stringify(await openTabIds(app)) === JSON.stringify(['editor-tab-file:src/Motor.st']),
        'The entry program is not the only tab.',
      );
    },
  },
  {
    name: 'W9 A restored session keeps its tabs',
    example: 'motor_start_stop',
    proves: [],
    partly: ['SHL-014'],
    run: async (app, { project, root, relaunch }) => {
      writeFileSync(join(project, 'src', 'Extra.st'), 'PROGRAM Extra\nVAR\n  Flag : BOOL;\nEND_VAR\nFlag := TRUE;\nEND_PROGRAM\n');
      await openFolder(app, project);
      await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
      await app.click(css('[aria-label="Navigator view"] button:nth-of-type(2)'), 'the Files mode of the navigator');
      await app.until('the src folder in the tree', async () => (await app.visible(treeItem('dir:src'))) || undefined);
      if (await app.eval(`${treeItem('dir:src')}.getAttribute('aria-expanded') === 'false'`)) await app.click(treeItem('dir:src'));
      await app.click(treeItem('file:src/Extra.st'));
      await app.until('Extra.st active in the editor', async () => /^PROGRAM Extra\b/m.test(await editorText(app)) || undefined);
      await app.until('both tabs on disk, Extra.st active', () => {
        const [session] = savedTabs(root);
        return (session?.tabs.join() === 'src/Motor.st,src/Extra.st' && session.active === 'src/Extra.st') || undefined;
      });
      const again = await relaunch();
      await again.click(css('[data-recent-project] > button'), 'the recent project');
      await again.until('the project workbench to appear', async () => (await again.visible(toolbar)) || undefined);
      await again.until(
        'both tabs back',
        async () =>
          JSON.stringify(await openTabIds(again)) === JSON.stringify(['editor-tab-file:src/Extra.st', 'editor-tab-file:src/Motor.st']) ||
          undefined,
      );
      assert(
        (await activeTabId(again)) === 'editor-tab-file:src/Extra.st',
        'The restored session lost its active tab: the entry program replaced it.',
      );
    },
  },
];
