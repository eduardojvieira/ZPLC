/** Tree view behaviour (WAI-ARIA tree pattern) as pure functions: the visible rows and the arrow keys. */
export interface TreeNodeSpec { id: string; label: string; children?: readonly TreeNodeSpec[] }
export interface TreeRow { id: string; label: string; level: number; setSize: number; position: number; parent: string | null; expandable: boolean; expanded: boolean }

/** The rows a person sees: a node's children only when it is expanded. Level, set size and position are 1-based (aria-level, -setsize, -posinset). */
export function flattenTree(nodes: readonly TreeNodeSpec[], expanded: ReadonlySet<string>, level = 1, parent: string | null = null): TreeRow[] {
  return nodes.flatMap((node, index) => {
    const expandable = (node.children?.length ?? 0) > 0;
    const open = expandable && expanded.has(node.id);
    const row: TreeRow = { id: node.id, label: node.label, level, setSize: nodes.length, position: index + 1, parent, expandable, expanded: open };
    return open ? [row, ...flattenTree(node.children!, expanded, level + 1, node.id)] : [row];
  });
}

export interface TreeKeyResult { active: string; expand: { id: string; open: boolean } | null }

/** The active row and the expansion a key causes, or null when the key is not a tree key. */
export function treeKey(key: string, rows: readonly TreeRow[], active: string, _expanded: ReadonlySet<string>): TreeKeyResult | null {
  const index = rows.findIndex((row) => row.id === active);
  const row = rows[index];
  if (!row) return null;
  const go = (target: TreeRow | undefined): TreeKeyResult => ({ active: target?.id ?? active, expand: null });
  switch (key) {
    case 'ArrowDown': return go(rows[index + 1]);
    case 'ArrowUp': return go(rows[index - 1]);
    case 'Home': return go(rows[0]);
    case 'End': return go(rows[rows.length - 1]);
    case 'ArrowRight':
      if (row.expandable && !row.expanded) return { active, expand: { id: active, open: true } };
      return row.expandable ? go(rows[index + 1]) : go(undefined);
    case 'ArrowLeft':
      if (row.expandable && row.expanded) return { active, expand: { id: active, open: false } };
      return go(rows.find((candidate) => candidate.id === row.parent));
    default: return null;
  }
}
