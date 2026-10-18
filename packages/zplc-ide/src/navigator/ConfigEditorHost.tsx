/**
 * The body of a configuration editor tab (UX-013): the form that the project settings page used to hold for tasks, I/O
 * mapping, network, communication or target, unchanged, under a header with the save button. Every setting those sections
 * offered is offered here, because it is the same section component editing the same configuration.
 */
import { useT } from '../i18n';
import { useProjectSettingsState } from '../store/regionSubscriptions';
import { useIDEStore } from '../store/useIDEStore';
import type { SectionProps } from '../components/settings/settingsSectionProps';
import { Badge, Button } from '../ui';
import { CONFIG_EDITOR_ICONS, CONFIG_EDITOR_SECTIONS } from './configEditorSections';
import { CONFIG_EDITOR_TITLE_KEYS, type ConfigEditorKind } from './configEditors';

interface ConfigEditorBodyProps extends SectionProps { kind: ConfigEditorKind }

/** The form alone, for the editor and for the test that compares it with the section. */
export function ConfigEditorBody({ kind, config, updateConfig }: ConfigEditorBodyProps) {
  const Section = CONFIG_EDITOR_SECTIONS[kind];
  return <Section config={config} updateConfig={updateConfig} />;
}

export function ConfigEditorHost({ kind }: { kind: ConfigEditorKind }) {
  const { t } = useT();
  const { projectConfig, updateProjectConfig, saveProjectConfig } = useProjectSettingsState();
  const dirty = useIDEStore((state) => state.projectConfigDirty);
  const Icon = CONFIG_EDITOR_ICONS[kind];
  const title = t(CONFIG_EDITOR_TITLE_KEYS[kind]);
  if (!projectConfig) return <div className="h-full p-6 text-sm text-[var(--color-surface-300)]">{t('configEditor.noProject')}</div>;
  return (
    <div className="h-full overflow-auto bg-[var(--color-surface-900)] p-6" data-config-editor={kind}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-surface-100)]">
            <Icon size={18} className="text-[var(--color-accent-blue)]" aria-hidden />
            {title}
          </h1>
          <div className="flex items-center gap-2">
            <Badge>{dirty ? t('configEditor.unsaved') : t('configEditor.saved')}</Badge>
            <Button variant="primary" size="sm" disabled={!dirty} onClick={() => { void saveProjectConfig(); }}>{t('configEditor.save')}</Button>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-4">
          <ConfigEditorBody kind={kind} config={projectConfig} updateConfig={updateProjectConfig} />
        </div>
      </div>
    </div>
  );
}

export default ConfigEditorHost;
