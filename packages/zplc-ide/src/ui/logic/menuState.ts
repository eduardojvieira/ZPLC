/**
 * Keyboard behaviour of a menu (WAI-ARIA menu button pattern), as pure functions of the key and the active item.
 * Enter, Space and ArrowDown open it at the first enabled item and ArrowUp at the last; inside, the arrows, Home, End
 * and type-ahead move the active item, Enter or Space activates it, Escape closes it and returns focus to the trigger,
 * and Tab closes it and lets focus go on.
 */
import { navigationTarget } from './keyboard';
import { typeahead, type TypeaheadState } from './typeahead';

export interface MenuItemSpec {
  label: string;
  disabled?: boolean;
}

export interface MenuKeyResult {
  /** The active item after the key, or null when the key does not apply. */
  active: number | null;
  action: 'none' | 'activate' | 'close' | 'close-and-restore';
  typeahead: TypeaheadState;
}

const disabledOf =
  (items: readonly MenuItemSpec[]) =>
  (index: number): boolean =>
    items[index]?.disabled === true;

/** The item a key on the trigger opens the menu at, or null when the key does not open it. */
export function menuOpenTarget(key: string, items: readonly MenuItemSpec[]): number | null {
  if (key === 'Enter' || key === ' ' || key === 'ArrowDown')
    return navigationTarget('Home', -1, items.length, { orientation: 'vertical', isDisabled: disabledOf(items) });
  if (key === 'ArrowUp') return navigationTarget('End', -1, items.length, { orientation: 'vertical', isDisabled: disabledOf(items) });
  return null;
}

export function menuKey(key: string, active: number, items: readonly MenuItemSpec[], now: number, state: TypeaheadState): MenuKeyResult {
  const isDisabled = disabledOf(items);
  if (key === 'Escape') return { active, action: 'close-and-restore', typeahead: state };
  if (key === 'Tab') return { active, action: 'close', typeahead: state };
  if (key === 'Enter' || key === ' ') return { active, action: isDisabled(active) || active < 0 ? 'none' : 'activate', typeahead: state };
  const moved = navigationTarget(key, active, items.length, { orientation: 'vertical', isDisabled });
  if (moved !== null) return { active: moved, action: 'none', typeahead: state };
  const found = typeahead(
    state,
    key,
    now,
    items.map((item) => item.label),
    active,
    isDisabled,
  );
  return { active: found.index ?? active, action: 'none', typeahead: found.state };
}
