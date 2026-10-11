/**
 * Dialog and alert dialog (UX-001). A modal dialog has a title that names it (`aria-labelledby`), an optional
 * description, focus that moves in when it opens, stays inside while it is open (Tab wraps, `logic/focusTrap.ts`) and
 * returns to the control that opened it, and Escape that closes it. The page behind it does not scroll.
 *
 * An alert dialog (`AlertDialog`) interrupts to confirm one action: its action button names the action, focus starts on
 * Cancel (so Enter or Space never confirms by accident), and neither the scrim nor a stray click dismisses it.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { ICON_SIZES } from '../theme/tokens';
import { Button } from './Button';
import { cx } from './cx';
import { trapTab } from './logic/focusTrap';
import { Portal } from './Portal';
import { registerModal } from './modalStack';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null);
}

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  /** A class for a width the sizes do not give. */
  className?: string;
  /** Show the close button in the header. */
  closeButton?: boolean;
  /** A click on the scrim closes the dialog. Off for anything that must not be dismissed by accident. */
  dismissOnScrim?: boolean;
  /** The control that takes focus when it opens; the first focusable one when absent. */
  initialFocus?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
  children: ReactNode;
}

export function Dialog({ open, onClose, title, description, size = 'md', className, closeButton = true, dismissOnScrim = true, initialFocus, footer, role = 'dialog', children }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = surface.current;
    if (!dialog) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = registerModal();
    const [first] = focusables(dialog);
    (initialFocus?.current ?? first ?? dialog).focus();

    // On the document, not on the dialog: focus is on the page after a click on the scrim or on non-focusable text.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!modal.isTop()) return;
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const list = focusables(dialog);
      const move = trapTab(list.length, list.indexOf(document.activeElement as HTMLElement), event.shiftKey);
      if (!move.prevent) return;
      event.preventDefault();
      (move.focus < 0 ? dialog : list[move.focus]).focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); modal.release(); opener?.focus?.(); };
  }, [open, initialFocus]);

  if (!open) return null;

  return (
    <Portal>
      <div className="ui-scrim" onMouseDown={(event) => { if (dismissOnScrim && event.target === event.currentTarget) onClose(); }}>
        <DialogSurface
          surfaceRef={surface}
          role={role}
          titleId={titleId}
          descriptionId={descriptionId}
          title={title}
          description={description}
          size={size}
          className={className}
          onClose={closeButton ? onClose : undefined}
          footer={footer}
        >
          {children}
        </DialogSurface>
      </div>
    </Portal>
  );
}

export interface DialogSurfaceProps {
  surfaceRef?: RefObject<HTMLDivElement | null>;
  role?: 'dialog' | 'alertdialog';
  titleId: string;
  descriptionId: string;
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  className?: string;
  /** Renders the close button when given. */
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/** The markup of a dialog with none of its behaviour, so the gallery can show it in place without taking focus. */
export function DialogSurface({ surfaceRef, role = 'dialog', titleId, descriptionId, title, description, size = 'md', className, onClose, footer, children }: DialogSurfaceProps) {
  return (
    <div
      ref={surfaceRef}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      tabIndex={-1}
      className={cx('ui-dialog', className)}
      data-size={size}
    >
      <div className="ui-dialog-header">
        <h2 id={titleId} className="ui-dialog-title">{title}</h2>
        {onClose && (
          <button type="button" className="ui-button ui-icon-button" data-variant="ghost" data-size="sm" aria-label="Close" onClick={onClose}>
            <X size={ICON_SIZES.md} aria-hidden="true" />
          </button>
        )}
      </div>
      {description !== undefined && <p id={descriptionId} className="ui-dialog-description">{description}</p>}
      <div className="ui-dialog-body">{children}</div>
      {footer !== undefined && <div className="ui-dialog-footer">{footer}</div>}
    </div>
  );
}

export interface AlertDialogProps {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  /** The name of the action, a verb phrase: "Stop PLC and deploy", never "OK". */
  actionLabel: string;
  cancelLabel?: string;
  /** Styles the action as destructive. */
  destructive?: boolean;
  onAction: () => void;
  onCancel: () => void;
  busy?: boolean;
  children?: ReactNode;
}

export function AlertDialog({ open, title, description, actionLabel, cancelLabel = 'Cancel', destructive = false, onAction, onCancel, busy = false, children }: AlertDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={() => { if (!busy) onCancel(); }}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
      closeButton={false}
      dismissOnScrim={false}
      initialFocus={cancel}
      footer={(
        <>
          <Button ref={cancel} onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onAction} disabled={busy}>{actionLabel}</Button>
        </>
      )}
    >
      {children}
    </Dialog>
  );
}
