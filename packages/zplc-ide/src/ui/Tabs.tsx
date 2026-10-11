/**
 * Tabs (UX-001): a tab list with the roving tabindex and arrow-key behaviour of the WAI-ARIA tabs pattern, and the
 * panel it controls. The tab and panel ids are `${idPrefix}-tab-${id}` and `${idPrefix}-panel-${id}`, so a tab names its
 * panel (`aria-controls`) and a panel its tab (`aria-labelledby`). Keyboard behaviour is `logic/tabs.ts`.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { tabKeyResult } from './logic/tabs';
import type { Orientation } from './logic/keyboard';

export interface TabSpec {
  id: string;
  label: ReactNode;
  disabled?: boolean;
  /** A short text beside the label, such as a count. It becomes part of the tab's accessible name. */
  badge?: ReactNode;
  /** Replaces the label as the accessible name when the label is only an icon. */
  ariaLabel?: string;
}

export interface TabListProps {
  /** Names the tab list for assistive technology. */
  label: string;
  tabs: readonly TabSpec[];
  value: string;
  onValueChange: (id: string) => void;
  idPrefix: string;
  orientation?: Exclude<Orientation, 'both'>;
  activation?: 'automatic' | 'manual';
  className?: string;
}

export function TabList({ label, tabs, value, onValueChange, idPrefix, orientation = 'horizontal', activation = 'automatic', className }: TabListProps) {
  const list = useRef<HTMLDivElement>(null);
  const focusTab = (index: number): void => {
    const tab = tabs[index];
    if (tab) list.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(tab.id)}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number): void => {
    const result = tabKeyResult(event.key, index, tabs, orientation, activation);
    if (result.focus === null && result.select === null) return;
    event.preventDefault();
    if (result.focus !== null) focusTab(result.focus);
    if (result.select !== null && tabs[result.select]) onValueChange(tabs[result.select].id);
  };
  // The selected tab is the one in the tab order; when none matches, the first enabled tab is.
  const tabbable = tabs.some((tab) => tab.id === value && !tab.disabled) ? value : tabs.find((tab) => !tab.disabled)?.id;
  return (
    <div ref={list} role="tablist" aria-label={label} aria-orientation={orientation} className={cx('ui-tablist', className)}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            aria-label={tab.ariaLabel}
            disabled={tab.disabled}
            tabIndex={tab.id === tabbable ? 0 : -1}
            className="ui-tab"
            onClick={() => onValueChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            {tab.badge !== undefined && <span className="ui-tab-badge">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  idPrefix: string;
  selected: boolean;
  className?: string;
  children: ReactNode;
}

/** The panel of a tab. An unselected panel is not rendered, so it holds no focusable content. */
export function TabPanel({ id, idPrefix, selected, className, children }: TabPanelProps) {
  if (!selected) return null;
  return (
    <div id={`${idPrefix}-panel-${id}`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0} className={cx('ui-tabpanel', className)}>
      {children}
    </div>
  );
}
