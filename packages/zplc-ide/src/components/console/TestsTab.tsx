/**
 * The Test results tab of the results panel: the controls to run the project's tests and the Test results (`TestResultsTab`). The tests are
 * listed and chosen in the Tests activity; there is no file to choose (TST-002).
 */
import { CheckCircle, Info, LoaderCircle, Play } from 'lucide-react';
import { Button } from '../../ui';
import { useT } from '../../i18n';
import { useProjectTests } from '../../projectTests/useProjectTests';
import { useWorkspaceTestResult } from '../../shell/workspaceTestResult';
import { CommandEmptyState } from '../panelStates';
import { TestResultsTab } from '../TestResultsTab';
import type { WorkspaceTestRunner } from './useWorkspaceTestRunner';
import type { useConsoleState } from '../../store/regionSubscriptions';

type ConsoleState = ReturnType<typeof useConsoleState>;

export interface TestsTabProps {
  runner: Pick<WorkspaceTestRunner, 'workspaceTestAvailabilityState'>;
  projectSession: number;
  compilerRunId: number;
  workspaceScenarioLink: ConsoleState['workspaceScenarioLink'];
  canonicalWorkspaceBuildEvidence: ConsoleState['canonicalWorkspaceBuildEvidence'];
}

export function TestsTab({ runner, workspaceScenarioLink, canonicalWorkspaceBuildEvidence }: TestsTabProps) {
  const { t } = useT();
  const presentation = useWorkspaceTestResult((state) => state.presentation);
  const hasRecords = useProjectTests((state) => Object.keys(state.records).length > 0);
  const running = useProjectTests((state) => state.running);
  const cancelling = useProjectTests((state) => state.cancelling);
  const run = useProjectTests((state) => state.run);
  const cancel = useProjectTests((state) => state.cancel);
  const availability = runner.workspaceTestAvailabilityState;
  const busy = running !== null;
  return (
    <div className="p-3 space-y-3 font-sans text-sm text-[var(--color-surface-200)]">
      {availability === 'desktop-unavailable' ? (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]">
          <Info size={15} aria-hidden="true" />
          {t('console.workspaceTestsRequireThe')}
        </p>
      ) : availability === 'project-required' ? (
        <CommandEmptyState title={t('panel.tests.empty.title')} description={t('panel.tests.empty.description')} actions={['file.open']} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void run();
              }}
              disabled={busy}
            >
              <Play size={14} aria-hidden="true" />
              {t('console.runHostScenarios')}
            </Button>
            {busy ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void cancel();
                }}
                disabled={cancelling}
              >
                {cancelling ? t('console.cancelling') : t('console.cancelScenarios')}
              </Button>
            ) : null}
          </div>
          {!busy && !presentation && !hasRecords && (availability === 'ready' || availability === 'unsaved') && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
              <CheckCircle size={15} aria-hidden="true" />
              {t('console.linkedSavedWorkspaceReady')}
            </p>
          )}
          {busy && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
              <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {cancelling ? t('console.cancellingHostPosixScenarios') : t('console.runningHostPosixScenarios')}
            </p>
          )}
          <TestResultsTab
            runDisabled={busy}
            workspaceScenarioLink={workspaceScenarioLink}
            canonicalWorkspaceBuildEvidence={canonicalWorkspaceBuildEvidence}
          />
        </>
      )}
    </div>
  );
}
