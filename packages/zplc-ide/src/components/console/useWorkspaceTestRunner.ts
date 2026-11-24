/**
 * The workspace test runner of the Console: the manifest link. The scenario run, its save and its cancel moved to
 * `projectTests/useProjectTests.ts` (U2 Task T2), and the interlock check to the Tests activity (T4; its tab left the panel in H6).
 */

import { useRef, useState } from 'react';
import { shownProjectBridge } from '../../ipc/shownProjectBridge';
import { useIDEStore } from '../../store/useIDEStore';
import { useConsoleState } from '../../store/regionSubscriptions';
import { isWorkspaceManifestRegistrationCurrent, workspaceTestAvailability } from '../workspaceTestPresentation';

type ConsoleState = ReturnType<typeof useConsoleState>;

export type WorkspaceTestRunner = ReturnType<typeof useWorkspaceTestRunner>;

export function useWorkspaceTestRunner(
  state: Pick<ConsoleState, 'isProjectOpen' | 'projectSession' | 'workspaceScenarioLink' | 'linkWorkspaceScenarios' | 'hasUnsavedChanges'>,
) {
  const { isProjectOpen, projectSession, workspaceScenarioLink, linkWorkspaceScenarios, hasUnsavedChanges } = state;
  const [workspaceTestBusy, setWorkspaceTestBusy] = useState(false);
  const workspaceManifestInputRef = useRef<HTMLInputElement>(null);
  const workspaceTests = shownProjectBridge(window.electronAPI?.workspaceTests);
  const hasCurrentWorkspaceLink = workspaceScenarioLink?.projectSession === projectSession;
  const workspaceTestAvailabilityState = workspaceTestAvailability({
    desktopAvailable: Boolean(workspaceTests),
    isProjectOpen,
    hasCurrentLink: hasCurrentWorkspaceLink,
    hasUnsavedChanges: hasUnsavedChanges(),
  });

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

  return {
    workspaceTests,
    workspaceTestBusy,
    setWorkspaceTestBusy,
    workspaceManifestInputRef,
    hasCurrentWorkspaceLink,
    workspaceTestAvailabilityState,
    registerWorkspaceManifest,
  };
}
