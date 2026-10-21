/**
 * A popover (UX-001): non-modal content anchored to a trigger, for a small form or an explanation that does not warrant a
 * dialog. The trigger carries `aria-haspopup`, `aria-expanded` and `aria-controls`; Escape or a press outside closes it and
 * Escape returns focus to the trigger.
 */
import { cloneElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { placeOverlay, type Placement } from './logic/overlayPosition';
import { Portal } from './Portal';
import { useDismiss } from './useDismiss';
import { cx } from './cx';

type TriggerProps = { onClick?: (event: unknown) => void; 'aria-haspopup'?: 'dialog'; 'aria-expanded'?: boolean; 'aria-controls'?: string };

export interface PopoverProps {
  /** The element that opens it, usually a Button or an IconButton. */
  trigger: ReactElement<TriggerProps>;
  /** Names the popover for assistive technology. */
  label: string;
  placement?: Placement;
  className?: string;
  children: ReactNode;
}

export function Popover({ trigger, label, placement = 'bottom-start', className, children }: PopoverProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) anchor.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]')?.focus();
  }, []);
  useDismiss(open, [anchor, panel], (reason) => close(reason === 'escape'));

  // Focus moves into the panel when it opens: its first control, or the panel itself.
  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    (first ?? panel.current)?.focus();
  }, [open]);

  const place = useCallback(
    (node: HTMLDivElement | null) => {
      panel.current = node;
      const target = anchor.current?.firstElementChild;
      if (!node || !target) return;
      const rect = target.getBoundingClientRect();
      const size = node.getBoundingClientRect();
      const placed = placeOverlay({
        anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        overlay: { width: size.width, height: size.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        placement,
      });
      node.style.left = `${placed.left}px`;
      node.style.top = `${placed.top}px`;
      node.style.visibility = 'visible';
    },
    [placement],
  );

  return (
    <>
      <span ref={anchor} style={{ display: 'contents' }}>
        {cloneElement(trigger, {
          onClick: (event: unknown) => {
            trigger.props.onClick?.(event);
            setOpen((current) => !current);
          },
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-controls': open ? id : undefined,
        })}
      </span>
      {open && (
        <Portal>
          <div
            ref={place}
            id={id}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className={cx('ui-popover', className)}
            style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
          >
            {children}
          </div>
        </Portal>
      )}
    </>
  );
}
