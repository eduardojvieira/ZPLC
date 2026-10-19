/**
 * The theme dropdown of the toolbar (IDE-014: split out of Toolbar.tsx).
 */

import { Sun, Moon, Monitor, Contrast } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useT } from '../i18n';
import { useDropdownMenu } from './useDropdownMenu';

export function ThemeMenu() {
  const { t } = useT();
  const { theme, setTheme, isDark } = useTheme();
  const { open, menuRef, triggerRef, firstItemRef, openMenu, closeMenu } = useDropdownMenu();
  const themeOptions = [
    { id: 'light' as const, label: t('theme.light'), icon: Sun },
    { id: 'dark' as const, label: t('theme.dark'), icon: Moon },
    { id: 'high-contrast' as const, label: t('theme.highContrast'), icon: Contrast },
    { id: 'system' as const, label: t('theme.system'), icon: Monitor },
  ];
  return (
  <div className="relative max-[1100px]:hidden" ref={menuRef} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); } }}>
    <button
      ref={triggerRef}
      type="button"
      onClick={() => open ? closeMenu() : openMenu()}
      className="focus-ring flex items-center gap-1 p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors"
      aria-label={t('toolbar.theme.label')}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls="toolbar-theme-menu"
      title={t('toolbar.theme.title', { theme: themeOptions.find((option) => option.id === theme)?.label ?? theme })}
    >
      {isDark ? <Moon size={16} /> : <Sun size={16} />}
    </button>

    {open && (
      <div id="toolbar-theme-menu" role="menu" aria-label={t('toolbar.theme.label')} className="absolute right-0 top-full mt-1 py-1 w-32 bg-[var(--color-surface-700)] border border-[var(--color-surface-600)] rounded-lg shadow-lg z-50">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isActive = theme === option.id;
          return (
            <button
              key={option.id}
              ref={option.id === themeOptions[0].id ? firstItemRef : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              aria-label={t('toolbar.theme.use', { theme: option.label.toLowerCase() })}
              onClick={() => { setTheme(option.id); closeMenu(true); }}
              className={`focus-ring w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${isActive
                ? 'bg-[var(--color-accent-blue)] text-white'
                : 'text-[var(--color-surface-100)] hover:bg-[var(--menu-item-bg-active)]'
                }`}
            >
              <Icon size={14} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    )}
  </div>
  );
}
