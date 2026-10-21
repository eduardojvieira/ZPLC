/**
 * The context menu of a diagram canvas (UX-033): which menu opens depends on what was pressed. A press on an element or
 * a wire selects it first when it is not selected, so a menu never acts on something other than what it was opened on.
 * The menu opens at the pointer for a right click, and for the context-menu key and Shift+F10, which the browser
 * delivers as the same event on the focused element.
 */

import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { MenuItem } from '../ui';
import { canvasMenuItems, type MenuTargetKind } from './contextMenus';

interface Options {
  editor: 'fbd' | 'sfc';
  nodesRef: RefObject<Node[]>;
  edgesRef: RefObject<Edge[]>;
  readOnly: boolean;
  /** Something has been copied. */
  canPaste: () => boolean;
  /** Shows the canvas with a new selection without making it a gesture of the history. */
  show: (nodes: Node[], edges: Edge[]) => void;
  run: (command: string) => void;
  /** The instance monitor of a block, when the block is an instance that has one. */
  instanceMonitorOf?: (node: Node) => (() => void) | undefined;
}

export function useCanvasContextMenu({ editor, nodesRef, edgesRef, readOnly, canPaste, show, run, instanceMonitorOf }: Options): {
  items: MenuItem[];
  onNodeContextMenu: (event: ReactMouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: ReactMouseEvent, edge: Edge) => void;
  onPaneContextMenu: (event: ReactMouseEvent | MouseEvent) => void;
} {
  const [open, setOpen] = useState<{ target: MenuTargetKind; nodes: number; edges: number; instanceMonitor?: () => void }>({
    target: 'canvas',
    nodes: 0,
    edges: 0,
  });

  const onNodeContextMenu = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      const current = nodesRef.current ?? [];
      const keep = current.find((candidate) => candidate.id === node.id)?.selected === true;
      if (!keep)
        show(
          current.map((candidate) => ({ ...candidate, selected: candidate.id === node.id })),
          (edgesRef.current ?? []).map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        );
      const nodes = keep ? current.filter((candidate) => candidate.selected).length : 1;
      setOpen({
        target: 'node',
        nodes,
        edges: keep ? (edgesRef.current ?? []).filter((edge) => edge.selected).length : 0,
        instanceMonitor: nodes === 1 ? instanceMonitorOf?.(node) : undefined,
      });
    },
    [edgesRef, instanceMonitorOf, nodesRef, show],
  );

  const onEdgeContextMenu = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      if (!edge.selected)
        show(
          (nodesRef.current ?? []).map((node) => (node.selected ? { ...node, selected: false } : node)),
          (edgesRef.current ?? []).map((candidate) => ({ ...candidate, selected: candidate.id === edge.id })),
        );
      setOpen({ target: 'edge', nodes: 0, edges: 1 });
    },
    [edgesRef, nodesRef, show],
  );

  const onPaneContextMenu = useCallback(() => {
    setOpen({
      target: 'canvas',
      nodes: (nodesRef.current ?? []).filter((node) => node.selected).length,
      edges: (edgesRef.current ?? []).filter((edge) => edge.selected).length,
    });
  }, [edgesRef, nodesRef]);

  const items = useMemo(
    () =>
      canvasMenuItems({
        editor,
        target: open.target,
        selectedNodes: open.nodes,
        selectedEdges: open.edges,
        readOnly,
        canPaste: canPaste(),
        run,
        instanceMonitor: open.instanceMonitor,
      }),
    [canPaste, editor, open, readOnly, run],
  );
  return { items, onNodeContextMenu, onEdgeContextMenu, onPaneContextMenu };
}
