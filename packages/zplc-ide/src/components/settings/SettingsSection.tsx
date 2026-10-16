/** The collapsible frame of one section of the project settings. */

import {
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../ui';

export interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, icon, isExpanded, onToggle, badge, children }: SettingsSectionProps) {
  return (
    <div className="bg-[var(--color-surface-800)] rounded-lg border border-[var(--color-surface-600)] overflow-hidden">
      <Button variant="ghost" onClick={onToggle} aria-expanded={isExpanded} className="w-full justify-between p-4">
        <span className="flex items-center gap-2">
          <span className="text-[var(--color-accent-blue)]">{icon}</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-surface-600)] text-[var(--color-surface-300)]">
              {badge}
            </span>
          )}
        </span>
        {isExpanded ? (
          <ChevronDown size={16} className="text-[var(--color-surface-400)]" />
        ) : (
          <ChevronRight size={16} className="text-[var(--color-surface-400)]" />
        )}
      </Button>
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-[var(--color-surface-600)]">
          {children}
        </div>
      )}
    </div>
  );
}
