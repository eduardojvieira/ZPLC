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

type BuildState = 'idle' | 'building' | 'cancelling' | 'not-started' | FirmwareBuildPresentation['kind'];

export function ToolchainCard({ ideId }: { ideId: string | undefined }) {
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
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--color-surface-100)] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-blue)]">
        <span className="inline-flex items-center gap-2"><ChevronRight size={15} className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden="true" />Firmware toolchain</span>
        <span id={statusId} role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs ${statusClass}`}>
          <StatusIcon size={14} className={state.kind === 'checking' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
          {state.message}
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--color-surface-700)] px-3 py-3">
        <p id={descriptionId} className="max-w-[68ch] text-xs leading-5 text-[var(--color-surface-400)]">
          Checks only local firmware build prerequisites. It does not build, flash, deploy, connect to hardware, or qualify hardware.
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => { void inspect(); }}
          disabled={checking || !bridgeAvailable || buildInFlight}
          aria-describedby={`${descriptionId} ${statusId}`}
          className="inline-flex items-center gap-2 rounded bg-[var(--color-surface-600)] px-3 py-2 text-xs font-medium text-[var(--color-surface-100)] transition-colors hover:bg-[var(--color-surface-500)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          {checking && <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          Choose checkout &amp; check
        </button>
        {presentation?.checks.length ? (
          <ul className="space-y-2 border-t border-[var(--color-surface-700)] pt-3" aria-label="Firmware toolchain checks">
            {presentation.checks.map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-[var(--color-surface-200)]">{check.label}</span>
                <span className={check.status === 'ready' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-yellow)]'}>
                  {check.status === 'ready' ? 'Ready' : 'Needs attention'}
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
              <h3 className="text-xs font-medium text-[var(--color-surface-100)]">Local runtime build</h3>
              <p className="mt-1 max-w-[68ch] text-xs leading-5 text-[var(--color-surface-400)]">
                Compiles runtime firmware, not your PLC program. It runs west, CMake, Kconfig, and Python from the selected checkout; use a trusted checkout only. The temporary ELF is removed. This does not flash, deploy, connect a device, or qualify hardware. Source identity is unverified.
              </p>
            </div>
            {canBuild ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  ref={buildButtonRef}
                  type="button"
                  onClick={() => { void build(); }}
                  aria-disabled={buildInFlight}
                  aria-label="Build runtime locally"
                  aria-describedby={`${descriptionId} ${statusId}`}
                  className={`inline-flex items-center gap-2 rounded bg-[var(--color-accent-blue)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-blue)]/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] motion-reduce:transition-none ${buildInFlight ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {buildState === 'building' && <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {buildState === 'building' || buildState === 'cancelling' ? 'Building locally…' : 'Build runtime locally'}
                </button>
                {(buildState === 'building' || buildState === 'cancelling') ? (
                  <button type="button" onClick={() => { void cancel(); }} disabled={buildState === 'cancelling'} className="inline-flex items-center gap-2 rounded bg-[var(--color-surface-600)] px-3 py-2 text-xs font-medium text-[var(--color-surface-100)] transition-colors hover:bg-[var(--color-surface-500)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">
                    {buildState === 'cancelling' ? 'Cancelling safely…' : 'Cancel build'}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs leading-5 text-[var(--color-surface-400)]">
                {localPlatform && targetOption ? 'A checked, ready checkout must include this catalogued target before a local build is available.' : 'Local runtime build is available only for a catalogued target in this app on Linux or macOS.'}
              </p>
            )}
            <div role="status" aria-live="polite" className="text-xs leading-5 text-[var(--color-surface-300)]">
              {buildState === 'not-started' ? 'Build was not started.' : null}
              {buildState === 'cancelled' ? 'Build cancelled after local cleanup.' : null}
              {buildState === 'cleanup-unconfirmed' ? 'Build stopped, but temporary cleanup could not be confirmed. Restart Studio before trying again.' : null}
              {buildState === 'failed' ? 'Firmware build did not complete. Check the toolchain, then try again.' : null}
              {buildState === 'success' && buildEvidence ? (
                <span className="block space-y-1"><strong className="text-[var(--color-accent-green)]">Local cross-build completed</strong><span className="block">{resultTarget ?? 'Catalogued target'}</span><span className="block break-all font-mono tabular-nums text-[var(--color-surface-200)]">SHA-256 {buildEvidence.sha256}</span><span className="block tabular-nums">{new Intl.NumberFormat().format(buildEvidence.byteLength)} bytes; temporary ELF was removed. This is not a flashable artifact or hardware evidence. Source identity is unverified.</span></span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
