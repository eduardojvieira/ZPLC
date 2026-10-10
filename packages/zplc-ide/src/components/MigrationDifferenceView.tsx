/**
 * The lines a migration changes in one file, as a unified difference (IDE-022). Each line carries its sign as text, so
 * the difference reads without colour; the colour only helps.
 */
import type { MigrationDifference } from '../project/migrationDiff';

const SIGN = { same: ' ', removed: '-', added: '+' } as const;
const TONE = {
  same: 'text-[var(--color-surface-300)]',
  removed: 'bg-[color-mix(in_srgb,var(--color-accent-red)_18%,transparent)] text-[var(--color-surface-100)]',
  added: 'bg-[color-mix(in_srgb,var(--color-accent-green)_18%,transparent)] text-[var(--color-surface-100)]',
} as const;

export function MigrationDifferenceView({ difference }: { difference: MigrationDifference }) {
  return (
    <section aria-label={`Changes to ${difference.file}`} data-migration-difference>
      <h3 className="font-mono text-sm text-[var(--color-surface-100)]">{difference.file}</h3>
      <p className="mt-0.5 text-xs text-[var(--color-surface-300)]">
        {difference.removed} {difference.removed === 1 ? 'line' : 'lines'} removed, {difference.added} {difference.added === 1 ? 'line' : 'lines'} added
      </p>
      <div role="group" aria-label={`Difference in ${difference.file}`} tabIndex={0} className="mt-2 max-h-72 overflow-auto border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)]">
        {difference.hunks.map((hunk, index) => (
          <pre key={index} className="border-b border-[var(--color-surface-700)] py-1 font-mono text-xs leading-5 last:border-b-0">
            {hunk.map((line, lineIndex) => (
              <div key={lineIndex} className={`whitespace-pre px-2 ${TONE[line.kind]}`} data-diff-line={line.kind}>{`${SIGN[line.kind]} ${line.text}`}</div>
            ))}
          </pre>
        ))}
      </div>
    </section>
  );
}
