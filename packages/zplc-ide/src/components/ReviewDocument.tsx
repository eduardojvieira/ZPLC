/**
 * The change review document (SHL-004, IDE-030): the editor area's home of a proposed change. It lists the pending change and shows its
 * review, with or without an AI provider; the flow is `reviewFlow.ts`, shared with the Assistant view.
 */
import { FileDiff, LoaderCircle } from 'lucide-react';
import { useT } from '../i18n';
import { useTheme } from '../hooks/useTheme';
import { isCandidateSourcePath } from '../ai/candidatePaths';
import { useIDEStore } from '../store/useIDEStore';
import { useReviewDocument } from '../store/useReviewDocument';
import { Button } from '../ui';
import { CandidateReviewResult, type CandidateReviewState } from './ConsoleReviewPanels';
import { acceptReview, cancelReview, reviewActiveChange, reviewIsCurrent } from './reviewFlow';
import { canLinkProjectWorkspace, linkProjectWorkspace } from '../utils/workspaceTestLink';

/** Reviews the active change; a project not linked yet is linked first, as Build, Tests and Simulate link it (IDE-001). */
async function linkAndReview(): Promise<void> {
  const { workspaceScenarioLink, projectSession } = useIDEStore.getState();
  if (workspaceScenarioLink?.projectSession !== projectSession && !(await linkProjectWorkspace())) return;
  await reviewActiveChange();
}

const STATUS_KEYS: Partial<Record<CandidateReviewState['kind'], string>> = {
  'matches-disk': 'console.theActiveBufferMatches',
  'no-change': 'console.proposalNoChange',
  cancelling: 'console.cancellingTheReview',
  saving: 'console.savingReviewedChange',
  stale: 'console.theChangeIsNo',
  error: 'console.theReviewCouldNot',
  saved: 'console.reviewedChangeSavedReview',
};

export function ReviewDocument() {
  const { t } = useT();
  const { effectiveTheme } = useTheme();
  const reviewState = useReviewDocument((state) => state.review) as CandidateReviewState;
  const busy = useReviewDocument((state) => state.busy);
  const activeFile = useIDEStore((state) => (state.activeFileId ? state.loadedFiles.get(state.activeFileId) : undefined));
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const hasLink = useIDEStore((state) => state.workspaceScenarioLink?.projectSession === state.projectSession);
  // a result whose program moved since the review is shown as stale and cannot be saved
  const review: CandidateReviewState = reviewIsCurrent(reviewState) ? reviewState : { kind: 'stale' };
  const desktop = Boolean(window.electronAPI?.candidateChangeSet);
  const linkable = hasLink || canLinkProjectWorkspace();
  const eligible = Boolean(
    desktop && isProjectOpen && linkable && activeFile?.handle && activeFile.isModified && isCandidateSourcePath(activeFile.path),
  );
  const statusKey = STATUS_KEYS[review.kind];
  return (
    <div className="h-full overflow-auto p-3 font-sans text-sm text-[var(--color-surface-200)]" data-review-document>
      <h1 className="mb-3 text-base font-medium text-[var(--color-surface-100)]">{t('review.title')}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void linkAndReview()} disabled={!eligible || busy}>
          <FileDiff size={14} aria-hidden="true" />
          {t('console.reviewActiveStChange')}
        </Button>
        {review.kind === 'running' && (
          <Button variant="secondary" size="sm" onClick={() => void cancelReview()}>
            {t('console.cancelReview')}
          </Button>
        )}
      </div>
      <div role="status" aria-live="polite" className="mt-3">
        {review.kind === 'idle' && <p>{t('review.empty')}</p>}
        {review.kind === 'unsaved' && <p>{t('console.proposalUnsaved', { path: review.path })}</p>}
        {review.kind === 'running' && (
          <p className="flex items-center gap-2">
            <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t('console.reviewingTheChangeIn')}
          </p>
        )}
        {statusKey && <p>{t(statusKey as 'console.proposalNoChange')}</p>}
      </div>
      {review.kind === 'idle' && (
        <p className="mt-2 text-xs text-[var(--color-surface-400)]">
          {desktop ? t('review.emptyHint') : t('console.changeReviewRequiresThe')}
        </p>
      )}
      {review.kind === 'result' && (
        <div className="mt-3">
          <CandidateReviewResult state={review} effectiveTheme={effectiveTheme} onSave={() => void acceptReview()} busy={busy} />
        </div>
      )}
    </div>
  );
}
