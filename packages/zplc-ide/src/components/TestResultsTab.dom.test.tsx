import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';

// TST-003, TST-005, TST-008: the Test results tab and the one verdict component shared with the lesson check.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { useProjectTests } = await import('../projectTests/useProjectTests');
const { useWorkspaceTestResult } = await import('../shell/workspaceTestResult');
const { useLearnUi } = await import('../learn/learnUi');
const { useLearnProgress } = await import('../learn/progressState');
const { useAppSettings } = await import('../store/useAppSettings');
const { learnLessonCatalog } = await import('./learnLesson');
const { presentWorkspaceTestResult } = await import('./workspaceTestPresentation');
const { TestResultsTab } = await import('./TestResultsTab');
const { LearnPanel } = await import('./LearnPanel');

const sha = 'a'.repeat(64);
const traceSha = 'b'.repeat(64);
const artifacts = [
  { kind: 'zplc', sha256: sha, byteLength: 12 },
  { kind: 'trace', sha256: traceSha, byteLength: 34 },
];
const failure = { kind: 'AT', passed: false, atMs: 10, index: 1, checks: [{ signal: 'Motor.Forward', expected: false, observed: true }] };
const scenario = (id: string, path: string, assertions: unknown[], passed: boolean) => ({
  id,
  path,
  passed,
  totalSamples: 2,
  totalSignals: 1,
  totalAssertions: assertions.length,
  truncated: false,
  assertions: assertions as NonNullable<WorkspaceTestPresentation['preview']>['scenarios'][number]['assertions'],
  samples: [
    { atMs: 0, outputs: { 'Motor.Forward': false } },
    { atMs: 10, outputs: { 'Motor.Forward': true } },
  ],
});
/** A failed run of three tests, one of them failed, through the presenter that the store uses. */
const failedRun = (scenarioPath = 'tests/motor.scenario.json', id = 'motor', operation = 'test'): WorkspaceTestPresentation =>
  presentWorkspaceTestResult({
    ok: false,
    evidence: {
      schemaVersion: 1,
      operation,
      outcome: 'failed',
      diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored', path: scenarioPath }],
      artifacts,
    },
    savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 3 },
    preview: {
      schemaVersion: 1,
      backend: 'native-posix',
      mode: 'logical-cyclic-task-set-scan',
      traceEvidenceSha256: traceSha,
      totalScenarioCount: 3,
      scenarios: [
        scenario(id, scenarioPath, [{ kind: 'AT', passed: true, atMs: 0 }, failure], false),
        scenario('lamp', 'tests/lamp.scenario.json', [{ kind: 'AT', passed: true, atMs: 0 }], true),
        scenario('belt', 'tests/belt.scenario.json', [{ kind: 'AT', passed: true, atMs: 0 }], true),
      ],
    },
  });

const props = { workspaceScenarioLink: null, canonicalWorkspaceBuildEvidence: null };
const idle = () => dom.patchStore(useProjectTests, { tests: [], records: {}, running: null, cancelling: false, refusal: null });

afterEach(() => {
  useWorkspaceTestResult.getState().publish(undefined);
});

