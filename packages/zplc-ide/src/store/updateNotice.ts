/**
 * The update notice as a small store of its own (REL-021): the last answer of the update check and the version that the
 * user dismissed. The check runs at start when the user turned it on, and on request from Preferences; both report here.
 */
import { create } from 'zustand';
import type { UpdateCheckResult } from '../../electron/updateCheckProtocol';
import { readDismissed, writeDismissed, type NoticeStorage } from '../ipc/updateNotice';

export interface UpdateNoticeState {
  result: UpdateCheckResult | null;
  dismissed: string | null;
  /** A new answer: shown again unless the user already dismissed that version. */
  report: (result: UpdateCheckResult) => void;
  /** Hides the notice for the release it names, until a newer one exists. */
  dismiss: () => void;
}

export function createUpdateNoticeStore(storage: NoticeStorage | undefined) {
  return create<UpdateNoticeState>()((set, get) => ({
    result: null,
    dismissed: readDismissed(storage),
    report: (result) => set({ result }),
    dismiss: () => {
      const { result } = get();
      if (result?.status !== 'available') return;
      writeDismissed(storage, result.latest);
      set({ dismissed: result.latest });
    },
  }));
}

function browserStorage(): NoticeStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export const useUpdateNotice = createUpdateNoticeStore(browserStorage());
