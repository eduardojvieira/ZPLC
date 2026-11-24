/**
 * Commands of the Tests activity and the test runner (plan-u2.md: T2 changes `view.tests`, T3 binds `view.testResults`, T4 the
 * `build.*` test commands, TST-006, TST-010). A test run starts a host process and never touches a board, so none is `physical`.
 */
import { useEffect } from 'react';
import { t } from '../../i18n';
import { sayTests, useProjectTests } from '../../projectTests/useProjectTests';
import { useSelection } from '../../shell/useSelection';
import { useIDEStore } from '../../store/useIDEStore';
import { bindCommands, type CommandHandler } from '../bus';
import type { CommandId } from '../registry';
import { showActivity, showPanel } from './layout';

/** After a run that did not start: a run that needs the desktop application says so (the other refusals have their own notice). */
function saidIfRefused(): void {
  if (useProjectTests.getState().refusal === 'desktop') sayTests('error', t('u2Tests.desktopOnly'));
}

async function runAtCursor(): Promise<void> {
  const tests = useProjectTests.getState();
  await tests.refresh();
  const known = new Set(useProjectTests.getState().tests.map((test) => test.path));
  const active = useIDEStore.getState().getActiveFile()?.path;
  const selected = useSelection.getState().test;
  // the scenario file in the editor, else the test selected in the Tests activity: a scenario holds one test, the file is the unit
  const path = active !== undefined && known.has(active) ? active : selected !== null && known.has(selected) ? selected : undefined;
  if (path === undefined) return sayTests('warning', t('u2Tests.runAtCursor.none'), t('u2Tests.runAtCursor.noneDetail'));
  await tests.run([path]);
  saidIfRefused();
}

function showInterlocks(): void {
  useProjectTests.getState().setView('interlocks');
  showActivity('tests');
}

/** The handlers of the test commands; `useTestCommands` binds them while the shell is mounted. */
export function testCommandHandlers(): Partial<Record<CommandId, CommandHandler>> {
  return {
    'view.tests': () => {
      useProjectTests.getState().setView('tests');
      showActivity('tests');
    },
    'view.testResults': showPanel('tests'),
    // a view of the Tests activity since U2 (SHL-004); a stored `interlocks` tab of 2.0 is routed here (shell/shellRouting.ts)
    'view.interlocks': showInterlocks,
    'build.runAllTests': async () => {
      await useProjectTests.getState().run();
      saidIfRefused();
    },
    'build.runFailedTests': async () => {
      await useProjectTests.getState().runFailed();
      saidIfRefused();
    },
    'build.runTestAtCursor': runAtCursor,
    'build.newTest': () => useProjectTests.getState().newTest(),
    'build.checkInterlocks': async () => {
      showInterlocks();
      await useProjectTests.getState().runSafety();
    },
  };
}

export function useTestCommands(): void {
  useEffect(() => bindCommands(testCommandHandlers()), []);
}
