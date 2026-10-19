/**
 * Menu button and context menu (UX-001). The trigger is a button with `aria-haspopup="menu"` and `aria-expanded`; the
 * popup has `role="menu"` and `role="menuitem"` entries that take focus one at a time (roving), so the arrows, Home,
 * End and typing a letter move through them, Enter or Space chooses, Escape closes and returns focus to the trigger.
 * The key behaviour is `logic/menuState.ts`. A context menu is the same popup opened at the pointer.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { ICON_SIZES } from '../theme/tokens';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { cx } from './cx';
import { menuKey, menuOpenTarget } from './logic/menuState';
import { placeOverlay, type Placement } from './logic/overlayPosition';
import type { TypeaheadState } from './logic/typeahead';
import { Portal } from './Portal';
import { useDismiss } from './useDismiss';

export interface MenuItem {
  id: string;
  label: string;
  /** Shown at the right edge, e.g. "Ctrl+B". */
  shortcut?: string;
  disabled?: boolean;
  /** Why the item is disabled: shown under its label and read by a screen reader, so that a disabled item explains itself. */
  disabledReason?: string;
  /** Draws a separator above this item. */
  separatorBefore?: boolean;
  /** Styles the item as destructive (it still needs an alert dialog when it cannot be undone). */
  destructive?: boolean;
  onSelect: () => void;
}

interface MenuSurfaceProps {
  label: string;
  items: readonly MenuItem[];
  /** Where it opens: next to a trigger rectangle, or at a point. */
  anchor: { left: number; top: number; width: number; height: number };
  placement: Placement;
  initialActive: number;
  onClose: (restoreFocus: boolean) => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

function MenuSurface({ label, items, anchor, placement, initialActive, onClose, menuRef }: MenuSurfaceProps) {
  const [active, setActive] = useState(initialActive);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typing = useRef<TypeaheadState>({ buffer: '', at: 0 });

  // Focus follows the active item, so the keyboard and a screen reader are where the highlight is.
  useEffect(() => { itemRefs.current[active]?.focus(); }, [active]);

  const place = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
    if (!node) return;
    const size = node.getBoundingClientRect();
    const placed = placeOverlay({ anchor, overlay: { width: size.width, height: size.height }, viewport: { width: window.innerWidth, height: window.innerHeight }, placement, gap: 2 });
    node.style.left = `${placed.left}px`;
    node.style.top = `${placed.top}px`;
    node.style.visibility = 'visible';
  }, [anchor, placement, menuRef]);

  const choose = (index: number): void => {
    const item = items[index];
    if (!item || item.disabled) return;
    onClose(true);
    item.onSelect();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const result = menuKey(event.key, active, items, Date.now(), typing.current);
    typing.current = result.typeahead;
    if (result.action === 'close') { onClose(false); return; }
    if (result.action === 'close-and-restore') { event.preventDefault(); onClose(true); return; }
    if (event.key.length === 1 || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
    if (result.action === 'activate') { choose(active); return; }
    if (result.active !== null && result.active !== active) setActive(result.active);
  };

  return (
    <Portal>
      <div ref={place} role="menu" aria-label={label} className="ui-menu" style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }} onKeyDown={onKeyDown}>
        {items.map((item, index) => (
          <div key={item.id} role="none">
            {item.separatorBefore && <div role="separator" className="ui-menu-separator" />}
            <button
              ref={(node) => { itemRefs.current[index] = node; }}
              type="button"
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              aria-description={item.disabled ? item.disabledReason : undefined}
              tabIndex={-1}
              data-active={index === active || undefined}
              data-destructive={item.destructive || undefined}
              className="ui-menu-item"
              onPointerMove={() => { if (!item.disabled && index !== active) setActive(index); }}
              onClick={() => choose(index)}
            >
              <span>{item.label}{item.disabled && item.disabledReason && <span className="ui-menu-reason">{item.disabledReason}</span>}</span>
              {item.shortcut && <kbd className="ui-menu-shortcut">{item.shortcut}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </Portal>
  );
}

export interface MenuButtonProps {
  /** The accessible name of the menu, and of the button when no `children` are given. */
  label: string;
  items: readonly MenuItem[];
  /** The visible content of the trigger; the label when absent. */
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  placement?: Placement;
  className?: string;
}

export function MenuButton({ label, items, children, variant = 'secondary', size = 'md', placement = 'bottom-start', className }: MenuButtonProps) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ initial: number; anchor: DOMRect } | null>(null);
  const specs = items.map((item) => ({ label: item.label, disabled: item.disabled }));

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  useDismiss(open !== null, [trigger, menu], (reason) => close(reason === 'escape'));

  return (
    <>
      <Button
        ref={trigger}
        variant={variant}
        size={size}
        className={cx('ui-menu-button', className)}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open !== null ? menuId : undefined}
        aria-label={children === undefined ? undefined : label}
        onClick={(event) => setOpen(open === null ? { initial: menuOpenTarget('Enter', specs) ?? 0, anchor: event.currentTarget.getBoundingClientRect() } : null)}
        onKeyDown={(event) => {
          const target = menuOpenTarget(event.key, specs);
          if (target === null || event.key === 'Enter' || event.key === ' ') return;
          event.preventDefault();
          setOpen({ initial: target, anchor: event.currentTarget.getBoundingClientRect() });
        }}
      >
        {children ?? label}
        <ChevronDown size={ICON_SIZES.sm} aria-hidden="true" />
      </Button>
      {open !== null && (
        <MenuSurface label={label} items={items} anchor={open.anchor} placement={placement} initialActive={open.initial} onClose={close} menuRef={menu} />
      )}
    </>
  );
}

export interface PointMenuProps {
  label: string;
  items: readonly MenuItem[];
  /** Window coordinates the menu opens at; it is moved back inside the window when it would run off an edge. */
  x: number;
  y: number;
  onClose: () => void;
}

/** A menu that its owner opens at a point (the Explorer's context menu): the same popup, keys and dismissal as the others. */
export function PointMenu({ label, items, x, y, onClose }: PointMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const specs = items.map((item) => ({ label: item.label, disabled: item.disabled }));
  useDismiss(true, [menu], () => onClose());
  const anchor = { left: x, top: y, width: 0, height: 0 };
  return <MenuSurface label={label} items={items} anchor={anchor} placement="bottom-start" initialActive={menuOpenTarget('Enter', specs) ?? 0} onClose={() => onClose()} menuRef={menu} />;
}

export interface ContextMenuProps {
  label: string;
  items: readonly MenuItem[];
  className?: string;
  children: ReactNode;
}

/** Wraps a region so that its context-menu gesture (right click, Shift+F10, the menu key) opens `items` at the pointer. */
export function ContextMenu({ label, items, className, children }: ContextMenuProps) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className={className}
      onContextMenu={(event) => {
        event.preventDefault();
        setAt({ x: event.clientX, y: event.clientY });
      }}
    >
      {children}
      {at !== null && <PointMenu label={label} items={items} x={at.x} y={at.y} onClose={() => setAt(null)} />}
    </div>
  );
}