describe('the Test results tab (TST-003)', () => {
  it('TST-003 the verdict counts the failed tests and lists the passed ones collapsed', () => {
    idle();
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 1 });
    useWorkspaceTestResult.getState().publish(failedRun());
    dom.render(<TestResultsTab {...props} />);
    expect(dom.screen.getByRole('status').textContent).toBe('2 of 3 tests passed');
    expect(dom.screen.getByText('Motor.Forward: expected false, observed true')).toBeTruthy();
    expect((document.querySelector('details[data-test-passed]') as HTMLDetailsElement).open).toBe(false);
    // the boundary is stated once, and Details is closed
    expect(document.querySelectorAll('[data-boundary-badge]')).toHaveLength(1);
    expect((document.querySelector('details[data-test-details]') as HTMLDetailsElement).open).toBe(false);
  });

  it('TST-003 eight failed tests say "at least"', () => {
    idle();
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 1 });
    const many = failedRun();
    many.preview!.totalScenarioCount = 12;
    many.preview!.scenarios = Array.from({ length: 8 }, (_, index) =>
      scenario(`t${index}`, `tests/t${index}.scenario.json`, [failure], false),
    );
    useWorkspaceTestResult.getState().publish(many);
    dom.render(<TestResultsTab {...props} />);
    expect(dom.screen.getByRole('status').textContent).toBe('At least 8 of 12 tests failed');
  });

  it('TST-003 the scenario step link opens the scenario file at the line of the expectation', async () => {
    idle();
    const node = { id: 'file:tests/motor.scenario.json', name: 'motor.scenario.json', path: 'tests/motor.scenario.json', type: 'file' };
    const text = '{\n  "id": "motor",\n  "expectations": [\n    { "kind": "AT" },\n    { "kind": "AT" }\n  ]\n}\n';
    const navigated: Array<[string, number, number]> = [];
    dom.patchStore(useIDEStore, {
      projectSession: 1,
      compilerRunId: 1,
      fileTree: { id: 'root', name: 'p', path: '', type: 'directory', children: [node] } as never,
      loadedFiles: new Map([[node.id, { id: node.id, path: node.path, content: text }]]) as never,
      openFile: (async () => undefined) as never,
      navigateToCompilerDiagnostic: (async (file: string, line: number, column: number) => {
        navigated.push([file, line, column]);
        return true;
      }) as never,
    });
    useWorkspaceTestResult.getState().publish(failedRun());
    const { user } = dom.render(<TestResultsTab {...props} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.step.open') }));
    // expectation 1 is the second element of the array: line 5
    expect(navigated).toEqual([['tests/motor.scenario.json', 5, 5]]);
  });

  it('TST-003 the file of a step that is not in the project is refused with what to do', async () => {
    idle();
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 1, fileTree: null, directoryHandle: null });
    useWorkspaceTestResult.getState().publish(failedRun());
    const { user } = dom.render(<TestResultsTab {...props} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.step.open') }));
    expect(dom.screen.getByRole('alert').textContent).toBe(dom.t('u2Tests.step.unavailable'));
  });

  it('TST-003 the trace link opens Details and marks the sample at that time in the recorded trace', async () => {
    idle();
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 1 });
    useWorkspaceTestResult.getState().publish(failedRun());
    const { user } = dom.render(<TestResultsTab {...props} />);
    const details = document.querySelector('details[data-test-details]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.trace.open') }));
    expect(details.open).toBe(true);
    const marked = details.querySelectorAll('[data-trace-highlight]');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.getAttribute('aria-current')).toBe('true');
    expect(marked[0]!.textContent).toContain('10');
  });
});

describe('the step of a test that the tree does not hold (TST-003)', () => {
  it('TST-003 the scenario step is read from the project folder and shown with its line when the editor cannot open the file', async () => {
    idle();
    const text = '{\n  "id": "motor",\n  "expectations": [\n    { "kind": "AT" },\n    { "kind": "NEVER", "condition": {} }\n  ]\n}\n';
    const root = {
      getDirectoryHandle: async (name: string) => {
        if (name !== 'tests') throw new Error('missing');
        return { getFileHandle: async () => ({ getFile: async () => ({ text: async () => text }) }) };
      },
    };
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 1, fileTree: null, directoryHandle: root as never });
    useWorkspaceTestResult.getState().publish(failedRun());
    const { user } = dom.render(<TestResultsTab {...props} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.step.open') }));
    const shown = await dom.screen.findByText(dom.t('u2Tests.step.title', { number: 2, file: 'tests/motor.scenario.json', line: 5 }));
    expect(shown).toBeTruthy();
    expect(document.querySelector('[data-scenario-step] pre')!.textContent).toBe(JSON.stringify({ kind: 'NEVER', condition: {} }, null, 2));
    expect(dom.screen.queryByRole('alert')).toBeNull();
  });
});

