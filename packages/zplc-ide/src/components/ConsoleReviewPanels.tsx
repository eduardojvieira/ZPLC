/**
 * The Changes and Agent tabs' pieces of the lower workbench: the reviewed-change result and the provider status line (IDE-014: split out of
 * Console.tsx).
 */

import { DiffEditor } from './monacoRuntime';
import { type CandidateChangeSetReviewPresentation } from './workspaceTestPresentation';
import { type AiProviderStatusPresentation } from './aiProviderPresentation';
import { type AgentResponsePresentation } from './agent/agentResponse';
import { type ChangeSetSnapshot } from './agent/changeSetReview';
import { MONACO_THEME_ID } from '../utils/monaco-themes';
import { Badge, Button, Tooltip } from '../ui';
import { useT } from '../i18n';

/** The review of the person's own modified buffer: one program, saved by the same click. */
export type CandidateReviewSnapshot = {
  origin: 'manual';
  projectSession: number;
  compilerRunId: number;
  workspaceId: string;
  fileId: string;
  path: string;
  editorContent: string;
  candidate: string;
  handle: FileSystemFileHandle;
  beforeSha256: string;
  afterSha256: string;
  baseline: string;
};
export type CandidateReviewState =
  | { kind: 'idle' | 'matches-disk' | 'running' | 'cancelling' | 'saving' | 'stale' | 'error' | 'saved' | 'no-change' }
  | { kind: 'unsaved'; path: string }
  /** `snapshot` is a change set of the assistant when it has `files`: every difference is shown, and one click saves them all. */
  | { kind: 'result'; snapshot: CandidateReviewSnapshot | ChangeSetSnapshot; presentation: CandidateChangeSetReviewPresentation };
export type AgentEditIdentity = {
  projectSession: number;
  compilerRunId: number;
  workspaceId: string;
  fileId: string;
  path: string;
  content: string;
  handle: FileSystemFileHandle;
  baselineSha256: string;
};
export type AgentState =
  | 'idle'
  | 'loading'
  | 'sending'
  | 'cancelling'
  | 'unavailable'
  | 'error'
  | { kind: 'response'; presentation: AgentResponsePresentation; expectedEdit?: AgentEditIdentity };

