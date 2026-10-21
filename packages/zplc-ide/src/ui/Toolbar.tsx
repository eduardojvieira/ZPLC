/**
 * A toolbar (UX-001): a named group of buttons that the left and right arrows move through. Every control stays in the
 * tab order; a roving tab stop is for the shell (UX-011) to add when it has the layout to need one.
 * ponytail: arrows move focus among the buttons that are in the DOM; a control that is not a button is passed over.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { navigationTarget } from './logic/keyboard';

export interface ToolbarProps {
  label: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  children: ReactNode;
}

export function Toolbar({ label, orientation = 'horizontal', className, children }: ToolbarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const controls = Array.from(bar.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
    const current = controls.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    const target = navigationTarget(event.key, current, controls.length, { orientation });
    if (target === null) return;
    event.preventDefault();
    controls[target]?.focus();
  };
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label={label}
      aria-orientation={orientation}
      className={cx('ui-toolbar', className)}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
