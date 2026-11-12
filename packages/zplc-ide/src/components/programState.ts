/**
 * The words of the program's state in the command bar's status rail (spec 013 MSG-007). Moved out of `Toolbar.tsx` with its
 * words unchanged (Task W6), so that the table of state words (Task W7) rewords it without that file.
 */
import { EXECUTION_MODE, type ExecutionMode } from './runtimeArtifactSelection';
import type { OperationalStatusTone } from './operationalStatusPresentation';
import type { VMState } from '../runtime/debugAdapter';
import type { Translator } from '../i18n';

export interface StatusInput {
  isConnected: boolean;
  vmState: VMState;
  executionMode: ExecutionMode;
  /** The current build is in the runtime. */
  programLoaded: boolean;
  /** The last build is of the current sources. */
  currentBuild: boolean;
  /** Some build was made in this session, current or not. */
  anyBuild: boolean;
}

export function getStatusDisplay(input: StatusInput, t: Translator['t']): { text: string; tone: OperationalStatusTone } {
  const { isConnected, vmState, executionMode, programLoaded, currentBuild, anyBuild } = input;
  if (!isConnected) return { text: t('toolbarMsg.disconnected'), tone: 'neutral' };
  switch (vmState) {
    case 'running':
      return currentBuild
        ? { text: t('toolbarMsg.status.running'), tone: 'success' }
        : { text: t('toolbarMsg.status.runningRebuild'), tone: 'attention' };
    case 'paused':
      return currentBuild
        ? { text: t('toolbarMsg.status.paused'), tone: 'attention' }
        : { text: t('toolbarMsg.status.pausedRebuild'), tone: 'attention' };
    case 'idle':
      if (executionMode === EXECUTION_MODE.HARDWARE) {
        if (programLoaded && currentBuild) return { text: t('toolbarMsg.status.deployedStopped'), tone: 'info' };
        return currentBuild
          ? { text: t('toolbarMsg.status.connectedDeploy'), tone: 'info' }
          : anyBuild
            ? { text: t('toolbarMsg.status.connectedRebuild'), tone: 'attention' }
            : { text: t('toolbarMsg.status.connectedBuild'), tone: 'info' };
      }
      return anyBuild && !currentBuild
        ? { text: t('toolbarMsg.status.readyRebuild'), tone: 'attention' }
        : { text: t('toolbarMsg.status.ready'), tone: 'info' };
    case 'error':
      return { text: t('toolbarMsg.status.error'), tone: 'danger' };
    default:
      return { text: vmState, tone: 'neutral' };
  }
}
