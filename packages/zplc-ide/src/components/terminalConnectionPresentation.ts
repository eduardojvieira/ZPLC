import { t } from '../i18n';

export function terminalDisconnectMessage(succeeded: boolean): string {
  return succeeded ? `\n${t('terminal.disconnected')}\n` : `\n${t('terminal.closeFailed')}\n`;
}
