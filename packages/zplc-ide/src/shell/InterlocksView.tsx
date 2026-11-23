/**
 * The interlock view of the Tests activity (TST-006, IDE-032): the declared-interlock coverage with its own check. The check is not
 * the tests' run: it has its own run and its own result, and "Run all" does not start it. The answer is kept in the project tests
 * store, where the Test results tab reads it under its own heading.
 */
import { InterlockCoverage } from '../components/InterlockCoverage';
import { workspaceTestAvailability } from '../components/workspaceTestPresentation';
import { useProjectTests } from '../projectTests/useProjectTests';
import { useIDEStore } from '../store/useIDEStore';

export function InterlocksView() {
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const safety = useProjectTests((state) => state.safety);
  const running = useProjectTests((state) => state.running);
  const runSafety = useProjectTests((state) => state.runSafety);
  // the check saves and links the project itself before it asks (as a test run does), so only the host and the project can block it
  const availability = workspaceTestAvailability({
    desktopAvailable: typeof window !== 'undefined' && Boolean(window.electronAPI?.workspaceTests),
    isProjectOpen,
    hasCurrentLink: true,
    hasUnsavedChanges: false,
  });
  return (
    <InterlockCoverage
      availability={availability}
      state={safety}
      busy={running !== null || safety === 'running'}
      onCheck={() => {
        void runSafety();
      }}
    />
  );
}
