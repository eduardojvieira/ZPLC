import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { TestsView } = await import('./TestsView');
const { useIDEStore } = await import('../store/useIDEStore');
const { useProjectTests } = await import('../projectTests/useProjectTests');
const { useSelection } = await import('./useSelection');

const scenario = (id: string) =>
  JSON.stringify({
    id,
    expectations: [
      { kind: 'AT', atMs: 250, condition: {} },
      { kind: 'NEVER', condition: {} },
    ],
  });
const fakeRoot = (files: Record<string, string>) => ({
  getDirectoryHandle: async () => ({
    async *values() {
      for (const [name, text] of Object.entries(files)) yield { kind: 'file', name, getFile: async () => ({ text: async () => text }) };
    },
  }),
});

let runs: Array<string | undefined>;

beforeEach(() => {
  runs = [];
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    isElectron: true,
    workspaceTests: {
      run: async (request: { scenarioId?: string }) => {
        runs.push(request.scenarioId);
        return { ok: false };
      },
      cancel: async () => undefined,
      registerProjectRoot: async () => ({ workspaceId: 'w' }),
      registerProjectFile: async () => null,
    },
  };
  dom.patchStore(useIDEStore, {
    isProjectOpen: true,
    projectSession: 1,
    directoryHandle: fakeRoot({ 'a.scenario.json': scenario('Alpha'), 'b.scenario.json': scenario('Beta') }) as never,
    workspaceScenarioLink: { workspaceId: 'w', projectSession: 1 },
    loadedFiles: new Map(),
  });
  dom.patchStore(useProjectTests, { tests: [], records: {}, running: null, cancelling: false, refusal: null });
  dom.patchStore(useSelection, { test: null });
});

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('the Tests activity', () => {
  it('TST-001 the Tests activity lists the scenarios of the open project', async () => {
    dom.render(<TestsView />);
    await dom.settle();
    const list = await dom.screen.findByRole('list', { name: dom.t('u2Tests.list') });
    expect(
      dom
        .within(list)
        .getAllByText(/Alpha|Beta/)
        .map((node) => node.textContent),
    ).toEqual(['Alpha', 'Beta']);
    expect(dom.within(list).getAllByText(dom.t('u2Tests.status.notRun'))).toHaveLength(2);
    expect(dom.screen.getByRole('button', { name: dom.t('u2Tests.runAll') })).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: dom.t('u2Tests.runOne', { id: 'Beta' }) })).toBeTruthy();
    // no file to choose (TST-002)
    expect(dom.screen.queryByText(/zplc\.json/i)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('TST-001 a row is operable by keyboard: arrows move, Enter runs', async () => {
    const { user } = dom.render(<TestsView />);
    await dom.settle();
    await dom.screen.findByRole('list', { name: dom.t('u2Tests.list') });
    const rows = [...document.querySelectorAll<HTMLElement>('[data-test-row]')];
    rows[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rows[1]!);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(rows[0]!);
    await user.keyboard('{Enter}');
    await dom.waitFor(() => expect(runs).toEqual(['Alpha']));
    await dom.settle();
  });

  it('TST-001 Space selects a test and shows its expectations', async () => {
    const { user } = dom.render(<TestsView />);
    await dom.settle();
    await dom.screen.findByRole('list', { name: dom.t('u2Tests.list') });
    document.querySelector<HTMLElement>('[data-test-row="tests/b.scenario.json"]')!.focus();
    await user.keyboard(' ');
    expect(useSelection.getState().test).toBe('tests/b.scenario.json');
    const expectations = dom.screen.getByRole('list', { name: dom.t('u2Tests.expectations', { id: 'Beta' }) });
    expect(
      dom
        .within(expectations)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['AT at 250 ms', 'NEVER']);
  });

  it('TST-001 Run all runs every test once', async () => {
    const { user } = dom.render(<TestsView />);
    await dom.settle();
    await dom.screen.findByRole('list', { name: dom.t('u2Tests.list') });
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.runAll') }));
    await dom.waitFor(() => expect(runs).toEqual([undefined]));
    await dom.settle();
  });

  it('SHL-005 the Tests sidebar holds a list and not a pointer to another surface', async () => {
    dom.render(<TestsView />);
    await dom.settle();
    await dom.screen.findByRole('list', { name: dom.t('u2Tests.list') });
    expect(dom.screen.queryByText(dom.t('testsView.show'))).toBeNull();
    expect(dom.screen.queryByText(dom.t('testsView.description'))).toBeNull();
  });

  it('TST-001 with no project open the activity says so', async () => {
    dom.patchStore(useIDEStore, { isProjectOpen: false });
    dom.render(<TestsView />);
    await dom.settle();
    expect(dom.screen.getByText(dom.t('u2Tests.noProject'))).toBeTruthy();
  });
});
