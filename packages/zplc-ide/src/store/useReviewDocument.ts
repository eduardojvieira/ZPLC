/**
 * The change review document (spec 013 SHL-004, IDE-030): whether it is open in the editor area, whether it is the active view, and
 * the review it holds. The store keeps the data; the review and the save are in `components/ReviewDocument.tsx` (a store module may not
 * import a component), and only the person's accept saves.
 */
import { create } from 'zustand';
import { t } from '../i18n';
import { useNotifications } from './notifications';

/** The id of the review document among the views of the editor area. */
export const REVIEW_VIEW_ID = 'review:changes';

/** The review the document holds; the component narrows it to `CandidateReviewState`. */
export interface HeldReview {
  kind: string;
}

interface ReviewDocumentState {
  open: boolean;
  active: boolean;
  requests: number;
  review: HeldReview;
  busy: boolean;
  show: () => void;
  deselect: () => void;
  select: () => void;
  close: () => void;
  /** An assistant's change arrives already reviewed: one notice with a Review action; no region moves (SHL-010). */
  propose: (review: HeldReview) => void;
}

export const useReviewDocument = create<ReviewDocumentState>((set, get) => ({
  open: false,
  active: false,
  requests: 0,
  review: { kind: 'idle' },
  busy: false,
  show: () => set((state) => ({ open: true, active: true, requests: state.requests + 1 })),
  deselect: () => set((state) => (state.active ? { active: false } : state)),
  select: () => set((state) => (state.open && !state.active ? { active: true } : state)),
  close: () => set((state) => (state.open ? { open: false, active: false } : state)),
  propose: (review) => {
    set({ review });
    useNotifications.getState().report({
      kind: 'save',
      status: 'warning',
      title: t('review.proposed'),
      details: 'changes',
      recover: { label: t('review.open'), run: () => get().show() },
    });
  },
}));
