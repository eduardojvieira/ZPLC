import { useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { useVmInfo } from '../store/vmInfo';
import { useCurrentExecution } from '../hooks/useDebugValue';
import { useT } from '../i18n';
import { connectionManager, type LinkInfo } from '../runtime/connectionManager';
import { ConnectionIndicator } from './ConnectionIndicator';
import { presentConnection, type ConnectionIndicatorView } from './connectionPresentation';
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
  status: { text: string; tone: OperationalStatusTone };
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
    <span className="flex items-center gap-1.5 text-xs">
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
  const debugMode = useIDEStore((state) => state.debug.mode);
  const { isPaused, currentLine } = useCurrentExecution();
  const [linkInfo, setLinkInfo] = useState<LinkInfo>(connectionManager.linkInfo);
  useEffect(() => connectionManager.onLinkInfoUpdate(setLinkInfo), []);

  if (!isProjectOpen) return null;
  const presentation = presentOperationalStatus({
    mode,
    adapterType,
    connected,
    vmInfo,
    status,
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
      adapterType,
      connected,
      connecting,
      faulted,
      ...(board ? { board } : {}),
      ...(protocol === 'framed' ? { link: 'framed' as const } : protocol === 'shell-only' ? { link: 'shell' as const } : {}),
    },
    t,
  );
  // the debug state of the code editor (UX-034): it was drawn over the code before
  const debug =
    debugMode === 'none' ? undefined : isPaused ? t('status.debug.paused', { line: currentLine ?? 0 }) : t('status.debug.attached');
  return <OperationalStatusView presentation={presentation} indicator={indicator} debug={debug} />;
}

/** What the status bar shows, from values already worked out: the container above reads the store, this one only draws. */
export function OperationalStatusView({
  presentation,
  indicator,
  debug,
}: {
  presentation: OperationalStatusPresentation;
  indicator: ConnectionIndicatorView;
  debug?: string;
}) {
  const { t } = useT();
  return (
    <section
      aria-label={t('status.label')}
      className="min-h-[34px] border-b border-[var(--color-surface-700)] bg-[var(--color-surface-900)] px-3 py-1.5"
    >
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="flex min-w-max items-center gap-3 whitespace-nowrap">
          <ConnectionIndicator indicator={indicator} />
          <span className="h-3.5 w-px bg-[var(--color-surface-700)]" aria-hidden="true" />
          <Detail
            label={t('status.mode')}
            value={presentation.mode === 'HARDWARE' ? t('statusText.mode.hardware') : t('statusText.mode.simulation')}
          />
          <span className="h-3.5 w-px bg-[var(--color-surface-700)]" aria-hidden="true" />
          <Detail label={t('status.runtime')} value={presentation.runtime} />
          {presentation.target && <Detail label={t('status.target')} value={presentation.target} />}
          {debug !== undefined && <Detail label={t('status.debug')} value={debug} />}
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
          {presentation.cycles !== undefined && <Detail label={t('status.cycles')} value={presentation.cycles.toLocaleString()} numeric />}
          {presentation.taskIntervalMs !== undefined && (
            <Detail label={t('status.taskInterval')} value={`${presentation.taskIntervalMs.toLocaleString()} ms`} numeric />
          )}
          {presentation.taskCount !== undefined && <Detail label={t('status.tasks')} value={String(presentation.taskCount)} numeric />}
          {presentation.overruns !== undefined && (
            <Detail label={t('status.overruns')} value={presentation.overruns.toLocaleString()} numeric />
          )}
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
