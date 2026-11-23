import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';
import type { WorkspaceSafetyPresentation } from '../components/workspaceSafetyPresentation';

// TST-006 and IDE-032: the interlock coverage is a view of the Tests activity with its own run and its own heading in the results.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { TestsView } = await import('./TestsView');
const { TestResultsTab } = await import('../components/TestResultsTab');
const { useIDEStore } = await import('../store/useIDEStore');
const { useProjectTests } = await import('../projectTests/useProjectTests');
const { useSelection } = await import('./useSelection');
const { useWorkspaceTestResult } = await import('./workspaceTestResult');

const pair = { outputs: ['Motor_Fwd', 'Motor_Rev'] as [string, string] };
const uncovered = { kind: 'uncovered', declared: [pair], uncovered: [pair], diagnostics: [] } as unknown as WorkspaceSafetyPresentation;
const covered = { kind: 'covered', declared: [pair], diagnostics: [] } as unknown as WorkspaceSafetyPresentation;

let calls: string[];
let answer: unknown;

const withBridge = (): void => {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    isElectron: true,
    workspaceTests: {
      run: async () => {
        calls.push('run');
        return { ok: false };
      },
      safetyCheck: async (request: { workspaceId: string }) => {
        calls.push(`safetyCheck ${request.workspaceId}`);
        if (answer instanceof Error) throw answer;
        return answer;
      },
      cancel: async () => undefined,
      registerProjectRoot: async () => ({ workspaceId: 'w' }),
      registerProjectFile: async () => null,
    },
  };
};

beforeEach(() => {
  calls = [];
  answer = { garbage: true };
  withBridge();
  dom.patchStore(useIDEStore, {
    isProjectOpen: true,
    projectSession: 1,
    directoryHandle: null,
    workspaceScenarioLink: { workspaceId: 'w', projectSession: 1 },
    loadedFiles: new Map(),
  });
  dom.patchStore(useProjectTests, { tests: [], records: {}, running: null, safety: 'idle', view: 'tests', refusal: null });
  dom.patchStore(useSelection, { test: null });
  dom.patchStore(useWorkspaceTestResult, { presentation: undefined });
});

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('the interlock view of the Tests activity (TST-006)', () => {
  it('TST-006 the Tests activity has an interlock view with its own run', async () => {
    const { user, container } = dom.render(<TestsView />);
    expect(container.querySelector('[data-interlock-coverage]')).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.view.interlocks') }));
    expect(container.querySelector('[data-interlock-coverage]')).not.toBeNull();

    await user.click(dom.screen.getByRole('button', { name: dom.t('interlock.checkDeclaredInterlocks') }));
    await dom.waitFor(() => expect(useProjectTests.getState().safety).toMatchObject({ presentation: { kind: 'invalid' } }));
    // the check is its own run: it asks the interlock check of the workspace, and starts no test
    expect(calls).toEqual(['safetyCheck w']);

    // and Run all is not the interlock check
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.view.tests') }));
    useProjectTests.setState({ tests: [{ path: 'tests/a.scenario.json', id: 'A', expectations: [], valid: true }] });
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.runAll') }));
    await dom.waitFor(() => expect(calls).toContain('run'));
    expect(calls.filter((call) => call.startsWith('safetyCheck'))).toHaveLength(1);
  });

  it('TST-006 the interlock result has its own heading in the Test results tab', () => {
    useProjectTests.setState({ safety: { presentation: uncovered } });
    const { container } = dom.render(<TestResultsTab workspaceScenarioLink={null} canonicalWorkspaceBuildEvidence={null} />);
    const heading = dom.screen.getByRole('heading', { name: dom.t('u2Tests.interlocks.title') });
    const section = heading.closest('[data-interlock-result]');
    expect(section).not.toBeNull();
    expect(section?.querySelector('table')?.textContent).toContain('Motor_Fwd');
    expect(container.querySelector('[data-test-results]')).toBeNull();
  });

  it('IDE-032 the interlock coverage check behaves as in 2.0', async () => {
    const { user } = dom.render(<TestsView />);
    dom.act(() => useProjectTests.setState({ view: 'interlocks' }));
    const check = () => dom.screen.getByRole('button', { name: dom.t('interlock.checkDeclaredInterlocks') }) as HTMLButtonElement;
    await dom.waitFor(() => expect(check().disabled).toBe(false));
    expect(dom.screen.getByText(dom.t('interlock.checksExactNeverCoverage'))).toBeTruthy();

    // an uncovered pair is listed with the claim it does not make; a covered one says Covered
    dom.act(() => useProjectTests.setState({ safety: { presentation: uncovered } }));
    expect(dom.screen.getByText(dom.t('interlock.missingExactNeverCoverage'))).toBeTruthy();
    dom.act(() => useProjectTests.setState({ safety: { presentation: covered } }));
    expect(dom.screen.getByText(dom.t('interlock.covered'))).toBeTruthy();

    // a failed request says so; the sources changing withdraws the answer
    answer = new Error('down');
    dom.act(() => useProjectTests.setState({ safety: 'idle' }));
    await user.click(check());
    await dom.waitFor(() => expect(dom.screen.getByText(dom.t('interlock.declaredInterlockCoverageIs'))).toBeTruthy());
    dom.act(() => useIDEStore.setState({ compilerRunId: useIDEStore.getState().compilerRunId + 1 }));
    expect(useProjectTests.getState().safety).toBe('idle');

    // without the desktop application, the check says so and cannot run
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    dom.act(() => useProjectTests.setState({ safety: 'idle' }));
    await dom.waitFor(() => expect(dom.screen.getByText(dom.t('interlock.declaredInterlockCoverageRequi'))).toBeTruthy());
    expect(check().disabled).toBe(true);
  });
});
