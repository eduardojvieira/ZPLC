/**
 * The change review document (SHL-004, IDE-030): the editor area's home of a proposed change. It lists the pending change and shows its
 * review, with or without an AI provider; the review reads the disk and writes nothing, and only the person's accept saves.
 */
import { FileDiff, LoaderCircle } from 'lucide-react';
import { useT } from '../i18n';
import { useTheme } from '../hooks/useTheme';
import { isCandidateSourcePath } from '../ai/candidatePaths';
import { shownProjectBridge } from '../ipc/shownProjectBridge';
import { useIDEStore } from '../store/useIDEStore';
import { useReviewDocument } from '../store/useReviewDocument';
import { Button } from '../ui';
import { readFileContent } from '../utils/fileSystem';
import { changeSetIsCurrent, saveChangeSet } from './agent/changeSetReview';
import { sha256Text } from './candidateSources';
import { CandidateReviewResult, type CandidateReviewSnapshot, type CandidateReviewState } from './ConsoleReviewPanels';
import { presentCandidateChangeSetReview } from './workspaceTestPresentation';

let generation = 0;
const hold = (patch: { review?: CandidateReviewState; busy?: boolean }) => useReviewDocument.setState(patch);
const held = () => useReviewDocument.getState().review as CandidateReviewState;

const manualIsCurrent = (snapshot: CandidateReviewSnapshot): boolean => {
  const current = useIDEStore.getState();
  const file = current.loadedFiles.get(snapshot.fileId);
  return (
    current.projectSession === snapshot.projectSession &&
    current.compilerRunId === snapshot.compilerRunId &&
    current.activeFileId === snapshot.fileId &&
    current.workspaceScenarioLink?.projectSession === snapshot.projectSession &&
    current.workspaceScenarioLink.workspaceId === snapshot.workspaceId &&
    file?.path === snapshot.path &&
    file.content === snapshot.editorContent &&
    file.handle === snapshot.handle &&
    file.isModified
  );
};

/** A result whose files or session moved since the review is stale: it never shows as acceptable and never saves. */
const reviewIsCurrent = (review: CandidateReviewState): boolean =>
  review.kind !== 'result' ||
  ('files' in review.snapshot ? changeSetIsCurrent(review.snapshot, useIDEStore.getState()) : manualIsCurrent(review.snapshot));

/** Reviews the active program's unsaved change on a copy; writes nothing. */
async function reviewActiveChange(): Promise<void> {
  const current = useIDEStore.getState();
  const file = current.activeFileId ? current.loadedFiles.get(current.activeFileId) : undefined;
  const link = current.workspaceScenarioLink;
  const bridge = window.electronAPI?.candidateChangeSet;
  if (
    !bridge ||
    useReviewDocument.getState().busy ||
    !file?.handle ||
    !file.isModified ||
    !isCandidateSourcePath(file.path) ||
    !current.isProjectOpen ||
    !link ||
    link.projectSession !== current.projectSession
  )
    return;
  const mine = ++generation;
  hold({ busy: true, review: { kind: 'running' } });
  try {
    const baseline = await readFileContent(file.handle);
    const [beforeSha256, afterSha256] = await Promise.all([sha256Text(baseline), sha256Text(file.content)]);
    const snapshot: CandidateReviewSnapshot = {
      origin: 'manual',
      projectSession: current.projectSession,
      compilerRunId: current.compilerRunId,
      workspaceId: link.workspaceId,
      fileId: file.id,
      path: file.path,
      editorContent: file.content,
      candidate: file.content,
      handle: file.handle,
      beforeSha256,
      afterSha256,
      baseline,
    };
    if (mine !== generation || !manualIsCurrent(snapshot)) return;
    if (beforeSha256 === afterSha256) {
      hold({ review: { kind: 'matches-disk' } });
      return;
    }
    const result = await bridge.review({ workspaceId: snapshot.workspaceId, edit: { path: snapshot.path, content: snapshot.candidate } });
    if (mine !== generation || !manualIsCurrent(snapshot)) return;
    hold({ review: { kind: 'result', snapshot, presentation: presentCandidateChangeSetReview(result, snapshot) } });
  } catch {
    if (mine === generation) hold({ review: { kind: 'error' } });
  } finally {
    const review = held();
    hold({ busy: false, review: review.kind === 'running' || review.kind === 'cancelling' ? { kind: 'stale' } : review });
  }
}

async function cancelReview(): Promise<void> {
  if (held().kind !== 'running') return;
  generation += 1;
  hold({ review: { kind: 'cancelling' } });
  try {
    await shownProjectBridge(window.electronAPI?.workspaceTests)?.cancel();
  } catch {
    /* cancellation cannot publish a review */
  }
}

/** Saves the reviewed change. Only the person's click reaches it, and only for a result that is accepted and still current. */
async function acceptReview(): Promise<void> {
  const review = held();
  if (useReviewDocument.getState().busy || review.kind !== 'result' || review.presentation.kind !== 'accepted') return;
  if (!reviewIsCurrent(review)) {
    hold({ review: { kind: 'stale' } });
    return;
  }
  const { snapshot } = review;
  generation += 1;
  hold({ busy: true, review: { kind: 'saving' } });
  try {
    if ('files' in snapshot) {
      hold({ review: { kind: await saveChangeSet(snapshot, useIDEStore.getState) } });
      return;
    }
    const disk = await sha256Text(await readFileContent(snapshot.handle));
    if (disk !== snapshot.beforeSha256 || !manualIsCurrent(snapshot)) hold({ review: { kind: 'stale' } });
    else hold({ review: { kind: (await useIDEStore.getState().saveFile(snapshot.fileId)) ? 'saved' : 'error' } });
  } catch {
    hold({ review: { kind: 'error' } });
  } finally {
    hold({ busy: false });
  }
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
  const eligible = Boolean(
    desktop && isProjectOpen && hasLink && activeFile?.handle && activeFile.isModified && isCandidateSourcePath(activeFile.path),
  );
  const statusKey = STATUS_KEYS[review.kind];
  return (
    <div className="h-full overflow-auto p-3 font-sans text-sm text-[var(--color-surface-200)]" data-review-document>
      <h1 className="mb-3 text-base font-medium text-[var(--color-surface-100)]">{t('review.title')}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void reviewActiveChange()} disabled={!eligible || busy}>
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
