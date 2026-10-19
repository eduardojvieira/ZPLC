/**
 * The open state, the focus handling and the click-outside close of a toolbar dropdown (IDE-014: shared by the Build
 * and theme menus, which kept two copies of it in Toolbar.tsx).
 */

import { useEffect, useRef, useState } from 'react';

export function useDropdownMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    setOpen(true);
    requestAnimationFrame(() => firstItemRef.current?.focus());
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return { open, setOpen, menuRef, triggerRef, firstItemRef, openMenu, closeMenu };
}