describe('a result older than the sources (TST-005)', () => {
  it('TST-005 a result older than the sources stays and offers one Run again', async () => {
    const runs: unknown[] = [];
    const presentation = failedRun();
    dom.patchStore(useProjectTests, {
      tests: [],
      records: {
        'tests/motor.scenario.json': {
          path: 'tests/motor.scenario.json',
          status: 'failed',
          presentation,
          compilerRunId: 1,
          projectSession: 1,
          at: 5,
        },
      },
      running: null,
      run: (async (paths?: readonly string[]) => void runs.push(paths)) as never,
    });
    // the sources changed since (compilerRunId 2); the published result was withdrawn
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 2 });
    useWorkspaceTestResult.getState().publish(undefined);
    const { user } = dom.render(<TestResultsTab {...props} />);
    expect(dom.screen.getByText(dom.t('u2Tests.older.notice'))).toBeTruthy();
    expect(dom.screen.getByText('Motor.Forward: expected false, observed true')).toBeTruthy(); // the result still shows
    const again = dom.screen.getAllByRole('button', { name: dom.t('u2Tests.runAgain') });
    expect(again).toHaveLength(1);
    await user.click(again[0]!);
    expect(runs).toEqual([undefined]);
  });

  it('TST-005 a result of the current sources is not marked', () => {
    dom.patchStore(useProjectTests, {
      records: {
        'tests/motor.scenario.json': { path: 'x', status: 'failed', presentation: failedRun(), compilerRunId: 2, projectSession: 1, at: 5 },
      },
    });
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 2 });
    useWorkspaceTestResult.getState().publish(undefined);
    dom.render(<TestResultsTab {...props} />);
    expect(dom.screen.queryByText(dom.t('u2Tests.older.notice'))).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('u2Tests.runAgain') })).toBeNull();
  });
});

describe('one verdict component for the lesson check and the tests (TST-008)', () => {
  it('TST-008 the lesson check and the tests tab render the same verdict component', () => {
    const lesson = learnLessonCatalog.en.find((entry) => entry.rubric.requireSavedEvidence)!;
    const lessonRun = failedRun(lesson.scenarioPath, lesson.requiredScenario, 'scenario-run');
    // the lesson grades one run of its own scenario: every expectation of the scenario, the first one failed
    lessonRun.preview!.scenarios = lessonRun.preview!.scenarios.slice(0, 1);
    lessonRun.preview!.totalScenarioCount = 1;
    lessonRun.preview!.scenarios[0]!.assertions = lesson.scenario.expectations.map((expectation, index) =>
      index === 0 ? { ...failure, kind: expectation.kind, index: 0 } : { kind: expectation.kind, passed: true, atMs: 20 },
    ) as never;
    lessonRun.preview!.scenarios[0]!.totalAssertions = lesson.scenario.expectations.length;

    idle();
    dom.patchStore(useIDEStore, { projectSession: 1, compilerRunId: 1 });
    useWorkspaceTestResult.getState().publish(lessonRun);
    const tab = dom.render(<TestResultsTab {...props} />);
    const tabRoot = document.querySelector('[data-test-verdict]')!;
    const tabSentence = tabRoot.querySelector('[data-test-verdict-sentence]')!.textContent!;
    expect(tabSentence).toMatch(/^\d+ of \d+ tests passed$/);
    expect(tabRoot.querySelector('[data-boundary-badge]')).not.toBeNull();
    tab.unmount();

    dom.patchStore(useAppSettings, { settings: { ...useAppSettings.getState().settings, unlockAllLessons: true } } as never);
    dom.patchStore(useLearnProgress, { document: null, loaded: true, failed: false } as never);
    dom.patchStore(useLearnUi, { selected: lesson.id, starting: false, workspace: null } as never);
    dom.render(<LearnPanel workspaceTestPresentation={lessonRun} />);
    const lessonRoot = document.querySelector('[data-test-verdict]')!;
    expect(lessonRoot).not.toBeNull();
    expect(document.querySelectorAll('[data-test-verdict]')).toHaveLength(1);
    expect(lessonRoot.getAttribute('data-verdict')).toBe('failed');
    expect(lessonRoot.querySelector('[data-test-verdict-sentence]')!.textContent).toMatch(/^\d+ of \d+ tests passed$/);
    expect(lessonRoot.querySelector('[data-boundary-badge]')!.textContent).toBe(
      tabRoot.querySelector('[data-boundary-badge]')!.textContent ?? '',
    );
  });
});
