/**
 * A toast (UX-001): a transient message with a tone, a word that says it and an optional action. It is a status
 * (`role="status"`) or, for a fault, an alert; it is not announced twice, because the shared announcer (LiveRegions) owns
 * the spoken message, so the toast element itself is not a live region. It does not move focus. Elevation is the overlay one.
 */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { IconButton } from './Button';
import type { Tone } from './Display';

export interface ToastProps {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
  dismissLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

export function Toast({ tone = 'info', children, action, dismissLabel, onDismiss, className }: ToastProps) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('ui-toast', className)} data-tone={tone}>
      <div className="ui-toast-body">{children}</div>
      {action}
      {onDismiss && dismissLabel && <IconButton label={dismissLabel} icon={<X size={14} />} size="sm" onClick={onDismiss} />}
    </div>
  );
}

/** Where toasts stack: a labelled region at a corner of the window. */
export function ToastRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="ui-toast-region">
      {children}
    </section>
  );
}
