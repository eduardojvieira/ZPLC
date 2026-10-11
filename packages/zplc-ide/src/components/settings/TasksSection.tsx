/** The tasks of the project and the programs each one runs. */

import { useId } from 'react';
import {
  Clock,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { useIDEStore } from '../../store/useIDEStore';
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
  const { fileTree } = useIDEStore();
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
          Define how and when your programs execute (IEC 61131-3 task model)
        </p>
        <Button variant="secondary" size="sm" onClick={addTask} disabled={atTaskLimit} aria-describedby={atTaskLimit ? taskLimitId : undefined}>
          <Plus size={12} />
          Add Task
        </Button>
      </div>
      {atTaskLimit && <p id={taskLimitId} role="status" className="mb-3 text-xs text-[var(--color-accent-yellow)]">Task limit reached: {tasks.length} of {ZPLC_CONSTANTS.MAX_TASKS}. Remove a task before adding another.</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--color-surface-400)] text-center py-4 bg-[var(--color-surface-700)] rounded">
          No tasks configured. Add a task to define program execution.
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
  // Currently only one program per task is supported by the runtime
  // Programs are stored WITH extension (e.g., "main.st", "main.fbd")
  const selectedProgram = task.programs[0] || '';

  return (
    <div className="bg-[var(--color-surface-700)] rounded-lg p-3 border border-[var(--color-surface-500)]">
      <div className="flex items-center justify-between mb-3">
        <TextField aria-label="Task name" value={task.name} onChange={(e) => onUpdate({ name: e.target.value })} />
        <IconButton label="Remove Task" variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={onRemove} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Trigger */}
        <div>
          <Select label="Trigger" value={task.trigger} onChange={(e) => onUpdate({ trigger: e.target.value as TaskTrigger })} className="w-full">
            <option value="cyclic">Cyclic</option>
            <option value="event">Event</option>
            <option value="freewheeling">Freewheeling</option>
          </Select>
        </div>

        {/* Interval */}
        <div>
          <NumberField label={<><Clock size={10} className="mr-1 inline" aria-hidden="true" />Interval (ms)</>} min={1} max={10000} value={getTaskIntervalMs(task)} onChange={(e) => onUpdate({ interval_ms: parseInt(e.target.value) || 100 })} disabled={task.trigger !== 'cyclic'} className="w-full" />
        </div>

        {/* Priority */}
        <div>
          <NumberField label="Priority" min={0} max={255} value={task.priority} onChange={(e) => onUpdate({ priority: parseInt(e.target.value) || 1 })} className="w-full" />
        </div>

      </div>

      {/* Program */}
      <div className="mt-3">
        <Select label={<><Play size={10} className="mr-1 inline" aria-hidden="true" />Program</>} value={selectedProgram} onChange={(e) => onUpdate({
            programs: e.target.value ? [e.target.value] : []
          })} className="w-full">
          <option value="">Select a program...</option>
          {availablePrograms.map((prog) => (
            <option key={prog} value={prog}>
              {prog}
            </option>
          ))}
        </Select>
        {availablePrograms.length === 0 && (
          <p className="mt-1 text-xs text-[var(--color-accent-yellow)]">
            No program files found. Create a .st, .fbd, .ld, or .sfc file first.
          </p>
        )}
      </div>
    </div>
  );
}
