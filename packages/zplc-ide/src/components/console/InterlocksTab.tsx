import { InterlockCoverage } from '../InterlockCoverage';
import type { WorkspaceTestRunner } from './useWorkspaceTestRunner';

export function InterlocksTab({
  runner,
}: {
  runner: Pick<
    WorkspaceTestRunner,
    'workspaceTestAvailabilityState' | 'workspaceSafetyStateForLink' | 'workspaceTestBusy' | 'runWorkspaceSafetyCheck'
  >;
}) {
  const { workspaceTestAvailabilityState, workspaceSafetyStateForLink, workspaceTestBusy, runWorkspaceSafetyCheck } = runner;
  return (
    <InterlockCoverage
      availability={workspaceTestAvailabilityState}
      state={workspaceSafetyStateForLink}
      busy={workspaceTestBusy}
      onCheck={() => {
        void runWorkspaceSafetyCheck();
      }}
    />
  );
}
