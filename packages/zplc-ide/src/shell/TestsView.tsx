/**
 * The Tests activity (TST-001, TST-002, SHL-005): the tests of the open project, one row per scenario file, with the last result of
 * each and the action to run it, or all of them. Arrow keys move between rows, Enter runs the row, Space selects it. There is no
 * file to choose: the project is the one that is open.
 */
import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { InterlocksView } from './InterlocksView';
import { statusOf, useProjectTests } from '../projectTests/useProjectTests';
import type { TestStatus } from '../projectTests/contracts';
import { useIDEStore } from '../store/useIDEStore';
import { Button } from '../ui';
import { useSelection } from './useSelection';

const STATUS_KEY = {
  notRun: 'u2Tests.status.notRun',
  passed: 'u2Tests.status.passed',
  failed: 'u2Tests.status.failed',
  older: 'u2Tests.status.older',
} as const satisfies Record<TestStatus, string>;

const STATUS_TONE: Record<TestStatus, string> = {
  notRun: 'text-[var(--color-surface-300)]',
  passed: 'text-[var(--color-accent-green)]',
  failed: 'text-[var(--color-accent-red)]',
  older: 'text-[var(--color-accent-yellow)]',
};

export function TestsView() {
  const { t } = useT();
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const projectSession = useIDEStore((state) => state.projectSession);
  const compilerRunId = useIDEStore((state) => state.compilerRunId);
  const directoryHandle = useIDEStore((state) => state.directoryHandle);
  const tests = useProjectTests((state) => state.tests);
  const records = useProjectTests((state) => state.records);
  const running = useProjectTests((state) => state.running);
  const cancelling = useProjectTests((state) => state.cancelling);
  const refresh = useProjectTests((state) => state.refresh);
  const run = useProjectTests((state) => state.run);
  const cancel = useProjectTests((state) => state.cancel);
  const runFailed = useProjectTests((state) => state.runFailed);
  const newTest = useProjectTests((state) => state.newTest);
  const view = useProjectTests((state) => state.view);
  const setView = useProjectTests((state) => state.setView);
  const safetyRunning = useProjectTests((state) => state.safety === 'running');
  const selected = useSelection((state) => state.test);
  const setTest = useSelection((state) => state.setTest);
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const desktop = typeof window !== 'undefined' && Boolean(window.electronAPI?.workspaceTests);
  const busy = running !== null || safetyRunning;

  useEffect(() => {
    void refresh();
  }, [refresh, projectSession, compilerRunId, directoryHandle]);

  if (!isProjectOpen) {
    return (
      <p className="p-3 font-sans text-sm text-[var(--color-surface-300)]" data-tests-view>
        {t('u2Tests.noProject')}
      </p>
    );
  }
  const current = { projectSession, compilerRunId };
  const stop = tests.find((test) => test.path === selected) ? selected : (tests[0]?.path ?? null);
  const move = (from: number, step: number): void => {
    const next = Math.min(tests.length - 1, Math.max(0, from + step));
    rows.current[next]?.focus();
  };
  const viewSwitch = (
    <div role="group" aria-label={t('u2Tests.view.label')} className="flex gap-1">
      <Button
        variant={view === 'tests' ? 'primary' : 'secondary'}
        size="sm"
        aria-pressed={view === 'tests'}
        data-command="view.tests"
        onClick={() => setView('tests')}
      >
        {t('u2Tests.view.tests')}
      </Button>
      <Button
        variant={view === 'interlocks' ? 'primary' : 'secondary'}
        size="sm"
        aria-pressed={view === 'interlocks'}
        data-command="view.interlocks"
        onClick={() => setView('interlocks')}
      >
        {t('u2Tests.view.interlocks')}
      </Button>
    </div>
  );
  if (view === 'interlocks') {
    return (
      <div className="space-y-1 p-3 font-sans text-sm text-[var(--color-surface-200)]" data-tests-view data-interlocks-view>
        {viewSwitch}
        <InterlocksView />
      </div>
    );
  }
  return (
    <div className="space-y-3 p-3 font-sans text-sm text-[var(--color-surface-200)]" data-tests-view>
      {viewSwitch}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          data-command="build.runAllTests"
          disabled={busy || !desktop || tests.length === 0}
          onClick={() => {
            void run();
          }}
        >
          {t('u2Tests.runAll')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-command="build.runFailedTests"
          disabled={busy || !desktop || tests.length === 0}
          onClick={() => {
            void runFailed();
          }}
        >
          {t('u2Tests.runFailed')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-command="build.newTest"
          disabled={busy}
          onClick={() => {
            void newTest();
          }}
        >
          {t('u2Tests.new')}
        </Button>
        {busy && (
          <Button
            variant="secondary"
            size="sm"
            data-command-exempt="stops the run in progress; the run itself starts from a command"
            disabled={cancelling}
            onClick={() => {
              void cancel();
            }}
          >
            {cancelling ? t('u2Tests.cancelling') : t('u2Tests.cancel')}
          </Button>
        )}
      </div>
      {!desktop && (
        <p role="status" className="text-[var(--color-surface-300)]">
          {t('u2Tests.desktopOnly')}
        </p>
      )}
      {busy && (
        <p role="status" className="text-[var(--color-surface-300)]">
          {t('u2Tests.running')}
        </p>
      )}
      {tests.length === 0 ? (
        <p className="text-[var(--color-surface-300)]">{t('u2Tests.empty')}</p>
      ) : (
        <ul aria-label={t('u2Tests.list')} className="space-y-1">
          {tests.map((test, index) => {
            const status = statusOf(records[test.path], current);
            const open = test.path === selected;
            return (
              <li key={test.path}>
                <div className="flex items-center gap-2">
                  <Button
                    variant="bare"
                    ref={(element) => {
                      rows.current[index] = element;
                    }}
                    tabIndex={test.path === stop ? 0 : -1}
                    aria-expanded={open}
                    data-test-row={test.path}
                    data-command-exempt="shows the expectations of the test; Enter runs it"

                    className="flex min-w-0 flex-1 items-baseline gap-2 rounded px-1 py-0.5 text-left"
                    onClick={() => setTest(open ? null : test.path)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        move(index, event.key === 'ArrowDown' ? 1 : -1);
                      } else if (event.key === 'Enter') {
                        event.preventDefault();
                        if (!busy && desktop && test.valid) void run([test.path]);
                      }
                    }}
                  >
                    <span className="truncate font-medium">{test.id}</span>
                    <span className={`shrink-0 ${STATUS_TONE[status]}`}>{test.valid ? t(STATUS_KEY[status]) : t('u2Tests.invalid')}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    tabIndex={-1}
                    aria-label={t('u2Tests.runOne', { id: test.id })}
                    data-command-exempt="runs the one test of this row; build.runTestAtCursor runs the selected one"

                    disabled={busy || !desktop || !test.valid}
                    onClick={() => {
                      void run([test.path]);
                    }}
                  >
                    {t('u2Tests.run')}
                  </Button>
                </div>
                {open && test.valid && (
                  <ul
                    aria-label={t('u2Tests.expectations', { id: test.id })}
                    className="ml-4 mt-1 space-y-0.5 text-[var(--color-surface-300)]"
                  >
                    {test.expectations.map((expectation) => (
                      <li key={expectation.index}>
                        {expectation.atMs === undefined
                          ? t('u2Tests.expectation.plain', { kind: expectation.kind })
                          : t('u2Tests.expectation.at', { kind: expectation.kind, ms: expectation.atMs })}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
