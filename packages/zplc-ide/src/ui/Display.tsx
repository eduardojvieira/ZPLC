/**
 * The display components of the kit (UX-001): badge, status dot, signal chip, spinner, empty state and property list.
 * None of them carries meaning by colour alone: a badge has text, a status dot has a label, a signal chip has the word and
 * the glyph of its state (UX-009), an empty state has a title and a next action.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { SIGNAL_CHIP_CLASS, SIGNAL_CUES, SIGNAL_TEXT_CLASS, signalMark, type SignalTone } from '../theme/signalTone';
import { cx } from './cx';
import { LOADING_DELAY_MS, startDelay } from './logic/delay';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('ui-badge', className)} data-tone={tone}>{children}</span>;
}

/** A small coloured dot with a text that says what it means: the text is shown, or read by a screen reader only. */
export function StatusDot({ tone = 'neutral', label, showLabel = false, className }: { tone?: Tone; label: string; showLabel?: boolean; className?: string }) {
  return (
    <span className={cx('ui-status', className)} data-tone={tone}>
      <span className="ui-status-dot" aria-hidden="true" />
      <span className={showLabel ? undefined : 'ui-visually-hidden'}>{label}</span>
    </span>
  );
}

/** One state of the signal vocabulary (UX-009): its glyph and word, coloured from the signal tokens. */
export function SignalChip({ tone, className, detail }: { tone: SignalTone; className?: string; detail?: string }) {
  const cue = SIGNAL_CUES[tone];
  return (
    <span className={cx('ui-signal ui-tabular', SIGNAL_CHIP_CLASS[tone], className)} data-signal={tone}>
      <span aria-hidden="true" className="ui-signal-glyph">{cue.glyph}</span>
      <span>{detail ?? cue.label}</span>
    </span>
  );
}

/**
 * A live value inside a node or a table cell (UX-009): coloured from the state's token, with the glyph of the state before
 * it and, for the states a value alone does not say, the word for a screen reader. A plain number has no glyph.
 */
export function SignalValue({ tone, children, className }: { tone: SignalTone; children?: ReactNode; className?: string }) {
  const mark = signalMark(tone);
  const says = tone === 'forced' || tone === 'fault' || tone === 'unknown';
  return (
    <span className={cx('ui-tabular', SIGNAL_TEXT_CLASS[tone], className)} data-signal={tone}>
      {mark && <span aria-hidden="true">{mark} </span>}
      {says && <span className="ui-visually-hidden">{SIGNAL_CUES[tone].description}: </span>}
      {children}
    </span>
  );
}

/** A loading indicator for work that takes longer than a moment; it announces itself and stops moving under reduced motion. */
export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cx('ui-spinner', className)}>
      <span className="ui-spinner-ring" aria-hidden="true" />
      <span className="ui-visually-hidden">{label}</span>
    </span>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** The next action: a Button or a link. Every empty panel offers one (UX-021). */
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function EmptyState({ icon, title, description, action, headingLevel = 3, className }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cx('ui-empty', className)}>
      {icon !== undefined && <div aria-hidden="true" className="ui-empty-icon">{icon}</div>}
      <Heading className="ui-empty-title">{title}</Heading>
      {description !== undefined && <p className="ui-empty-description">{description}</p>}
      {action !== undefined && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

export interface LoadingStateProps {
  /** What is happening, as a short phrase: "Loading the workbench". */
  label: string;
  /** How long to wait before showing anything; 300 ms by default, so an operation that is quick shows no indicator (UX-021). */
  delayMs?: number;
  className?: string;
}

/** True once `delayMs` has passed since the component mounted. */
function useAfterDelay(delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(delayMs <= 0);
  useEffect(() => (delayMs <= 0 ? undefined : startDelay(() => setElapsed(true), delayMs)), [delayMs]);
  return elapsed;
}

/** The loading state of a panel: nothing for the first 300 ms, then a spinner with the phrase, announced politely. */
export function LoadingState({ label, delayMs = LOADING_DELAY_MS, className }: LoadingStateProps) {
  const visible = useAfterDelay(delayMs);
  if (!visible) return null;
  return (
    <div className={cx('ui-empty', className)} data-state="loading">
      <Spinner label={label} />
      <p className="ui-empty-description" aria-hidden="true">{label}</p>
    </div>
  );
}

export interface ErrorStateProps {
  title: string;
  /** What went wrong, in words the person can act on. */
  message: ReactNode;
  /** The way out: a retry or the step that fixes it. Every error state offers one (UX-021). */
  action: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/** The error state of a panel: a heading, the reason, and a recovery action; announced as an alert. */
export function ErrorState({ title, message, action, headingLevel = 3, className }: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div role="alert" className={cx('ui-empty', className)} data-state="error">
      <Heading className="ui-empty-title">{title}</Heading>
      <p className="ui-empty-description">{message}</p>
      <div className="ui-empty-action">{action}</div>
    </div>
  );
}

export interface PropertyItem { label: string; value: ReactNode }

/** A definition list of facts (the inspector's pattern): a label column and a wrapping value column. */
export function PropertyList({ items, className, label }: { items: readonly PropertyItem[]; className?: string; label?: string }) {
  return (
    <dl className={cx('ui-properties', className)} aria-label={label}>
      {items.map((item) => (
        <div key={item.label} className="ui-property">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
