/**
 * A combo box (UX-001): a text field that filters a list box. The input has `role="combobox"`, `aria-expanded`,
 * `aria-controls` and `aria-activedescendant` (focus stays in the input); the arrows move the active option, Enter chooses,
 * Escape closes. The behaviour is `logic/combobox.ts`.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { cx } from './cx';
import { Field } from './Field';
import { comboKey, filterOptions, type ComboOption } from './logic/combobox';

export interface ComboBoxProps {
  label: string;
  options: readonly ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ComboBox({ label, options, value, onChange, placeholder, disabled, className }: ComboBoxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shown = filterOptions(options, query ?? '');
  const choose = (option: ComboOption): void => {
    onChange(option.value);
    setQuery(null);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const next = comboKey(event.key, { open, active, count: shown.length });
    if (next.open === open && next.active === active && next.action === 'none') return;
    event.preventDefault();
    setOpen(next.open);
    setActive(next.active);
    if (next.action === 'choose' && shown[next.active] && !shown[next.active]!.disabled) choose(shown[next.active]!);
  };
  return (
    <Field label={label} controlId={id} className={className} disabled={disabled}>
      <div className="ui-combobox">
        <input
          id={id}
          type="text"
          role="combobox"
          className="ui-input"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-o${active}` : undefined}
          value={query ?? selected?.label ?? ''}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setQuery(null);
          }}
        />
        <ul id={listId} role="listbox" aria-label={label} className={cx('ui-listbox')} hidden={!open}>
          {shown.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-o${index}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              data-active={index === active || undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                if (!option.disabled) choose(option);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
    </Field>
  );
}
