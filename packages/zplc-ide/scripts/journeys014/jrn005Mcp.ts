/**
 * JRN-005, journey 5 of spec 014 (an agent over MCP): a scripted client connects to the real `zplc-mcp` over a lesson
 * workspace, reads the project, the plant, the lesson and a format, checks and writes a program in a textual and in a
 * graphical language, runs the scenario, reads its trace, debugs it in a private simulation with a breakpoint, and Studio,
 * which has the same folder open, shows each file the agent wrote (AIX-012). The client speaks both protocol eras of the
 * server: the initialize handshake of 2025-11-25 and the per-request envelope of 2026-07-28. No model, no network.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEARN_POLICY_FILENAME } from '../../shared/learnPolicyModel';
import { LESSON_INDEX } from '../../src/generated/lessonIndex';
import { MONACO_MODULE, assert } from '../run-desktop-smoke';
import { css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { connectMcp, type McpClient } from './mcpClient';
import { closeProject, openFileInEditor, openFolder, runTests, text } from './support';

const PROJECTS = join(import.meta.dir, '..', '..', 'projects');
/** The two lessons of the belt to the sensor, found by the project they start from. */
const lessonStartingFrom = (project: string) => LESSON_INDEX.lessons.find((lesson) => lesson.starter.project === project)!;
const ST_LESSON = lessonStartingFrom('plant_belt_to_sensor_starter');
const LD_LESSON = lessonStartingFrom('plant_belt_to_sensor_ladder_starter');
const solution = (lesson: typeof ST_LESSON) => readFileSync(join(PROJECTS, lesson.solution.project, lesson.solution.program), 'utf8');
/** What an agent must never be offered: it would act on a board or on a session a person runs (AGENTS.md rule 8). */
const HARDWARE = /flash|deploy|force|serial|shell|upload|run_stop/;

const editorText = (app: App) =>
  app.eval<string>(
    `(async () => { const monaco = await ${MONACO_MODULE}; return monaco.editor.getEditors()[0]?.getModel()?.getValue() ?? ''; })()`,
  );

/** The notice Studio shows for a file that was replaced from outside, by its words in the region of such notices. */
const noticeFor = (app: App, name: string) =>
  app.until(
    `the notice that names ${name}`,
    async () => ((await app.text()).includes(`Updated outside ZPLC: ${name}`) ? true : undefined),
    30_000,
  );

async function layOut(root: string): Promise<{ userData: string; st: string; ld: string }> {
  const userData = join(root, 'agent-user-data');
  const base = join(userData, 'learn-workspaces');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(userData, LEARN_POLICY_FILENAME), JSON.stringify({ hideSolutions: true }));
  const st = join(base, ST_LESSON.id);
  const ld = join(base, LD_LESSON.id);
  cpSync(join(PROJECTS, ST_LESSON.starter.project), st, { recursive: true });
  cpSync(join(PROJECTS, LD_LESSON.starter.project), ld, { recursive: true });
  return { userData, st, ld };
}

/** What every client reads before it writes: the tools, the project, the plant, the lesson and a format. */
async function readTheProject(client: McpClient, lesson: typeof ST_LESSON, format: 'ld' | 'scenario', hidden: boolean): Promise<string[]> {
  const tools = (await client.tools()).map((tool) => tool.name);
  for (const name of ['workspace_check_write', 'workspace_write', 'scenario_run', 'trace_get', 'debug_session_start', 'debug_breakpoints'])
    assert(tools.includes(name), `The server does not offer ${name}: ${tools.join()}`);
  assert(
    !tools.some((name) => HARDWARE.test(name)),
    `The server offers a tool that reaches hardware: ${tools.filter((name) => HARDWARE.test(name)).join()}`,
  );

  const inspected = await client.call('project_inspect');
  assert(inspected.body.ok === true, `project_inspect: ${JSON.stringify(inspected.body).slice(0, 300)}`);
  const programs = JSON.parse((await client.readResource('zplc://project/programs')).text);
  assert(
    programs.ok !== false && JSON.stringify(programs).includes('BeltToSensor'),
    `The program list lacks BeltToSensor: ${JSON.stringify(programs)}`,
  );

  const plant = await client.call('plant_inspect');
  assert(
    plant.body.ok === true && JSON.stringify(plant.body).includes('Belt1'),
    `plant_inspect does not name the belt: ${JSON.stringify(plant.body).slice(0, 300)}`,
  );
  const map = (await client.readResource('zplc://project/plant-map')).text;
  assert(map.includes('StartButton.pressed') && map.includes('EyeFar.detect'), 'The plant map does not carry the signals of the plant.');
  const scenarios = await client.call('scenarios_list');
  assert(JSON.stringify(scenarios.body).includes('belt-to-sensor'), 'scenarios_list does not list the scenario of the lesson.');

  const current = JSON.parse((await client.readResource('zplc://lesson/current')).text);
  assert(
    current.ok === true && current.lesson.lessonId === lesson.id,
    `The lesson is not ${lesson.id}: ${JSON.stringify(current).slice(0, 300)}`,
  );
  assert(
    current.lesson.goal === lesson.text.en.summary && current.lesson.solutionsHidden === hidden,
    `The lesson goal is not read, or solutionsHidden is not ${hidden}.`,
  );
  const lessonText = JSON.stringify(current);
  assert(
    !lessonText.includes(solution(lesson).slice(0, 120)) &&
      !/"solution"\s*:/i.test(lessonText) &&
      !lessonText.includes(lesson.solution.project),
    'The lesson resource carries its solution.',
  );

  const formatText = (await client.readResource(`zplc://formats/${format}`)).text;
  assert(
    formatText.length > 200 && formatText.includes(format === 'ld' ? 'rungs' : 'expectations'),
    `The ${format} format resource is not the format: ${formatText.slice(0, 200)}`,
  );
  return tools;
}

