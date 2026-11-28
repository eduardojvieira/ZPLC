/**
 * JRN-005, journey 4 of spec 014 (the Assistant): set the assistant up, have a failed plant scenario explained, accept a
 * reviewed change in a textual and in a graphical language, run it and save it. The model is a scripted loopback server
 * (`mockModel.ts`), so nothing here depends on a model, a key or a network: what is asserted is what Studio sends, what it
 * shows and what it writes.
 */
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { closeProject, openFileInEditor, openFolder, runFromPalette, runTests, text } from './support';
import type { Wire } from './mcpClient';
import { isProbe, startMockModel, type MockModel, type MockRequest } from './mockModel';

const en = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate('en', key, values);
const PROJECTS = join(import.meta.dir, '..', '..', 'projects');
const ASSISTANT = `[role="region"][aria-label=${JSON.stringify(en('assistant.region'))}]`;
const MODEL = 'mock-plc-1';

/** Types into the field of a label: focus it, select what it holds, then type as a person would. */
async function fill(app: App, label: string, value: string): Promise<void> {
  const found = await app.eval<boolean>(
    `(() => { const label = [...document.querySelectorAll('[data-assistant-settings] label')]` +
      `.find((item) => item.textContent?.trim() === ${JSON.stringify(label)}); const control = label?.control; ` +
      `if (!control) return false; control.focus(); control.select?.(); return true; })()`,
  );
  assert(found, `Preferences has no field named ${label}.`);
  await app.press('Ctrl+A');
  await app.type(value);
}

/** The fields and bounds of a request, as `docs/docs/ide/ai-privacy.md` ("Every field of a request") states them. */
function assertRequest(request: MockRequest, expected: { mode: string; historyTurns: number; activeFile?: string; locale?: string }): void {
  const { body } = request;
  const say = (problem: string) => `${problem} (request: ${request.raw.slice(0, 300)})`;
  assert(
    request.authorization === null && !request.headerNames.includes('authorization'),
    say('A key-free endpoint received an Authorization header.'),
  );
  assert(Buffer.byteLength(request.raw) <= 128 * 1024, say('A request is larger than 128 KiB.'));
  assert(Object.keys(body).sort().join() === 'messages,model,stream', say(`The body has fields ${Object.keys(body).join()}.`));
  assert(body.model === MODEL && body.stream === false, say('The model is not the one of Preferences, or the request streams.'));
  assert(!('tools' in body) && !('tool_choice' in body) && !('functions' in body), say('The request offers the model tools.'));
  const messages = body.messages as Array<{ role: string; content: string }>;
  assert(
    messages[0]?.role === 'system' && messages[0].content.includes('ZPLC Assistant'),
    say('The first message is not the system policy.'),
  );
  const history = messages.slice(1, -1);
  assert(history.length === expected.historyTurns, say(`History holds ${history.length} turns, not ${expected.historyTurns}.`));
  assert(history.length <= 6, say('History is longer than three exchanges.'));
  history.forEach((turn, index) => {
    assert(turn.role === (index % 2 === 0 ? 'user' : 'assistant'), say('History does not alternate user and assistant, oldest first.'));
    assert(turn.content.length > 0 && Buffer.byteLength(turn.content) <= 2048, say('A history turn is empty or longer than 2048 bytes.'));
  });
  const last = messages.at(-1)!;
  assert(last.role === 'user', say('The last message is not the person.'));
  const user = JSON.parse(last.content) as Record<string, Wire>;
  const allowed = ['mode', 'prompt', 'locale', 'selection', 'activeFile', 'project', 'context', 'trace'];
  assert(
    Object.keys(user).every((key) => allowed.includes(key)),
    say(`The request carries a field of its own: ${Object.keys(user).join()}.`),
  );
  assert(user.mode === expected.mode, say(`The mode is ${user.mode}, not ${expected.mode}.`));
  assert(user.locale === (expected.locale ?? 'en'), say(`The locale is ${user.locale}.`));
  assert(
    typeof user.prompt === 'string' && user.prompt.length > 0 && Buffer.byteLength(user.prompt) <= 4096,
    say('The prompt is empty or longer than 4 KiB.'),
  );
  if (expected.activeFile) {
    assert(user.activeFile?.path === expected.activeFile, say(`The open program sent is ${user.activeFile?.path}.`));
    assert(Object.keys(user.activeFile).sort().join() === 'language,path,source', say('The open program has fields of its own.'));
    assert(Buffer.byteLength(user.activeFile.source) <= 64 * 1024, say('The open program is larger than 64 KiB.'));
  }
  const programs: string[] = user.project?.programs ?? [];
  assert(programs.length <= 128, say('The project summary lists more than 128 programs.'));
  const context = user.context ?? {};
  assert(
    Object.keys(context).every((key) =>
      ['manifest', 'plant', 'scenarios', 'failedScenarios', 'facts', 'diagnostics', 'lesson'].includes(key),
    ),
    say(`The context carries a field of its own: ${Object.keys(context).join()}.`),
  );
  assert((context.failedScenarios ?? []).length <= 4, say('More than 4 failed scenarios.'));
  for (const scenario of context.failedScenarios ?? [])
    assert(scenario.assertions.length <= 8, say('More than 8 failed expectations in a scenario.'));
  assert((context.diagnostics ?? []).length <= 32, say('More than 32 diagnostics.'));
  assert(
    (user.trace ?? []).length <= 32 && (expected.mode === 'debug' || user.trace === undefined),
    say('The trace is longer than 32 samples, or not in Debug.'),
  );
  // nothing that must never leave: the key, the secret of the manifest, a path of the machine, the endpoint, a tool call
  for (const forbidden of ['Bearer ', 'api_key', 'apiKey', '/home/', 'tool_calls', 'function_call'])
    assert(!request.raw.includes(forbidden), say(`The request carries ${JSON.stringify(forbidden)}.`));
  assert(!request.raw.includes('127.0.0.1'), say('The request carries the provider endpoint.'));
}

