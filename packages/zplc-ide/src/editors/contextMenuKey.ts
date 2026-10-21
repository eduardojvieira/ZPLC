/**
 * The keys that open a context menu without a pointer (UX-033): the context-menu key, and Shift+F10. A browser turns
 * them into a `contextmenu` event on the focused element only on some systems, so the editors do it themselves, the same
 * way everywhere: the event is sent to the element that has the focus, from where it reaches the handlers a right click
 * would, positioned at the element, so that the menu opens next to what the cursor is on.
 */

export const isContextMenuKey = (event: { key: string; shiftKey?: boolean }): boolean =>
  event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey === true);

/** Sends a `contextmenu` event to `target`, at its top left corner moved a little in, as the browser positions the key. */
export function openContextMenuOn(target: Element): void {
  const box = target.getBoundingClientRect();
  target.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: box.left + Math.min(24, box.width / 2),
      clientY: box.top + Math.min(24, box.height / 2),
    }),
  );
}
