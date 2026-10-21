/**
 * The live native motor controls of the Lab tab (IDE-014: split out of Console.tsx).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DebugController } from '../hooks/useDebugController';
import { LIVE_NATIVE_OUTPUT_MAX_AGE_MS, presentLiveNativeMotorControls, presentLiveNativeMotorOutput } from '../runtime/nativeTrace';
import { claimMotorInputCommand, shouldClearMotorInputFailure } from './liveNativeMotorPanel';
import { Button } from '../ui';
import { useT } from '../i18n';

export function LiveNativeMotorPanel(
  props: Omit<Parameters<typeof presentLiveNativeMotorControls>[0], 'nowMs'> & {
    setSimulationInput: DebugController['setSimulationInput'] | undefined;
  },
) {
  const { t } = useT();
  const { setSimulationInput, sample } = props;
  // eslint-disable-next-line react-hooks/purity -- this panel must compare each parent snapshot to the current wall clock.
  const nowMs = Date.now();
  const [, setFreshnessTick] = useState(0);
  const [pending, setPending] = useState(false);
  const [failedAtMs, setFailedAtMs] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const failureAtRef = useRef<number | null>(null);
  useEffect(() => {
    const receivedAtMs = sample?.receivedAtMs;
    const currentNowMs = Date.now();
    if (
      typeof receivedAtMs !== 'number' ||
      !Number.isSafeInteger(receivedAtMs) ||
      receivedAtMs < 0 ||
      !Number.isSafeInteger(currentNowMs) ||
      currentNowMs < 0 ||
      receivedAtMs > currentNowMs ||
      currentNowMs - receivedAtMs > LIVE_NATIVE_OUTPUT_MAX_AGE_MS
    )
      return;
    const expiresAtMs =
      receivedAtMs > Number.MAX_SAFE_INTEGER - LIVE_NATIVE_OUTPUT_MAX_AGE_MS ? receivedAtMs : receivedAtMs + LIVE_NATIVE_OUTPUT_MAX_AGE_MS;
    const delayMs = Math.min(LIVE_NATIVE_OUTPUT_MAX_AGE_MS + 1, Math.max(0, expiresAtMs - currentNowMs + 1));
    const timeout = window.setTimeout(() => setFreshnessTick((tick) => tick + 1), delayMs);
    return () => window.clearTimeout(timeout);
  }, [sample?.receivedAtMs]);

  useEffect(() => {
    if (!shouldClearMotorInputFailure(failureAtRef.current, sample?.receivedAtMs)) return;
    const clearFailure = window.setTimeout(() => {
      if (!shouldClearMotorInputFailure(failureAtRef.current, sample?.receivedAtMs)) return;
      failureAtRef.current = null;
      setFailedAtMs(null);
    }, 0);
    return () => window.clearTimeout(clearFailure);
  }, [failedAtMs, sample?.receivedAtMs]);

  const output = presentLiveNativeMotorOutput({
    adapterType: props.adapterType,
    connected: props.connected,
    vmState: props.vmState,
    debugMap: props.debugMap,
    sample,
    currentCompilerRunId: props.currentCompilerRunId,
    nowMs,
  });
  const controls = output ? presentLiveNativeMotorControls({ ...props, nowMs }) : null;

  const command = useCallback(
    async (inputId: 'motor.start' | 'motor.stop' | 'motor.estop', active: boolean) => {
      if (!setSimulationInput || pending || !claimMotorInputCommand(inFlightRef, failureAtRef)) return;
      setPending(true);
      try {
        await setSimulationInput(inputId, active);
      } catch {
        const failureAtMs = Date.now();
        failureAtRef.current = failureAtMs;
        setFailedAtMs(failureAtMs);
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [pending, setSimulationInput, setFailedAtMs, setPending],
  );

  if (!output) return null;
  const unavailable = failedAtMs !== null;
  const disabled = pending || unavailable;

  return (
    <section
      aria-label={t('console.liveNativePosixMotor')}
      aria-busy={pending}
      className="mb-3 border border-[var(--color-surface-700)] bg-[var(--color-surface-900)] p-2"
    >
      <p className="text-xs font-medium text-[var(--color-surface-100)]">{t('console.liveNativePosixHost')}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--color-surface-200)]">{t('console.motorForward')}</dt>
          <dd className="font-medium text-[var(--color-surface-100)]">{output.forward ? t('console.on') : t('console.off')}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--color-surface-200)]">{t('console.motorReverse')}</dt>
          <dd className="font-medium text-[var(--color-surface-100)]">{output.reverse ? t('console.on') : t('console.off')}</dd>
        </div>
        <div className="col-span-2 text-[var(--color-surface-200)]">
          {t('console.msCycles', { uptimeMs: output.uptimeMs, cycles: output.cycles, state: output.state })}
        </div>
      </dl>
      {controls && setSimulationInput && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" disabled={disabled || controls.eStopAsserted} onClick={() => void command('motor.start', true)}>
            {t('console.start')}
          </Button>
          <Button variant="ghost" size="sm" disabled={disabled || controls.eStopAsserted} onClick={() => void command('motor.stop', true)}>
            {t('toolbar.stop.label')}
          </Button>
          <Button variant="ghost" size="sm" disabled={disabled || controls.eStopAsserted} onClick={() => void command('motor.estop', true)}>
            {t('console.assertEStop')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !controls.eStopAsserted}
            onClick={() => void command('motor.estop', false)}
          >
            {t('console.releaseEStop')}
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-surface-200)]">
        {unavailable
          ? t('console.inputCommandWasNot')
          : pending
            ? t('console.stagingHostInputWaiting')
            : controls
              ? t('console.eStop', { value: controls.eStopAsserted ? 'asserted' : 'released' })
              : t('console.inputControlsUnavailable')}
      </p>
    </section>
  );
}
