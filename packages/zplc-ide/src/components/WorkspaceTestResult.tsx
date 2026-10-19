/**
 * The Tests tab's result and scenario preview (IDE-014: split out of Console.tsx).
 */

import { AlertTriangle, XCircle, AlertCircle, CheckCircle, Activity } from 'lucide-react';
import { classifyWorkspaceTestBuildLink, presentRecordedConveyorPlant, presentRecordedMotorPlant, presentRecordedMotorOutput, presentRecordedPedestrianCrossing, presentRecordedTankLevel, type WorkspaceTestPresentation } from './workspaceTestPresentation';
import { Badge, Button, SIGNAL_TEXT_CLASS, Tooltip } from '../ui';
import { useT } from '../i18n';

export function WorkspaceTestResult({ presentation, buildLink, onRunScenario, scenarioRunDisabled }: {
  presentation: WorkspaceTestPresentation;
  buildLink: ReturnType<typeof classifyWorkspaceTestBuildLink>;
  onRunScenario: (scenarioId: string) => void;
  scenarioRunDisabled: boolean;
}) {
  const { t, tn } = useT();
  const Icon = presentation.kind === 'passed' ? CheckCircle : presentation.kind === 'assertion-failed' ? XCircle : presentation.kind === 'invalid' ? AlertTriangle : AlertCircle;
  const iconColor = presentation.kind === 'passed' ? 'text-[var(--color-accent-green)]' : presentation.kind === 'assertion-failed' ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-accent-yellow)]';

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Icon size={16} className={`${iconColor} mt-0.5 flex-shrink-0`} aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p role="status" aria-live="polite" className="font-medium text-[var(--color-surface-100)]">{presentation.message}</p>
          {presentation.scenarioCount !== undefined && <p className="text-xs tabular-nums text-[var(--color-surface-400)]">{tn('console.scenariosPassed', presentation.scenarioCount)}</p>}
        </div>
      </div>

      {presentation.diagnostics.length > 0 && (
        <div className="space-y-1 border-t border-[var(--color-surface-700)] pt-2">
          {presentation.diagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${index}`} className="flex min-w-0 items-start gap-2 break-words text-xs">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-[var(--color-accent-yellow)]" aria-hidden="true" />
              <p className="min-w-0"><span className="font-medium text-[var(--color-surface-200)]">{diagnostic.code}</span><span className="text-[var(--color-surface-400)]"> · {diagnostic.message}</span>{diagnostic.path && <span className="block break-all text-[var(--color-surface-500)]">{diagnostic.path}</span>}</p>
            </div>
          ))}
        </div>
      )}

      {presentation.preview && (
        <details open={presentation.kind === 'assertion-failed' || presentation.preview.scenarios.some((scenario) => presentRecordedMotorPlant(scenario) || presentRecordedConveyorPlant(scenario) || presentRecordedPedestrianCrossing(scenario) || presentRecordedTankLevel(scenario))} className="border-t border-[var(--color-surface-700)] pt-2">
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-surface-200)]">{t('console.scenarioEvidenceRecordedTest')}</summary>
          <p className="mt-2 text-xs text-[var(--color-surface-400)]">{t('console.recordedDuringThisHost')}</p>
          {presentation.preview.totalScenarioCount > presentation.preview.scenarios.length && <p className="mt-1 text-xs tabular-nums text-[var(--color-surface-400)]">{tn('console.showingScenarios', presentation.preview.totalScenarioCount, { shown: presentation.preview.scenarios.length })}</p>}
          <div className="mt-3 space-y-4">
            {presentation.preview.scenarios.map((scenario) => <ScenarioPreview key={`${scenario.id}-${scenario.path}`} scenario={scenario} onRunScenario={onRunScenario} scenarioRunDisabled={scenarioRunDisabled} />)}
          </div>
        </details>
      )}

      {presentation.hasEvidence && presentation.artifacts.length > 0 && (
        <div className="overflow-x-auto border-t border-[var(--color-surface-700)] pt-2">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{t('console.nativePosixTestEvidence')}</caption>
            <thead className="text-[var(--color-surface-400)]"><tr><th scope="col" className="pr-3 font-medium">{t('console.artifact')}</th><th scope="col" className="pr-3 font-medium">{t('console.sha256')}</th><th scope="col" className="text-right font-medium">{t('console.bytes2')}</th></tr></thead>
            <tbody>
              {presentation.artifacts.map((artifact) => (
                <tr key={`${artifact.kind}-${artifact.sha256}`} className="border-t border-[var(--color-surface-700)] text-[var(--color-surface-300)]">
                  <td className="py-1.5 pr-3">{artifact.kind}</td>
                  <Tooltip content={artifact.sha256}><td className="py-1.5 pr-3 font-mono" tabIndex={0} aria-label={t('console.sha2562', { sha256: artifact.sha256 })}>{artifact.sha256.slice(0, 12)}…</td></Tooltip>
                  <td className="py-1.5 text-right tabular-nums">{artifact.byteLength}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-label={t('console.canonicalBuildTestLink')} className="border-t border-[var(--color-surface-700)] pt-2 text-xs">
        {buildLink.kind === 'verified' ? (
          <p className="text-[var(--color-accent-green)]">{t('console.canonicalSavedBuildLinked')}</p>
        ) : presentation.hasEvidence ? (
          <p className="text-[var(--color-surface-400)]">{t('console.notLinkedToThe')}</p>
        ) : (
          <p className="text-[var(--color-surface-400)]">{t('console.noScenarioEvidenceWas')}</p>
        )}
      </section>

      {presentation.savedTestInputIdentity && <p className="border-t border-[var(--color-surface-700)] pt-2 text-xs tabular-nums text-[var(--color-surface-400)]">{tn('console.savedInputs', presentation.savedTestInputIdentity.fileCount)} <Tooltip content={presentation.savedTestInputIdentity.sha256}><span className="font-mono" tabIndex={0}>{presentation.savedTestInputIdentity.sha256.slice(0, 12)}…</span></Tooltip></p>}

      {presentation.hasEvidence && <p className="border-t border-[var(--color-surface-700)] pt-2 text-xs text-[var(--color-surface-400)]"><Tooltip content={t('console.nativePosixHostEvidence')}><span tabIndex={0}><Badge tone="neutral">{t('console.hostEvidenceBadge')}</Badge></span></Tooltip> {t('console.logicalSingleTaskScan')}</p>}
    </div>
  );
}

function ScenarioPreview({ scenario, onRunScenario, scenarioRunDisabled }: {
  scenario: NonNullable<WorkspaceTestPresentation['preview']>['scenarios'][number];
  onRunScenario: (scenarioId: string) => void;
  scenarioRunDisabled: boolean;
}) {
  const { t } = useT();
  const signals = [...new Set(scenario.samples.flatMap((sample) => Object.keys(sample.outputs)))].sort();
  const motorOutput = presentRecordedMotorOutput(scenario);
  const motorPlant = presentRecordedMotorPlant(scenario);
  const conveyorPlant = presentRecordedConveyorPlant(scenario);
  const pedestrianCrossing = presentRecordedPedestrianCrossing(scenario);
  const tankLevel = presentRecordedTankLevel(scenario);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className={scenario.passed ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.fault}>{scenario.passed ? t('console.passed') : t('console.failed')}</span><span className="text-[var(--color-surface-200)]">{scenario.id}</span><span className="break-all text-[var(--color-surface-500)]">{scenario.path}</span>{scenario.truncated && <span className="text-[var(--color-surface-400)]">{t('console.previewTruncated')}</span>}<Button variant="secondary" size="sm" onClick={() => onRunScenario(scenario.id)} aria-label={t('console.runAgainOnNative', { id: scenario.id })} disabled={scenarioRunDisabled} className="ml-auto">{t('console.runThisScenarioAgain')}</Button></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-xs tabular-nums">
          <caption className="sr-only">{t('console.recordedAssertionsFor', { id: scenario.id })}</caption>
          <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]"><tr><th scope="col" className="px-2 py-1 font-medium">{t('console.kind')}</th><th scope="col" className="px-2 py-1 font-medium">{t('console.result')}</th><th scope="col" className="px-2 py-1 font-medium">{t('console.time')}</th></tr></thead>
          <tbody>{scenario.assertions.map((assertion, index) => <tr key={`${assertion.kind}-${index}`} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-300)]"><td className="px-2 py-1">{assertion.kind}</td><td className="px-2 py-1">{assertion.passed ? t('console.passed') : t('console.failed')}</td><td className="px-2 py-1">{assertion.atMs === undefined ? '—' : t('console.ms2', { atMs: assertion.atMs })}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs tabular-nums">
          <caption className="sr-only">{t('console.recordedSampledTimelineFor', { id: scenario.id })}</caption>
          <thead className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-400)]"><tr><th scope="col" className="px-2 py-1 font-medium">{t('console.time')}</th>{signals.map((signal) => <th key={signal} scope="col" className="px-2 py-1 font-medium">{signal}</th>)}</tr></thead>
          <tbody>{scenario.samples.map((sample) => <tr key={sample.atMs} className="border-b border-[var(--color-surface-700)] text-[var(--color-surface-300)]"><td className="px-2 py-1">{t('console.ms2', { atMs: sample.atMs })}</td>{signals.map((signal) => <td key={signal} className="px-2 py-1">{sample.outputs[signal] ? t('console.true') : t('console.false')}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {motorOutput && (
        <div data-recorded-motor-output className="space-y-2 border-t border-[var(--color-surface-700)] pt-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />{t('console.recordedMotorOutput')}</p>
          <div className="overflow-x-auto">
            <div role="group" aria-label={t('console.recordedMotorOutputSamples')} className="flex min-w-max rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">{t('console.time')}</span>
                {motorOutput.signals.map((signal) => <span key={signal} className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{signal}</span>)}
              </div>
              {motorOutput.samples.map((sample) => (
                <div key={sample.atMs} className="flex min-w-[4.5rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{t('console.ms2', { atMs: sample.atMs })}</span>
                  {motorOutput.signals.map((signal) => {
                    const state = sample.outputs[signal] ? 'ON' : 'OFF';
                    return <span key={signal} className="flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2" aria-label={t('console.atMs', { signal, state, atMs: sample.atMs })}>{state}</span>;
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-[var(--color-surface-200)]">{t('console.recordedNativePosixScenario')}</p>
        </div>
      )}
      {motorPlant && (
        <section data-recorded-motor-plant className="space-y-2 border-t border-[var(--color-surface-700)] pt-2" aria-label={t('console.motorPlantRecordedHost')}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />{t('console.motorPlantRecordedHost2')}</p>
          <div role="region" className="overflow-x-auto" tabIndex={0} aria-label={t('console.recordedMotorPlantMatrix')}>
            <div role="group" aria-label={t('console.recordedMotorPlantSamples')} className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">{t('console.time')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.command')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.running')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.atSpeed')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.speed')}</span>
              </div>
              {motorPlant.samples.map((sample) => {
                const values = [
                  ['Command', sample.command ? 'ON' : 'OFF', sample.command ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Running', sample.running ? 'ON' : 'OFF', sample.running ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['At speed', sample.atSpeed ? 'YES' : 'NO', sample.atSpeed ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Speed', `${sample.speedPermilleAfterTick / 10}%`, sample.speedPermilleAfterTick > 0 ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                ] as const;
                return <div key={sample.atMs} className="flex min-w-[4.5rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{t('console.ms2', { atMs: sample.atMs })}</span>
                  {values.map(([label, value, stateClass]) => <span key={label} className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${stateClass}`} aria-label={t('console.atMs2', { label, value, atMs: sample.atMs })}>{value}</span>)}
                </div>;
              })}
            </div>
          </div>
          <p className="text-xs text-[var(--color-surface-200)]">{t('console.recordedNativePosixScenario')}</p>
        </section>
      )}
      {conveyorPlant && (
        <section data-recorded-conveyor-plant className="space-y-1 border-t border-[var(--color-surface-700)] pt-1.5" aria-label={t('console.conveyorPlantRecordedHost')}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />{t('console.conveyorPlantRecordedHost2')}</p>
          <div role="region" className="overflow-x-auto" tabIndex={0} aria-label={t('console.recordedConveyorPlantMatrix')}>
            <div role="group" aria-label={t('console.recordedConveyorPlantSamples')} className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-[11px] tabular-nums">
              <div className="grid shrink-0 grid-cols-2 border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="col-span-2 flex h-6 items-center px-2 font-medium">{t('console.time')}</span>
                {[
                  ['Belt command', 'Diverter command'],
                  ['Fault lamp', 'Classified count'],
                  ['Classifier sensor', 'Metal sensor'],
                  ['Diverter sensor', 'Jam sensor'],
                ].flat().map((label) => <span key={label} className="flex h-6 items-center border-t border-[var(--color-surface-600)] px-2">{label}</span>)}
              </div>
              {conveyorPlant.samples.map((sample) => {
                const values = [
                  ['Belt command', sample.beltCommand ? 'ON' : 'OFF', sample.beltCommand ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Diverter command', sample.diverterCommand ? 'ON' : 'OFF', sample.diverterCommand ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Fault lamp', sample.faultLamp ? 'ON' : 'OFF', sample.faultLamp ? SIGNAL_TEXT_CLASS.fault : SIGNAL_TEXT_CLASS.false],
                  ['Classified count', String(sample.classifiedCountAfterTick), sample.classifiedCountAfterTick > 0 ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Classifier sensor', sample.partAtClassifierInput ? 'ACTIVE' : 'CLEAR', sample.partAtClassifierInput ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Metal sensor', sample.metalDetectedInput ? 'DETECTED' : 'CLEAR', sample.metalDetectedInput ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Diverter sensor', sample.partAtDiverterInput ? 'ACTIVE' : 'CLEAR', sample.partAtDiverterInput ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false],
                  ['Jam sensor', sample.jamDetectedInput ? 'JAM' : 'CLEAR', sample.jamDetectedInput ? SIGNAL_TEXT_CLASS.fault : SIGNAL_TEXT_CLASS.false],
                ] as const;
                return <div key={sample.atMs} className="grid min-w-[7rem] grid-cols-2 border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="col-span-2 flex h-6 items-center justify-center px-2 font-medium">{t('console.ms2', { atMs: sample.atMs })}</span>
                  {values.map(([label, value, stateClass], index) => <span key={label} className={`flex h-6 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${index % 2 === 0 ? 'border-r border-[var(--color-surface-600)]' : ''} ${stateClass}`} aria-label={t('console.atMs2', { label, value, atMs: sample.atMs })}>{value}</span>)}
                </div>;
              })}
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-surface-200)]">{t('console.recordedNativePosixScenario')}</p>
        </section>
      )}
      {pedestrianCrossing && (
        <section data-recorded-pedestrian-crossing className="space-y-1 border-t border-[var(--color-surface-700)] pt-1.5" aria-label={t('console.pedestrianCrossingRecordedHost')}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />{t('console.pedestrianCrossingRecordedHost2')}</p>
          <div role="region" className="overflow-x-auto" tabIndex={0} aria-label={t('console.recordedPedestrianCrossingMatr')}>
            <div role="group" aria-label={t('console.recordedPedestrianCrossingSamp')} className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">{t('console.time')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.vehicle')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.pedestrian')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.request')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.plant')}</span>
              </div>
              {pedestrianCrossing.samples.map((sample) => (
                <div key={sample.atMs} className="flex min-w-[5.25rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{t('console.ms2', { atMs: sample.atMs })}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.vehicle === 'GREEN' ? SIGNAL_TEXT_CLASS.true : sample.vehicle === 'YELLOW' ? SIGNAL_TEXT_CLASS.true : sample.vehicle === 'RED' ? SIGNAL_TEXT_CLASS.fault : SIGNAL_TEXT_CLASS.false}`} aria-label={t('console.vehicleAtMs', { vehicle: sample.vehicle, atMs: sample.atMs })}>{sample.vehicle}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.pedestrian === 'WALK' ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.fault}`} aria-label={t('console.pedestrianAtMs', { pedestrian: sample.pedestrian, atMs: sample.atMs })}>{sample.pedestrian}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.request === 'ACTIVE' ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false}`} aria-label={t('console.requestAtMs', { request: sample.request, atMs: sample.atMs })}>{sample.request}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.phase === 'CROSSING' ? SIGNAL_TEXT_CLASS.true : sample.phase === 'WAITING' ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false}`} aria-label={t('console.plantAtMs', { phase: sample.phase, atMs: sample.atMs })}>{sample.phase}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-surface-200)]">{t('console.recordedNativePosixScenario')}</p>
        </section>
      )}
      {tankLevel && (
        <section data-recorded-tank-level className="space-y-1 border-t border-[var(--color-surface-700)] pt-1.5" aria-label={t('console.tankLevelControllerRecorded')}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-200)]"><Activity size={14} aria-hidden="true" />{t('console.tankLevelControllerRecorded2')}</p>
          <div role="region" className="overflow-x-auto" tabIndex={0} aria-label={t('console.recordedTankLevelMatrix')}>
            <div role="group" aria-label={t('console.recordedTankLevelOutputs')} className="flex min-w-max border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] text-xs tabular-nums">
              <div className="flex shrink-0 flex-col border-r border-[var(--color-surface-600)] text-[var(--color-surface-200)]">
                <span className="flex h-7 items-center px-2 font-medium">{t('console.time')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.pump')}</span>
                <span className="flex h-7 items-center border-t border-[var(--color-surface-600)] px-2">{t('console.alarm')}</span>
              </div>
              {tankLevel.samples.map((sample) => (
                <div key={sample.atMs} className="flex min-w-[5.25rem] flex-col border-r border-[var(--color-surface-600)] last:border-r-0 text-center text-[var(--color-surface-100)]">
                  <span className="flex h-7 items-center justify-center px-2 font-medium">{t('console.ms2', { atMs: sample.atMs })}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.pump === 'RUNNING' ? SIGNAL_TEXT_CLASS.true : SIGNAL_TEXT_CLASS.false}`} aria-label={t('console.pumpAtMs', { pump: sample.pump, atMs: sample.atMs })}>{sample.pump}</span>
                  <span className={`flex h-7 items-center justify-center border-t border-[var(--color-surface-600)] px-2 ${sample.alarm === 'ALARM' ? SIGNAL_TEXT_CLASS.fault : SIGNAL_TEXT_CLASS.false}`} aria-label={t('console.alarmAtMs', { alarm: sample.alarm, atMs: sample.atMs })}>{sample.alarm}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-surface-200)]">{t('console.recordedNativePosixScenario')}</p>
        </section>
      )}
    </section>
  );
}
