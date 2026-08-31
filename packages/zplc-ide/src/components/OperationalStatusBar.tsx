import { useIDEStore } from '../store/useIDEStore';
import type { DebugAdapterType, VMInfo } from '../runtime/debugAdapter';
import type { ExecutionMode } from './runtimeArtifactSelection';
import { presentOperationalStatus, type OperationalStatusTone } from './operationalStatusPresentation';

interface OperationalStatusBarProps {
  mode: ExecutionMode;
  adapterType: DebugAdapterType | null;
  connected: boolean;
  vmInfo: VMInfo | null;
  status: { text: string; tone: OperationalStatusTone };
}

const TONE_DOT: Record<OperationalStatusTone, string> = {
  neutral: 'bg-[var(--color-surface-500)]',
  info: 'bg-[var(--color-accent-blue)]',
  success: 'bg-[var(--color-accent-green)]',
  attention: 'bg-[var(--color-accent-orange)]',
  danger: 'bg-[var(--color-accent-red)]',
};

function Detail({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={numeric ? 'font-mono tabular-nums text-[var(--color-surface-100)]' : 'text-[var(--color-surface-100)]'}>{value}</span>
    </span>
  );
}

/** Persistent, read-only operational truth for the current project session. */
export function OperationalStatusBar({ mode, adapterType, connected, vmInfo, status }: OperationalStatusBarProps) {
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const projectConfig = useIDEStore((state) => state.projectConfig);
  const controllerInfo = useIDEStore((state) => state.controllerInfo);
  const controllerStatus = useIDEStore((state) => state.controllerStatus);
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  const forcesUnconfirmed = useIDEStore((state) => state.debug.forcesUnconfirmed);
  const nativeTrace = useIDEStore((state) => state.debug.nativeTrace);

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

  return (
    <section aria-label="Operational status" className="min-h-[34px] border-b border-[var(--color-surface-700)] bg-[var(--color-surface-900)] px-3 py-1.5">
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="flex min-w-max items-center gap-3 whitespace-nowrap">
          <Detail label="Mode" value={presentation.mode} />
          <span className="h-3.5 w-px bg-[var(--color-surface-700)]" aria-hidden="true" />
          <Detail label="Runtime" value={presentation.runtime} />
          {presentation.target && <Detail label="Target" value={presentation.target} />}
          <span role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-surface-100)]">
            <span className={`h-1.5 w-1.5 rounded-full ring-1 ring-[var(--color-surface-100)] ${TONE_DOT[presentation.status.tone]}`} aria-hidden="true" />
            <span>{presentation.status.text}</span>
          </span>
          {presentation.cycles !== undefined && <Detail label="cycles" value={presentation.cycles.toLocaleString()} numeric />}
          {presentation.taskIntervalMs !== undefined && <Detail label="task interval" value={`${presentation.taskIntervalMs.toLocaleString()} ms`} numeric />}
          {presentation.taskCount !== undefined && <Detail label="tasks" value={String(presentation.taskCount)} numeric />}
          {presentation.overruns !== undefined && <Detail label="overruns" value={presentation.overruns.toLocaleString()} numeric />}
        </div>
        {presentation.force && (
          <div className={`mt-1 border-l-2 px-2 text-xs text-[var(--color-surface-100)] ${presentation.force.kind === 'unconfirmed' ? 'border-[var(--color-accent-red)]' : 'border-[var(--color-accent-orange)]'}`} {...(presentation.force.kind === 'unconfirmed' ? { role: 'alert' } : {})}>
            {presentation.force.text}
          </div>
        )}
      </div>
    </section>
  );
}
