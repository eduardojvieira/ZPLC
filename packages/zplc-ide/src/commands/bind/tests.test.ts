import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { projectLoaderStub } from '../../test/projectLoaderStub';

await mock.module('../../utils/projectLoader', () => projectLoaderStub());
const { bindCommands, isCommandBound, resetCommandsForTest } = await import('../bus');
const { COMMAND_LIST, INITIAL_COMMAND_STATE, isCommandEnabled } = await import('../registry');
const { useProjectTests } = await import('../../projectTests/useProjectTests');
const { useNotifications } = await import('../../store/notifications');
const { useSelection } = await import('../../shell/useSelection');
const { useIDEStore } = await import('../../store/useIDEStore');
const { testCommandHandlers } = await import('./tests');

const IDS = ['build.runAllTests', 'build.runFailedTests', 'build.runTestAtCursor', 'build.newTest', 'build.checkInterlocks'] as const;
const before = { ...useProjectTests.getState() };
let runs: Array<readonly string[] | undefined> = [];

beforeEach(() => {
  runs = [];
  useNotifications.getState().clear();
  resetCommandsForTest();
  bindCommands(testCommandHandlers());
  useProjectTests.setState({
    records: {},
    tests: [],
    refusal: null,
    run: async (paths) => void runs.push(paths),
    refresh: async () => undefined,
  });
});
afterEach(() => {
  resetCommandsForTest();
  useProjectTests.setState({ run: before.run, refresh: before.refresh, records: before.records, tests: before.tests });
  useSelection.setState({ test: null });
  useNotifications.getState().clear();
});

const notices = () => useNotifications.getState().items.map((notice) => notice.title);

describe('the test commands (TST-010)', () => {
  it('TST-010 Run all, Run failed and Run at the cursor are bound and enabled with a project open', async () => {
    for (const id of IDS) {
      const command = COMMAND_LIST.find((candidate) => candidate.id === id)!;
      expect(isCommandBound(id)).toBe(true);
      expect(isCommandEnabled(command, { ...INITIAL_COMMAND_STATE, projectOpen: true })).toBe(true);
      expect('physical' in command && command.physical).toBeFalsy();
    }
    expect(COMMAND_LIST.find((command) => command.id === 'build.runAllTests')?.shortcut).toBe('Mod+Alt+T');
    await testCommandHandlers()['build.runAllTests']!();
    expect(runs).toEqual([undefined]);
    // a failed test runs alone, by its path
    const { projectSession } = useIDEStore.getState();
    const record = { path: 'tests/a.scenario.json', status: 'failed' as const, compilerRunId: 1, projectSession, at: 1 };
    const passed = { ...record, path: 'tests/b.scenario.json', status: 'passed' as const };
    useProjectTests.setState({ records: { [record.path]: record, [passed.path]: passed } });
    await testCommandHandlers()['build.runFailedTests']!();
    expect(runs).toEqual([undefined, ['tests/a.scenario.json']]);
  });

  it('TST-010 Run failed with none failed says so and runs nothing', async () => {
    await testCommandHandlers()['build.runFailedTests']!();
    expect(runs).toEqual([]);
    expect(notices()).toEqual(['No failed tests']);
  });

  it('TST-010 Run the test at the cursor refuses with no scenario in sight', async () => {
    await testCommandHandlers()['build.runTestAtCursor']!();
    expect(runs).toEqual([]);
    expect(notices()).toEqual(['No test to run here']);
    // a test selected in the Tests activity is the one to run when no scenario file is open
    useProjectTests.setState({ tests: [{ path: 'tests/a.scenario.json', id: 'A', expectations: [], valid: true }] });
    useSelection.setState({ test: 'tests/a.scenario.json' });
    await testCommandHandlers()['build.runTestAtCursor']!();
    expect(runs).toEqual([['tests/a.scenario.json']]);
  });
});
