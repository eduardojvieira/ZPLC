/**
 * The confirmations of the physical actions that Studio starts on a real device (UX-020): stopping and resetting the
 * PLC, forcing a variable, changing a forced value and releasing forces. Each is one `AlertDialog` whose action button
 * names the action and whose Cancel takes the initial focus. A simulation has nothing physical to protect, so it is
 * never asked (`needsPhysicalConfirmation`).
 */
import { t } from '../i18n';
import { confirmAction } from '../store/actionConfirm';

export function needsPhysicalConfirmation(mode: 'simulate' | 'hardware'): boolean {
  return mode === 'hardware';
}

/** True when the action may go ahead: a simulation is never asked, a real device only goes ahead after the person said yes. */
export async function proceedAfterConfirmation(mode: 'simulate' | 'hardware', ask: () => Promise<boolean>): Promise<boolean> {
  return !needsPhysicalConfirmation(mode) || ask();
}

/** An IEC literal, not translated: TRUE and FALSE for a BOOL, the number or the text otherwise. */
export function forceValueText(value: number | boolean | string | null): string {
  return typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : value === null ? '?' : String(value);
}

const cancelLabel = (): string => t('common.cancel');

export const confirmStop = (): Promise<boolean> =>
  confirmAction({ title: t('confirm.stop.title'), description: t('confirm.stop.description'), actionLabel: t('confirm.stop.action'), cancelLabel: cancelLabel(), destructive: true });

export const confirmReset = (): Promise<boolean> =>
  confirmAction({ title: t('confirm.reset.title'), description: t('confirm.reset.description'), actionLabel: t('confirm.reset.action'), cancelLabel: cancelLabel(), destructive: true });

export const confirmForce = (name: string, value: number | boolean | string | null): Promise<boolean> =>
  confirmAction({ title: t('confirm.force.title', { name }), description: t('confirm.force.description', { name, value: forceValueText(value) }), actionLabel: t('confirm.force.action'), cancelLabel: cancelLabel(), destructive: true });

export const confirmForceChange = (name: string, value: number | boolean | string | null): Promise<boolean> =>
  confirmAction({ title: t('confirm.forceChange.title', { name }), description: t('confirm.forceChange.description', { name, value: forceValueText(value) }), actionLabel: t('confirm.forceChange.action'), cancelLabel: cancelLabel(), destructive: true });

export const confirmRelease = (name: string): Promise<boolean> =>
  confirmAction({ title: t('confirm.release.title', { name }), description: t('confirm.release.description', { name }), actionLabel: t('confirm.release.action'), cancelLabel: cancelLabel(), destructive: true });

export const confirmReleaseAll = (): Promise<boolean> =>
  confirmAction({ title: t('confirm.releaseAll.title'), description: t('confirm.releaseAll.description'), actionLabel: t('confirm.releaseAll.action'), cancelLabel: cancelLabel(), destructive: true });
