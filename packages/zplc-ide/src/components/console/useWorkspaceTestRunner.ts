/**
 * The workspace test runner of the Console: the manifest link, the save, the scenario run, the interlock check and the cancel.
 * Moved out of Console.tsx with no change in behaviour (U2 Task X0a).
 */

import { useRef, useState } from 'react';
import { shownProjectBridge } from '../../ipc/shownProjectBridge';
import { trackTestRun } from '../workspaceTestNotifications';
import { useIDEStore } from '../../store/useIDEStore';
import { useConsoleState } from '../../store/regionSubscriptions';
import { usePublishWorkspaceTestResult } from '../../shell/workspaceTestResult';
import {
  isWorkspaceManifestRegistrationCurrent,
  isWorkspaceTestRunCurrent,
  presentWorkspaceTestResult,
  workspaceTestAvailability,
  workspaceTestRunFallbackState,
  type WorkspaceTestPresentation,
} from '../workspaceTestPresentation';
import { presentWorkspaceSafetyCheck, type WorkspaceSafetyPresentation } from '../workspaceSafetyPresentation';

type WorkspaceTestResultState = {
  presentation: WorkspaceTestPresentation;
  projectSession: number;
  compilerRunId: number;
  workspaceId: string;
};
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
  const {
    isProjectOpen,
    projectSession,
    compilerRunId,
    workspaceScenarioLink,
    linkWorkspaceScenarios,
    hasUnsavedChanges,
    saveAllFiles,
    saveProjectConfig,
  } = state;
  const [workspaceTestBusy, setWorkspaceTestBusy] = useState(false);
  const [workspaceTestState, setWorkspaceTestState] = useState<
    'idle' | 'selected' | 'running' | 'cancelling' | 'desktop-unavailable' | WorkspaceTestResultState
  >('idle');
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
  const workspaceTestStateForLink =
    typeof workspaceTestState === 'object' &&
    !isWorkspaceTestRunCurrent({ projectSession, compilerRunId, workspaceScenarioLink }, workspaceTestState)
      ? workspaceTestRunFallbackState({ isProjectOpen, projectSession, workspaceScenarioLink })
      : hasCurrentWorkspaceLink
        ? workspaceTestState
        : 'idle';
  const workspaceSafetyStateForLink: 'idle' | 'running' | 'unavailable' | Extract<WorkspaceSafetyState, { presentation: unknown }> =
    workspaceSafetyState === 'idle' ||
    !isWorkspaceTestRunCurrent({ projectSession, compilerRunId, workspaceScenarioLink }, workspaceSafetyState)
      ? 'idle'
      : 'status' in workspaceSafetyState
        ? workspaceSafetyState.status
        : workspaceSafetyState;

  // The lessons live in the sidebar and read the latest scenario run from here.
  usePublishWorkspaceTestResult(typeof workspaceTestStateForLink === 'object' ? workspaceTestStateForLink.presentation : undefined);

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
        if (linkWorkspaceScenarios(selection.workspaceId, expectedProjectSession)) {
          setWorkspaceTestState('selected');
        }
      }
    } catch {
      if (isWorkspaceManifestRegistrationCurrent(useIDEStore.getState().projectSession, expectedProjectSession)) {
        setWorkspaceTestState('desktop-unavailable');
      }
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  const saveWorkspaceProject = async () => {
    const current = useIDEStore.getState();
    if (workspaceTestBusy || !current.isProjectOpen) return;
    const expectedProjectSession = current.projectSession;
    setWorkspaceTestBusy(true);
    try {
      await saveAllFiles();
      let latest = useIDEStore.getState();
      if (
        latest.projectSession !== expectedProjectSession ||
        !latest.isProjectOpen ||
        Array.from(latest.loadedFiles.values()).some((file) => file.isModified)
      )
        return;

      if (latest.projectConfigDirty) {
        await saveProjectConfig();
      }

      latest = useIDEStore.getState();
      if (latest.projectSession !== expectedProjectSession || !latest.isProjectOpen || latest.hasUnsavedChanges()) return;
    } finally {
      setWorkspaceTestBusy(false);
    }
  };

  // The workspace test handlers below catch their own errors and show them in the panel; the buttons start them with `void`.
  const runWorkspaceTests = async (scenarioId?: string) => {
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
    setWorkspaceTestBusy(true);
    setWorkspaceTestState('running');
    const notice = trackTestRun(scenarioId, () => {
      void workspaceTests.cancel().catch(() => undefined);
    });
    try {
      const request = { workspaceId, ...(scenarioId === undefined ? {} : { scenarioId }) };
      const result = await workspaceTests.run(request);
      const latest = useIDEStore.getState();
      if (
        isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })
      ) {
        setWorkspaceTestState({
          presentation: presentWorkspaceTestResult(result),
          projectSession: expectedProjectSession,
          compilerRunId: expectedCompilerRunId,
          workspaceId,
        });
        notice.done(result);
      } else notice.dismiss();
    } catch {
      const latest = useIDEStore.getState();
      if (
        isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })
      ) {
        setWorkspaceTestState('desktop-unavailable');
        notice.unavailable();
      } else notice.dismiss();
    } finally {
      setWorkspaceTestBusy(false);
      const latest = useIDEStore.getState();
      setWorkspaceTestState((state) => (state === 'running' || state === 'cancelling' ? workspaceTestRunFallbackState(latest) : state));
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

  const cancelWorkspaceTests = async () => {
    if (!workspaceTests || !workspaceTestBusy || workspaceTestState !== 'running') return;
    setWorkspaceTestState('cancelling');
    try {
      await workspaceTests.cancel();
    } catch {
      /* the active run remains authoritative */
    }
  };

  return {
    workspaceTests,
    workspaceTestBusy,
    setWorkspaceTestBusy,
    workspaceManifestInputRef,
    hasCurrentWorkspaceLink,
    workspaceTestAvailabilityState,
    workspaceTestStateForLink,
    workspaceSafetyStateForLink,
    registerWorkspaceManifest,
    saveWorkspaceProject,
    runWorkspaceTests,
    runWorkspaceSafetyCheck,
    cancelWorkspaceTests,
  };
}