/** Waits for the answer of the model to show in the Assistant view, and returns what the view says. */
async function answerShown(app: App, phrase: string): Promise<string> {
  return app
    .until(
      `the assistant to show "${phrase}"`,
      async () => ((await text(app, ASSISTANT)).includes(phrase) ? text(app, ASSISTANT) : undefined),
      30_000,
    )
    .catch(async (error: Error) => {
      throw new Error(
        `${error.message}: the Assistant says ${JSON.stringify((await text(app, ASSISTANT)).replace(/\s+/g, ' ').slice(-700))}`,
      );
    });
}

async function sendRequest(app: App): Promise<void> {
  await app.until('Send request to be enabled', async () => (await app.clickable(button(en('console.sendRequest')))) || undefined);
  await app.click(button(en('console.sendRequest')), 'Send request');
}

async function setPrompt(app: App, prompt: string): Promise<void> {
  await app.eval(`document.querySelector(${JSON.stringify(`${ASSISTANT} textarea`)}).focus()`);
  await app.press('Ctrl+A');
  await app.type(prompt);
}

/** Opens the Assistant in the secondary sidebar from its command, and takes the mode with its button. */
async function inMode(app: App, mode: 'ask' | 'edit' | 'debug'): Promise<void> {
  if (!(await app.visible(css(ASSISTANT)))) await runFromPalette(app, 'view.agent', 'Show the Assistant');
  await app.until('the Assistant view', async () => (await app.visible(css(ASSISTANT))) || undefined);
  await app.click(css(`#agent-mode-${mode}`), `the ${mode} mode`);
}

/** Reviews the proposal and waits for the review document to accept it, with its difference shown and nothing written. */
async function acceptedReview(app: App): Promise<void> {
  await app.click(button(en('console.reviewProposedChange')), 'Review proposed change');
  // the reviewed change arrives as a notice and moves no region: the person opens the review document (SHL-004, SHL-010)
  await runFromPalette(app, 'view.changes', 'Show changes');
  await app
    .until(
      'the review of the change',
      async () =>
        (await text(app, '[aria-label="Change review result"]')).includes('Accepted: the change passed in an isolated host run.')
          ? true
          : undefined,
      90_000,
    )
    .catch(async (error: Error) => {
      throw new Error(
        `${error.message}: the review says ` + `${JSON.stringify((await text(app, '[aria-label="Change review result"]')).slice(0, 600))}`,
      );
    });
  await app.until(
    'the difference',
    async () => (await app.visible(css('[aria-label="Change review result"] .monaco-diff-editor'))) || undefined,
    30_000,
  );
}

