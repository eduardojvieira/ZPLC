/**
 * Keyboard shortcuts as data (UX-015): a shortcut is a string such as `Mod+S`, `Shift+F5` or the two-step `Mod+K Mod+S`.
 * `Mod` is the command key of the platform. This module parses them, matches them against key events, writes them for
 * the person (a tooltip, the shortcut reference) and for the operating-system menu. Pure: no React, no Electron, so the
 * main process can bundle it with the registry.
 */

export type Platform = 'darwin' | 'win32' | 'linux';

export interface KeyChord { mod: boolean; shift: boolean; alt: boolean; key: string }

export interface KeyEventLike { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** `Mod+Shift+P` as one chord; a letter is stored in lower case, a named key (`F5`, `Enter`) as it is. */
export function parseChord(text: string): KeyChord {
  const chord: KeyChord = { mod: false, shift: false, alt: false, key: '' };
  for (const part of text.split('+')) {
    if (part === 'Mod') chord.mod = true;
    else if (part === 'Shift') chord.shift = true;
    else if (part === 'Alt') chord.alt = true;
    else chord.key = part.length === 1 ? part.toLowerCase() : part;
  }
  if (chord.key === '') throw new Error(`The shortcut "${text}" names no key`);
  return chord;
}

/** The chords of a shortcut, in the order they are pressed. */
export function parseShortcut(shortcut: string): KeyChord[] {
  return shortcut.split(' ').filter((part) => part !== '').map(parseChord);
}

/**
 * Whether the key event is the chord. `Mod` is Ctrl or Cmd on every platform, as the shortcuts that existed before the
 * registry were; the modifiers must match exactly, so `Ctrl+Alt+S` (AltGr on some layouts) is not `Ctrl+S`.
 */
export function chordMatches(chord: KeyChord, event: KeyEventLike): boolean {
  if (MODIFIER_KEYS.has(event.key)) return false;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return key === chord.key && mod === chord.mod && event.shiftKey === chord.shift && event.altKey === chord.alt;
}

export interface KeyNames { ctrl: string; shift: string; alt: string }
export const ENGLISH_KEY_NAMES: KeyNames = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt' };

const MAC_SYMBOLS = { mod: '⌘', shift: '⇧', alt: '⌥' } as const;

/** One chord as the person reads it: `Ctrl+Shift+P`, or `⌘⇧P` on macOS. */
export function formatChord(chord: KeyChord, platform: Platform, names: KeyNames = ENGLISH_KEY_NAMES): string {
  const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  if (platform === 'darwin') return `${chord.alt ? MAC_SYMBOLS.alt : ''}${chord.shift ? MAC_SYMBOLS.shift : ''}${chord.mod ? MAC_SYMBOLS.mod : ''}${key}`;
  return [chord.mod ? names.ctrl : '', chord.shift ? names.shift : '', chord.alt ? names.alt : '', key].filter((part) => part !== '').join('+');
}

export function formatShortcut(shortcut: string, platform: Platform, names?: KeyNames): string {
  return parseShortcut(shortcut).map((chord) => formatChord(chord, platform, names)).join(' ');
}

/** The Electron accelerator of a single-chord shortcut; a two-step shortcut has none, because a menu cannot hold one. */
export function toAccelerator(shortcut: string): string | null {
  const chords = parseShortcut(shortcut);
  if (chords.length !== 1) return null;
  const chord = chords[0]!;
  const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  return [chord.mod ? 'CmdOrCtrl' : '', chord.shift ? 'Shift' : '', chord.alt ? 'Alt' : '', key].filter((part) => part !== '').join('+');
}

export interface ShortcutBinding<Id extends string = string> { id: Id; chords: readonly KeyChord[] }

export interface ShortcutResult<Id extends string = string> {
  /** The command whose last chord this event was. */
  id: Id | null;
  /** The event is the first or middle chord of a shortcut, or the end of one: the page must not also act on it. */
  consumed: boolean;
}

export interface ShortcutMatcher<Id extends string = string> {
  handle(event: KeyEventLike): ShortcutResult<Id>;
  /** Forget a half-typed two-step shortcut. */
  reset(): void;
}

/** How long the second chord of a two-step shortcut may take. */
export const CHORD_TIMEOUT_MS = 1500;

/**
 * Recognises single chords and two-step shortcuts such as `Mod+K Mod+S`. After the first chord of a sequence the matcher
 * waits for the next; a different key, or a pause longer than `CHORD_TIMEOUT_MS`, forgets it and the event is read again
 * as the start of a shortcut. Pressing a modifier alone changes nothing.
 */
export function createShortcutMatcher<Id extends string>(bindings: readonly ShortcutBinding<Id>[], now: () => number = Date.now): ShortcutMatcher<Id> {
  let pending: { candidates: readonly ShortcutBinding<Id>[]; step: number; at: number } | null = null;

  const advance = (candidates: readonly ShortcutBinding<Id>[], step: number, event: KeyEventLike): ShortcutResult<Id> | null => {
    const matching = candidates.filter((binding) => binding.chords[step] !== undefined && chordMatches(binding.chords[step]!, event));
    if (matching.length === 0) return null;
    const finished = matching.find((binding) => binding.chords.length === step + 1);
    if (finished) { pending = null; return { id: finished.id, consumed: true }; }
    pending = { candidates: matching, step: step + 1, at: now() };
    return { id: null, consumed: true };
  };

  return {
    handle(event) {
      if (MODIFIER_KEYS.has(event.key)) return { id: null, consumed: false };
      const waiting = pending !== null && now() - pending.at <= CHORD_TIMEOUT_MS ? pending : null;
      pending = null;
      if (waiting) {
        const next = advance(waiting.candidates, waiting.step, event);
        if (next) return next;
      }
      return advance(bindings, 0, event) ?? { id: null, consumed: false };
    },
    reset() { pending = null; },
  };
}
