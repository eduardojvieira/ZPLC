/** The firmware toolchain of the selected board, and the build of its image. It never flashes. */

import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Circle,
  LoaderCircle,
} from 'lucide-react';
import {
  BOARD_OPTIONS,
} from '../../config/boardProfiles';
import { presentFirmwareBuildResult, presentToolchainInspectResult, type FirmwareBuildPresentation, type ToolchainPresentation } from './toolchainPresentation';
import { Button } from '../../ui';
import { useT } from '../../i18n';

type BuildState = 'idle' | 'building' | 'cancelling' | 'not-started' | FirmwareBuildPresentation['kind'];

export function ToolchainCard({ ideId }: { ideId: string | undefined }) {
  const { t } = useT();
  const [presentation, setPresentation] = useState<ToolchainPresentation>();
  const [checking, setChecking] = useState(false);
  const [buildState, setBuildState] = useState<BuildState>('idle');
  const [buildEvidence, setBuildEvidence] = useState<Extract<FirmwareBuildPresentation, { kind: 'success' }>>();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const buildButtonRef = useRef<HTMLButtonElement>(null);
  const buildActiveRef = useRef(false);
  const descriptionId = useId();
  const statusId = useId();
  const inspectToolchain = window.electronAPI?.toolchain?.inspect;
  const startBuild = window.electronAPI?.firmwareBuild?.start;
  const cancelBuild = window.electronAPI?.firmwareBuild?.cancel;
  const bridgeAvailable = typeof inspectToolchain === 'function';
  const localPlatform = window.electronAPI?.platform === 'linux' || window.electronAPI?.platform === 'darwin';
  const targetOption = BOARD_OPTIONS.find((board) => board.value === ideId && board.value !== '' && board.value !== 'custom');
  const canBuild = presentation?.kind === 'ready'
    && Boolean(ideId && targetOption && presentation.boardIdeIds.includes(ideId))
    && typeof startBuild === 'function' && typeof cancelBuild === 'function' && localPlatform;
  const buildInFlight = buildState === 'building' || buildState === 'cancelling';
  const state = checking
    ? { kind: 'checking' as const, message: 'Checking…' }
    : presentation ?? (bridgeAvailable
      ? { kind: 'idle' as const, message: 'Not checked' }
      : { kind: 'unavailable' as const, message: 'Unavailable in this app' });
  const statusClass = state.kind === 'ready'
    ? 'text-[var(--color-accent-green)]'
    : state.kind === 'attention' ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-surface-400)]';
  const StatusIcon = state.kind === 'ready' ? CheckCircle : state.kind === 'attention' || state.kind === 'unavailable' ? AlertTriangle : state.kind === 'checking' ? LoaderCircle : Circle;

  const inspect = async () => {
    if (!bridgeAvailable || checking || buildActiveRef.current) return;
    setPresentation(undefined);
    setBuildState('idle');
    setBuildEvidence(undefined);
    setChecking(true);
    try {
      const result = await inspectToolchain();
      setPresentation(result === null ? undefined : presentToolchainInspectResult(result));
    } catch {
      setPresentation({ kind: 'unavailable', message: 'Unavailable in this app', checks: [], boardIdeIds: [] });
    } finally {
      setChecking(false);
      requestAnimationFrame(() => {
        const button = buttonRef.current;
        if (button && (document.activeElement === button || document.activeElement === document.body)) button.focus();
      });
    }
  };

  useEffect(() => () => {
    if (buildActiveRef.current) void cancelBuild?.().catch(() => undefined);
  }, [cancelBuild]);

  useEffect(() => {
    if (buildState !== 'idle' && buildState !== 'building' && buildState !== 'cancelling') {
      requestAnimationFrame(() => {
        const button = buildButtonRef.current;
        if (button && (document.activeElement === button || document.activeElement === document.body)) button.focus();
      });
    }
  }, [buildState]);

  const build = async () => {
    if (!canBuild || !ideId || buildActiveRef.current) return;
    buildActiveRef.current = true;
    setBuildEvidence(undefined);
    setBuildState('building');
    try {
      const result = await startBuild!({ ideId });
      const next = result === null ? 'not-started' : presentFirmwareBuildResult(result);
      setBuildState(typeof next === 'string' ? next : next.kind);
      if (typeof next !== 'string' && next.kind === 'success') setBuildEvidence(next);
    } catch {
      setBuildState('failed');
    } finally {
      buildActiveRef.current = false;
    }
  };
  const cancel = async () => {
    if (!buildActiveRef.current || buildState === 'cancelling') return;
    buildButtonRef.current?.focus();
    setBuildState('cancelling');
    try { await cancelBuild?.(); } catch { /* The gateway still owns termination. */ }
  };
  const resultTarget = buildEvidence && BOARD_OPTIONS.find((board) => board.value === buildEvidence.ideId)?.label;

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-800)]/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--color-surface-100)] marker:content-none">
        <span className="inline-flex items-center gap-2"><ChevronRight size={15} className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden="true" />{t('toolchain.firmwareToolchain')}</span>
        <span id={statusId} role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs ${statusClass}`}>
          <StatusIcon size={14} className={state.kind === 'checking' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
          {state.message}
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--color-surface-700)] px-3 py-3">
        <p id={descriptionId} className="max-w-[68ch] text-xs leading-5 text-[var(--color-surface-400)]">
          {t('toolchain.checksOnlyLocalFirmware')}
        </p>
        <Button variant="secondary" size="sm" ref={buttonRef} onClick={() => { void inspect(); }} disabled={checking || !bridgeAvailable || buildInFlight} aria-describedby={`${descriptionId} ${statusId}`} className="motion-reduce:transition-none">
          {checking && <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {t('toolchain.chooseCheckoutCheck')}
        </Button>
        {presentation?.checks.length ? (
          <ul className="space-y-2 border-t border-[var(--color-surface-700)] pt-3" aria-label={t('toolchain.firmwareToolchainChecks')}>
            {presentation.checks.map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-[var(--color-surface-200)]">{check.label}</span>
                <span className={check.status === 'ready' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-yellow)]'}>
                  {check.status === 'ready' ? t('toolchain.ready') : t('toolchain.needsAttention')}
                  {check.version ? ` (${check.version})` : ''}
                  {check.status !== 'ready' ? <span className="mt-0.5 block max-w-[28ch] text-right leading-4 text-[var(--color-surface-400)]">{check.remediation}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {presentation?.kind === 'ready' ? (
          <div className="space-y-3 border-t border-[var(--color-surface-700)] pt-3">
            <div>
              <h3 className="text-xs font-medium text-[var(--color-surface-100)]">{t('toolchain.localRuntimeBuild')}</h3>
              <p className="mt-1 max-w-[68ch] text-xs leading-5 text-[var(--color-surface-400)]">
                {t('toolchain.compilesRuntimeFirmwareNot')}
              </p>
            </div>
            {canBuild ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" ref={buildButtonRef} onClick={() => { void build(); }} aria-disabled={buildInFlight} aria-label={t('toolchain.buildRuntimeLocally')} aria-describedby={`${descriptionId} ${statusId}`} className={buildInFlight ? 'cursor-not-allowed opacity-50' : undefined}>
                  {buildState === 'building' && <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {buildState === 'building' || buildState === 'cancelling' ? t('toolchain.buildingLocally') : t('toolchain.buildRuntimeLocally')}
                </Button>
                {(buildState === 'building' || buildState === 'cancelling') ? (
                  <Button variant="secondary" size="sm" onClick={() => { void cancel(); }} disabled={buildState === 'cancelling'} className="motion-reduce:transition-none">
                    {buildState === 'cancelling' ? t('toolchain.cancellingSafely') : t('toolchain.cancelBuild')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs leading-5 text-[var(--color-surface-400)]">
                {localPlatform && targetOption ? t('toolchain.aCheckedReadyCheckout') : t('toolchain.localRuntimeBuildIs')}
              </p>
            )}
            <div role="status" aria-live="polite" className="text-xs leading-5 text-[var(--color-surface-300)]">
              {buildState === 'not-started' ? t('toolchain.buildWasNotStarted') : null}
              {buildState === 'cancelled' ? t('toolchain.buildCancelledAfterLocal') : null}
              {buildState === 'cleanup-unconfirmed' ? t('toolchain.buildStoppedButTemporary') : null}
              {buildState === 'failed' ? t('toolchain.firmwareBuildDidNot') : null}
              {buildState === 'success' && buildEvidence ? (
                <span className="block space-y-1"><strong className="text-[var(--color-accent-green)]">{t('toolchain.localCrossBuildCompleted')}</strong><span className="block">{resultTarget ?? t('toolchain.cataloguedTarget')}</span><span className="block break-all font-mono tabular-nums text-[var(--color-surface-200)]">{t('console.sha2562', { sha256: buildEvidence.sha256 })}</span><span className="block tabular-nums">{t('toolchain.bytesTemporaryElfWas', { value: new Intl.NumberFormat().format(buildEvidence.byteLength) })}</span></span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