/** A scenario run and the failed expectation an agent finds the cause in. */
async function failedExpectation(client: McpClient): Promise<{ signal: string; expected: unknown; observed: unknown }> {
  const run = await client.call('scenario_run', { scenarioId: 'belt-to-sensor' });
  assert(run.isError === true && run.body.ok === false, `The starter should fail its scenario: ${JSON.stringify(run.body).slice(0, 300)}`);
  const scenario = run.body.preview.scenarios.find((item: { id: string }) => item.id === 'belt-to-sensor');
  const failed = scenario.assertions.find((item: { passed: boolean }) => !item.passed);
  assert(failed?.checks?.[0]?.signal === 'fact:count:EyeFar', `The failed expectation does not name its signal: ${JSON.stringify(failed)}`);
  return failed.checks[0];
}

/** After a write: the scenario passes, and the trace says so in both of its modes. */
async function passesWithTrace(client: McpClient): Promise<void> {
  const run = await client.call('scenario_run', { scenarioId: 'belt-to-sensor' });
  assert(
    run.isError !== true && run.body.ok === true && run.body.summary.scenarios[0].passed === true,
    `The written program fails: ${JSON.stringify(run.body).slice(0, 300)}`,
  );
  // no mode is the compact one an agent reads first; mode full is the whole trace of ZPLC 2.0
  const changes = await client.call('trace_get', { scenarioId: 'belt-to-sensor' });
  assert(
    changes.body.mode === 'changes' && changes.body.returnedSamples < changes.body.totalSamples,
    'trace_get without a mode is not the compact changes view.',
  );
  const full = await client.call('trace_get', { scenarioId: 'belt-to-sensor', mode: 'full' });
  assert(
    full.body.trace.length === full.body.totalSamples && full.body.totalSamples > changes.body.returnedSamples,
    'trace_get in mode full does not return every sample.',
  );
  assert(full.body.traceSha256 === changes.body.traceSha256, 'The two modes do not read the same trace.');
  assert(
    full.body.assertions.every((item: { passed: boolean }) => item.passed),
    'The trace of the passing run holds a failed expectation.',
  );
}

/** A private debug session: a breakpoint where the program decides, a stop there, a look at the values, and the end of the session. */
async function debugToABreakpoint(
  client: McpClient,
  location: { file: string; line?: number; element?: string },
  watch: string,
): Promise<void> {
  const started = await client.call('debug_session_start', {});
  assert(
    started.body.ok === true && started.body.evidence.scope === 'private-native-posix-host',
    `debug_session_start: ${JSON.stringify(started.body).slice(0, 300)}`,
  );
  const sessionId: string = started.body.sessionId;
  try {
    const set = await client.call('debug_breakpoints', { sessionId, action: 'set', locations: [location] });
    assert(
      set.body.ok === true && set.body.breakpoints.length === 1 && set.body.breakpoints[0].active === true,
      `The breakpoint is not set: ${JSON.stringify(set.body).slice(0, 300)}`,
    );
    await client.call('debug_set_inputs', { sessionId, plantActions: [{ kind: 'operate', signal: 'StartButton.pressed', value: true }] });
    const stopped = await client.call('debug_step', { sessionId, mode: 'continue', watch: [watch] });
    assert(
      stopped.body.stopReason === 'breakpoint' && stopped.body.state === 'paused',
      `The session did not stop at the breakpoint: ${JSON.stringify(stopped.body).slice(0, 300)}`,
    );
    assert(stopped.body.location.file === location.file, `The stop is not in ${location.file}.`);
    const seen = await client.call('debug_inspect', { sessionId });
    assert(seen.body.signals['BeltToSensor.Start'].value === true, 'The input staged by the agent is not what the program reads.');
    assert(
      seen.body.plant.signals['StartButton.pressed'] === true,
      'The plant side of the session does not show the button the agent operated.',
    );
  } finally {
    const stopped = await client.call('debug_session_stop', { sessionId });
    assert(stopped.body.stopped === true, 'The debug session did not end.');
  }
}

