/**
 * The notification list (IDE-021): what the model of `store/notifications.ts` looks like on screen. Presentational only (no
 * store), so it renders in a test without a window.
 */
import { AlertCircle, CheckCircle, CircleSlash, LoaderCircle, TriangleAlert, X } from 'lucide-react';

import type { AppNotification, NotificationStatus } from '../store/notifications';
import type { ConsoleTab } from '../types';

const PANEL_NAMES: Partial<Record<ConsoleTab, string>> = { output: 'Output', problems: 'Problems', tests: 'Tests', trace: 'Trace', watch: 'Watch' };

const TONE: Record<NotificationStatus, string> = {
  running: 'border-[var(--color-accent-blue)]',
  success: 'border-[var(--color-accent-green)]',
  warning: 'border-[var(--color-accent-yellow)]',
  error: 'border-[var(--color-accent-red)]',
  cancelled: 'border-[var(--color-surface-500)]',
};

function Icon({ status }: { status: NotificationStatus }) {
  const common = { size: 16, 'aria-hidden': true, className: 'mt-0.5 shrink-0' } as const;
  if (status === 'running') return <LoaderCircle {...common} className="mt-0.5 shrink-0 animate-spin motion-reduce:animate-none text-[var(--color-accent-blue)]" />;
  if (status === 'success') return <CheckCircle {...common} className="mt-0.5 shrink-0 text-[var(--color-accent-green)]" />;
  if (status === 'warning') return <TriangleAlert {...common} className="mt-0.5 shrink-0 text-[var(--color-accent-yellow)]" />;
  if (status === 'error') return <AlertCircle {...common} className="mt-0.5 shrink-0 text-[var(--color-accent-red)]" />;
  return <CircleSlash {...common} className="mt-0.5 shrink-0 text-[var(--color-surface-300)]" />;
}

const BUTTON = 'border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-0.5 text-xs text-[var(--color-surface-100)] hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]';

export function NotificationList({ items, onOpenDetails, onDismiss }: {
  items: AppNotification[];
  onOpenDetails: (tab: ConsoleTab) => void;
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Notifications" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((entry) => {
        const panel = PANEL_NAMES[entry.details] ?? entry.details;
        return (
          <div
            key={entry.id}
            data-notification={entry.kind}
            data-status={entry.status}
            role={entry.status === 'error' ? 'alert' : 'status'}
            aria-busy={entry.status === 'running'}
            className={`pointer-events-auto border-l-4 border border-[var(--color-surface-600)] ${TONE[entry.status]} bg-[var(--color-surface-900)] p-2 text-sm text-[var(--color-surface-100)] shadow-lg`}
          >
            <div className="flex items-start gap-2">
              <Icon status={entry.status} />
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{entry.title}</p>
                {entry.detail && <p className="mt-0.5 text-xs break-words text-[var(--color-surface-300)]">{entry.detail}</p>}
              </div>
              <button type="button" className="shrink-0 p-0.5 text-[var(--color-surface-300)] hover:text-[var(--color-surface-100)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)]" aria-label={`Dismiss: ${entry.title}`} onClick={() => onDismiss(entry.id)}><X size={14} aria-hidden="true" /></button>
            </div>
            {entry.status === 'running' && (
              <div role="progressbar" aria-label={entry.title} aria-valuetext="In progress" className="mt-2 h-1 w-full overflow-hidden bg-[var(--color-surface-700)]">
                <div className="h-full w-1/3 animate-pulse motion-reduce:animate-none bg-[var(--color-accent-blue)]" />
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button type="button" data-details={entry.details} className={BUTTON} aria-label={`Details: ${entry.title} (${panel})`} onClick={() => onOpenDetails(entry.details)}>Details</button>
              {entry.status === 'running' && entry.cancel && (
                <button type="button" className={BUTTON} aria-label={`Cancel: ${entry.title}`} onClick={entry.cancel}>Cancel</button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
