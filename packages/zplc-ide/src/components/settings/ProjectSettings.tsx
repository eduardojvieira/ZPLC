/**
 * ProjectSettings Component
 *
 * Complete project configuration editor for zplc.json. Each section is a module of its own:
 * - Project Metadata (name, version, description, author)
 * - Target Hardware (board, cpu, clock_mhz) and its toolchain
 * - Network (Wi-Fi or Ethernet of the board)
 * - I/O Mapping (inputs, outputs)
 * - Communication (MQTT, Modbus, tags)
 * - Task Configuration (cyclic, event, freewheeling)
 */

import { useState } from 'react';
import {
  Settings,
  Zap,
  Cpu,
  Cable,
  FileText,
  Radio,
} from 'lucide-react';
import { useIDEStore } from '../../store/useIDEStore';
import type {
  ZPLCProjectConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import { AppPreferences } from './AppPreferences';
import { SettingsSection } from './SettingsSection';
import { MetadataSection } from './MetadataSection';
import { TargetSection } from './TargetSection';
import { NetworkSection } from './NetworkSection';
import { IOSection } from './IOSection';
import { CommunicationSection } from './CommunicationSection';
import { TasksSection } from './TasksSection';

export function ProjectSettings() {
  const { projectConfig, saveProjectConfig, updateProjectConfig } = useIDEStore();

  // Section collapse state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    metadata: true,
    target: true,
    network: true,
    io: true,
    communication: true,
    tasks: true,
  });

  if (!projectConfig) {
    return (
      <div className="h-full overflow-auto bg-[var(--color-surface-900)] p-6">
        <div className="max-w-3xl mx-auto">
          <AppPreferences />
          <p className="text-center text-[var(--color-surface-400)]">No project configuration loaded</p>
        </div>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Generic update helper for nested config
  const updateConfig = (updates: Partial<ZPLCProjectConfig>) => {
    updateProjectConfig(updates);
  };

  // Save to disk
  // Catches its own errors; the button starts it with `void`.
  const handleSave = async () => {
    try {
      await saveProjectConfig();
    } catch (err) {
      console.error('[ProjectSettings] handleSave error:', err);
    }
  };

  return (
    <div className="h-full overflow-auto bg-[var(--color-surface-900)] p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-accent-blue)]/20">
              <Settings className="text-[var(--color-accent-blue)]" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--color-surface-100)]">
                Project Settings
              </h1>
              <p className="text-sm text-[var(--color-surface-400)]">
                Configure hardware target, I/O mapping, and runtime behavior
              </p>
            </div>
          </div>
          <button
            onClick={() => { void handleSave(); }}
            className="px-4 py-2 text-sm rounded font-medium transition-colors bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white"
            title="Save changes to zplc.json"
          >
            Save Config
          </button>
        </div>

        <AppPreferences />

        {/* Settings Sections */}
        <div className="space-y-4">
          {/* ================= METADATA ================= */}
          <SettingsSection
            title="Project Metadata"
            icon={<FileText size={16} />}
            isExpanded={expandedSections.metadata}
            onToggle={() => toggleSection('metadata')}
          >
            <MetadataSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= TARGET HARDWARE ================= */}
          <SettingsSection
            title="Target Hardware"
            icon={<Cpu size={16} />}
            isExpanded={expandedSections.target}
            onToggle={() => toggleSection('target')}
            badge={projectConfig.target?.board}
          >
            <TargetSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          <SettingsSection
            title="Network"
            icon={<Radio size={16} />}
            isExpanded={expandedSections.network}
            onToggle={() => toggleSection('network')}
          >
            <NetworkSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= I/O MAPPING ================= */}
          <SettingsSection
            title="I/O Mapping"
            icon={<Cable size={16} />}
            isExpanded={expandedSections.io}
            onToggle={() => toggleSection('io')}
            badge={`${projectConfig.io?.inputs?.length || 0} IN / ${projectConfig.io?.outputs?.length || 0} OUT`}
          >
            <IOSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          <SettingsSection
            title="Communication"
            icon={<Radio size={16} />}
            isExpanded={expandedSections.communication}
            onToggle={() => toggleSection('communication')}
            badge={`${(projectConfig.communication?.bindings?.length || projectConfig.communication?.tags?.length || 0)} tag${(projectConfig.communication?.bindings?.length || projectConfig.communication?.tags?.length || 0) !== 1 ? 's' : ''}`}
          >
            <CommunicationSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= TASKS ================= */}
          <SettingsSection
            title="Task Configuration"
            icon={<Zap size={16} />}
            isExpanded={expandedSections.tasks}
            onToggle={() => toggleSection('tasks')}
            badge={`${projectConfig.tasks.length} task${projectConfig.tasks.length !== 1 ? 's' : ''}`}
          >
            <TasksSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

        </div>

        {/* Summary Footer */}
        <div className="mt-6 bg-[var(--color-surface-700)]/50 rounded-lg p-4 border border-[var(--color-surface-600)]">
          <div className="text-sm text-[var(--color-surface-300)]">
            <strong className="text-[var(--color-surface-100)]">Configuration Summary:</strong>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                Project: <span className="text-[var(--color-accent-blue)]">{projectConfig.name}</span> v{projectConfig.version}
                {projectConfig.author && <span className="text-[var(--color-surface-400)]"> by {projectConfig.author}</span>}
              </li>
              {projectConfig.target?.board && (
                <li>
                  Target: <span className="text-[var(--color-accent-green)]">{projectConfig.target.board}</span>
                  {projectConfig.target.clock_mhz && ` @ ${projectConfig.target.clock_mhz} MHz`}
                </li>
              )}
              <li>
                I/O: <span className="text-[var(--color-accent-yellow)]">{projectConfig.io?.inputs?.length || 0}</span> inputs,
                <span className="text-[var(--color-accent-yellow)]"> {projectConfig.io?.outputs?.length || 0}</span> outputs
              </li>
              <li>
                Communication: <span className="text-[var(--color-accent-blue)]">{projectConfig.communication?.bindings?.length || projectConfig.communication?.tags?.length || 0}</span> tags,
                MQTT <span className="text-[var(--color-accent-green)]">{projectConfig.communication?.mqtt?.enabled ? 'ON' : 'OFF'}</span>,
                Modbus <span className="text-[var(--color-accent-green)]">{projectConfig.communication?.modbus?.enabled ? 'ON' : 'OFF'}</span>
              </li>
              <li>
                Network: <span className="text-[var(--color-accent-green)]">{getBoardNetworkType(projectConfig.target?.board)}</span>
                {projectConfig.network?.hostname ? ` (${projectConfig.network.hostname})` : ''}
              </li>
              <li>
                Tasks: <span className="text-[var(--color-accent-green)]">{projectConfig.tasks.length}</span> configured
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
