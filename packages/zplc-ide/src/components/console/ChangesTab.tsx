import { FileDiff, FolderOpen, LoaderCircle } from 'lucide-react';
import type { RefObject } from 'react';
import { Badge, Button, Tooltip } from '../../ui';
import { useT } from '../../i18n';
import { CandidateReviewResult, type CandidateReviewState } from '../ConsoleReviewPanels';
import type { useTheme } from '../../hooks/useTheme';

export interface ChangesTabProps {
  hasCurrentWorkspaceLink: boolean;
  isProjectOpen: boolean;
  candidateDesktopReady: boolean;
  candidateEligible: boolean;
  candidateReviewStateForCurrent: CandidateReviewState;
  workspaceTestBusy: boolean;
  workspaceManifestInputRef: RefObject<HTMLInputElement | null>;
  effectiveTheme: ReturnType<typeof useTheme>['effectiveTheme'];
  reviewCandidateChange: () => Promise<void>;
  cancelCandidateReview: () => Promise<void>;
  saveReviewedChange: () => Promise<void>;
}

export function ChangesTab({
  hasCurrentWorkspaceLink,
  isProjectOpen,
  candidateDesktopReady,
  candidateEligible,
  candidateReviewStateForCurrent,
  workspaceTestBusy,
  workspaceManifestInputRef,
  effectiveTheme,
  reviewCandidateChange,
  cancelCandidateReview,
  saveReviewedChange,
}: ChangesTabProps) {
  const { t } = useT();
  return (
    <div className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
      <div className="border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {!hasCurrentWorkspaceLink && isProjectOpen && candidateDesktopReady && (
            <Button variant="secondary" size="sm" onClick={() => workspaceManifestInputRef.current?.click()} disabled={workspaceTestBusy}>
              <FolderOpen size={14} aria-hidden="true" />
              {t('console.chooseZplcJson')}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void reviewCandidateChange();
            }}
            disabled={!candidateEligible || workspaceTestBusy}
          >
            <FileDiff size={14} aria-hidden="true" />
            {t('console.reviewActiveStChange')}
          </Button>
          {candidateReviewStateForCurrent.kind === 'running' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void cancelCandidateReview();
              }}
            >
              {t('console.cancelReview')}
            </Button>
          )}
        </div>
        {!candidateDesktopReady ? (
          <p role="status" aria-live="polite" className="mt-3">
            {t('console.changeReviewRequiresThe')}
          </p>
        ) : !isProjectOpen ? (
          <p role="status" aria-live="polite" className="mt-3">
            {t('console.openASavedProject')}
          </p>
        ) : !hasCurrentWorkspaceLink ? (
          <p role="status" aria-live="polite" className="mt-3">
            {t('console.chooseTheSavedWorkspace')}
          </p>
        ) : !candidateEligible ? (
          <p role="status" aria-live="polite" className="mt-3">
            {t('console.onlyAModifiedActive')}
          </p>
        ) : (
          <p className="mt-3 text-[var(--color-surface-300)]">{t('console.onlyTheActiveStructured')}</p>
        )}
        <p className="mt-2 text-xs text-[var(--color-surface-400)]">
          <Tooltip content={t('console.nativePosixHostEvidence')}>
            <span tabIndex={0}>
              <Badge tone="neutral">{t('console.hostEvidenceBadge')}</Badge>
            </span>
          </Tooltip>
        </p>
        <p className="text-xs text-[var(--color-surface-400)]">{t('console.reviewItselfDoesNot')}</p>
      </div>
      <div role="status" aria-live="polite" className="mt-3">
        {candidateReviewStateForCurrent.kind === 'matches-disk' && <p>{t('console.theActiveBufferMatches')}</p>}
        {candidateReviewStateForCurrent.kind === 'no-change' && <p>{t('console.proposalNoChange')}</p>}
        {candidateReviewStateForCurrent.kind === 'unsaved' && (
          <p>{t('console.proposalUnsaved', { path: candidateReviewStateForCurrent.path })}</p>
        )}
        {candidateReviewStateForCurrent.kind === 'running' && (
          <p className="flex items-center gap-2">
            <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t('console.reviewingTheChangeIn')}
          </p>
        )}
        {candidateReviewStateForCurrent.kind === 'cancelling' && <p>{t('console.cancellingTheReview')}</p>}
        {candidateReviewStateForCurrent.kind === 'saving' && <p>{t('console.savingReviewedChange')}</p>}
        {candidateReviewStateForCurrent.kind === 'stale' && <p>{t('console.theChangeIsNo')}</p>}
        {candidateReviewStateForCurrent.kind === 'error' && <p>{t('console.theReviewCouldNot')}</p>}
        {candidateReviewStateForCurrent.kind === 'saved' && <p>{t('console.reviewedChangeSavedReview')}</p>}
      </div>
      {candidateReviewStateForCurrent.kind === 'result' && (
        <CandidateReviewResult
          state={candidateReviewStateForCurrent}
          effectiveTheme={effectiveTheme}
          onSave={() => {
            void saveReviewedChange();
          }}
          busy={workspaceTestBusy}
        />
      )}
    </div>
  );
}
