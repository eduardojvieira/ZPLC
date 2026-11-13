import { useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { useVmInfo } from '../store/vmInfo';
import { useCurrentExecution } from '../hooks/useDebugValue';
import { useT } from '../i18n';
import { connectionManager, type LinkInfo } from '../runtime/connectionManager';
import { ConnectionIndicator } from './ConnectionIndicator';
import { presentConnection, type ConnectionIndicatorView } from './connectionPresentation';
import { runCommand } from '../commands/bus';
import { Button } from '../ui';
import { StatusDetails, type StatusDetailRow } from './StatusDetails';
import { programStateOf, programStateText, type ProgramState, type ProgramStateInput } from './programState';
import { useRegisteredPlantTransport } from '../store/useTransport';
import type { DebugAdapterType } from '../runtime/debugAdapter';
import type { ExecutionMode } from './runtimeArtifactSelection';
import {
  presentOperationalStatus,
  reportedBoardOf,
  type OperationalStatusPresentation,
  type OperationalStatusTone,
} from './operationalStatusPresentation';

interface OperationalStatusBarProps {
  mode: ExecutionMode;
  adapterType: DebugAdapterType | null;
  connected: boolean;
  /** The program's state in words; `input` lets the rail word it again with a plant session and the place of a pause. */
  status: { text: string; tone: OperationalStatusTone; input?: ProgramStateInput };
  /** A connection to hardware is being made (UX-018). */
  connecting: boolean;
  /** The runtime reports a fault. */
  faulted: boolean;
}

// The status dot is a tone of the signal vocabulary (UX-009): the same borders as a TRUE chip, a forced chip and a fault chip.
const TONE_DOT: Record<OperationalStatusTone, string> = {
  neutral: 'bg-[var(--tone-neutral-border)]',
  info: 'bg-[var(--tone-info-border)]',
  success: 'bg-[var(--signal-true-border)]',
  attention: 'bg-[var(--signal-forced-border)]',
  danger: 'bg-[var(--signal-fault-border)]',
};

function Detail({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs" data-status-item>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={numeric ? 'font-mono tabular-nums text-[var(--color-surface-100)]' : 'text-[var(--color-surface-100)]'}>
        {value}
      </span>
    </span>
  );
}

/** Persistent, read-only operational truth for the current project session. */
export function OperationalStatusBar({ mode, adapterType, connected, status, connecting, faulted }: OperationalStatusBarProps) {
  const { t } = useT();
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const projectConfig = useIDEStore((state) => state.projectConfig);
  const controllerInfo = useIDEStore((state) => state.controllerInfo);
  const controllerStatus = useIDEStore((state) => state.controllerStatus);
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  const forcesUnconfirmed = useIDEStore((state) => state.debug.forcesUnconfirmed);
  const vmInfo = useVmInfo();
  const nativeTrace = useIDEStore((state) => state.debug.nativeTrace);
  const { isPaused, currentLine, currentPOU } = useCurrentExecution();
  const [linkInfo, setLinkInfo] = useState<LinkInfo>(connectionManager.linkInfo);
  useEffect(() => connectionManager.onLinkInfoUpdate(setLinkInfo), []);

  // A bound plant session speaks through the same line (PLS-013): the rail follows its changes.
  const plant = useRegisteredPlantTransport();

  if (!isProjectOpen) return null;
  const place = isPaused
    ? t('studio.status.place', { unit: currentPOU ?? t('studio.status.detail.none'), line: currentLine ?? 0 })
    : undefined;
  const stateInput = status.input && {
    ...status.input,
    ...(plant ? { transport: plant.state, slowdown: plant.slowdown } : {}),
    ...(place ? { place } : {}),
  };
  const state = stateInput ? programStateOf(stateInput) : undefined;
  const shownStatus = state ? { text: programStateText(state, t), tone: state.tone } : status;
  const presentation = presentOperationalStatus({
    mode,
    adapterType,
    connected,
    vmInfo,
    status: shownStatus,
    projectTargetBoard: projectConfig?.target?.board,
    projectTasks: projectConfig?.tasks,
    controllerInfo,
    controllerStatus,
    forcedValuesCount: forcedValues.size,
    forcesUnconfirmed,
    nativeTrace,
  });
  const protocol = linkInfo.firmware?.protocol.kind;
  const board = adapterType === 'serial' ? reportedBoardOf(controllerInfo) : undefined;
  const indicator = presentConnection(
    {
      mode,
      // A simulation needs no Connect: its session is implicit, so the indicator never says "not connected" for it (FLW-008, MSG-007).
      adapterType: mode === 'simulate' ? (adapterType ?? 'native') : adapterType,
      connected: mode === 'simulate' ? true : connected,
      connecting,
      faulted,
      ...(board ? { board } : {}),
      ...(protocol === 'framed' ? { link: 'framed' as const } : protocol === 'shell-only' ? { link: 'shell' as const } : {}),
    },
    t,
  );
  const none = t('studio.status.detail.none');
  const rows: StatusDetailRow[] = [
    { label: t('studio.status.detail.runtime'), value: presentation.runtime },
    {
      label: t('studio.status.detail.cycles'),
      value: presentation.cycles?.toLocaleString() ?? none,
      numeric: presentation.cycles !== undefined,
    },
    {
      label: t('studio.status.detail.tasks'),
      value: presentation.taskCount !== undefined ? String(presentation.taskCount) : presentation.taskIntervalMs !== undefined ? '1' : none,
      numeric: true,
    },
    { label: t('studio.status.detail.firmware'), value: linkInfo.firmware?.firmwareVersion ?? none },
    { label: t('studio.status.detail.protocol'), value: protocol ?? none },
  ];
  const action = state?.action ? actionOf(state, t) : undefined;
  return <OperationalStatusView presentation={presentation} indicator={indicator} rows={rows} {...(action ? { action } : {})} />;
}

function actionOf(state: ProgramState, t: ReturnType<typeof useT>['t']): { label: string; run: () => void } | undefined {
  if (state.action === 'debug.rebuildAndRestart')
    return { label: t('studio.status.action.rebuildAndRestart'), run: () => void runCommand('debug.rebuildAndRestart') };
  if (state.action === 'build.compile') return { label: t('studio.status.action.build'), run: () => void runCommand('build.compile') };
  return undefined;
}

/**
 * What the status bar shows, from values already worked out: the container above reads the store, this one only draws. One line:
 * the connection indicator, the program state (with its one action), the scan interval, the count of active forces, and the
 * overruns only when there are some (FLW-011). The rest is behind the details control.
 */
export function OperationalStatusView({
  presentation,
  indicator,
  debug,
  rows = [],
  action,
}: {
  presentation: OperationalStatusPresentation;
  indicator: ConnectionIndicatorView;
  /** The debug state of the code editor (UX-034). The container no longer passes it: a pause is worded at its place in the state. */
  debug?: string;
  rows?: StatusDetailRow[];
  action?: { label: string; run: () => void };
}) {
  const { t } = useT();
  return (
    <section
      aria-label={t('status.label')}
      className="min-h-[34px] border-b border-[var(--color-surface-700)] bg-[var(--color-surface-900)] px-3 py-1.5"
    >
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="flex flex-nowrap items-center gap-x-3 whitespace-nowrap" data-status-line>
          <span data-status-item>
            <ConnectionIndicator indicator={indicator} />
          </span>
          <span className="h-3.5 w-px bg-[var(--color-surface-700)]" aria-hidden="true" />
          <span className="flex items-center gap-2" data-status-item>
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-100)]"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ring-1 ring-[var(--color-surface-100)] ${TONE_DOT[presentation.status.tone]}`}
                aria-hidden="true"
              />
              <span>{presentation.status.text}</span>
            </span>
            {action && (
              <Button variant="secondary" size="sm" onClick={action.run}>
                {action.label}
              </Button>
            )}
          </span>
          {presentation.taskIntervalMs !== undefined && (
            <Detail label={t('studio.status.interval')} value={`${presentation.taskIntervalMs.toLocaleString()} ms`} numeric />
          )}
          {debug !== undefined && <Detail label={t('status.debug')} value={debug} />}
          {presentation.forceCount !== undefined && (
            <Detail label={t('studio.status.forces')} value={presentation.forceCount.toLocaleString()} numeric />
          )}
          {presentation.overruns !== undefined && presentation.overruns > 0 && (
            <Detail label={t('studio.status.overruns')} value={presentation.overruns.toLocaleString()} numeric />
          )}
          <span className="ml-auto">
            <StatusDetails rows={rows} />
          </span>
        </div>
        {presentation.limits && (
          <div role="note" className="mt-1 border-l-2 border-[var(--color-accent-orange)] px-2 text-xs text-[var(--color-surface-100)]">
            {presentation.limits}
          </div>
        )}
        {presentation.force && (
          <div
            className={
              `mt-1 border-l-2 px-2 text-xs ` +
              `text-[var(--color-surface-100)] ${
                presentation.force.kind === 'unconfirmed' ? 'border-[var(--signal-fault-border)]' : 'border-[var(--signal-forced-border)]'
              }`
            }
            {...(presentation.force.kind === 'unconfirmed' ? { role: 'alert' } : {})}
          >
            {presentation.force.text}
          </div>
        )}
      </div>
    </section>
  );
}
