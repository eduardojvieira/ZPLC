/**
 * The Output tab of the results panel, with its two levels (MSG-005): normal shows one line per step, detailed shows everything. The
 * tab says how many detailed lines the normal level hides, and the choice is a setting of the user (`outputLevel`).
 */
import { getEntryIcon, getEntryColor, formatTime } from '../consoleEntryStyle';
import { CommandEmptyState } from '../panelStates';
import { Switch } from '../../ui';
import { useT } from '../../i18n';
import { useAppSettings } from '../../store/useAppSettings';
import { outputLevelOf } from '../../utils/appSettings';
import { entriesForLevel } from '../../store/consoleEntries';
import type { ConsoleEntry } from '../../types';

export function OutputTab({ entries }: { entries: readonly ConsoleEntry[] }) {
  const { t, tn } = useT();
  const level = useAppSettings((state) => outputLevelOf(state.settings));
  const update = useAppSettings((state) => state.update);
  const shown = entriesForLevel(entries, level);
  const hidden = entries.length - shown.length;

  return (
    <div className="p-2 space-y-0.5" data-output-level={level}>
      <div className="flex items-center gap-3 pb-1 font-sans text-xs text-[var(--color-surface-400)]">
        <Switch
          label={t('console.output.detailed')}
          checked={level === 'detailed'}
          onChange={(event) => update({ outputLevel: event.target.checked ? 'detailed' : 'normal' })}
        />
        {hidden > 0 && <span data-output-hidden>{tn('console.output.hidden', hidden)}</span>}
      </div>
      {entries.length === 0 ? (
        <CommandEmptyState
          title={t('panel.output.empty.title')}
          description={t('panel.output.empty.description')}
          actions={['build.compile']}
        />
      ) : (
        shown.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 py-0.5 hover:bg-[var(--color-surface-700)] px-1 rounded">
            {getEntryIcon(entry.type)}
            <span className="shrink-0 text-[var(--color-surface-400)] text-xs">[{formatTime(entry.timestamp)}]</span>
            {entry.source && <span className="shrink-0 text-[var(--text-muted)] text-xs">[{entry.source}]</span>}
            <span className={getEntryColor(entry.type)}>{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
