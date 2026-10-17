/**
 * The update notice (REL-021): what the notice says about a newer release and which step updates the installation the
 * user has. It is built from the answer of the update check (IDE-010: one fixed address, asked by the main process,
 * silent when it cannot tell) and never downloads or installs anything: it names the release and the step, and a
 * person does the rest.
 *
 * The renderer opens no link (the window opens no other window and navigates nowhere), so the link is the address of
 * the release, shown to be read or copied.
 */
import { t as translateNow, type Translator } from '../i18n';
import type { UpdateCheckResult } from '../../electron/updateCheckProtocol';

export interface UpdateNotice {
  current: string;
  latest: string;
  /** The release page of this project, validated by the check. */
  releaseUrl: string;
  /** The files that this system installs from, and what to do with each: the step of the user's channel. */
  steps: string[];
}

/** One line per format that the platform installs from; the same steps as the Update section of the install page. */
export function updateSteps(platform: string, t: Translator['t'] = translateNow): string[] {
  switch (platform) {
    case 'win32':
      return [t('updateNotice.step.win32Setup'), t('updateNotice.step.win32Portable')];
    case 'darwin':
      return [t('updateNotice.step.darwin')];
    case 'linux':
      return [t('updateNotice.step.deb'), t('updateNotice.step.rpm'), t('updateNotice.step.appImage')];
    default:
      return [t('updateNotice.step.other')];
  }
}

/**
 * The notice for an answer, or null: only a release that is newer than this one and has not been dismissed. A
 * dismissal is of one version, so a still newer release shows again.
 */
export function updateNotice(result: UpdateCheckResult | null, platform: string, dismissedVersion: string | null, t: Translator['t'] = translateNow): UpdateNotice | null {
  if (result === null || result.status !== 'available') return null;
  if (dismissedVersion === result.latest) return null;
  return { current: result.current, latest: result.latest, releaseUrl: result.url, steps: updateSteps(platform, t) };
}

export const DISMISSED_STORAGE_KEY = 'zplc-ide-update-dismissed';

export interface NoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The version the user dismissed, or null: storage that is missing, throws or holds something else reads as nothing dismissed. */
export function readDismissed(storage: NoticeStorage | undefined): string | null {
  try {
    const value = storage?.getItem(DISMISSED_STORAGE_KEY) ?? null;
    return value !== null && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,60})?$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDismissed(storage: NoticeStorage | undefined, version: string): void {
  try { storage?.setItem(DISMISSED_STORAGE_KEY, version); } catch { /* the notice comes back at the next start: nothing is lost */ }
}
