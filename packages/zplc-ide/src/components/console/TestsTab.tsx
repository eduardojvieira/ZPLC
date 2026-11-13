import { AlertCircle, CheckCircle, FolderOpen, Info, LoaderCircle, Play } from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '../../ui';
import { useT } from '../../i18n';
import { CommandEmptyState } from '../panelStates';
import { WorkspaceTestResult } from '../WorkspaceTestResult';
import { classifyWorkspaceTestBuildLink } from '../workspaceTestPresentation';
import type { WorkspaceTestRunner } from './useWorkspaceTestRunner';
import type { useConsoleState } from '../../store/regionSubscriptions';

type ConsoleState = ReturnType<typeof useConsoleState>;

export interface TestsTabProps {
  runner: Pick<
    WorkspaceTestRunner,
    | 'workspaceTestBusy'
    | 'hasCurrentWorkspaceLink'
    | 'workspaceTestAvailabilityState'
    | 'workspaceTestStateForLink'
    | 'saveWorkspaceProject'
    | 'runWorkspaceTests'
    | 'cancelWorkspaceTests'
  > & { workspaceManifestInputRef: RefObject<HTMLInputElement | null> };
  projectSession: number;
  compilerRunId: number;
  workspaceScenarioLink: ConsoleState['workspaceScenarioLink'];
  canonicalWorkspaceBuildEvidence: ConsoleState['canonicalWorkspaceBuildEvidence'];
}

export function TestsTab({ runner, projectSession, compilerRunId, workspaceScenarioLink, canonicalWorkspaceBuildEvidence }: TestsTabProps) {
  const { t } = useT();
  const {
    workspaceTestBusy,
    hasCurrentWorkspaceLink,
    workspaceTestAvailabilityState,
    workspaceTestStateForLink,
    workspaceManifestInputRef,
    saveWorkspaceProject,
    runWorkspaceTests,
    cancelWorkspaceTests,
  } = runner;
  return (
    <div className="p-3 space-y-3 font-sans text-sm text-[var(--color-surface-200)]">
      {workspaceTestAvailabilityState === 'desktop-unavailable' ? (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]">
          <Info size={15} aria-hidden="true" />
          {t('console.workspaceTestsRequireThe')}
        </p>
      ) : workspaceTestAvailabilityState === 'project-required' ? (
        <CommandEmptyState title={t('panel.tests.empty.title')} description={t('panel.tests.empty.description')} actions={['file.open']} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => workspaceManifestInputRef.current?.click()} disabled={workspaceTestBusy}>
              <FolderOpen size={14} aria-hidden="true" />
              {hasCurrentWorkspaceLink ? t('console.chooseZplcJsonAgain') : t('console.chooseZplcJson')}
            </Button>
            {workspaceTestAvailabilityState === 'unsaved' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void saveWorkspaceProject();
                }}
                disabled={workspaceTestBusy}
              >
                {t('console.saveProject')}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void runWorkspaceTests();
              }}
              disabled={workspaceTestBusy || workspaceTestAvailabilityState !== 'ready'}
            >
              <Play size={14} aria-hidden="true" />
              {t('console.runHostScenarios')}
            </Button>
            {workspaceTestStateForLink === 'running' || workspaceTestStateForLink === 'cancelling' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void cancelWorkspaceTests();
                }}
                disabled={workspaceTestStateForLink === 'cancelling'}
              >
                {workspaceTestStateForLink === 'cancelling' ? t('console.cancelling') : t('console.cancelScenarios')}
              </Button>
            ) : null}
          </div>

          {workspaceTestAvailabilityState === 'link-required' && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-400)]">
              <Info size={15} aria-hidden="true" />
              {t('console.selectTheSavedWorkspace')}
            </p>
          )}
          {workspaceTestAvailabilityState === 'unsaved' && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-accent-yellow)]">
              <AlertCircle size={15} aria-hidden="true" />
              {t('console.testsUseSavedWorkspace')}
            </p>
          )}
          {workspaceTestAvailabilityState === 'ready' &&
            (workspaceTestStateForLink === 'selected' || workspaceTestStateForLink === 'idle') && (
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
                <CheckCircle size={15} aria-hidden="true" />
                {t('console.linkedSavedWorkspaceReady')}
              </p>
            )}
          {workspaceTestStateForLink === 'running' && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
              <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t('console.runningHostPosixScenarios')}
            </p>
          )}
          {workspaceTestStateForLink === 'cancelling' && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-[var(--color-surface-200)]">
              <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t('console.cancellingHostPosixScenarios')}
            </p>
          )}
          {workspaceTestStateForLink === 'desktop-unavailable' && (
            <p role="status" aria-live="polite" className="text-[var(--color-accent-yellow)]">
              {t('console.hostPosixSimulationIs')}
            </p>
          )}
          {typeof workspaceTestStateForLink === 'object' && (
            <WorkspaceTestResult
              presentation={workspaceTestStateForLink.presentation}
              onRunScenario={(scenarioId) => {
                void runWorkspaceTests(scenarioId);
              }}
              scenarioRunDisabled={workspaceTestBusy || workspaceTestAvailabilityState !== 'ready'}
              buildLink={classifyWorkspaceTestBuildLink(
                { projectSession, compilerRunId, workspaceScenarioLink },
                canonicalWorkspaceBuildEvidence,
                workspaceTestStateForLink,
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
