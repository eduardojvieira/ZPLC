/**
 * The review flow of a proposed change (SHL-004, IDE-030), held once in the review document's store: the editor area's document and the
 * Changes tab of the results panel both read that state and act through these functions. The review reads the disk and writes nothing,
 * and only the person's accept saves: an accepted result that is still current and whose disk hash still matches.
 */
import { isCandidateSourcePath } from '../ai/candidatePaths';
import { shownProjectBridge } from '../ipc/shownProjectBridge';
import { useIDEStore } from '../store/useIDEStore';
import { useReviewDocument } from '../store/useReviewDocument';
import { readFileContent } from '../utils/fileSystem';
import { changeSetIsCurrent, reviewChangeSet, saveChangeSet, type ChangeSetReviewBridge } from './agent/changeSetReview';
import { sha256Text } from './candidateSources';
import type { CandidateReviewSnapshot, CandidateReviewState } from './ConsoleReviewPanels';
import { presentCandidateChangeSetReview } from './workspaceTestPresentation';

let generation = 0;
/** A change of project, build or program makes the review in flight stale (it is never published). */
export const invalidateReview = (): void => {
  generation += 1;
};
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
export const reviewIsCurrent = (review: CandidateReviewState): boolean =>
  review.kind !== 'result' ||
  ('files' in review.snapshot ? changeSetIsCurrent(review.snapshot, useIDEStore.getState()) : manualIsCurrent(review.snapshot));

/** Reviews the active program's unsaved change on a copy; writes nothing. */
export async function reviewActiveChange(): Promise<void> {
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

export async function cancelReview(): Promise<void> {
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
export async function acceptReview(): Promise<void> {
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
    const diskHash = await sha256Text(await readFileContent(snapshot.handle));
    if (diskHash !== snapshot.beforeSha256 || !manualIsCurrent(snapshot)) hold({ review: { kind: 'stale' } });
    else hold({ review: { kind: (await useIDEStore.getState().saveFile(snapshot.fileId)) ? 'saved' : 'error' } });
  } catch {
    hold({ review: { kind: 'error' } });
  } finally {
    hold({ busy: false });
  }
}

/** Reviews the assistant's change set on a copy; the review is proposed to the person with one notice (SHL-010) and nothing moves. */
export async function reviewProposal(
  changes: Parameters<typeof reviewChangeSet>[0],
  workspaceId: string,
  bridge: ChangeSetReviewBridge,
): Promise<void> {
  const mine = ++generation;
  hold({ busy: true, review: { kind: 'running' } });
  try {
    // every file of the proposal is read from the disk and checked against what the host read, then the whole set is reviewed on a copy
    const outcome = await reviewChangeSet(changes, {
      workspaceId,
      bridge,
      getState: useIDEStore.getState,
      isCurrent: () => mine === generation,
    });
    if (mine !== generation) return;
    if (outcome.kind === 'result') useReviewDocument.getState().propose(outcome);
    else hold({ review: outcome });
  } catch {
    if (mine === generation) hold({ review: { kind: 'error' } });
  } finally {
    hold({ busy: false });
  }
}
