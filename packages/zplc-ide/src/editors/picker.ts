
import { t } from '../i18n';/**
 * The search list of the visual editors (LNG-012): the palette of elements, the declared symbols a variable is bound
 * from, the wires a block can have, and the list of commands are all one list with a search box, driven from the
 * keyboard. This is its state machine, with no screen in it.
 */

export interface PickerItem {
  id: string;
  label: string;
  /** What is said next to the label: a type, a direction. It is searched too. */
  detail?: string;
  /** The heading it is listed under. */
  group?: string;
  /** More words that find it. */
  keywords?: readonly string[];
}

export interface PickerState {
  query: string;
  /** Index into the items that the query leaves visible. */
  active: number;
}

export const INITIAL_PICKER: PickerState = { query: '', active: 0 };

/** The text of an item the free text is turned into; the id carries the typed text after this prefix. */
export const FREE_TEXT_PREFIX = 'text:';

/** How well `needle` finds `text`: 0 starts it, 1 starts a word of it, 2 is inside it, undefined is not in it. */
function matchRank(text: string, needle: string): number | undefined {
  const at = text.indexOf(needle);
  if (at < 0) return undefined;
  if (at === 0) return 0;
  return /[\s_.:()/-]/.test(text[at - 1]!) ? 1 : 2;
}

/** The items that every word of the query finds, the best matches first and the order of the list among equals. */
export function filterItems(items: readonly PickerItem[], query: string): PickerItem[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return [...items];
  const scored: Array<{ item: PickerItem; score: number; order: number }> = [];
  items.forEach((item, order) => {
    const label = item.label.toLowerCase();
    const others = [item.detail, item.group, ...(item.keywords ?? [])].filter((value): value is string => value !== undefined).map((value) => value.toLowerCase());
    let score = 0;
    for (const word of words) {
      const own = matchRank(label, word);
      const other = others.map((text) => matchRank(text, word)).filter((rank): rank is number => rank !== undefined);
      if (own === undefined && other.length === 0) return;
      score += own ?? 3 + Math.min(...other);
    }
    scored.push({ item, score, order });
  });
  return scored.sort((first, second) => first.score - second.score || first.order - second.order).map(({ item }) => item);
}

export interface PickerOptions {
  /** The text typed may be taken as it is, when it is no item: a name that is not declared, an expression. */
  allowFreeText?: boolean;
  /** How the free text is offered, `Use "{text}"` when absent. */
  freeTextLabel?: (text: string) => string;
}

/** The items shown for a query: the matches, and the typed text as the last one when it is allowed and is no match by name. */
export function visibleItems(items: readonly PickerItem[], query: string, options: PickerOptions = {}): PickerItem[] {
  const shown = filterItems(items, query);
  const text = query.trim();
  if (!options.allowFreeText || text === '' || shown.some((item) => item.label.toLowerCase() === text.toLowerCase())) return shown;
  return [...shown, { id: `${FREE_TEXT_PREFIX}${text}`, label: options.freeTextLabel?.(text) ?? t('picker.use', { text }), group: t('picker.groupTyped') }];
}

export type PickerKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End' | 'PageDown' | 'PageUp' | 'Enter' | 'Escape' | 'Tab';

export type PickerOutcome =
  | { kind: 'none' }
  | { kind: 'choose'; item: PickerItem }
  | { kind: 'cancel' };

const PAGE = 8;

/** What a key does to the list: it moves the active item, chooses it or leaves. */
export function pickerKey(state: PickerState, shown: readonly PickerItem[], key: PickerKey): { state: PickerState; outcome: PickerOutcome } {
  const last = Math.max(0, shown.length - 1);
  const move = (active: number): { state: PickerState; outcome: PickerOutcome } => ({ state: { ...state, active: Math.min(last, Math.max(0, active)) }, outcome: { kind: 'none' } });
  switch (key) {
    case 'ArrowDown': return move(state.active >= last ? 0 : state.active + 1);
    case 'ArrowUp': return move(state.active <= 0 ? last : state.active - 1);
    case 'Home': return move(0);
    case 'End': return move(last);
    case 'PageDown': return move(state.active + PAGE);
    case 'PageUp': return move(state.active - PAGE);
    case 'Enter': {
      const item = shown[Math.min(state.active, last)];
      return item ? { state, outcome: { kind: 'choose', item } } : { state, outcome: { kind: 'none' } };
    }
    case 'Escape': return { state, outcome: { kind: 'cancel' } };
    case 'Tab': return { state, outcome: { kind: 'none' } };
  }
}

/** The state after the query is edited: the first match is active. */
export function pickerQuery(state: PickerState, query: string): PickerState {
  return { ...state, query, active: 0 };
}

/** The text of a free-text item, or undefined for one of the list. */
export function freeTextOf(item: PickerItem): string | undefined {
  return item.id.startsWith(FREE_TEXT_PREFIX) ? item.id.slice(FREE_TEXT_PREFIX.length) : undefined;
}
