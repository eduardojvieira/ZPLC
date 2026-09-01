/**
 * useTheme Hook
 * 
 * React hook to synchronize theme state with DOM and system preferences
 */

import { useEffect } from 'react';
import { applyThemeToDOM, useIDEStore, type Theme } from '../store/useIDEStore';

/**
 * Hook that manages theme application to the DOM
 * - Syncs store theme to document.documentElement class
 * - Listens for system preference changes when in 'system' mode
 */
export function useTheme() {
  const { theme, setTheme } = useIDEStore();

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      // Update data attribute for JS consumers
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Helper to cycle through themes
  const cycleTheme = () => {
    const order: Theme[] = ['light', 'dark', 'high-contrast', 'system'];
    const currentIndex = order.indexOf(theme);
    const nextIndex = (currentIndex + 1) % order.length;
    setTheme(order[nextIndex]);
  };

  // Get the effective theme (resolved 'system' to actual value)
  const getEffectiveTheme = (): 'light' | 'dark' | 'high-contrast' => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  };

  return {
    theme,
    setTheme,
    cycleTheme,
    effectiveTheme: getEffectiveTheme(),
    isDark: getEffectiveTheme() !== 'light',
  };
}
