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
        <button
          type="button"
          onClick={addTask}
          disabled={atTaskLimit}
          aria-describedby={atTaskLimit ? taskLimitId : undefined}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus size={12} />
          Add Task
        </button>
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
        <input
          type="text"
          value={task.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="text-sm font-medium bg-transparent text-[var(--color-surface-100)] border-b border-transparent focus:border-[var(--color-accent-blue)] focus:outline-none"
        />
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-[var(--color-surface-600)] text-[var(--color-accent-red)]"
          title="Remove Task"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Trigger */}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Trigger
          </label>
          <select
            value={task.trigger}
            onChange={(e) => onUpdate({ trigger: e.target.value as TaskTrigger })}
            className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
          >
            <option value="cyclic">Cyclic</option>
            <option value="event">Event</option>
            <option value="freewheeling">Freewheeling</option>
          </select>
        </div>

        {/* Interval */}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            <Clock size={10} className="inline mr-1" />
            Interval (ms)
          </label>
          <input
            type="number"
            min={1}
            max={10000}
            value={getTaskIntervalMs(task)}
            onChange={(e) => onUpdate({ interval_ms: parseInt(e.target.value) || 100 })}
            disabled={task.trigger !== 'cyclic'}
            className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Priority
          </label>
          <input
            type="number"
            min={0}
            max={255}
            value={task.priority}
            onChange={(e) => onUpdate({ priority: parseInt(e.target.value) || 1 })}
            className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
          />
        </div>

      </div>

      {/* Program */}
      <div className="mt-3">
        <label className="block text-xs text-[var(--color-surface-400)] mb-1">
          <Play size={10} className="inline mr-1" />
          Program
        </label>
        <select
          value={selectedProgram}
          onChange={(e) => onUpdate({
            programs: e.target.value ? [e.target.value] : []
          })}
          className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
        >
          <option value="">Select a program...</option>
          {availablePrograms.map((prog) => (
            <option key={prog} value={prog}>
              {prog}
            </option>
          ))}
        </select>
        {availablePrograms.length === 0 && (
          <p className="mt-1 text-xs text-[var(--color-accent-yellow)]">
            No program files found. Create a .st, .fbd, .ld, or .sfc file first.
          </p>
        )}
      </div>
    </div>
  );
}
