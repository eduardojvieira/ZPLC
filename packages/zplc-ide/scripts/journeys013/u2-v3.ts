import { assert, MONACO_MODULE } from '../run-desktop-smoke';
import { button, css, menuItem, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const toolbar = css('[role="toolbar"]');
const rowStatus = (app: App, path: string) =>
  app.eval<string>(`document.querySelector('[data-test-row=${JSON.stringify(path)}]')?.textContent ?? ''`);

async function openProject(app: App, project: string): Promise<void> {
  app.answer(project);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench to appear', async () => (await app.visible(toolbar)) || undefined);
  await app.until(
    'the program in the editor',
    async () =>
      (await app.eval<boolean>(
        `(async () => { const monaco = await ${MONACO_MODULE}; ` +
          `return Boolean(monaco.editor.getEditors()[0]?.getModel()?.getValue().includes('BeltCommand')); })()`,
      )) || undefined,
  );
}

/** Journeys of task U2-V3 (plan-u2.md): failure messages, the two levels of Output, the boundary stated once. */
export const journeysU2V3: Journey[] = [
  {
    name: 'MSG-003 count the boundary statements on the Test results tab: one',
    example: 'conveyor_01',
    proves: [],
    partly: ['MSG-003'],
    run: async (app, { project }) => {
      await openProject(app, project);
      await app.click(css('[data-activity="tests"]'), 'the Tests activity');
      await app.until('the tests in the list', async () => (await app.visible(css('[data-test-row]'))) || undefined);
      await app.click(button('Run all'), 'Run all');
      await app.until(
        'a test to pass',
        async () => ((await rowStatus(app, 'tests/conveyor-01.scenario.json')).includes('Passed') ? true : undefined),
        40_000,
      );
      await app.click(css('#console-tab-tests'), 'the Tests tab of the results panel');
      await app.until('the verdict', async () => (await app.visible(css('[data-test-verdict-sentence]'))) || undefined, 20_000);
      const badges = await app.eval<number>(`document.querySelectorAll('[data-boundary-badge]').length`);
      assert(badges === 1, `The Test results tab states its boundary ${badges} times, not once`);
      const old = await app.eval<boolean>(`/Host evidence only|Native POSIX host evidence/.test(document.body.innerText)`);
      assert(!old, 'The Test results tab still carries a 2.0 statement of the boundary');
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
  {
    name: 'MSG-004 a build error names the file and line and offers Open; Output keeps the failure at the normal level',
    example: 'conveyor_01',
    proves: [],
    partly: ['MSG-004', 'MSG-005'],
    run: async (app, { project }) => {
      await openProject(app, project);
      // An edit made in the moment after the program shows and before the editor is wired to the project is put back by the
      // editor's own sync (CodeEditor.tsx, "A kept model can be older than the store"), and the build then compiles the program
      // unbroken. The edit is made again until the tab marks the file as changed, the sign that the project holds it.
      const broken = await app.eval<boolean>(
        `(async () => { const monaco = await ${MONACO_MODULE}; const model = monaco.editor.getEditors()[0]?.getModel(); ` +
          `if (!model) return false; const text = model.getValue(); const next = text.replace('BeltCommand := Requested AND NOT ` +
          `Faulted;', 'BeltCommand := Requested AND ;'); model.setValue(next); return next !== text; })()`,
      );
      assert(broken, 'The journey could not edit the program in the editor');
      await app.until('the tab to mark the edited file as changed', async () => {
        if ((await app.eval<string>(`document.getElementById('editor-tab-file:src/Conveyor.st')?.textContent ?? ''`)).includes('*'))
          return true;
        await app.eval(
          `(async () => { const monaco = await ${MONACO_MODULE}; const model = monaco.editor.getEditors()[0]?.getModel(); ` +
            `const text = model?.getValue() ?? ''; if (!text.includes('BeltCommand := Requested AND ;')) model?.setValue(text.replace(` +
            `'BeltCommand := Requested AND NOT Faulted;', 'BeltCommand := Requested AND ;')); })()`,
        );
        return undefined;
      });
      await app.click(button('Build options'), 'the Build options button');
      await app.click(menuItem('Compile'), 'Compile');
      await app.click(css('#console-tab-problems'), 'the Problems tab');
      const row = `document.querySelector('section[aria-label="Latest build diagnostics"] button')`;
      await app
        .until('a located build error', async () => (await app.eval<boolean>(`Boolean(${row})`)) || undefined, 40_000)
        .catch(async (error: Error) => {
          const kept = await app.eval<string>(
            `(async () => { const monaco = await ${MONACO_MODULE}; return JSON.stringify(monaco.editor.getEditors().map((editor) => ` +
              `editor.getModel()?.getValue().includes('BeltCommand := Requested AND ;'))); })()`,
          );
          throw new Error(
            `${error.message}: the broken line is in the editor models ${kept}; the window says ${JSON.stringify(
              (await app.text()).replace(/\s+/g, ' ').slice(0, 300),
            )}`,
          );
        });
      const text = await app.eval<string>(`${row}?.textContent ?? ''`);
      const place = /(src\/Conveyor\.st):(\d+)/.exec(text);
      assert(place !== null, `The build error does not name the file and the line: ${text}`);
      await app.click(css('section[aria-label="Latest build diagnostics"] button'), 'the build error, which opens its place');
      await app.until(
        'the editor at the line of the error',
        async () =>
          (await app.eval<boolean>(
            `(async () => { const monaco = await ${MONACO_MODULE}; ` +
              `return monaco.editor.getEditors()[0]?.getPosition()?.lineNumber === ${Number(place![2])}; })()`,
          )) || undefined,
      );
      // Output at its normal level still shows the failure
      await app.click(css('#console-tab-output'), 'the Output tab');
      assert(await app.visible(css('[data-output-level="normal"]')), 'Output should start at the normal level');
      const failed = await app.eval<boolean>(
        `Boolean(document.querySelector('[data-output-level] svg.lucide-circle-x, [data-output-level] svg.lucide-x-circle'))`,
      );
      assert(failed, 'Output hides the failure of the build at the normal level');
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
