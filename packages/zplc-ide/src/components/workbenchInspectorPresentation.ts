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

/**
 * The POUs a text file declares (`PROGRAM`, `FUNCTION_BLOCK`, `FUNCTION`), or the `name` of a diagram document; the file name is not
 * repeated.
 */
export function declaredPous(language: string, content: string): string[] {
  if (language === 'ST' || language === 'IL') {
    return [...content.matchAll(/^\s*(?:PROGRAM|FUNCTION_BLOCK|FUNCTION)\s+([A-Za-z_]\w*)/gim)].map((match) => match[1]!);
  }
  try {
    const name = (JSON.parse(content) as { name?: unknown }).name;
    return typeof name === 'string' && name !== '' ? [name] : [];
  } catch {
    return [];
  }
}

/** The active document for the Inspector (SHL-009): what the tabs and the status rail do not say. */
export function presentActiveDocument(file: { language: string; content: string; isModified?: boolean }) {
  return {
    language: file.language,
    pous: declaredPous(file.language, file.content),
    lines: file.content === '' ? 0 : file.content.split('\n').length,
    characters: file.content.length,
    saved: !file.isModified,
  };
}