export function CandidateReviewResult({
  state,
  effectiveTheme,
  onSave,
  busy,
}: {
  state: Extract<CandidateReviewState, { kind: 'result' }>;
  effectiveTheme: 'light' | 'dark' | 'high-contrast';
  onSave: () => void;
  busy: boolean;
}) {
  const { t, tn } = useT();
  const { presentation, snapshot } = state;
  const accepted = presentation.kind === 'accepted';
  // the person's own buffer is one file; a change set of the assistant is several, each with its difference
  const files =
    'files' in snapshot
      ? snapshot.files.map(({ path, kind, baseline, candidate }) => ({ path, kind, original: baseline, modified: candidate }))
      : [{ path: snapshot.path, kind: 'modify' as const, original: snapshot.baseline, modified: snapshot.candidate }];
  return (
    <section
      className="space-y-3 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3"
      aria-label={t('console.changeReviewResult')}
    >
      <h2 className="font-medium text-[var(--color-surface-100)]">
        {'files' in snapshot ? tn('console.reviewChangeSet', files.length) : t('console.review', { path: snapshot.path })}
      </h2>
      <p
        className={
          accepted
            ? 'text-[var(--color-accent-green)]'
            : presentation.kind === 'rejected'
              ? 'text-[var(--color-accent-yellow)]'
              : 'text-[var(--color-accent-red)]'
        }
      >
        {accepted
          ? t('console.acceptedTheChangePassed')
          : presentation.kind === 'rejected'
            ? t('console.rejectedTheChangeWas')
            : t('console.invalidTheReviewResult')}
      </p>
      <dl className="grid gap-x-4 gap-y-1 border-y border-[var(--color-surface-600)] py-2 text-xs sm:grid-cols-2">
        {presentation.artifacts.map((artifact) => (
          <div key={artifact.kind} className="flex justify-between gap-2">
            <dt>{artifact.kind === 'zplc' ? t('console.zplcProgram') : t('panel.trace')}</dt>
            <Tooltip content={artifact.sha256}>
              <dd
                className="break-all tabular-nums"
                tabIndex={0}
                aria-label={
                  artifact.kind === 'zplc'
                    ? t('console.zplcProgramSha256', { sha256: artifact.sha256 })
                    : t('console.traceSha256', { sha256: artifact.sha256 })
                }
              >
                {t('console.bytes', { value: artifact.sha256.slice(0, 12), byteLength: artifact.byteLength })}
              </dd>
            </Tooltip>
          </div>
        ))}
        {presentation.savedTestInputIdentity && (
          <div className="flex justify-between gap-2 sm:col-span-2">
            <dt>{t('console.savedInputIdentity')}</dt>
            <Tooltip content={presentation.savedTestInputIdentity.sha256}>
              <dd
                className="break-all tabular-nums"
                tabIndex={0}
                aria-label={t('console.savedInputIdentitySha', { sha256: presentation.savedTestInputIdentity.sha256 })}
              >
                {presentation.savedTestInputIdentity.sha256.slice(0, 12)} ·{' '}
                {tn('console.files', presentation.savedTestInputIdentity.fileCount)}
              </dd>
            </Tooltip>
          </div>
        )}
        {presentation.diagnostics.map((diagnostic) => (
          <div key={diagnostic.code} className="sm:col-span-2">
            <dt className="inline">{t('console.diagnostic')} </dt>
            <dd className="inline">{diagnostic.code}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-1 text-xs text-[var(--color-surface-300)] sm:grid-cols-2">
        <span>{t('console.savedOnDisk')}</span>
        <span>{'files' in snapshot ? t('console.proposedChange') : t('console.currentEditorBuffer')}</span>
      </div>
      {files.map((file) => (
        <div key={file.path} className="space-y-1">
          {'files' in snapshot && (
            <h3 className="flex items-center gap-2 text-xs font-medium text-[var(--color-surface-200)]">
              <span className="break-all">{file.path}</span>
              <Badge tone="neutral">{file.kind === 'create' ? t('console.newFile') : t('console.changedFile')}</Badge>
            </h3>
          )}
          <div className="h-72 border border-[var(--color-surface-600)]">
            <DiffEditor
              original={file.original}
              modified={file.modified}
              language={file.path.endsWith('.json') ? 'json' : file.path.endsWith('.st') ? 'st' : 'plaintext'}
              theme={MONACO_THEME_ID[effectiveTheme]}
              options={{
                readOnly: true,
                automaticLayout: true,
                minimap: { enabled: false },
                wordWrap: 'on',
                accessibilitySupport: 'on',
                scrollBeyondLastLine: false,
                renderSideBySide: true,
              }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--color-surface-400)]">
        <Tooltip content={t('console.nativePosixHostEvidence')}>
          <span tabIndex={0}>
            <Badge tone="neutral">{t('console.hostEvidenceBadge')}</Badge>
          </span>
        </Tooltip>
      </p>
      <p className="text-xs text-[var(--color-surface-400)]">{t('console.noFileHasBeen')}</p>
      {accepted && (
        <Button variant="secondary" size="sm" onClick={onSave} disabled={busy}>
          {t('console.saveReviewedChange')}
        </Button>
      )}
    </section>
  );
}

export function AgentStatus({ state, status }: { state: AgentState; status: AiProviderStatusPresentation }) {
  const { t } = useT();
  if (state === 'loading')
    return (
      <p role="status" className="text-xs text-[var(--color-surface-400)]">
        {t('console.checkingProviderConfiguration')}
      </p>
    );
  if (state === 'sending')
    return (
      <p role="status" className="text-xs text-[var(--color-surface-300)]">
        {t('console.sendingExplicitProviderRequest')}
      </p>
    );
  if (state === 'cancelling')
    return (
      <p role="status" className="text-xs text-[var(--color-surface-300)]">
        {t('console.cancellingProviderRequest')}
      </p>
    );
  if (state === 'unavailable')
    return (
      <p role="status" className="text-xs text-[var(--color-accent-yellow)]">
        {t('console.agentIsUnavailableIn')}
      </p>
    );
  if (state === 'error')
    return (
      <p role="status" className="text-xs text-[var(--color-accent-yellow)]">
        {t('console.agentRequestIsNo')}
      </p>
    );
  if (status.kind === 'invalid')
    return (
      <p role="status" className="text-xs text-[var(--color-surface-400)]">
        {t('console.providerStatusHasNot')}
      </p>
    );
  if (status.kind === 'unavailable')
    return (
      <p role="status" className="text-xs text-[var(--color-accent-yellow)]">
        {status.vaultReason
          ? t('console.vaultUnavailableKeysAre', { vaultReason: status.vaultReason })
          : t('console.vaultUnavailableKeysAre2')}
      </p>
    );
  return (
    <p role="status" className="text-xs text-[var(--color-surface-400)]">
      {t('console.providerStatus', {
        provider: status.enabled ? t('console.enabled') : t('console.disabled'),
        key: status.keyStored ? t('console.stored') : t('console.notStored'),
      })}
    </p>
  );
}
