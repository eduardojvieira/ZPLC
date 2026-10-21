/**
 * A dismissible notice that a newer release exists (REL-021): the version, the address of the release and the step that
 * updates this installation. It downloads and installs nothing; the person follows the step.
 */
import { Button } from '../ui';
import { useT } from '../i18n';
import { updateNotice, type UpdateNotice as Notice } from '../ipc/updateNotice';
import { useUpdateNotice } from '../store/updateNotice';

export function UpdateNoticeView({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const { t } = useT();
  return (
    <section
      role="status"
      aria-label={t('updateNotice.label')}
      data-update-notice={notice.latest}
      className={
        'shrink-0 border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-4 py-2 text-xs leading-5 ' +
        'text-[var(--text-secondary)]'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <p>
          <strong className="text-[var(--text-primary)]">{t('updateNotice.available', { version: notice.latest })}</strong>{' '}
          {t('updateNotice.thisIs', { current: notice.current })} {t('updateNotice.release')}{' '}
          <span className="font-mono break-all select-text">{notice.releaseUrl}</span>
        </p>
        <Button size="sm" onClick={onDismiss} aria-label={t('updateNotice.dismissLabel', { version: notice.latest })} className="shrink-0">
          {t('updateNotice.dismiss')}
        </Button>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-[var(--text-primary)]">{t('updateNotice.howTo')}</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {notice.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <p className="mt-1">{t('updateNotice.untouched')}</p>
      </details>
    </section>
  );
}

/** Shows the notice for the last answer of the check, unless it is not newer or the user dismissed it. */
export function UpdateNoticeBanner() {
  const { t } = useT();
  const result = useUpdateNotice((state) => state.result);
  const dismissed = useUpdateNotice((state) => state.dismissed);
  const dismiss = useUpdateNotice((state) => state.dismiss);
  const platform = typeof window === 'undefined' ? 'linux' : (window.electronAPI?.platform ?? 'linux');
  const notice = updateNotice(result, platform, dismissed, t);
  return notice ? <UpdateNoticeView notice={notice} onDismiss={dismiss} /> : null;
}