export const journeysJrn005Assistant: Journey[] = [
  {
    name: 'JRN-005 Journey 4 the Assistant, on a scripted local model, explains a failed scenario and saves reviewed ST and LD changes',
    example: 'plant_belt_to_sensor_starter',
    proves: ['JRN-005'],
    partly: ['AIX-003', 'AIX-005', 'AIX-006', 'AIX-004'],
    run: async (app, { root, project }) => {
      const model: MockModel = startMockModel();
      try {
        const stProject = join(root, 'st-project');
        const ldProject = join(root, 'ld-project');
        cpSync(join(PROJECTS, 'first_blink_starter'), stProject, { recursive: true });
        cpSync(join(PROJECTS, 'ld_alarm_latch_starter'), ldProject, { recursive: true });
        const solutionSt = readFileSync(join(PROJECTS, 'first_blink', 'src', 'FirstBlink.st'), 'utf8');
        const solutionLd = readFileSync(join(PROJECTS, 'ld_alarm_latch', 'src', 'AlarmLatchLd.ld.json'), 'utf8');

        await openFolder(app, project);

        // 1. setup: no provider, so no Assistant; Preferences takes an endpoint on this computer and no key
        await runFromPalette(app, 'file.preferences', 'Open preferences');
        await app.until(
          'the Assistant section of Preferences',
          async () => (await app.visible(css('[data-assistant-settings]'))) || undefined,
        );
        await app.click(css('[data-assistant-settings] input[type="checkbox"]'), 'Enabled');
        await fill(app, en('console.endpoint'), model.endpoint);
        await fill(app, en('console.model'), MODEL);
        await app.click(button(en('configEditor.save')), 'Save');
        await app.until('the configuration saved', async () =>
          (await text(app, '[data-assistant-settings]')).includes(en('assistant.configSaved')) ? true : undefined,
        );
        await app.click(button(en('assistant.test')), 'Test connection');
        await app.until('the connection test to answer', async () =>
          (await text(app, '[data-assistant-settings]')).match(/The connection works \(\d+ ms\)\./) ? true : undefined,
        );
        const probe = model.requests.find(isProbe);
        assert(probe !== undefined && probe.authorization === null, 'The connection test sent no probe, or sent a key.');
        assert(
          JSON.stringify(probe!.body.messages) === JSON.stringify([{ role: 'user', content: 'ping' }]) && probe!.body.max_tokens === 1,
          `The probe carried more than the word ping: ${probe!.raw}`,
        );
        const stored = readFileSync(join(root, 'profile', 'ai-provider.json'), 'utf8');
        assert(!stored.includes('keyCiphertext'), 'A key was stored for an endpoint that needs none.');
        assert(
          (await app.eval<string>(`document.querySelector('[data-assistant-settings] input[type="password"]').value`)) === '',
          'The key field holds text.',
        );
        // the Assistant is now offered
        await runFromPalette(app, 'view.agent', 'Show the Assistant');
        await app.until('the Assistant view', async () => (await app.visible(css(ASSISTANT))) || undefined);

        // 2. Debug with a failed plant scenario: run the tests, ask the Assistant from the failed test
        await runTests(app);
        await app.click(css('#console-tab-tests'), 'the Tests tab of the results panel');
        await app.until(
          'the failed scenario with its explain button',
          async () => (await app.visible(button(en('assistant.explainFailure')))) || undefined,
          60_000,
        );
        model.enqueue(
          'The belt never ran: BeltToSensor.Run stays FALSE, so the box from fact:count:EyeFar never reached the far sensor. ' +
            'Look at what turns Run on after the start button (StartButton.pressed).',
        );
        await app.click(button(en('assistant.explainFailure')), 'Explain this failure');
        await app.until(
          'the Assistant in Debug with the failed test attached',
          async () => (await app.visible(css(`${ASSISTANT} [role="group"]`))) || undefined,
        );
        assert((await text(app, ASSISTANT)).includes('belt-to-sensor'), 'The chip does not name the failed scenario.');
        await sendRequest(app);
        const explained = await answerShown(app, 'The belt never ran');
        assert(explained.includes('fact:count:EyeFar'), 'The visible answer is not the scripted one.');
        const debug = model.chatRequests().at(-1)!;
        assertRequest(debug, { mode: 'debug', historyTurns: 0 });
        const failed = JSON.parse((debug.body.messages as Wire[]).at(-1).content).context.failedScenarios;
        assert(failed?.[0]?.id === 'belt-to-sensor', `The request does not carry the failed scenario: ${JSON.stringify(failed)}`);
        assert(
          JSON.stringify(failed).includes('fact:count:EyeFar'),
          `A failed expectation does not name its signal: ${JSON.stringify(failed)}`,
        );

        // 3. a follow-up in Ask keeps the earlier exchange
        await app
          .click(css(`${ASSISTANT} [aria-label="${en('assistant.chip.remove')}"]`), 'Remove the attached context')
          .catch(() => undefined);
        await inMode(app, 'ask');
        model.enqueue('Add a latch: Run := (Run OR Start) AND NOT EyeFar; and pulse Emit when Start rises.');
        await setPrompt(app, 'And what would turn the belt on?');
        await sendRequest(app);
        await answerShown(app, 'Add a latch');
        const follow = model.chatRequests().at(-1)!;
        assertRequest(follow, { mode: 'ask', historyTurns: 2 });
        const turns = (follow.body.messages as Wire[]).slice(1, -1);
        assert(turns[1].content.includes('The belt never ran'), 'The follow-up does not carry the earlier answer.');

        // 4 and 5. Edit in a textual and in a graphical language, each in a project of its own (another project, another
        // conversation): the proposal is reviewed as a difference, saved by a person, and its scenario then passes.
        // These two projects have no plant scene: the review of a change set copies no scene.json yet (see the report of AIX-U14b).
        for (const step of [
          {
            folder: stProject,
            file: 'src/FirstBlink.st',
            solution: solutionSt,
            test: 'FirstBlink',
            answer: 'The program toggles the lamp every half second.',
          },
          {
            folder: ldProject,
            file: 'src/AlarmLatchLd.ld.json',
            solution: solutionLd,
            test: 'AlarmLatchLd',
            answer: 'The rungs latch the alarm until it is acknowledged.',
          },
        ]) {
          await closeProject(app);
          await openFolder(app, step.folder);
          await openFileInEditor(app, step.file);
          const disk = () => readFileSync(join(step.folder, step.file), 'utf8');
          const before = disk();
          await inMode(app, 'edit');
          model.enqueue(JSON.stringify({ answer: step.answer, changes: [{ path: step.file, content: step.solution }] }));
          await setPrompt(app, 'Write the program of the goal in the comment.');
          await sendRequest(app);
          await answerShown(app, step.answer);
          assert(disk() === before, 'The answer wrote the file before anyone reviewed it.');
          assertRequest(model.chatRequests().at(-1)!, { mode: 'edit', historyTurns: 0, activeFile: step.file });
          await acceptedReview(app);
          assert(disk() === before, 'Reviewing wrote the file.');
          await app.click(button(en('console.saveReviewedChange')), 'Save reviewed change');
          await app.until(`${step.file} on disk`, () => (disk() !== before ? true : undefined));
          await runTests(app, step.test);
          await app.until(
            `${step.test} to pass`,
            async () => ((await text(app, '[data-test-row]')).includes('Passed') ? true : undefined),
            60_000,
          );
        }

        // the model was asked what the journey scripted and nothing else
        assert(model.chatRequests().length === 4, `The model received ${model.chatRequests().length} requests, not 4.`);
        assert(existsSync(join(root, 'profile', 'ai-provider.json')), 'The provider settings vanished.');
      } finally {
        model.stop();
      }
    },
  },
];
