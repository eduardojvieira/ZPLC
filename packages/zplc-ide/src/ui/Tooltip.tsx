/**
 * A tooltip (UX-001). It replaces the `title` attribute: it shows on pointer hover after a delay and at once on
 * keyboard focus, hides on Escape without moving focus, and describes its control with `aria-describedby` while
 * it is open. The timing is `logic/tooltipState.ts`, the position `logic/overlayPosition.ts`.
 *
 * It adds no element of its own: it gives its child the pointer, focus and key handlers and a ref, so the child stays
 * where its parent's markup puts it (a `dd` in a `dl`, a button in a toolbar). The child must take those props: a DOM
 * element or a component that passes its rest props to one, as the kit's controls do.
 */
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ElementType, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { INITIAL_TOOLTIP, TOOLTIP_DELAY_MS, tooltipTransition, type TooltipEvent, type TooltipPhase } from './logic/tooltipState';
import { placeOverlay, type Placement } from './logic/overlayPosition';
import { Portal } from './Portal';

interface TooltipTargetProps {
  'aria-describedby'?: string;
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  ref?: Ref<HTMLElement>;
}

export interface TooltipProps {
  content: ReactNode;
  /** A keyboard shortcut shown next to the text, e.g. "Ctrl+S". */
  shortcut?: string;
  placement?: Placement;
  /** Whether the tooltip also describes its control. Off when it only repeats the control's accessible name. */
  describes?: boolean;
  children: ReactElement<TooltipTargetProps, ElementType>;
}

export function Tooltip({ content, shortcut, placement = 'top', describes = true, children }: TooltipProps) {
  const id = useId();
  const machine = useRef(INITIAL_TOOLTIP);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<TooltipPhase>('closed');

  const send = useCallback(function send(event: TooltipEvent): void {
    const step = tooltipTransition(machine.current, event);
    machine.current = step.state;
    if (step.timer !== null && timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    if (step.timer === 'start') timer.current = setTimeout(() => send('delay-elapsed'), TOOLTIP_DELAY_MS);
    setPhase(step.state.phase);
  }, []);

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  // Placed imperatively on mount, once the bubble has a size: it starts hidden so it never flashes at the corner.
  // ponytail: not re-placed when the content or the window changes while it is open; a tooltip lives a few seconds.
  const place = useCallback((node: HTMLDivElement | null) => {
    const target = anchor.current;
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
  }, [placement]);

  if (!isValidElement(children)) return children;
  const own = children.props;
  const open = phase === 'open';
  const target = cloneElement(children, {
    'aria-describedby': describes && open ? [own['aria-describedby'], id].filter(Boolean).join(' ') : own['aria-describedby'],
    onPointerEnter: (event) => { own.onPointerEnter?.(event); send('pointer-enter'); },
    onPointerLeave: (event) => { own.onPointerLeave?.(event); send('pointer-leave'); },
    onPointerDown: (event) => { own.onPointerDown?.(event); send('pointer-down'); },
    onFocus: (event) => { own.onFocus?.(event); send('focus'); },
    onBlur: (event) => { own.onBlur?.(event); send('blur'); },
    onKeyDown: (event) => {
      own.onKeyDown?.(event);
      if (event.key === 'Escape' && machine.current.phase !== 'closed') { send('escape'); event.stopPropagation(); }
    },
    ref: (node: HTMLElement | null) => {
      anchor.current = node;
      if (typeof own.ref === 'function') own.ref(node);
      else if (own.ref && typeof own.ref === 'object') (own.ref as { current: HTMLElement | null }).current = node;
    },
  });
  return (
    <>
      {target}
      {open && (
        <Portal>
          <div ref={place} id={id} role="tooltip" className="ui-tooltip" style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}>
            {content}
            {shortcut && <kbd className="ui-tooltip-shortcut">{shortcut}</kbd>}
          </div>
        </Portal>
      )}
    </>
  );
}
