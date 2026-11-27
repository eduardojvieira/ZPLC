import { useEffect, useRef } from 'react';
import type { usePanelCallbackRef } from 'react-resizable-panels';

/**
 * Keeps a collapsible panel and the visibility flag that stands for it the same, whichever one the user changed. The library reopens a
 * panel at the size it remembers from a collapse, else at minSize; a panel that started closed remembers none, so its first open is
 * given the default width.
 */
export function useCollapsible(panel: ReturnType<typeof usePanelCallbackRef>[0], visible: boolean): void {
  const remembers = useRef(false);
  useEffect(() => {
    if (!panel) return;
    if (visible && panel.isCollapsed()) {
      panel.expand();
      if (!remembers.current) panel.resize('280px');
    }
    if (!visible && !panel.isCollapsed()) {
      remembers.current = true;
      panel.collapse();
    }
  }, [panel, visible]);
}
