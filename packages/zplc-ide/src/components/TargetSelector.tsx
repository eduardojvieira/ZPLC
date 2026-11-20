/**
 * The target selector of the command bar (spec 013 FLW-007): where Run goes, the simulation or the board of the project. It
 * replaces the Simulation and Hardware toggle and is the one place the bar shows the target. Choosing is the owner's
 * `handleExecutionModeChange`, which asks first while a program runs (UX-020).
 */
import { Cpu, Radio } from 'lucide-react';
import { useT } from '../i18n';
import { MenuButton } from '../ui';
import { EXECUTION_MODE, type ExecutionMode } from './runtimeArtifactSelection';

export function TargetSelector({
  mode,
  boardName,
  degraded,
  onChange,
  onChangeBoard,
}: {
  mode: ExecutionMode;
  /** The board the project names, when it names one. */
  boardName: string | undefined;
  /** The simulation runs in the browser's WebAssembly runtime, which has fewer features (IDE-025). */
  degraded: boolean;
  onChange: (mode: ExecutionMode) => void;
  onChangeBoard: () => void;
}) {
  const { t } = useT();
  const simulation = degraded ? t('studio.flow.target.degraded') : t('studio.flow.target.simulation');
  const board = boardName ?? t('studio.flow.target.board');
  const shown = mode === EXECUTION_MODE.SIMULATE ? simulation : board;
  return (
    <MenuButton
      label={t('studio.flow.target.title', { target: shown })}
      data-command-exempt="opens the target menu: online.simulation, online.hardware, project.target"
      variant="secondary"
      size="sm"
      items={[
        { id: 'simulation', command: 'online.simulation', label: simulation, onSelect: () => onChange(EXECUTION_MODE.SIMULATE) },
        {
          id: 'board',
          command: 'online.hardware',
          label: board,
          disabled: boardName === undefined,
          ...(boardName === undefined ? { disabledReason: t('studio.flow.target.noBoard') } : {}),
          onSelect: () => onChange(EXECUTION_MODE.HARDWARE),
        },
        { id: 'change', command: 'project.target', label: t('studio.flow.target.change'), separatorBefore: true, onSelect: onChangeBoard },
      ]}
    >
      {mode === EXECUTION_MODE.SIMULATE ? <Cpu size={14} aria-hidden="true" /> : <Radio size={14} aria-hidden="true" />}
      <span>{shown}</span>
    </MenuButton>
  );
}
