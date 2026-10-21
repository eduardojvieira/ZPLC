/**
 * The notification list (IDE-021): what the model of `store/notifications.ts` looks like on screen. Presentational only (no
 * store), so it renders in a test without a window.
 */
import { AlertCircle, CheckCircle, CircleSlash, LoaderCircle, TriangleAlert, X } from 'lucide-react';

import type { AppNotification, NotificationStatus } from '../store/notifications';
import type { ConsoleTab } from '../types';
import { Button, IconButton } from '../ui';
import { useT, type MessageKey } from '../i18n';

const PANEL_NAMES: Partial<Record<ConsoleTab, MessageKey>> = {
  output: 'panel.output',
  problems: 'panel.problems',
  tests: 'panel.tests',
  trace: 'panel.trace',
  watch: 'panel.watch',
};

const TONE: Record<NotificationStatus, string> = {
  running: 'border-[var(--color-accent-blue)]',
  success: 'border-[var(--color-accent-green)]',
  warning: 'border-[var(--color-accent-yellow)]',
  error: 'border-[var(--color-accent-red)]',
  cancelled: 'border-[var(--color-surface-500)]',
};

function Icon({ status }: { status: NotificationStatus }) {
  const common = { size: 16, 'aria-hidden': true, className: 'mt-0.5 shrink-0' } as const;
  if (status === 'running')
    return <LoaderCircle {...common} className="mt-0.5 shrink-0 animate-spin motion-reduce:animate-none text-[var(--color-accent-blue)]" />;
  if (status === 'success') return <CheckCircle {...common} className="mt-0.5 shrink-0 text-[var(--color-accent-green)]" />;
  if (status === 'warning') return <TriangleAlert {...common} className="mt-0.5 shrink-0 text-[var(--color-accent-yellow)]" />;
  if (status === 'error') return <AlertCircle {...common} className="mt-0.5 shrink-0 text-[var(--color-accent-red)]" />;
  return <CircleSlash {...common} className="mt-0.5 shrink-0 text-[var(--color-surface-300)]" />;
}

export function NotificationList({
  items,
  onOpenDetails,
  onDismiss,
}: {
  items: AppNotification[];
  onOpenDetails: (tab: ConsoleTab) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <section
      aria-label={t('notifications.label')}
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {items.map((entry) => {
        const panelKey = PANEL_NAMES[entry.details];
        const panel = panelKey ? t(panelKey) : entry.details;
        return (
          <div
            key={entry.id}
            data-notification={entry.kind}
            data-status={entry.status}
            aria-busy={entry.status === 'running'}
            className={
              `pointer-events-auto border-l-4 border ` +
              `border-[var(--color-surface-600)] ${TONE[entry.status]} bg-[var(--color-surface-900)] p-2 text-sm ` +
              `text-[var(--color-surface-100)]`
            }
          >
            <div className="flex items-start gap-2">
              <Icon status={entry.status} />
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{entry.title}</p>
                {entry.detail && <p className="mt-0.5 text-xs break-words text-[var(--color-surface-300)]">{entry.detail}</p>}
              </div>
              <IconButton
                label={t('notifications.dismiss', { title: entry.title })}
                variant="ghost"
                size="sm"
                icon={<X size={14} aria-hidden="true" />}
                className="shrink-0"
                onClick={() => onDismiss(entry.id)}
              />
            </div>
            {entry.status === 'running' && (
              <div
                role="progressbar"
                aria-label={entry.title}
                aria-valuetext={t('notifications.inProgress')}
                className="mt-2 h-1 w-full overflow-hidden bg-[var(--color-surface-700)]"
              >
                <div className="h-full w-1/3 bg-[var(--color-accent-blue)]" />
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-details={entry.details}
                aria-label={t('notifications.detailsLabel', { title: entry.title, panel })}
                onClick={() => onOpenDetails(entry.details)}
              >
                {t('notifications.details')}
              </Button>
              {entry.recover && (
                <Button variant="secondary" size="sm" data-recover onClick={entry.recover.run}>
                  {entry.recover.label}
                </Button>
              )}
              {entry.status === 'running' && entry.cancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('notifications.cancelLabel', { title: entry.title })}
                  onClick={entry.cancel}
                >
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
