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
import type { ZPLCProjectConfig } from '../../types';
import { getBoardNetworkType } from '../../config/boardProfiles';
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
          <p className="text-center text-[var(--color-surface-400)]">{t('project.noProjectConfigurationLoaded')}</p>
        </div>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
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
              <h1 className="text-xl font-bold text-[var(--color-surface-100)]">{t('toolbar.settings')}</h1>
              <p className="text-sm text-[var(--color-surface-400)]">{t('project.configureHardwareTargetI')}</p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            tooltip={t('project.saveChangesToZplc')}
            onClick={() => {
              void handleSave();
            }}
          >
            {t('project.saveConfig')}
          </Button>
        </div>

        <AppPreferences />

        <section
          aria-labelledby="config-editors-heading"
          className="mb-4 rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-4"
        >
          <h2 id="config-editors-heading" className="text-sm font-medium text-[var(--color-surface-100)]">
            {t('configEditor.editorsHeading')}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-surface-300)]">{t('configEditor.editorsHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONFIG_EDITOR_KINDS.map((kind) => (
              <Button key={kind} size="sm" data-open-config-editor={kind} onClick={() => openConfigEditorFromNavigator(kind)}>
                {t(CONFIG_EDITOR_TITLE_KEYS[kind])}
              </Button>
            ))}
          </div>
        </section>

        {/* Settings Sections */}
        <div className="space-y-4">
          {/* ================= METADATA ================= */}
          <SettingsSection
            title={t('project.projectMetadata')}
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
            <strong className="text-[var(--color-surface-100)]">{t('project.configurationSummary')}</strong>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                {t('project.project')} <span className="text-[var(--color-accent-blue)]">{projectConfig.name}</span> {t('project.v')}
                {projectConfig.version}
                {projectConfig.author && (
                  <span className="text-[var(--color-surface-400)]">{t('project.by', { author: projectConfig.author })}</span>
                )}
              </li>
              {projectConfig.target?.board && (
                <li>
                  {t('project.target')} <span className="text-[var(--color-accent-green)]">{projectConfig.target.board}</span>
                  {projectConfig.target.clock_mhz && t('project.mhz', { clock_mhz: projectConfig.target.clock_mhz })}
                </li>
              )}
              <li>
                {t('project.iO')} <span className="text-[var(--color-accent-yellow)]">{projectConfig.io?.inputs?.length || 0}</span>{' '}
                {t('project.inputs')}
                <span className="text-[var(--color-accent-yellow)]"> {projectConfig.io?.outputs?.length || 0}</span> {t('project.outputs')}
              </li>
              <li>
                {t('project.communication')}{' '}
                <span className="text-[var(--color-accent-blue)]">
                  {projectConfig.communication?.bindings?.length || projectConfig.communication?.tags?.length || 0}
                </span>{' '}
                {t('project.tagsMqtt')}{' '}
                <span className="text-[var(--color-accent-green)]">
                  {projectConfig.communication?.mqtt?.enabled ? t('console.on') : t('console.off')}
                </span>
                {t('project.modbus')}{' '}
                <span className="text-[var(--color-accent-green)]">
                  {projectConfig.communication?.modbus?.enabled ? t('console.on') : t('console.off')}
                </span>
              </li>
              <li>
                {t('project.network')}{' '}
                <span className="text-[var(--color-accent-green)]">{getBoardNetworkType(projectConfig.target?.board)}</span>
                {projectConfig.network?.hostname ? ` (${projectConfig.network.hostname})` : ''}
              </li>
              <li>
                {t('project.tasks')} <span className="text-[var(--color-accent-green)]">{projectConfig.tasks.length}</span>{' '}
                {t('project.configured')}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
