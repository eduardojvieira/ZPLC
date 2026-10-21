import { t } from '../i18n';
const BLOCKED_FORCE_SUBCOMMANDS = new Set(['set', 'clear', 'clear_all']);

export const terminalForceBlockedMessage = (): string => `${t('terminal.forceBlocked')}\n`;

export function isTerminalForceMutation(command: string): boolean {
  const [runtime, debug, force, subcommand] = command
    .trim()
    .split(/\s+/, 4)
    .map((part) => part.toLowerCase());
  return (
    runtime === 'zplc' && debug === 'dbg' && force === 'force' && subcommand !== undefined && BLOCKED_FORCE_SUBCOMMANDS.has(subcommand)
  );
}
