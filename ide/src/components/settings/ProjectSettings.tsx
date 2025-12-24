/**
 * ProjectSettings Component
 * 
 * Displays project configuration settings:
 * - Project name
 * - Task execution mode (cyclic vs freewheeling)
 * - Cycle time
 * - Priority
 * - Watchdog timeout
 * - Entry point POU
 */

import { Settings, Clock, Zap, Shield, Play } from 'lucide-react';
import { useIDEStore } from '../../store/useIDEStore';

export function ProjectSettings() {
  const { projectConfig, updateProjectConfig, files } = useIDEStore();

  // Get list of programs (files that could be entry points)
  const programFiles = files.filter((f) => 
    f.language === 'ST' || f.language === 'IL' || 
    f.language === 'LD' || f.language === 'FBD' || f.language === 'SFC'
  );

  const handleChange = <K extends keyof typeof projectConfig>(
    key: K,
    value: typeof projectConfig[K]
  ) => {
    updateProjectConfig({ [key]: value });
  };

  return (
    <div className="h-full overflow-auto bg-[var(--color-surface-900)] p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-[var(--color-accent-blue)]/20">
            <Settings className="text-[var(--color-accent-blue)]" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-surface-100)]">
              Project Settings
            </h1>
            <p className="text-sm text-[var(--color-surface-400)]">
              Configure task execution and runtime behavior
            </p>
          </div>
        </div>

        {/* Settings Form */}
        <div className="space-y-6">
          {/* Project Name */}
          <div className="bg-[var(--color-surface-800)] rounded-lg p-4 border border-[var(--color-surface-600)]">
            <label className="block text-sm font-medium text-[var(--color-surface-200)] mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={projectConfig.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
            />
          </div>

          {/* Task Mode */}
          <div className="bg-[var(--color-surface-800)] rounded-lg p-4 border border-[var(--color-surface-600)]">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-[var(--color-accent-yellow)]" />
              <label className="block text-sm font-medium text-[var(--color-surface-200)]">
                Task Execution Mode
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleChange('taskMode', 'cyclic')}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  projectConfig.taskMode === 'cyclic'
                    ? 'bg-[var(--color-accent-blue)]/20 border-[var(--color-accent-blue)] text-[var(--color-surface-100)]'
                    : 'bg-[var(--color-surface-700)] border-[var(--color-surface-500)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
                }`}
              >
                <div className="font-medium">Cyclic</div>
                <div className="text-xs text-[var(--color-surface-400)] mt-1">
                  Fixed interval execution (recommended)
                </div>
              </button>
              <button
                onClick={() => handleChange('taskMode', 'freewheeling')}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  projectConfig.taskMode === 'freewheeling'
                    ? 'bg-[var(--color-accent-blue)]/20 border-[var(--color-accent-blue)] text-[var(--color-surface-100)]'
                    : 'bg-[var(--color-surface-700)] border-[var(--color-surface-500)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
                }`}
              >
                <div className="font-medium">Freewheeling</div>
                <div className="text-xs text-[var(--color-surface-400)] mt-1">
                  Run as fast as possible
                </div>
              </button>
            </div>
          </div>

          {/* Timing Settings */}
          <div className="bg-[var(--color-surface-800)] rounded-lg p-4 border border-[var(--color-surface-600)]">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-[var(--color-accent-green)]" />
              <label className="block text-sm font-medium text-[var(--color-surface-200)]">
                Timing Configuration
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[var(--color-surface-400)] mb-1">
                  Cycle Time (ms)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={projectConfig.cycleTimeMs}
                  onChange={(e) => handleChange('cycleTimeMs', parseInt(e.target.value) || 10)}
                  disabled={projectConfig.taskMode === 'freewheeling'}
                  className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-[10px] text-[var(--color-surface-500)] mt-1">
                  {projectConfig.taskMode === 'freewheeling' 
                    ? 'N/A in freewheeling mode' 
                    : 'Target scan time'}
                </p>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-surface-400)] mb-1">
                  Watchdog Timeout (ms)
                </label>
                <input
                  type="number"
                  min={10}
                  max={60000}
                  value={projectConfig.watchdogMs}
                  onChange={(e) => handleChange('watchdogMs', parseInt(e.target.value) || 100)}
                  className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
                />
                <p className="text-[10px] text-[var(--color-surface-500)] mt-1">
                  Maximum cycle execution time
                </p>
              </div>
            </div>
          </div>

          {/* Priority */}
          <div className="bg-[var(--color-surface-800)] rounded-lg p-4 border border-[var(--color-surface-600)]">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-[var(--color-accent-purple)]" />
              <label className="block text-sm font-medium text-[var(--color-surface-200)]">
                Task Priority
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={projectConfig.priority}
              onChange={(e) => handleChange('priority', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[var(--color-surface-400)] mt-1">
              <span>Low (0)</span>
              <span className="font-medium text-[var(--color-surface-200)]">
                {projectConfig.priority}
              </span>
              <span>High (10)</span>
            </div>
          </div>

          {/* Entry Point POU */}
          <div className="bg-[var(--color-surface-800)] rounded-lg p-4 border border-[var(--color-surface-600)]">
            <div className="flex items-center gap-2 mb-3">
              <Play size={16} className="text-[var(--color-accent-blue)]" />
              <label className="block text-sm font-medium text-[var(--color-surface-200)]">
                Entry Point (Start POU)
              </label>
            </div>
            <select
              value={projectConfig.startPOU}
              onChange={(e) => handleChange('startPOU', e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
            >
              {programFiles.map((file) => {
                // Extract program name from file
                const baseName = file.name.replace(/\.(st|il|ld\.json|ld|fbd\.json|fbd|sfc\.json|sfc)$/i, '');
                return (
                  <option key={file.id} value={baseName}>
                    {baseName} ({file.language})
                  </option>
                );
              })}
              {/* Show current value if not in file list (e.g., custom name) */}
              {!programFiles.some(f => {
                const baseName = f.name.replace(/\.(st|il|ld\.json|ld|fbd\.json|fbd|sfc\.json|sfc)$/i, '');
                return baseName === projectConfig.startPOU;
              }) && (
                <option value={projectConfig.startPOU}>
                  {projectConfig.startPOU} (custom)
                </option>
              )}
            </select>
            <p className="text-xs text-[var(--color-surface-400)] mt-2">
              The program that will be executed when the PLC starts.
            </p>
          </div>

          {/* Summary Card */}
          <div className="bg-[var(--color-surface-700)]/50 rounded-lg p-4 border border-[var(--color-surface-600)]">
            <div className="text-sm text-[var(--color-surface-300)]">
              <strong className="text-[var(--color-surface-100)]">Configuration Summary:</strong>
              <ul className="mt-2 space-y-1 text-xs">
                <li>
                  • Task will run in <span className="text-[var(--color-accent-blue)]">{projectConfig.taskMode}</span> mode
                  {projectConfig.taskMode === 'cyclic' && (
                    <> every <span className="text-[var(--color-accent-green)]">{projectConfig.cycleTimeMs}ms</span></>
                  )}
                </li>
                <li>
                  • Watchdog will trip after <span className="text-[var(--color-accent-orange)]">{projectConfig.watchdogMs}ms</span>
                </li>
                <li>
                  • Entry point: <span className="text-[var(--color-accent-purple)]">{projectConfig.startPOU}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
