/**
 * The activity rail (UX-011): Project, Search, Tests and Learn, as icon buttons with an accessible name and a tooltip.
 * Selecting one swaps the primary sidebar. The selected one is marked by a bar at its edge, a filled background and
 * `aria-current`, not by its colour alone; in the compact shell (UX-023) the labels go and the icons stay.
 */
import type { ReactNode } from 'react';
import { BookOpen, FlaskConical, FolderOpen, Search } from 'lucide-react';
import { useT, type MessageKey } from '../i18n';
import { withShortcut } from '../commands/shortcutLabels';
import type { CommandId } from '../commands/registry';
import type { ActivityView } from '../store/useShellLayout';
import { IconButton } from '../ui';
import type { ShellDensity } from './shellDensity';

interface ActivitySpec {
  view: ActivityView;
  titleKey: MessageKey;
  icon: ReactNode;
  command: CommandId | null;
}

const ACTIVITIES: readonly ActivitySpec[] = [
  { view: 'project', titleKey: 'shell.activity.project', icon: <FolderOpen size={20} />, command: 'view.showProject' },
  { view: 'search', titleKey: 'shell.activity.search', icon: <Search size={20} />, command: 'view.showSearch' },
  { view: 'tests', titleKey: 'shell.activity.tests', icon: <FlaskConical size={20} />, command: null },
  { view: 'learn', titleKey: 'shell.activity.learn', icon: <BookOpen size={20} />, command: 'view.showLearn' },
];

interface ActivityRailProps {
  active: ActivityView;
  density: ShellDensity;
  onSelect: (view: ActivityView) => void;
}

export function ActivityRail({ active, density, onSelect }: ActivityRailProps) {
  const { t } = useT();
  return (
    <nav
      aria-label={t('shell.rail.label')}
      data-activity-rail
      data-density={density}
      className={
        'activity-rail flex shrink-0 flex-col items-stretch gap-1 border-r border-[var(--color-surface-600)] ' +
        'bg-[var(--color-surface-800)] py-1'
      }
    >
      {ACTIVITIES.map((activity) => {
        const title = t(activity.titleKey);
        return (
          <div
            key={activity.view}
            className="activity-rail-item flex flex-col items-center"
            data-active={activity.view === active || undefined}
          >
            <IconButton
              label={title}
              tooltip={activity.command ? withShortcut(title, activity.command) : title}
              icon={activity.icon}
              aria-current={activity.view === active ? 'true' : undefined}
              data-activity={activity.view}
              onClick={() => onSelect(activity.view)}
            />
            {density === 'regular' && (
              <span
                aria-hidden="true"
                className="activity-rail-label text-[length:var(--font-size-caption)] leading-tight text-[var(--color-surface-300)]"
              >
                {title}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
