/** Combo box behaviour (WAI-ARIA combobox with a list box popup) as pure functions: filtering and the keys. */
import { navigationTarget } from './keyboard';

export interface ComboOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** The options whose label contains the query, ignoring case; all of them for an empty query. */
export function filterOptions<T extends ComboOption>(options: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle === '' ? [...options] : options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
}

export interface ComboState {
  open: boolean;
  active: number;
  count: number;
}
export interface ComboResult {
  open: boolean;
  active: number;
  action: 'none' | 'choose';
}

export function comboKey(key: string, { open, active, count }: ComboState): ComboResult {
  if (key === 'Escape') return { open: false, active: -1, action: 'none' };
  if (key === 'Enter') return open && active >= 0 ? { open: false, active, action: 'choose' } : { open, active, action: 'none' };
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (!open) return { open: true, active: navigationTarget(key === 'ArrowDown' ? 'Home' : 'End', -1, count) ?? -1, action: 'none' };
    return { open, active: navigationTarget(key, active, count, { orientation: 'vertical' }) ?? active, action: 'none' };
  }
  return { open, active, action: 'none' };
}
