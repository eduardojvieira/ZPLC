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
    disconnected: 'Disconnected',
    connecting: 'Connecting',
    connected: 'Connected',
    error: 'Connection error',
  };
  const device = input.controllerBoard ? `${deviceByStatus[input.connectionStatus]} · ${input.controllerBoard}` : deviceByStatus[input.connectionStatus];
  return {
    file: input.activeFile,
    project: input.projectName || 'No project metadata',
    target: input.target || 'No target configured',
    device,
    diagnostics: input.compilerMessagesChecked ? `${errors} ${errors === 1 ? 'error' : 'errors'} · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : 'Not checked',
    forces: input.forcesUnconfirmed
      ? 'Force state unconfirmed — verify before operating'
      : input.forcedValuesCount === 1 ? '1 active force' : input.forcedValuesCount > 1 ? `${input.forcedValuesCount} active forces` : 'No active forces',
    evidence: input.nativeTraceCount === 1 ? '1 native POSIX trace sample' : input.nativeTraceCount > 1 ? `${input.nativeTraceCount} native POSIX trace samples` : 'No recorded host trace',
  };
}
