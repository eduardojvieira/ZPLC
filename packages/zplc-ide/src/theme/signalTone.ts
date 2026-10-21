import { t } from '../i18n'; /**
 * The signal vocabulary (UX-009): how Studio shows the state of a value, defined once. FALSE is neutral, green means a
 * confirmed TRUE (or RUN) and nothing else, amber means forced or a warning, red means a fault and nothing else, and a
 * value that has not been read is neutral and dashed. Colour never carries a state alone: every state has a label and a
 * glyph (SIGNAL_CUES), and a forced Watch value also says "(forced)" in text.
 *
 * The colours are the `--signal-*` component tokens of tokens.ts; this module is the one place that maps a value to a
 * state and a state to its classes and cues, so the inline values of the code editor (index.css), the Watch table and
 * the kit's signal chip cannot disagree. Ladder, FBD and SFC read the same tokens through `sampleTone`, `SIGNAL_PAINT`
 * (for SVG, where classes do not apply) and the kit's `SignalValue` (UX-009).
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
export const SIGNAL_CHIP_CLASS: Record<SignalTone, string> = Object.fromEntries(
  SIGNAL_TONES.map((tone) => [
    tone,
    `${SIGNAL_TEXT_CLASS[tone]} bg-[var(--signal-${tone}-bg)] border border-[var(--signal-${tone}-border)]${
      tone === 'unknown' ? ' border-dashed' : ''
    }`,
  ]),
) as Record<SignalTone, string>;

/** What says the state besides its colour: a word and a shape. */
export interface SignalCue {
  label: string;
  glyph: string;
  description: string;
}

export const SIGNAL_CUES: Record<SignalTone, SignalCue> = {
  true: {
    label: 'TRUE',
    glyph: '●',
    get description() {
      return t('signal.cue.true');
    },
  },
  false: {
    label: 'FALSE',
    glyph: '○',
    get description() {
      return t('signal.cue.false');
    },
  },
  unknown: {
    label: '---',
    glyph: '◌',
    get description() {
      return t('signal.cue.unknown');
    },
  },
  forced: {
    label: 'FORCED',
    glyph: '◆',
    get description() {
      return t('signal.cue.forced');
    },
  },
  fault: {
    label: 'FAULT',
    glyph: '▲',
    get description() {
      return t('signal.cue.fault');
    },
  },
  value: {
    label: 'VALUE',
    glyph: '#',
    get description() {
      return t('signal.cue.value');
    },
  },
};

/** The tokens of a state as `var()` values, for SVG `fill` and `stroke`, where the class names above do not apply. */
export const SIGNAL_PAINT: Record<SignalTone, { fg: string; bg: string; border: string }> = Object.fromEntries(
  SIGNAL_TONES.map((tone) => [
    tone,
    { fg: `var(--signal-${tone}-fg)`, bg: `var(--signal-${tone}-bg)`, border: `var(--signal-${tone}-border)` },
  ]),
) as Record<SignalTone, { fg: string; bg: string; border: string }>;

/** A live reading as an editor holds it: the debug map's result, plus whether the user forces the variable. */
export interface SignalSample {
  value?: unknown;
  type?: string | null;
  /** The map has the variable. */
  exists?: boolean;
  forced?: boolean;
  error?: string | null;
}

/** The state of a reading: a variable the map lacks, or one not read yet, is unknown, never FALSE; an error is a fault. */
export function sampleTone(sample?: SignalSample | null): SignalTone {
  if (!sample || sample.exists === false) return 'unknown';
  const type = sample.type ?? (typeof sample.value === 'boolean' ? 'BOOL' : undefined);
  return signalTone({ forced: sample.forced === true, fault: Boolean(sample.error), type, value: sample.value });
}

/** The glyph that goes before the value of a state; a plain number has none, because its digits are the cue. */
export const signalMark = (tone: SignalTone): string => (tone === 'value' ? '' : SIGNAL_CUES[tone].glyph);
