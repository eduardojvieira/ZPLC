/**
 * The search list of the visual editors (LNG-012): one control for the element palette, the declared symbols a variable
 * is bound from, the wires of a block and the list of commands. The state machine is `picker.ts`; this draws it.
 *
 * Focus moves into the search box when it opens and goes back to where it was when it closes. Up and Down move through
 * the list, Enter chooses, Escape closes; every other key is the search text and does not reach the editor.
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { TextField } from '../ui';
import { INITIAL_PICKER, pickerKey, pickerQuery, visibleItems, type PickerItem, type PickerKey, type PickerOptions, type PickerState } from './picker';

export interface SearchListProps extends PickerOptions {
  /** What is being chosen: it names the dialog. */
  title: string;
  items: readonly PickerItem[];
  placeholder?: string;
  /** What is shown when nothing is listed and nothing may be typed. */
  emptyText?: string;
  onChoose: (item: PickerItem) => void;
  onCancel: () => void;
}

const KEYS = new Set<string>(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter', 'Escape', 'Tab']);

export default function SearchList({ title, items, placeholder, emptyText, allowFreeText, freeTextLabel, onChoose, onCancel }: SearchListProps) {
  const [state, setState] = useState<PickerState>(INITIAL_PICKER);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);
  const listId = useId();
  const shown = useMemo(() => visibleItems(items, state.query, { allowFreeText, freeTextLabel }), [items, state.query, allowFreeText, freeTextLabel]);
  const active = Math.min(state.active, Math.max(0, shown.length - 1));

  // set while the focus is being given back, so that the blur that causes is not taken for the user leaving
  const leaving = useRef(false);
  useEffect(() => {
    leaving.current = false;
    // where the focus was when the list opened; a second run of this effect (development re-mounts it) must not take the box itself
    opener.current ??= document.activeElement;
    input.current?.focus();
    return () => {
      const back = opener.current as HTMLElement | null;
      leaving.current = true;
      // the focus goes back to where it was, unless the command that was chosen has already put it somewhere else
      const held = document.activeElement;
      if (back?.isConnected && (!held || held === document.body)) back.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listId]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // the text of the search is not a command of the editor under it
    event.stopPropagation();
    if (!KEYS.has(event.key) || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    const step = pickerKey({ ...state, active }, shown, event.key as PickerKey);
    setState(step.state);
    if (step.outcome.kind === 'choose') onChoose(step.outcome.item);
    else if (step.outcome.kind === 'cancel') onCancel();
  };

  return (
    <div
      role="dialog"
      aria-label={title}
      data-keyboard-picker
      className="absolute left-1/2 top-10 z-50 w-96 max-w-[90%] -translate-x-1/2 rounded-lg border border-[var(--border-color)] bg-[var(--color-surface-800)] text-[var(--text-primary)]"
    >
      <div className="px-3 pt-2 text-xs font-semibold text-[var(--text-secondary)]">{title}</div>
      <div className="p-2">
        <TextField
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={shown.length > 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-label={title}
          value={state.query}
          placeholder={placeholder ?? 'Type to search'}
          onChange={(event) => setState((current) => pickerQuery(current, event.target.value))}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            // leaving for another control closes the list; clicking one of its options does not leave
            if (leaving.current) return;
            const next = event.relatedTarget as Element | null;
            if (!next || !event.currentTarget.closest('[data-keyboard-picker]')?.contains(next)) onCancel();
          }}
          className="w-full"
        />
      </div>
      <ul id={listId} role="listbox" aria-label={`${title}: choices`} className="max-h-64 overflow-y-auto pb-1">
        {shown.length === 0 ? (
          <li role="presentation" className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{emptyText ?? 'Nothing matches.'}</li>
        ) : shown.map((item, index) => (
          <li
            key={item.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            data-picker-item={item.id}
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(item);
            }}
            onMouseMove={() => setState((current) => (current.active === index ? current : { ...current, active: index }))}
            className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1 text-sm ${index === active ? 'bg-[var(--color-surface-600)]' : ''}`}
          >
            <span className="min-w-0 truncate font-mono">{item.label}</span>
            {item.detail ? <span className="shrink-0 text-[length:var(--font-size-caption)] text-[var(--text-tertiary)]">{item.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
