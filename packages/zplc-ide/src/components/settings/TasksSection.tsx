/** The tasks of the project and the programs each one runs. */

import { useId } from 'react';
import { useT } from '../../i18n';
import {
  Clock,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { useFileTreeState } from '../../store/regionSubscriptions';
import { listTaskPrograms } from '../../utils/fileSystem';
import { ZPLC_CONSTANTS } from '@zplc/compiler';
import { getTaskIntervalMs } from './taskFieldAccessors';
import type {
  TaskDefinition,
  TaskTrigger,
} from '../../types';
import type { SectionProps } from './settingsSectionProps';
import { Button, IconButton, NumberField, Select, TextField } from '../../ui';

export function TasksSection({ config, updateConfig }: SectionProps) {
  const { t } = useT();
  const { fileTree } = useFileTreeState();
  const tasks = config.tasks;
  const taskLimitId = useId();
  const atTaskLimit = tasks.length >= ZPLC_CONSTANTS.MAX_TASKS;
  const availablePrograms = listTaskPrograms(fileTree);

  const addTask = () => {
    if (atTaskLimit) return;
    const newTask: TaskDefinition = {
      name: `Task${tasks.length + 1}`,
      trigger: 'cyclic',
      interval: 100,
      priority: 5,
      programs: [],
    };
    updateConfig({ tasks: [...tasks, newTask] });
  };

  const updateTask = (index: number, updates: Partial<TaskDefinition>) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    updateConfig({ tasks: newTasks });
  };

  const removeTask = (index: number) => {
    updateConfig({ tasks: tasks.filter((_, i) => i !== index) });
  };

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--color-surface-400)]">
          {t('settings.tasks.intro')}
        </p>
        <Button variant="secondary" size="sm" onClick={addTask} disabled={atTaskLimit} aria-describedby={atTaskLimit ? taskLimitId : undefined}>
          <Plus size={12} />
          {t('settings.tasks.add')}
        </Button>
      </div>
      {atTaskLimit && <p id={taskLimitId} role="status" className="mb-3 text-xs text-[var(--color-accent-yellow)]">{t('settings.tasks.limit', { count: tasks.length, max: ZPLC_CONSTANTS.MAX_TASKS })}</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--color-surface-400)] text-center py-4 bg-[var(--color-surface-700)] rounded">
          {t('settings.tasks.none')}
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <TaskCard
              key={index}
              task={task}
              availablePrograms={availablePrograms}
              onUpdate={(updates) => updateTask(index, updates)}
              onRemove={() => removeTask(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Task Card sub-component
interface TaskCardProps {
  task: TaskDefinition;
  availablePrograms: string[];
  onUpdate: (updates: Partial<TaskDefinition>) => void;
  onRemove: () => void;
}

function TaskCard({ task, availablePrograms, onUpdate, onRemove }: TaskCardProps) {
  const { t } = useT();
  // Currently only one program per task is supported by the runtime
  // Programs are stored WITH extension (e.g., "main.st", "main.fbd")
  const selectedProgram = task.programs[0] || '';

  return (
    <div className="bg-[var(--color-surface-700)] rounded-lg p-3 border border-[var(--color-surface-500)]">
      <div className="flex items-center justify-between mb-3">
        <TextField aria-label={t('settings.tasks.name')} value={task.name} onChange={(e) => onUpdate({ name: e.target.value })} />
        <IconButton label={t('settings.tasks.remove')} variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={onRemove} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Trigger */}
        <div>
          <Select label={t('settings.tasks.trigger')} value={task.trigger} onChange={(e) => onUpdate({ trigger: e.target.value as TaskTrigger })} className="w-full">
            <option value="cyclic">{t('settings.tasks.cyclic')}</option>
            <option value="event">{t('settings.tasks.event')}</option>
            <option value="freewheeling">{t('settings.tasks.freewheeling')}</option>
          </Select>
        </div>

        {/* Interval */}
        <div>
          <NumberField label={<><Clock size={10} className="mr-1 inline" aria-hidden="true" />{t('settings.tasks.interval')}</>} min={1} max={10000} value={getTaskIntervalMs(task)} onChange={(e) => onUpdate({ interval_ms: parseInt(e.target.value) || 100 })} disabled={task.trigger !== 'cyclic'} className="w-full" />
        </div>

        {/* Priority */}
        <div>
          <NumberField label={t('settings.tasks.priority')} min={0} max={255} value={task.priority} onChange={(e) => { const priority = parseInt(e.target.value); onUpdate({ priority: Number.isNaN(priority) ? 1 : priority }); }} className="w-full" />
        </div>

      </div>

      {/* Program */}
      <div className="mt-3">
        <Select label={<><Play size={10} className="mr-1 inline" aria-hidden="true" />{t('settings.tasks.program')}</>} value={selectedProgram} onChange={(e) => onUpdate({
            programs: e.target.value ? [e.target.value] : []
          })} className="w-full">
          <option value="">{t('settings.tasks.select')}</option>
          {availablePrograms.map((prog) => (
            <option key={prog} value={prog}>
              {prog}
            </option>
          ))}
        </Select>
        {availablePrograms.length === 0 && (
          <p className="mt-1 text-xs text-[var(--color-accent-yellow)]">
            {t('settings.tasks.noPrograms')}
          </p>
        )}
      </div>
    </div>
  );
}
