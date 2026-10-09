/**
 * One control for the theme: Light, Dark or High contrast. It replaces a sun/moon button and a high-contrast button
 * that read as two switches for the same thing. A native select is keyboard operable and announces its label.
 */
import { useTheme } from '../hooks/useTheme';
import { THEME_CHOICES, chooseTheme } from './ThemeControlChoices';

export function ThemeControl() {
  const { effectiveTheme, setTheme } = useTheme();
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
      <span>Theme</span>
      <select
        value={effectiveTheme}
        onChange={(event) => chooseTheme(event.target.value, setTheme)}
        data-theme-control
        className="h-9 border border-[var(--border-color)] bg-[var(--color-surface-800)] px-2 text-sm text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
      >
        {THEME_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>
  );
}
