/**
 * ProjectSettings Component
 *
 * The settings tab of zplc.json: the project metadata, the preferences of the application and a summary. The target, the
 * network, the I/O mapping, the communication and the tasks are editors of their own, tabs of the editor area opened from
 * the project navigator or from the list below (UX-013); they are the same sections, unchanged.
 */

import { useState } from 'react';
import { Settings, FileText } from 'lucide-react';
import { useProjectSettingsState } from '../../store/regionSubscriptions';
import type {
  ZPLCProjectConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import { AppPreferences } from './AppPreferences';
import { SettingsSection } from './SettingsSection';
import { MetadataSection } from './MetadataSection';
import { Button } from '../../ui';
import { useT } from '../../i18n';
import { CONFIG_EDITOR_KINDS, CONFIG_EDITOR_TITLE_KEYS } from '../../navigator/configEditors';
import { openConfigEditorFromNavigator } from '../../navigator/openConfigEditor';

export function ProjectSettings() {
  const { projectConfig, saveProjectConfig, updateProjectConfig } = useProjectSettingsState();

  // Section collapse state
  const { t } = useT();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ metadata: true });

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
          <Button variant="primary" size="sm" tooltip="Save changes to zplc.json" onClick={() => { void handleSave(); }}>
            Save Config
          </Button>
        </div>

        <AppPreferences />

        <section aria-labelledby="config-editors-heading" className="mb-4 rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-4">
          <h2 id="config-editors-heading" className="text-sm font-medium text-[var(--color-surface-100)]">{t('configEditor.editorsHeading')}</h2>
          <p className="mt-1 text-xs text-[var(--color-surface-300)]">{t('configEditor.editorsHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONFIG_EDITOR_KINDS.map((kind) => (
              <Button key={kind} size="sm" data-open-config-editor={kind} onClick={() => openConfigEditorFromNavigator(kind)}>{t(CONFIG_EDITOR_TITLE_KEYS[kind])}</Button>
            ))}
          </div>
        </section>

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
