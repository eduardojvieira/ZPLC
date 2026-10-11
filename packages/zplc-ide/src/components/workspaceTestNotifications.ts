import { useNotifications, type NotificationResult } from '../store/notifications';
import { presentWorkspaceTestResult, type WorkspaceTestPresentation } from './workspaceTestPresentation';

/** What the Tests panel concluded, as the notification of that run. */
function workspaceTestNotification(presentation: WorkspaceTestPresentation): NotificationResult {
  const detail = presentation.scenarioCount !== undefined ? `${presentation.scenarioCount} ${presentation.scenarioCount === 1 ? 'scenario' : 'scenarios'}` : undefined;
  switch (presentation.kind) {
    case 'passed': return { kind: 'tests', status: 'success', title: 'Host scenarios passed', ...(detail ? { detail } : {}), details: 'tests' };
    case 'assertion-failed': return { kind: 'tests', status: 'error', title: 'A host scenario failed an assertion', detail: presentation.message, details: 'tests' };
    case 'cancelled': return { kind: 'tests', status: 'cancelled', title: 'Host scenarios cancelled', details: 'tests' };
    case 'timeout': return { kind: 'tests', status: 'error', title: 'Host scenarios timed out', details: 'tests' };
    default: return { kind: 'tests', status: 'error', title: 'Host scenarios could not run', detail: presentation.message, details: 'tests' };
  }
}

/**
 * The notification of a run of host scenarios (IDE-021): progress while it runs, the cancel of the Tests panel, and its
 * result. `dismiss` is for a run whose result is no longer about the project that is open.
 */
export function trackTestRun(scenarioId: string | undefined, cancel: () => void) {
  const notices = useNotifications.getState();
  const operation = notices.begin({ kind: 'tests', title: scenarioId === undefined ? 'Running host scenarios' : `Running scenario ${scenarioId}`, details: 'tests', cancel });
  return {
    /** `result` is what the run answered; the notification says what the Tests panel concludes from it. */
    done: (result: unknown) => notices.finish(operation, workspaceTestNotification(presentWorkspaceTestResult(result))),
    unavailable: () => notices.finish(operation, { kind: 'tests', status: 'error', title: 'Host POSIX simulation is unavailable', details: 'tests' }),
    dismiss: () => notices.dismiss(operation),
  };
}
