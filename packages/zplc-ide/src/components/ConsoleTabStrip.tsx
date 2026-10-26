/**
 * The tabs of the workbench panels, split out of Console.tsx (IDE-014). Every tab shows its icon and its name when they
 * all fit. When they do not (ten tabs, Spanish names, a narrow window), the open tab keeps its name and the others show
 * their icon and their count, with the name in a tooltip and for assistive technology, so no tab sits behind a sideways
 * scroll.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ConsoleTab } from '../types';
import { Button, Tooltip } from '../ui';
import { useT } from '../i18n';

export interface ConsoleTabFace {
  id: ConsoleTab;
  label: string;
  icon: ReactNode;
  /** Words after the name (the Problems counts), shown only when every name fits. */
  summary?: string;
  count?: ReactNode;
  ariaLabel?: string;
}

function consoleTabAfterKey(tabs: ConsoleTab[], activeTab: ConsoleTab, key: string): ConsoleTab | null {
  const index = tabs.indexOf(activeTab);
  if (index < 0) return null;
  if (key === 'Home') return tabs[0] ?? null;
  if (key === 'End') return tabs.at(-1) ?? null;
  if (key === 'ArrowLeft') return tabs[(index - 1 + tabs.length) % tabs.length] ?? null;
  if (key === 'ArrowRight') return tabs[(index + 1) % tabs.length] ?? null;
  return null;
}

export function ConsoleTabStrip({
  tabs,
  activeConsoleTab,
  onSelect,
}: {
  tabs: ConsoleTabFace[];
  activeConsoleTab: ConsoleTab;
  onSelect: (tab: ConsoleTab) => void;
}) {
  const { t } = useT();
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // What the names were measured for. A new width, open tab, name or count measures them again with every name shown,
  // before the strip is painted, so the strip never flickers and never settles on a stale choice.
  const fitKey = `${width}|${activeConsoleTab}|${tabs
    .map((tab) => `${tab.label}${tab.summary ?? ''}${tab.ariaLabel ?? ''}${typeof tab.count === 'number' ? tab.count : ''}`)
    .join('|')}`;
  const [tooWideFor, setTooWideFor] = useState('');
  const compact = tooWideFor === fitKey;
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip && !compact && strip.scrollWidth > strip.clientWidth + 1) setTooWideFor(fitKey);
  }, [compact, fitKey]);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(strip.clientWidth));
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={t('console.workbenchPanels')}
      className="flex h-full min-w-0 flex-1 items-center overflow-x-auto"
      data-compact={compact || undefined}
    >
      {tabs.map((tab) => {
        const short = compact && tab.id !== activeConsoleTab;
        // The tooltip is there whether the name shows or not: adding it only to a short tab would put the button under
        // another element and mount it again at each measure, which drops a click in progress and the keyboard focus.
        return (
          <Tooltip key={tab.id} content={tab.label} describes={false}>
            <Button
              variant="bare"
              id={`console-tab-${tab.id}`}
              role="tab"
              aria-selected={activeConsoleTab === tab.id}
              aria-controls={`console-panel-${tab.id}`}
              aria-label={tab.ariaLabel}
              tabIndex={activeConsoleTab === tab.id ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                const nextTab = consoleTabAfterKey(
                  tabs.map(({ id }) => id),
                  activeConsoleTab,
                  event.key,
                );
                if (!nextTab) return;
                event.preventDefault();
                onSelect(nextTab);
                document.getElementById(`console-tab-${nextTab}`)?.focus();
              }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap py-1 text-sm transition-colors ${short ? 'px-2' : 'px-3'} ${
                activeConsoleTab === tab.id
                  ? 'text-[var(--color-surface-100)] border-b-2 border-[var(--color-accent-blue)]'
                  : 'text-[var(--color-surface-300)] hover:text-[var(--color-surface-100)]'
              }`}
            >
              {tab.icon}
              <span className={short ? 'sr-only' : undefined}>{tab.label}</span>
              {tab.summary !== undefined && (
                <span className={short ? 'sr-only' : 'ml-1 hidden text-xs tabular-nums md:inline'}>{tab.summary}</span>
              )}
              {tab.count !== undefined && <span className="ml-1">{tab.count}</span>}
            </Button>
          </Tooltip>
        );
      })}
    </div>
  );
}
