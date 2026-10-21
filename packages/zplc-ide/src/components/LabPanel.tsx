import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';
import { labSampleIndex, labSceneFrame, nextLabPlayback, recordedLabScenes, type LabScene } from './labPlayback';
import { Button, RangeField, Select } from '../ui';
import { useT } from '../i18n';
import type { DebugController } from '../hooks/useDebugController';
import { PlantLivePanel } from '../plants/PlantLivePanel';

interface LabPanelProps {
  presentation: WorkspaceTestPresentation | null;
  runDisabled: boolean;
  running: boolean;
  onRun: () => void;
  controller?: DebugController;
}

function SceneDrawing({ scene, index }: { scene: LabScene; index: number }) {
  const { t } = useT();
  const frame = labSceneFrame(scene, index);
  const on = (value: boolean) => (value ? t('console.on') : t('console.off'));
  const act = (value: boolean) => (value ? t('labScene.active') : t('labScene.clear'));
  const det = (value: boolean) => (value ? t('labScene.detected') : t('labScene.clear'));
  const tone = (active: boolean, danger = false) =>
    active ? (danger ? 'var(--color-accent-red)' : 'var(--color-accent-green)') : 'var(--color-surface-700)';
  if (frame.kind === 'motor')
    return (
      <svg
        viewBox="0 0 520 160"
        className="h-36 w-full border border-[var(--border-color)] bg-[var(--color-surface-900)] text-[var(--text-primary)]"
        role="img"
        aria-label={t('labScene.motorLabel', {
          ms: frame.atMs,
          command: on(frame.command),
          running: on(frame.running),
          atSpeed: frame.atSpeed ? t('lab.yes') : t('lab.no'),
          speed: frame.speedPermille,
        })}
      >
        <title>{t('lab.recordedMotorState')}</title>
        <rect x="54" y="50" width="126" height="58" fill={tone(frame.command)} stroke="currentColor" />
        <circle
          cx="116"
          cy="79"
          r="22"
          fill={tone(frame.running)}
          stroke="currentColor"
          strokeDasharray={frame.atSpeed ? undefined : '5 3'}
        />
        <path d="M180 79h90" stroke="currentColor" strokeWidth="3" strokeDasharray={frame.running ? undefined : '6 4'} />
        <rect x="270" y="54" width="92" height="50" fill={tone(frame.atSpeed)} stroke="currentColor" />
        <text x="116" y="136" textAnchor="middle" fill="currentColor">
          {t('labScene.motorCaption', { command: on(frame.command), running: on(frame.running) })}
        </text>
        <text x="316" y="136" textAnchor="middle" fill="currentColor">
          {t('labScene.atSpeedCaption', { atSpeed: frame.atSpeed ? t('lab.yes') : t('lab.no'), speed: frame.speedPermille })}
        </text>
      </svg>
    );
  if (frame.kind === 'conveyor')
    return (
      <svg
        viewBox="0 0 520 160"
        className="h-36 w-full border border-[var(--border-color)] bg-[var(--color-surface-900)] text-[var(--text-primary)]"
        role="img"
        aria-label={t('labScene.conveyorLabel', {
          ms: frame.atMs,
          belt: on(frame.belt),
          diverter: on(frame.diverter),
          fault: on(frame.fault),
          classifier: act(frame.classifier),
          metal: det(frame.metal),
          diverterSensor: act(frame.diverterSensor),
          jam: det(frame.jam),
          count: frame.classifiedCount,
        })}
      >
        <title>{t('lab.recordedConveyorState')}</title>
        <rect
          x="45"
          y="74"
          width="390"
          height="24"
          fill={tone(frame.belt)}
          stroke="currentColor"
          strokeDasharray={frame.belt ? undefined : '6 4'}
        />
        <path d="M260 44v85M350 44v85" stroke="currentColor" strokeWidth="3" />
        <circle cx="260" cy="55" r="10" fill={tone(frame.classifier)} stroke="currentColor" />
        <rect x="300" y="45" width="20" height="20" fill={tone(frame.metal)} stroke="currentColor" />
        <circle cx="350" cy="55" r="10" fill={tone(frame.diverterSensor)} stroke="currentColor" />
        <path d={frame.diverter ? 'M350 100l28 22' : 'M350 100l0 30'} stroke={tone(frame.diverter)} strokeWidth="5" />
        <rect x="400" y="45" width="22" height="22" fill={tone(frame.fault, true)} stroke="currentColor" />
        <text x="45" y="137" fontSize="10" fill="currentColor">
          {t('labScene.beltCaption', { belt: on(frame.belt), diverter: on(frame.diverter), fault: on(frame.fault) })}
        </text>
        <text x="45" y="151" fontSize="9" fill="currentColor">
          {t('labScene.sensorsCaption', {
            classifier: on(frame.classifier),
            metal: on(frame.metal),
            diverterSensor: on(frame.diverterSensor),
            jam: on(frame.jam),
            count: frame.classifiedCount,
          })}
        </text>
      </svg>
    );
  if (frame.kind === 'tank') {
    const height = Math.round((92 * frame.levelPermille) / 1000);
    return (
      <svg
        viewBox="0 0 520 160"
        className="h-36 w-full border border-[var(--border-color)] bg-[var(--color-surface-900)] text-[var(--text-primary)]"
        role="img"
        aria-label={t('labScene.tankLabel', {
          ms: frame.atMs,
          level: frame.levelPermille,
          pump: frame.pump,
          alarm: frame.alarm,
          low: act(frame.low),
          high: act(frame.high),
        })}
      >
        <title>{t('lab.recordedTankState')}</title>
        <path d="M150 28h150v106H150z" fill="var(--color-surface-800)" stroke="currentColor" strokeWidth="2" />
        <path d={`M152 ${132 - height}h146v${height}H152z`} fill="var(--color-accent-blue)" />
        <circle
          cx="412"
          cy="94"
          r="24"
          fill={tone(frame.pump === 'RUNNING')}
          stroke="currentColor"
          strokeDasharray={frame.pump === 'RUNNING' ? undefined : '5 3'}
        />
        <rect x="330" y="45" width="24" height="24" fill={tone(frame.alarm === 'ALARM', true)} stroke="currentColor" />
        <text x="225" y="151" textAnchor="middle" fill="currentColor">
          {t('labScene.levelCaption', { level: frame.levelPermille, low: on(frame.low), high: on(frame.high) })}
        </text>
        <text x="412" y="140" textAnchor="middle" fill="currentColor">
          {t('labScene.pumpCaption', { pump: frame.pump, alarm: frame.alarm })}
        </text>
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 520 160"
      className="h-36 w-full border border-[var(--border-color)] bg-[var(--color-surface-900)] text-[var(--text-primary)]"
      role="img"
      aria-label={t('labScene.crossingLabel', {
        ms: frame.atMs,
        vehicle: frame.vehicle,
        pedestrian: frame.pedestrian,
        request: frame.request,
        phase: frame.phase,
      })}
    >
      <title>{t('lab.recordedPedestrianCrossingStat')}</title>
      <path d="M48 80h420" stroke="currentColor" strokeWidth="36" />
      <path d="M195 57v46M225 57v46M255 57v46M285 57v46" stroke="var(--color-surface-800)" strokeWidth="10" />
      <rect
        x="92"
        y="27"
        width="34"
        height="42"
        fill={
          frame.vehicle === 'RED'
            ? 'var(--color-accent-red)'
            : frame.vehicle === 'YELLOW'
              ? 'var(--color-accent-yellow)'
              : frame.vehicle === 'GREEN'
                ? 'var(--color-accent-green)'
                : 'var(--color-surface-700)'
        }
        stroke="currentColor"
      />
      <rect
        x="380"
        y="27"
        width="34"
        height="42"
        fill={tone(frame.pedestrian === 'WALK')}
        stroke="currentColor"
        strokeDasharray={frame.request === 'ACTIVE' ? undefined : '5 3'}
      />
      <text x="260" y="145" textAnchor="middle" fill="currentColor">
        {t('labScene.crossingCaption', {
          vehicle: frame.vehicle,
          pedestrian: frame.pedestrian,
          request: frame.request,
          phase: frame.phase,
        })}
      </text>
    </svg>
  );
}

export function LabPanel({ presentation, runDisabled, running, onRun, controller }: LabPanelProps) {
  const { t } = useT();
  const scenes = useMemo(() => recordedLabScenes(presentation), [presentation]);
  const [sceneId, setSceneId] = useState('');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scene = scenes.find((candidate) => candidate.id === sceneId) ?? scenes[0];

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (!playing || !scene || reducedMotion) return;
    const timer = window.setInterval(
      () =>
        setIndex((current) => {
          const next = nextLabPlayback(current, scene.samples.length);
          if (!next.playing) window.setTimeout(() => setPlaying(false), 0);
          return next.index;
        }),
      480,
    );
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, scene]);

  const live = <PlantLivePanel controller={controller} />;
  if (!scene)
    return (
      <div>
        {live}
        <section className="p-3 text-sm text-[var(--text-secondary)]" aria-label={t('console.tab.lab')}>
          <h2 className="font-medium text-[var(--text-primary)]">{t('console.tab.lab')}</h2>
          <p className="mt-2">{t('lab.runTheSavedHost')}</p>
          <Button variant="secondary" size="sm" onClick={onRun} disabled={runDisabled || running} className="mt-3">
            {running ? t('lab.runningScenarios') : t('console.runHostScenarios')}
          </Button>
        </section>
      </div>
    );

  const current = labSampleIndex(index, scene.samples.length);
  const sample = scene.samples[current]!;
  return (
    <div>
      {live}
      <section
        className="grid gap-3 p-3 text-sm text-[var(--text-secondary)] lg:grid-cols-[minmax(0,1fr)_14rem]"
        aria-label={t('console.tab.lab')}
      >
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-medium text-[var(--text-primary)]">{t('lab.labRecordedScenario')}</h2>
              <p className="text-xs">{t('lab.recordedNativePosixHost')}</p>
            </div>
            <Select
              label={t('lab.scenario')}
              layout="inline"
              value={scene.id}
              onChange={(event) => {
                setSceneId(event.target.value);
                setIndex(0);
                setPlaying(false);
              }}
              fieldClassName="text-xs"
            >
              {scenes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <SceneDrawing scene={scene} index={current} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (current >= scene.samples.length - 1) setIndex(0);
                setPlaying((value) => !value);
              }}
              disabled={reducedMotion}
            >
              {playing ? (
                <>
                  <Pause className="mr-1 inline" size={14} />
                  {t('toolbar.pause.label')}
                </>
              ) : (
                <>
                  <Play className="mr-1 inline" size={14} />
                  {t('lab.play')}
                </>
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIndex((value) => labSampleIndex(value + 1, scene.samples.length))}>
              <SkipForward className="mr-1 inline" size={14} />
              {t('lab.step')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIndex(0);
                setPlaying(false);
              }}
            >
              <RotateCcw className="mr-1 inline" size={14} />
              {t('lab.reset')}
            </Button>
            <output className="font-mono text-xs text-[var(--text-primary)]">
              {t('lab.ms', { atMs: sample.atMs, value: current + 1, length: scene.samples.length })}
            </output>
          </div>
          {reducedMotion && (
            <p role="status" className="mt-2 text-xs">
              {t('lab.playbackIsDisabledWhile')}
            </p>
          )}
          <RangeField
            aria-label={t('lab.recordedScenarioTimeline')}
            min="0"
            max={Math.max(0, scene.samples.length - 1)}
            value={current}
            onChange={(event) => {
              setPlaying(false);
              setIndex(Number(event.target.value));
            }}
            className="mt-2"
          />
        </div>
        <aside className="border-l border-[var(--border-color)] pl-3 text-xs">
          <h3 className="font-medium uppercase tracking-[.08em] text-[var(--text-primary)]">{t('lab.assertions')}</h3>
          <p className="mt-2 font-medium text-[var(--text-primary)]">
            {scene.passed ? t('lab.pass') : t('lab.failed')} · {scene.assertions.filter((assertion) => assertion.passed).length}/
            {scene.assertions.length}
          </p>
          <ul className="mt-2 space-y-1">
            {scene.assertions.map((assertion, assertionIndex) => (
              <li key={`${assertion.kind}-${assertionIndex}`}>
                <span aria-hidden="true">{assertion.passed ? '✓' : '×'}</span> {assertion.kind}
                {assertion.atMs !== undefined ? t('lab.ms2', { atMs: assertion.atMs }) : ''}
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
