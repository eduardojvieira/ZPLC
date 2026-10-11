/**
 * A dismissible notice that a newer release exists (REL-021): the version, the address of the release and the step that
 * updates this installation. It downloads and installs nothing; the person follows the step.
 */
import { updateNotice, type UpdateNotice as Notice } from '../ipc/updateNotice';
import { useUpdateNotice } from '../store/updateNotice';

export function UpdateNoticeView({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <section
      role="status"
      aria-label="A newer release of ZPLC Studio is available"
      data-update-notice={notice.latest}
      className="shrink-0 border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-4 py-2 text-xs leading-5 text-[var(--text-secondary)]"
    >
      <div className="flex items-start justify-between gap-4">
        <p>
          <strong className="text-[var(--text-primary)]">ZPLC Studio {notice.latest} is available</strong> (this is {notice.current}).
          Release: <span className="font-mono break-all select-text">{notice.releaseUrl}</span>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss the notice about ZPLC Studio ${notice.latest}`}
          className="h-7 shrink-0 border border-[var(--border-color)] px-2 text-[var(--text-primary)] hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
        >
          Dismiss
        </button>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-[var(--text-primary)]">How to update</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {notice.steps.map((step) => <li key={step}>{step}</li>)}
        </ul>
        <p className="mt-1">Studio does not download or install anything. Your projects are folders you chose, so an update does not touch them.</p>
      </details>
    </section>
  );
}

/** Shows the notice for the last answer of the check, unless it is not newer or the user dismissed it. */
export function UpdateNoticeBanner() {
  const result = useUpdateNotice((state) => state.result);
  const dismissed = useUpdateNotice((state) => state.dismissed);
  const dismiss = useUpdateNotice((state) => state.dismiss);
  const platform = typeof window === 'undefined' ? 'linux' : window.electronAPI?.platform ?? 'linux';
  const notice = updateNotice(result, platform, dismissed);
  return notice ? <UpdateNoticeView notice={notice} onDismiss={dismiss} /> : null;
}
