/**
 * Declared-interlock coverage in a view of its own (IDE-032). A project declares which pairs of outputs must never be
 * on together (`safety.incompatibleOutputs` in zplc.json); this checks that the saved scenarios assert each pair with an
 * exact NEVER. It is a logical check on saved scenarios: it says nothing about wiring, timing or certification, and the
 * view says so.
 */
import type { workspaceTestAvailability } from './workspaceTestPresentation';
import type { WorkspaceSafetyPresentation } from './workspaceSafetyPresentation';
import { Button } from '../ui';
import { useT } from '../i18n';

type SafetyView = 'idle' | 'running' | 'unavailable' | { presentation: WorkspaceSafetyPresentation };

interface InterlockCoverageProps {
  availability: ReturnType<typeof workspaceTestAvailability>;
  /** `idle` before a check, then its progress, and the presentation of its answer. */
  state: SafetyView;
  /** A scenario run or another check is using the workspace. */
  busy: boolean;
  onCheck: () => void;
}

function SafetyDiagnostics({ diagnostics }: { diagnostics: WorkspaceSafetyPresentation['diagnostics'] }) {
  const { t } = useT();
  if (diagnostics.length === 0) return null;
  return <ul aria-label={t('interlock.safetyDiagnostics')} className="space-y-1 border-t border-[var(--color-surface-700)] pt-2 text-xs text-[var(--color-surface-200)]">{diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`}><span className="font-mono">{diagnostic.code}</span>{diagnostic.path && <span className="text-[var(--color-surface-400)]"> · {diagnostic.path}{diagnostic.line ? `:${diagnostic.line}` : ''}{diagnostic.column ? `:${diagnostic.column}` : ''}</span>}</li>)}</ul>;
}

function SafetyCoverageReport({ presentation }: { presentation: WorkspaceSafetyPresentation }) {
  const { t } = useT();
  if (presentation.kind === 'not-configured') return <p role="status" className="text-xs text-[var(--color-surface-400)]">{t('interlock.noIncompatibleOutputsAre')}</p>;
  if (presentation.kind === 'invalid') return <div className="space-y-1"><p role="status" className="text-xs text-[var(--color-accent-yellow)]">{t('interlock.declaredInterlockCoverageResul')}</p><SafetyDiagnostics diagnostics={presentation.diagnostics} /></div>;
  const missing = presentation.kind === 'uncovered' ? new Set(presentation.uncovered.map((pair) => [...pair.outputs].sort().join('\0'))) : new Set<string>();
  return <div className="space-y-2 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><caption className="sr-only">{t('interlock.declaredOutputInterlockCoverag')}</caption><thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]"><tr><th scope="col" className="px-2 py-1 font-medium">{t('interlock.outputA')}</th><th scope="col" className="px-2 py-1 font-medium">{t('interlock.outputB')}</th><th scope="col" className="px-2 py-1 font-medium">{t('interlock.status')}</th></tr></thead><tbody>{presentation.declared.map((pair) => { const isMissing = missing.has([...pair.outputs].sort().join('\0')); return <tr key={pair.outputs.join('\0')} className="border-b border-[var(--color-surface-700)]"><td className="px-2 py-1 font-mono text-[var(--color-surface-200)]">{pair.outputs[0]}</td><td className="px-2 py-1 font-mono text-[var(--color-surface-200)]">{pair.outputs[1]}</td><td className={`px-2 py-1 ${isMissing ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-accent-green)]'}`}>{isMissing ? t('interlock.missingExactNeverCoverage') : t('interlock.covered')}</td></tr>; })}</tbody></table><SafetyDiagnostics diagnostics={presentation.diagnostics} /></div>;
}

export function InterlockCoverage({ availability, state, busy, onCheck }: InterlockCoverageProps) {
  const { t } = useT();
  return (
    <section aria-label={t('interlock.declaredInterlockCoverage')} data-interlock-coverage className="space-y-2 p-3 font-sans text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-surface-200)]">{t('interlock.declaredInterlockCoverage')}</h2>
        <Button variant="secondary" size="sm" onClick={onCheck} disabled={busy || availability !== 'ready'}>
          {state === 'running' ? t('interlock.checking') : t('interlock.checkDeclaredInterlocks')}
        </Button>
      </div>
      {availability === 'link-required' && <p role="status" className="text-xs text-[var(--color-surface-400)]">{t('interlock.saveTheProjectAnd')}</p>}
      {availability === 'unsaved' && <p role="status" className="text-xs text-[var(--color-surface-400)]">{t('interlock.saveAllChangesBefore')}</p>}
      {availability === 'desktop-unavailable' && <p role="status" className="text-xs text-[var(--color-surface-400)]">{t('interlock.declaredInterlockCoverageRequi')}</p>}
      {availability === 'project-required' && <p role="status" className="text-xs text-[var(--color-surface-400)]">{t('interlock.openASavedProject')}</p>}
      {state === 'unavailable' && <p role="status" className="text-xs text-[var(--color-accent-yellow)]">{t('interlock.declaredInterlockCoverageIs')}</p>}
      {typeof state === 'object' && <SafetyCoverageReport presentation={state.presentation} />}
      <p className="text-xs text-[var(--color-surface-400)]">{t('interlock.checksExactNeverCoverage')}</p>
    </section>
  );
}
