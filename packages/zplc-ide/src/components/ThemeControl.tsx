/**
 * One control for the theme: Light, Dark or High contrast. It replaces a sun/moon button and a high-contrast button
 * that read as two switches for the same thing. A native select is keyboard operable and announces its label.
 */
import { useTheme } from '../hooks/useTheme';
import { Select } from '../ui';
import { THEME_CHOICES, chooseTheme } from './ThemeControlChoices';

export function ThemeControl() {
  const { effectiveTheme, setTheme } = useTheme();
  return (
    <Select label="Theme" layout="inline" value={effectiveTheme} onChange={(event) => chooseTheme(event.target.value, setTheme)} data-theme-control>
      {THEME_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
    </Select>
  );
}
