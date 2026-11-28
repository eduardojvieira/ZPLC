/**
 * The live native motor outputs of the Trace tab (IDE-014: split out of Console.tsx). It only shows them: the faceplate in the
 * Watch tab is the one owner of the motor inputs (PLS-007).
 */

import { useEffect, useState } from 'react';
import { LIVE_NATIVE_OUTPUT_MAX_AGE_MS, presentLiveNativeMotorControls, presentLiveNativeMotorOutput } from '../runtime/nativeTrace';
import { useT } from '../i18n';

export function LiveNativeMotorPanel(props: Omit<Parameters<typeof presentLiveNativeMotorControls>[0], 'nowMs'>) {
  const { t } = useT();
  const { sample } = props;
  // eslint-disable-next-line react-hooks/purity -- this panel must compare each parent snapshot to the current wall clock.
  const nowMs = Date.now();
  const [, setFreshnessTick] = useState(0);
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

  if (!output) return null;

  return (
    <section
      aria-label={t('console.liveNativePosixMotor')}
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
      <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-surface-200)]">
        {controls ? t('console.eStop', { value: controls.eStopAsserted ? 'asserted' : 'released' }) : t('console.inputControlsUnavailable')}
      </p>
      <p className="mt-1 text-xs text-[var(--color-surface-400)]">{t('console.setInputsInWatch')}</p>
    </section>
  );
}
