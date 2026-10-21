/**
 * The project navigator (UX-012): by PLC objects, or by files with the declarations of the project and its library folders
 * under the tree (IDE-023). The mode is a toggle in its header and is remembered.
 */
import { useT } from '../i18n';
import { ObjectNavigator } from '../navigator/ObjectNavigator';
import { useShellLayout, type NavigatorMode } from '../store/useShellLayout';
import { ToggleGroup } from '../ui';
import { ProjectDeclarations } from './ProjectDeclarations';
import { Sidebar } from './Sidebar';

export function ProjectExplorer() {
  const { t } = useT();
  const mode = useShellLayout((state) => state.navigatorMode);
  const setMode = useShellLayout((state) => state.setNavigatorMode);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-[var(--color-surface-600)] px-2 py-1">
        <ToggleGroup
          label={t('navigator.mode.label')}
          value={mode}
          onValueChange={(value) => setMode(value as NavigatorMode)}
          options={[
            { value: 'objects', label: t('navigator.mode.objects') },
            { value: 'files', label: t('navigator.mode.files') },
          ]}
        />
      </div>
      {mode === 'objects' ? (
        <div className="min-h-0 flex-1">
          <ObjectNavigator />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1">
            <Sidebar />
          </div>
          <ProjectDeclarations />
        </>
      )}
    </div>
  );
}
