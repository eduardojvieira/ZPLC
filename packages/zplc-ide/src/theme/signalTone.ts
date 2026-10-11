/**
 * The signal vocabulary (UX-009): how Studio shows the state of a value, defined once. FALSE is neutral, green means a
 * confirmed TRUE (or RUN) and nothing else, amber means forced or a warning, red means a fault and nothing else, and a
 * value that has not been read is neutral and dashed. Colour never carries a state alone: every state has a label and a
 * glyph (SIGNAL_CUES), and a forced Watch value also says "(forced)" in text.
 *
 * The colours are the `--signal-*` component tokens of tokens.ts; this module is the one place that maps a value to a
 * state and a state to its classes and cues, so the inline values of the code editor (index.css), the Watch table and
 * the kit's signal chip cannot disagree. Ladder, FBD, SFC, Trace and the I/O faceplate read the same tokens and
 * `signalTone` once their editors move to the kit (WP-45).
 */
export type SignalTone = 'true' | 'false' | 'unknown' | 'forced' | 'fault' | 'value';

export const SIGNAL_TONES: readonly SignalTone[] = ['true', 'false', 'unknown', 'forced', 'fault', 'value'];

export interface WatchedValue {
  forced: boolean;
  /** The variable could not be read or its address is gone. */
  fault?: boolean;
  type?: string | null;
  value?: unknown;
}

/** The state a watched value is shown in. A fault outranks a force; a force outranks the value it holds. */
export function signalTone({ forced, fault = false, type, value }: WatchedValue): SignalTone {
  if (fault) return 'fault';
  if (forced) return 'forced';
  if (value === null || value === undefined) return 'unknown';
  return type === 'BOOL' ? (value ? 'true' : 'false') : 'value';
}

/** Theme tokens only: stock palette colours do not follow the light, dark and high-contrast themes. */
export const SIGNAL_TEXT_CLASS: Record<SignalTone, string> = {
  true: 'text-[var(--signal-true-fg)]',
  false: 'text-[var(--signal-false-fg)]',
  unknown: 'text-[var(--signal-unknown-fg)]',
  forced: 'text-[var(--signal-forced-fg)]',
  fault: 'text-[var(--signal-fault-fg)]',
  value: 'text-[var(--signal-value-fg)]',
};

/** The chip of a state: text, fill and border from the same tokens; an unknown value is outlined with a dashed rule. */
export const SIGNAL_CHIP_CLASS: Record<SignalTone, string> = Object.fromEntries(SIGNAL_TONES.map((tone) => [
  tone,
  `${SIGNAL_TEXT_CLASS[tone]} bg-[var(--signal-${tone}-bg)] border border-[var(--signal-${tone}-border)]${tone === 'unknown' ? ' border-dashed' : ''}`,
])) as Record<SignalTone, string>;

/** What says the state besides its colour: a word and a shape. */
export interface SignalCue { label: string; glyph: string; description: string }

export const SIGNAL_CUES: Record<SignalTone, SignalCue> = {
  true: { label: 'TRUE', glyph: '●', description: 'Confirmed TRUE' },
  false: { label: 'FALSE', glyph: '○', description: 'FALSE' },
  unknown: { label: '---', glyph: '◌', description: 'Not read yet' },
  forced: { label: 'FORCED', glyph: '◆', description: 'Forced by the user' },
  fault: { label: 'FAULT', glyph: '▲', description: 'Fault' },
  value: { label: 'VALUE', glyph: '#', description: 'Value' },
};