export const journeysJrn005Mcp: Journey[] = [
  {
    name: 'JRN-005 Journey 5 an agent over MCP, scripted, reads the project, writes ST and LD, runs the scenario, debugs it and Studio follows',
    example: 'none',
    proves: [],
    partly: ['JRN-005', 'AIX-001', 'AIX-002', 'AIX-011', 'AIX-012', 'AIX-013', 'AIX-014'],
    run: async (app, { root, runtime }) => {
      const { userData, st, ld } = await layOut(root);
      const env = { ZPLC_NATIVE_SIM_BIN: runtime };
      const clients: McpClient[] = [];
      try {
        // --- ST, over the 2025-11-25 handshake, with Studio open on the same folder --------------------------------
        await openFolder(app, st);
        await openFileInEditor(app, 'src/BeltToSensor.st');
        const starterText = await app.until('the program in the editor', async () => (await editorText(app)) || undefined);
        assert(
          starterText.includes('Goal: a press of the start button'),
          `Studio does not show the starter program: ${starterText.slice(0, 200)}`,
        );

        const first = await connectMcp('2025-11-25', { workspace: st, userData, env });
        clients.push(first);
        assert(
          first.hello.protocolVersion === '2025-11-25' && first.hello.serverInfo.name === 'zplc-local',
          `Unexpected handshake: ${JSON.stringify(first.hello).slice(0, 200)}`,
        );
        const toolsA = await readTheProject(first, ST_LESSON, 'scenario', true);
        const cause = await failedExpectation(first);
        assert(
          cause.expected === true && cause.observed === false,
          `The cause is not an expected fact that did not happen: ${JSON.stringify(cause)}`,
        );

        const goal = solution(ST_LESSON);
        const before = readFileSync(join(st, 'src', 'BeltToSensor.st'), 'utf8');
        // the check answers a program that does not compile with the place of each diagnostic, and a write that requires a build refuses it
        const typo = goal.replace('END_IF;', 'END_IFF;');
        const broken = await first.call('workspace_check_write', { files: [{ path: 'src/BeltToSensor.st', content: typo }] });
        assert(
          broken.body.dryRun === true &&
            broken.body.compiled === false &&
            broken.body.diagnostics[0].path === 'src/BeltToSensor.st' &&
            broken.body.diagnostics[0].line > 0,
          `The check does not place the error of a program that does not compile: ${JSON.stringify(broken.body).slice(0, 400)}`,
        );
        // while the classroom hides solutions the agent cannot write the reference solution, whatever it asks (AIX-002, D-32)
        const hiddenWrite = await first.call('workspace_write', { files: [{ path: 'src/BeltToSensor.st', content: goal }] });
        assert(
          hiddenWrite.isError === true && hiddenWrite.body.error === 'MCP_SOLUTIONS_HIDDEN',
          `The reference solution was written into a lesson that hides it: ${JSON.stringify(hiddenWrite.body).slice(0, 300)}`,
        );
        assert(readFileSync(join(st, 'src', 'BeltToSensor.st'), 'utf8') === before, 'A refused write changed the file.');
        // the person turns hiding off, as the setting of Studio does, and the agent writes
        writeFileSync(join(userData, LEARN_POLICY_FILENAME), JSON.stringify({ hideSolutions: false }));
        const refused = await first.call('workspace_write', {
          files: [{ path: 'src/BeltToSensor.st', content: typo }],
          requireCompile: true,
        });
        assert(
          refused.isError === true && refused.body.error === 'MCP_VALIDATION_FAILED',
          `A program that does not compile was written: ${JSON.stringify(refused.body).slice(0, 300)}`,
        );
        assert(readFileSync(join(st, 'src', 'BeltToSensor.st'), 'utf8') === before, 'A refused write changed the file.');
        const checked = await first.call('workspace_check_write', { files: [{ path: 'src/BeltToSensor.st', content: goal }] });
        assert(
          checked.body.ok === true && checked.body.dryRun === true && checked.body.compiled === true,
          `The check of the program failed: ${JSON.stringify(checked.body).slice(0, 300)}`,
        );
        assert(readFileSync(join(st, 'src', 'BeltToSensor.st'), 'utf8') === before, 'The dry run wrote the file.');
        assert((await editorText(app)) === starterText, 'Studio changed before the agent wrote.');

        const written = await first.call('workspace_write', {
          files: [{ path: 'src/BeltToSensor.st', content: goal }],
          requireCompile: true,
          expectedBaseSha256: { 'src/BeltToSensor.st': checked.body.files[0].beforeSha256 },
        });
        assert(
          written.body.ok === true && written.body.compiled === true && written.body.written[0].action === 'replace',
          `workspace_write: ${JSON.stringify(written.body).slice(0, 300)}`,
        );
        assert(readFileSync(join(st, 'src', 'BeltToSensor.st'), 'utf8') === goal, 'The program on disk is not the one the agent wrote.');

        // Studio follows with no restart: the editor shows the program and a notice names the file (AIX-012)
        await app.until(
          'the editor to show the program the agent wrote',
          async () => ((await editorText(app)) === goal ? true : undefined),
          30_000,
        );
        await noticeFor(app, 'BeltToSensor.st');

        await passesWithTrace(first);
        await debugToABreakpoint(first, { file: 'src/BeltToSensor.st', line: 22 }, 'BeltToSensor.Run');

        // the person runs it in Studio
        await runTests(app);
        await app.until(
          'the scenario to pass in Studio',
          async () => ((await text(app, '[data-test-row]')).includes('Passed') ? true : undefined),
          60_000,
        );
        first.close();
        await closeProject(app);

        // --- LD, over the 2026-07-28 envelope ---------------------------------------------------------------------
        await openFolder(app, ld);
        await openFileInEditor(app, 'src/BeltToSensor.ld.json');
        const rungs = () => app.eval<number>(`document.querySelectorAll('[data-ld-rung-id]').length`);
        await app.until('the Ladder editor', async () => (await app.visible(css('[data-ld-toolbox]'))) || undefined);
        assert((await rungs()) === 0, 'The starter diagram already has rungs.');

        const second = await connectMcp('2026-07-28', { workspace: ld, userData, env });
        clients.push(second);
        assert(
          second.hello.supportedVersions.includes('2026-07-28'),
          `The server does not serve 2026-07-28: ${JSON.stringify(second.hello).slice(0, 200)}`,
        );
        const toolsB = await readTheProject(second, LD_LESSON, 'ld', false);
        assert(JSON.stringify(toolsB) === JSON.stringify(toolsA), 'The two protocol eras do not offer the same tools.');
        await failedExpectation(second);

        const diagram = solution(LD_LESSON);
        const bad = await second.call('workspace_check_write', {
          files: [{ path: 'src/BeltToSensor.ld.json', content: diagram.replace('"contact_no"', '"contact"') }],
        });
        assert(
          bad.isError === true && JSON.stringify(bad.body).includes('"contact"') && JSON.stringify(bad.body).includes('contact_no'),
          `The refused diagram does not say what is accepted: ${JSON.stringify(bad.body).slice(0, 400)}`,
        );
        const good = await second.call('workspace_check_write', { files: [{ path: 'src/BeltToSensor.ld.json', content: diagram }] });
        assert(
          good.body.ok === true && good.body.dryRun === true,
          `The check of the diagram failed: ${JSON.stringify(good.body).slice(0, 300)}`,
        );
        const drawn = await second.call('workspace_write', {
          files: [{ path: 'src/BeltToSensor.ld.json', content: diagram }],
          requireCompile: true,
        });
        assert(
          drawn.body.ok === true && drawn.body.compiled === true,
          `workspace_write of the diagram: ${JSON.stringify(drawn.body).slice(0, 300)}`,
        );
        await app.until('the rungs the agent drew to appear in the editor', async () => ((await rungs()) === 4 ? true : undefined), 30_000);
        await noticeFor(app, 'BeltToSensor.ld.json');

        await passesWithTrace(second);
        await debugToABreakpoint(second, { file: 'src/BeltToSensor.ld.json', element: 'rung:rung_3' }, 'BeltToSensor.Run');
        await runTests(app);
        await app.until(
          'the Ladder scenario to pass in Studio',
          async () => ((await text(app, '[data-test-row]')).includes('Passed') ? true : undefined),
          60_000,
        );
      } finally {
        for (const client of clients) client.close();
      }
    },
  },
];
