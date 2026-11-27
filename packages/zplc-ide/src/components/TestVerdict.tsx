/**
 * The verdict of a run of tests or of a lesson check, in one component with the same words (TST-008): one sentence, the failed
 * expectations with what was expected and observed, the passed tests collapsed, and the boundary of the result once (MSG-003).
 */
import { CheckCircle, XCircle } from 'lucide-react';
import { useT } from '../i18n';
import type { FactExpect } from '../test-engine';
import { Button } from '../ui';
import { BoundaryBadge, type ResultBoundary } from './BoundaryBadge';

export interface VerdictFailure {
  /** The test (scenario) id. */
  id: string;
  path: string;
  kind?: string;
  atMs?: number;
  /** The position of the expectation in the scenario file. */
  index?: number;
  checks?: ReadonlyArray<{ signal: string; expected: boolean | FactExpect; observed?: boolean | number }>;
}

export interface TestVerdictProps {
  sentence: string;
  /** true: passed, false: failed, null: neither (the run did not finish, the file is not valid). */
  ok: boolean | null;
  failures?: readonly VerdictFailure[];
  passedIds?: readonly string[];
  boundary: ResultBoundary | null;
  /** Off where an enclosing region already announces the sentence. */
  live?: boolean;
  onScenarioStep?: (failure: VerdictFailure) => void;
  onTraceTime?: (failure: VerdictFailure) => void;
  /** Ask the Assistant to explain one failure (AIX-003); absent where there is no Assistant or the verdict is a lesson check. */
  onExplain?: (failure: VerdictFailure) => void;
}

const KINDS = new Set(['AT', 'WITHIN', 'FOR', 'EVENTUALLY', 'ALWAYS', 'NEVER', 'UNTIL', 'RISING', 'FALLING']);

export function TestVerdict({
  sentence,
  ok,
  failures = [],
  passedIds = [],
  boundary,
  live = true,
  onScenarioStep,
  onTraceTime,
  onExplain,
}: TestVerdictProps) {
  const { t } = useT();
  const word = (key: string) => t(key as Parameters<typeof t>[0]);
  // a number or a range is the same in both languages: "3", "[2, 4]", "≥ 2", "≤ 4" (SCN-005)
  const value = (flag: boolean | number | FactExpect | undefined) =>
    flag === undefined
      ? t('u2Tests.value.missing')
      : typeof flag === 'number'
        ? String(flag)
        : typeof flag === 'object'
          ? flag.min !== undefined && flag.max !== undefined
            ? `[${flag.min}, ${flag.max}]`
            : flag.min !== undefined
              ? `≥ ${flag.min}`
              : `≤ ${flag.max}`
          : t(flag ? 'u2Tests.value.true' : 'u2Tests.value.false');
  const Icon = ok === false ? XCircle : CheckCircle;
  const tone =
    ok === false ? 'text-[var(--color-accent-red)]' : ok ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-yellow)]';
  return (
    <section data-test-verdict data-verdict={ok === null ? 'unfinished' : ok ? 'passed' : 'failed'} className="space-y-3">
      <div className="flex items-start gap-2">
        <Icon size={16} className={`${tone} mt-0.5 flex-shrink-0`} aria-hidden="true" />
        <p
          data-test-verdict-sentence
          {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})}
          className="min-w-0 font-medium text-[var(--color-surface-100)]"
        >
          {sentence}
        </p>
        {boundary && (
          <span className="ml-auto shrink-0">
            <BoundaryBadge boundary={boundary} />
          </span>
        )}
      </div>

      {failures.length > 0 && (
        <div data-test-failures className="space-y-2">
          <h3 className="text-xs font-medium text-[var(--color-surface-200)]">{t('u2Tests.failed.title')}</h3>
          <ul className="space-y-2">
            {failures.map((failure, position) => (
              <li
                key={`${failure.id}-${failure.index ?? position}`}
                data-test-failure
                className="space-y-1 border-l-2 border-[var(--color-accent-red)] pl-2 text-xs"
              >
                <p className="font-medium text-[var(--color-surface-100)]">{failure.id}</p>
                {failure.kind === undefined ? (
                  <p className="text-[var(--color-surface-400)]">{t('u2Tests.failed.noDetail')}</p>
                ) : (
                  <p className="text-[var(--color-surface-300)]">
                    {(() => {
                      const kind = KINDS.has(failure.kind) ? word(`u2Tests.kind.${failure.kind}`) : failure.kind;
                      return failure.atMs === undefined
                        ? t('u2Tests.expectation.plain', { kind })
                        : t('u2Tests.expectation.at', { kind, ms: failure.atMs });
                    })()}
                  </p>
                )}
                {failure.checks && failure.checks.length > 0 && (
                  <ul
                    aria-label={t('u2Tests.failed.expectations', { id: failure.id })}
                    className="font-mono text-[var(--color-surface-300)]"
                  >
                    {failure.checks.map((check) => (
                      <li key={check.signal}>
                        {t('u2Tests.check', { signal: check.signal, expected: value(check.expected), observed: value(check.observed) })}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="flex flex-wrap gap-3">
                  {onScenarioStep && failure.index !== undefined && (
                    <Button variant="ghost" size="sm" className="underline underline-offset-2" onClick={() => onScenarioStep(failure)}>
                      {t('u2Tests.step.open')}
                    </Button>
                  )}
                  {onTraceTime && failure.atMs !== undefined && (
                    <Button variant="ghost" size="sm" className="underline underline-offset-2" onClick={() => onTraceTime(failure)}>
                      {t('u2Tests.trace.open')}
                    </Button>
                  )}
                  {onExplain && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="underline underline-offset-2"
                      data-command-exempt="opens the Assistant with this failed test attached (view.agent)"
                      onClick={() => onExplain(failure)}
                    >
                      {t('assistant.explainFailure')}
                    </Button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {passedIds.length > 0 && (
        <details data-test-passed className="text-xs text-[var(--color-surface-300)]">
          <summary className="cursor-pointer select-none font-medium text-[var(--color-surface-200)]">
            {t('u2Tests.passed.title', { count: passedIds.length })}
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {passedIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
