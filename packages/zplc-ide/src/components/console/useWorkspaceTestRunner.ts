/**
 * The workspace test runner of the Console: the manifest link and the interlock check. The scenario run, its save and its cancel
 * moved to `projectTests/useProjectTests.ts` (U2 Task T2); the interlock check moves with Task T4.
 */

import { useRef, useState } from 'react';
import { shownProjectBridge } from '../../ipc/shownProjectBridge';
import { useIDEStore } from '../../store/useIDEStore';
import { useConsoleState } from '../../store/regionSubscriptions';
import { isWorkspaceManifestRegistrationCurrent, isWorkspaceTestRunCurrent, workspaceTestAvailability } from '../workspaceTestPresentation';
import { presentWorkspaceSafetyCheck, type WorkspaceSafetyPresentation } from '../workspaceSafetyPresentation';

type WorkspaceSafetyTextState = { status: 'running' | 'unavailable'; projectSession: number; compilerRunId: number; workspaceId: string };
type WorkspaceSafetyState =
  | 'idle'
  | WorkspaceSafetyTextState
  | { presentation: WorkspaceSafetyPresentation; projectSession: number; compilerRunId: number; workspaceId: string };

type ConsoleState = ReturnType<typeof useConsoleState>;

export type WorkspaceTestRunner = ReturnType<typeof useWorkspaceTestRunner>;

export function useWorkspaceTestRunner(
  state: Pick<
    ConsoleState,
    | 'isProjectOpen'
    | 'projectSession'
    | 'compilerRunId'
    | 'workspaceScenarioLink'
    | 'linkWorkspaceScenarios'
    | 'hasUnsavedChanges'
    | 'saveAllFiles'
    | 'saveProjectConfig'
  >,
) {
  const { isProjectOpen, projectSession, compilerRunId, workspaceScenarioLink, linkWorkspaceScenarios, hasUnsavedChanges } = state;
  const [workspaceTestBusy, setWorkspaceTestBusy] = useState(false);
  const [workspaceSafetyState, setWorkspaceSafetyState] = useState<WorkspaceSafetyState>('idle');
  const workspaceManifestInputRef = useRef<HTMLInputElement>(null);
  const workspaceTests = shownProjectBridge(window.electronAPI?.workspaceTests);
  const hasCurrentWorkspaceLink = workspaceScenarioLink?.projectSession === projectSession;
  const workspaceTestAvailabilityState = workspaceTestAvailability({
    desktopAvailable: Boolean(workspaceTests),
    isProjectOpen,
    hasCurrentLink: hasCurrentWorkspaceLink,
    hasUnsavedChanges: hasUnsavedChanges(),
  });
  const workspaceSafetyStateForLink: 'idle' | 'running' | 'unavailable' | Extract<WorkspaceSafetyState, { presentation: unknown }> =
    workspaceSafetyState === 'idle' ||
    !isWorkspaceTestRunCurrent({ projectSession, compilerRunId, workspaceScenarioLink }, workspaceSafetyState)
      ? 'idle'
      : 'status' in workspaceSafetyState
        ? workspaceSafetyState.status
        : workspaceSafetyState;

  const registerWorkspaceManifest = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !workspaceTests || workspaceTestBusy || !isProjectOpen) return;
    const expectedProjectSession = projectSession;
    setWorkspaceTestBusy(true);
    try {
      const selection = await workspaceTests.registerProjectFile(file);
      if (selection?.workspaceId && isWorkspaceManifestRegistrationCurrent(useIDEStore.getState().projectSession, expectedProjectSession)) {
        linkWorkspaceScenarios(selection.workspaceId, expectedProjectSession);
      }
    } catch {
      /* the project stays unlinked; the run asks for a link again */
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  const runWorkspaceSafetyCheck = async () => {
    const current = useIDEStore.getState();
    const link = current.workspaceScenarioLink;
    if (
      !workspaceTests ||
      workspaceTestBusy ||
      !current.isProjectOpen ||
      current.hasUnsavedChanges() ||
      !link ||
      link.projectSession !== current.projectSession
    )
      return;
    const { workspaceId, projectSession: expectedProjectSession } = link;
    const expectedCompilerRunId = current.compilerRunId;
    let published = false;
    setWorkspaceTestBusy(true);
    setWorkspaceSafetyState({
      status: 'running',
      projectSession: expectedProjectSession,
      compilerRunId: expectedCompilerRunId,
      workspaceId,
    });
    try {
      const result = await workspaceTests.safetyCheck({ workspaceId });
      const latest = useIDEStore.getState();
      if (
        isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })
      ) {
        setWorkspaceSafetyState({
          presentation: presentWorkspaceSafetyCheck(result),
          projectSession: expectedProjectSession,
          compilerRunId: expectedCompilerRunId,
          workspaceId,
        });
        published = true;
      }
    } catch {
      const latest = useIDEStore.getState();
      if (
        isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })
      ) {
        setWorkspaceSafetyState({
          status: 'unavailable',
          projectSession: expectedProjectSession,
          compilerRunId: expectedCompilerRunId,
          workspaceId,
        });
        published = true;
      }
    } finally {
      setWorkspaceTestBusy(false);
      if (!published)
        setWorkspaceSafetyState((state) => (typeof state === 'object' && 'status' in state && state.status === 'running' ? 'idle' : state));
    }
  };

  return {
    workspaceTests,
    workspaceTestBusy,
    setWorkspaceTestBusy,
    workspaceManifestInputRef,
    hasCurrentWorkspaceLink,
    workspaceTestAvailabilityState,
    workspaceSafetyStateForLink,
    registerWorkspaceManifest,
    runWorkspaceSafetyCheck,
  };
}
