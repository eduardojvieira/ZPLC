/**
 * The command palette (UX-015): Ctrl or Cmd+Shift+P opens a list of every registered command, the person types a few
 * letters to filter it, the arrow keys choose and Enter runs. It is the keyboard route to every command, including the
 * ones without a shortcut. A command the state does not offer is listed, marked, and not run.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n';
import { Dialog, TextField, cx } from '../ui';
import { runCommand, useCommandState } from './bus';
import { filterEntries, nextIndex, type PaletteEntry } from './palette';
import { COMMAND_LIST, MENU_TITLE_KEYS, isCommandEnabled, type CommandId } from './registry';
import { shortcutText } from './shortcutLabels';
import { closeSurfaces, useCommandSurfaces } from './surfaces';

interface Row extends PaletteEntry { id: CommandId; shortcut: string | null; enabled: boolean }

function PaletteBody() {
  const { t } = useT();
  const state = useCommandState();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const rows = useMemo((): Row[] => COMMAND_LIST.map((command) => ({
    id: command.id as CommandId,
    title: t(command.titleKey),
    category: t(MENU_TITLE_KEYS[command.category]),
    shortcut: command.shortcut ? shortcutText(command.id as CommandId) : null,
    enabled: isCommandEnabled(command, state),
  })), [t, state]);
  const shown = useMemo(() => filterEntries(query, rows), [query, rows]);
  const current = Math.min(active, Math.max(shown.length - 1, 0));

  const choose = (row: Row | undefined): void => {
    if (!row || !row.enabled) return;
    closeSurfaces();
    // After the dialog has handed focus back, so that a command that opens another dialog takes it.
    setTimeout(() => runCommand(row.id, { respectEnabled: true }), 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(nextIndex(current, event.key === 'ArrowDown' ? 1 : -1, shown.length));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : Math.max(shown.length - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(shown[current]);
    }
  };

  return (
    <Dialog open onClose={closeSurfaces} title={t('palette.title')} description={t('palette.description')} size="md" initialFocus={input}>
      <TextField
        ref={input}
        aria-label={t('palette.label')}
        placeholder={t('palette.placeholder')}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? `${listId}-${current}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
      />
      {shown.length === 0 ? (
        <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{t('palette.empty', { query })}</p>
      ) : (
        <ul id={listId} role="listbox" aria-label={t('palette.list')} className="mt-3 max-h-80 overflow-y-auto">
          {shown.map((row, index) => (
            <li
              key={row.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              aria-disabled={!row.enabled}
              data-command={row.id}
              onMouseMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(row)}
              className={cx('flex cursor-pointer items-baseline gap-3 px-3 py-2 text-sm', index === current && 'bg-[var(--color-surface-700)]', !row.enabled && 'cursor-default opacity-60')}
            >
              <span className="min-w-0 flex-1 truncate">{row.title}</span>
              <span className="shrink-0 text-[var(--text-secondary)]">{row.enabled ? row.category : `${row.category} · ${t('palette.unavailable')}`}</span>
              {row.shortcut !== null && <kbd className="shrink-0 font-mono text-[var(--text-secondary)]">{row.shortcut}</kbd>}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function CommandPalette() {
  return useCommandSurfaces().palette ? <PaletteBody /> : null;
}
