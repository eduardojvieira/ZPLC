/**
 * A tree view (UX-001): `role="tree"` with `treeitem` rows that carry `aria-level`, `aria-setsize`, `aria-posinset` and
 * `aria-expanded`. One row is in the tab order (roving tabindex); the arrows, Home and End move, Right and Left expand and
 * collapse. The behaviour is `logic/tree.ts`.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from './cx';
import { flattenTree, treeKey, type TreeNodeSpec, type TreeRow } from './logic/tree';

export interface TreeProps {
  label: string;
  nodes: readonly TreeNodeSpec[];
  /** Ids expanded at the start. */
  defaultExpanded?: readonly string[];
  selected?: string;
  onSelect?: (id: string) => void;
  renderLabel?: (row: TreeRow) => ReactNode;
  className?: string;
}

export function Tree({ label, nodes, defaultExpanded = [], selected, onSelect, renderLabel, className }: TreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(defaultExpanded));
  const rows = flattenTree(nodes, expanded);
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  const active = rows.some((row) => row.id === focusId) ? focusId! : (rows.find((row) => row.id === selected) ?? rows[0])?.id;
  const root = useRef<HTMLUListElement>(null);
  const toggle = (id: string, open: boolean): void => setExpanded((current) => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next; });
  const move = (id: string): void => { setFocusId(id); queueMicrotask(() => root.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)?.focus()); };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, row: TreeRow): void => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(row.id); return; }
    const result = treeKey(event.key, rows, row.id);
    if (!result) return;
    event.preventDefault();
    if (result.expand) toggle(result.expand.id, result.expand.open);
    if (result.active !== row.id) move(result.active);
  };
  return (
    <ul ref={root} role="tree" aria-label={label} className={cx('ui-tree', className)}>
      {rows.map((row) => (
        <li key={row.id} role="none">
          <div
            role="treeitem" data-row={row.id} tabIndex={row.id === active ? 0 : -1} aria-level={row.level} aria-setsize={row.setSize} aria-posinset={row.position}
            aria-expanded={row.expandable ? row.expanded : undefined} aria-selected={row.id === selected} className="ui-treeitem" style={{ paddingInlineStart: `${(row.level - 1) * 1}rem` }}
            onClick={() => { setFocusId(row.id); onSelect?.(row.id); if (row.expandable) toggle(row.id, !row.expanded); }} onKeyDown={(event) => onKeyDown(event, row)}
          >
            <span aria-hidden="true" className="ui-tree-twisty">{row.expandable ? (row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
            {renderLabel ? renderLabel(row) : row.label}
          </div>
        </li>
      ))}
    </ul>
  );
}
