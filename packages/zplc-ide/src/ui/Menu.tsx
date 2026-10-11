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
  /** Draws a separator above this item. */
  separatorBefore?: boolean;
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
              tabIndex={-1}
              data-active={index === active || undefined}
              className="ui-menu-item"
              onPointerMove={() => { if (!item.disabled && index !== active) setActive(index); }}
              onClick={() => choose(index)}
            >
              <span>{item.label}</span>
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

export interface ContextMenuProps {
  label: string;
  items: readonly MenuItem[];
  className?: string;
  children: ReactNode;
}

/** Wraps a region so that its context-menu gesture (right click, Shift+F10, the menu key) opens `items` at the pointer. */
export function ContextMenu({ label, items, className, children }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const specs = items.map((item) => ({ label: item.label, disabled: item.disabled }));
  const close = useCallback(() => setAt(null), []);
  useDismiss(at !== null, [menu], close);
  return (
    <div
      className={className}
      onContextMenu={(event) => {
        event.preventDefault();
        setAt({ x: event.clientX, y: event.clientY });
      }}
    >
      {children}
      {at !== null && (
        <MenuSurface label={label} items={items} anchor={{ left: at.x, top: at.y, width: 0, height: 0 }} placement="bottom-start" initialActive={menuOpenTarget('Enter', specs) ?? 0} onClose={close} menuRef={menu} />
      )}
    </div>
  );
}
