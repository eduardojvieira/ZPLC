/**
 * A separator between two panels of a resizable group (UX-017). The panel library gives it `role="separator"`, the
 * orientation, the value, its limits, the arrow keys (5 %), Home, End and the double click that restores the default
 * size; this adds a name, the larger Shift+arrow step, and the hover, active and focus styles of index.css.
 */
import { useEffect, useRef } from 'react';
import { Separator, type GroupImperativeHandle } from 'react-resizable-panels';
import { moveSeparator, withLeadingSize } from '../layout/separatorSteps';

interface PanelSeparatorProps {
  id: string;
  /** What it resizes, for the accessible name. */
  label: string;
  /** The group the separator is in, and the ids of the panels on each side of it. */
  group: GroupImperativeHandle | null;
  leading: string;
  trailing: string;
}

export function PanelSeparator({ id, label, group, leading, trailing }: PanelSeparatorProps) {
  const element = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = element.current;
    if (!node || !group) return undefined;
    // In the capture phase and only for Shift+arrow: the library's own handler skips an event that was handled first.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.shiftKey || !event.key.startsWith('Arrow')) return;
      const now = Number(node.getAttribute('aria-valuenow'));
      const next = moveSeparator({
        now,
        min: Number(node.getAttribute('aria-valuemin')),
        max: Number(node.getAttribute('aria-valuemax')),
        // the separator's own orientation is the bar's; the key axis follows the group's, which is the other one
        orientation: node.getAttribute('aria-orientation') === 'vertical' ? 'horizontal' : 'vertical',
        key: event.key,
        shiftKey: true,
      });
      const layout = next === null ? null : withLeadingSize(group.getLayout(), leading, trailing, next);
      if (!layout) return;
      event.preventDefault();
      event.stopPropagation();
      group.setLayout(layout);
    };
    node.addEventListener('keydown', onKeyDown, true);
    return () => node.removeEventListener('keydown', onKeyDown, true);
  }, [group, leading, trailing]);

  return <Separator id={id} elementRef={element} aria-label={label} />;
}
