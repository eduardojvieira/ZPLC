/**
 * The display components of the kit (UX-001): badge, status dot, signal chip, spinner, empty state and property list.
 * None of them carries meaning by colour alone: a badge has text, a status dot has a label, a signal chip has the word and
 * the glyph of its state (UX-009), an empty state has a title and a next action.
 */
import type { ReactNode } from 'react';
import { SIGNAL_CHIP_CLASS, SIGNAL_CUES, type SignalTone } from '../theme/signalTone';
import { cx } from './cx';

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
