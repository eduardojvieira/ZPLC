/**
 * A group of toggle buttons where one is on (UX-001), for a choice that is a few words, such as a view mode. Each is a
 * button with `aria-pressed`; arrow keys move between them (roving tabindex).
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { navigationTarget } from './logic/keyboard';

export interface ToggleOption { value: string; label: ReactNode; disabled?: boolean; ariaLabel?: string }

export interface ToggleGroupProps {
  label: string;
  options: readonly ToggleOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function ToggleGroup({ label, options, value, onValueChange, className }: ToggleGroupProps) {
  const group = useRef<HTMLDivElement>(null);
  const tabbable = options.some((option) => option.value === value && !option.disabled) ? value : options.find((option) => !option.disabled)?.value;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number): void => {
    const target = navigationTarget(event.key, index, options.length, { orientation: 'horizontal', isDisabled: (item) => options[item]?.disabled === true });
    if (target === null) return;
    event.preventDefault();
    group.current?.querySelectorAll<HTMLElement>('button')[target]?.focus();
  };
  return (
    <div ref={group} role="group" aria-label={label} className={cx('ui-toggle-group', className)}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          aria-label={option.ariaLabel}
          disabled={option.disabled}
          tabIndex={option.value === tabbable ? 0 : -1}
          className="ui-toggle"
          onClick={() => onValueChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
