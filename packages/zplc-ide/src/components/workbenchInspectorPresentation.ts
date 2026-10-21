import { t, tn } from '../i18n';
import type { ConnectionStatus } from '../types';

export type WorkbenchInspectorInput = {
  activeFile: { name: string; path: string; language: string } | null;
  projectName: string | null;
  target: string | null;
  connectionStatus: ConnectionStatus;
  controllerBoard: string | null;
  compilerMessages: Array<{ type: string }>;
  compilerMessagesChecked: boolean;
  forcedValuesCount: number;
  forcesUnconfirmed: boolean;
  nativeTraceCount: number;
};

export function presentWorkbenchInspector(input: WorkbenchInspectorInput) {
  const errors = input.compilerMessages.filter((message) => message.type === 'error').length;
  const warnings = input.compilerMessages.filter((message) => message.type === 'warning').length;
  const deviceByStatus: Record<ConnectionStatus, string> = {
    disconnected: t('workbench.inspector.disconnected'),
    connecting: t('workbench.inspector.connecting'),
    connected: t('workbench.inspector.connected'),
    error: t('workbench.inspector.connectionError'),
  };
  const device = input.controllerBoard
    ? `${deviceByStatus[input.connectionStatus]} · ${input.controllerBoard}`
    : deviceByStatus[input.connectionStatus];
  return {
    file: input.activeFile,
    project: input.projectName || t('workbench.inspector.noMetadata'),
    target: input.target || t('workbench.inspector.noTarget'),
    device,
    diagnostics: input.compilerMessagesChecked
      ? `${tn('workbench.inspector.errors', errors)} · ${tn('workbench.inspector.warnings', warnings)}`
      : t('workbench.inspector.notChecked'),
    forces: input.forcesUnconfirmed
      ? t('workbench.inspector.forcesUnconfirmed')
      : input.forcedValuesCount > 0
        ? tn('workbench.inspector.activeForces', input.forcedValuesCount)
        : t('workbench.inspector.noForces'),
    evidence:
      input.nativeTraceCount > 0 ? tn('workbench.inspector.traceSamples', input.nativeTraceCount) : t('workbench.inspector.noTrace'),
  };
}
