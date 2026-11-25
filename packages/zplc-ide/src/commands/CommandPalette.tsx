/**
 * The command palette (UX-015): Ctrl or Cmd+Shift+P opens a list of every registered command, the person types a few
 * letters to filter it, the arrow keys choose and Enter runs. It is the keyboard route to every command, including the
 * ones without a shortcut. A command the state does not offer is listed, marked, and not run.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n';
import { useIDEStore } from '../store/useIDEStore';
import { listSceneFiles } from '../utils/fileSystem';
import { Dialog, TextField, cx } from '../ui';
import { listedCommands, runCommand, useCommandState } from './bus';
import { nextIndex, rankGroups, type GroupedEntry } from './palette';
import type { PaletteGroup } from './paletteSources/contracts';
import { buildPaletteSnapshot, paletteItems } from './paletteSources';
import { COMMAND_LIST, MENU_TITLE_KEYS, isCommandEnabled, type CommandId } from './registry';
import { shortcutText } from './shortcutLabels';
import { closeSurfaces, useCommandSurfaces } from './surfaces';

interface Row extends GroupedEntry {
  /** The id of a command, for `data-command`. */
  command?: CommandId;
  shortcut: string | null;
  enabled: boolean;
  run: () => void;
}
/** The "show all N" row at the end of a group that was cut. */
interface MoreRow {
  group: PaletteGroup;
  total: number;
}

function PaletteBody() {
  const { t, locale } = useT();
  const state = useCommandState();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<PaletteGroup>>(new Set());
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  // Read once when the palette opens: the files, objects and points of the project as they are now.
  const [scenePaths, setScenePaths] = useState<readonly string[]>([]);
  useEffect(() => {
    const handle = useIDEStore.getState().directoryHandle;
    if (handle) void listSceneFiles(handle).then(setScenePaths, () => undefined);
  }, []);
  const snapshot = useMemo(() => buildPaletteSnapshot(locale, scenePaths), [locale, scenePaths]);
  const rows = useMemo(
    (): Row[] => [
      ...listedCommands(COMMAND_LIST).map((command): Row => {
        const id = command.id as CommandId;
        return {
          id,
          command: id,
          group: 'commands',
          title: t(command.titleKey),
          category: t(MENU_TITLE_KEYS[command.category]),
          shortcut: command.shortcut ? shortcutText(id) : null,
          enabled: isCommandEnabled(command, state),
          run: () => runCommand(id, { respectEnabled: true }),
        };
      }),
      ...paletteItems(snapshot).map((item): Row => ({
        id: item.key,
        group: item.group,
        title: item.title,
        category: item.detail ?? '',
        shortcut: null,
        enabled: true,
        run: item.run,
      })),
    ],
    [t, state, snapshot],
  );
  const groups = useMemo(() => rankGroups(query, rows, expanded), [query, rows, expanded]);
  // The options in the order the arrow keys walk them: each group's rows, then its "show all" row when it was cut.
  const flat = useMemo(
    () =>
      groups.flatMap((group): Array<Row | MoreRow> => [
        ...group.entries,
        ...(group.total > group.entries.length ? [{ group: group.group, total: group.total }] : []),
      ]),
    [groups],
  );
  const current = Math.min(active, Math.max(flat.length - 1, 0));
  const optionId = (index: number): string => `${listId}-${index}`;

  const choose = (row: Row | MoreRow | undefined): void => {
    if (!row) return;
    if (!('run' in row)) return setExpanded(new Set([...expanded, row.group]));
    if (!row.enabled) return;
    closeSurfaces();
    // After the dialog has handed focus back, so that a command that opens another dialog takes it.
    setTimeout(row.run, 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(nextIndex(current, event.key === 'ArrowDown' ? 1 : -1, flat.length));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : Math.max(flat.length - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(flat[current]);
    }
  };

  // Where each group starts in `flat`.
  const starts = groups.map((_, at) =>
    groups.slice(0, at).reduce((sum, group) => sum + group.entries.length + (group.total > group.entries.length ? 1 : 0), 0),
  );
  const optionProps = (own: number) => ({
    id: optionId(own),
    role: 'option' as const,
    'aria-selected': own === current,
    onMouseMove: () => setActive(own),
    onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
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
        aria-activedescendant={flat.length > 0 ? optionId(current) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setExpanded(new Set());
        }}
        onKeyDown={onKeyDown}
      />
      {flat.length === 0 ? (
        <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">
          {t('palette.empty', { query })}
        </p>
      ) : (
        <div id={listId} role="listbox" aria-label={t('palette.list')} className="mt-3 max-h-80 overflow-y-auto">
          {groups.map((group, at) => {
            const title = t(`palette.group.${group.group}` as const);
            return (
              <div key={group.group} role="group" aria-labelledby={`${listId}-${group.group}`}>
                <div id={`${listId}-${group.group}`} className="px-3 pt-2 text-xs font-bold uppercase text-[var(--text-secondary)]">
                  {title}
                </div>
                {group.entries.map((row, at2) => {
                  const own = starts[at]! + at2;
                  return (
                    <div
                      key={row.id}
                      {...optionProps(own)}
                      aria-disabled={!row.enabled}
                      data-command={row.command}
                      onClick={() => choose(row)}
                      className={cx(
                        'flex cursor-pointer items-baseline gap-3 px-3 py-2 text-sm',
                        own === current && 'bg-[var(--color-surface-700)]',
                        !row.enabled && 'cursor-default opacity-60',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{row.title}</span>
                      <span className="shrink-0 text-[var(--text-secondary)]">
                        {row.enabled ? row.category : `${row.category} · ${t('palette.unavailable')}`}
                      </span>
                      {row.shortcut !== null && <kbd className="shrink-0 font-mono text-[var(--text-secondary)]">{row.shortcut}</kbd>}
                    </div>
                  );
                })}
                {group.total > group.entries.length &&
                  (() => {
                    const own = starts[at]! + group.entries.length;
                    return (
                      <div
                        {...optionProps(own)}
                        onClick={() => choose({ group: group.group, total: group.total })}
                        className={cx(
                          'cursor-pointer px-3 py-2 text-sm text-[var(--text-secondary)]',
                          own === current && 'bg-[var(--color-surface-700)]',
                        )}
                      >
                        {t('palette.more', { count: group.total, group: title })}
                      </div>
                    );
                  })()}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

export function CommandPalette() {
  return useCommandSurfaces().palette ? <PaletteBody /> : null;
}
