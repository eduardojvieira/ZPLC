/**
 * A tooltip (UX-001). It replaces the `title` attribute: it shows on pointer hover after a delay and at once on
 * keyboard focus, hides on Escape without moving focus, and describes its control with `aria-describedby` while
 * it is open. The timing is `logic/tooltipState.ts`, the position `logic/overlayPosition.ts`.
 */
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { INITIAL_TOOLTIP, TOOLTIP_DELAY_MS, tooltipTransition, type TooltipEvent, type TooltipPhase } from './logic/tooltipState';
import { placeOverlay, type Placement } from './logic/overlayPosition';
import { Portal } from './Portal';

export interface TooltipProps {
  content: ReactNode;
  /** A keyboard shortcut shown next to the text, e.g. "Ctrl+S". */
  shortcut?: string;
  placement?: Placement;
  /** Whether the tooltip also describes its control. Off when it only repeats the control's accessible name. */
  describes?: boolean;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

export function Tooltip({ content, shortcut, placement = 'top', describes = true, children }: TooltipProps) {
  const id = useId();
  const machine = useRef(INITIAL_TOOLTIP);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<TooltipPhase>('closed');
  const anchor = useRef<HTMLSpanElement>(null);

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
  }, [placement]);

  const open = phase === 'open';
  const child = isValidElement(children) && describes && open ? cloneElement(children, { 'aria-describedby': id }) : children;
  return (
    <>
      <span
        ref={anchor}
        style={{ display: 'contents' }}
        onPointerEnter={() => send('pointer-enter')}
        onPointerLeave={() => send('pointer-leave')}
        onPointerDown={() => send('pointer-down')}
        onFocus={() => send('focus')}
        onBlur={() => send('blur')}
        onKeyDown={(event) => { if (event.key === 'Escape' && open) { send('escape'); event.stopPropagation(); } }}
      >
        {child}
      </span>
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
