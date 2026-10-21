/**
 * The notice of the web build (REL-037): what ZPLC in the browser lacks, listed from the one table (platform/webCapabilities),
 * with the way to the install page. It shows only in the web build, and the person can dismiss it for the visit.
 */
import { create } from 'zustand';
import { Button } from '../ui';
import { useT } from '../i18n';
import { WEB_INSTALL_PATH, WEB_PAGE_PATH, isWebBuild, webDocsLink, webMissingFeatures } from '../platform/webCapabilities';

const useWebNotice = create<{ dismissed: boolean; dismiss: () => void }>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}));

export function WebBuildNoticeView({ onDismiss }: { onDismiss: () => void }) {
  const translator = useT();
  const { t, locale } = translator;
  return (
    <section
      role="region"
      aria-label={t('web.notice.label')}
      data-web-build-notice=""
      className={
        'shrink-0 border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-4 py-2 text-xs leading-5 ' +
        'text-[var(--text-secondary)]'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <p>
          <strong className="text-[var(--text-primary)]">{t('web.notice.title')}</strong> {t('web.notice.body')}{' '}
          <a
            className="underline"
            href={webDocsLink(WEB_INSTALL_PATH, locale)}
            target="_blank"
            rel="noopener noreferrer"
            data-web-install=""
          >
            {t('web.notice.install')}
          </a>
          {' · '}
          <a className="underline" href={webDocsLink(WEB_PAGE_PATH, locale)} target="_blank" rel="noopener noreferrer">
            {t('web.notice.page')}
          </a>
        </p>
        <Button size="sm" onClick={onDismiss} aria-label={t('web.notice.dismissLabel')} className="shrink-0">
          {t('web.notice.dismiss')}
        </Button>
      </div>
      <details className="mt-1" data-web-missing="">
        <summary className="cursor-pointer text-[var(--text-primary)]">{t('web.notice.show')}</summary>
        <p className="mt-1 font-medium text-[var(--text-primary)]">{t('web.notice.list')}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {webMissingFeatures(translator).map((feature) => (
            <li key={feature.id} data-web-feature={feature.id}>
              <strong className="text-[var(--text-primary)]">{feature.title}.</strong> {feature.reason}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function WebBuildNotice() {
  const dismissed = useWebNotice((state) => state.dismissed);
  const dismiss = useWebNotice((state) => state.dismiss);
  return isWebBuild() && !dismissed ? <WebBuildNoticeView onDismiss={dismiss} /> : null;
}
