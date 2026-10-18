/**
 * The middle and the end of the command bar (UX-011): the name of the project, the entry to the command palette, and, in
 * the compact shell (UX-023), a menu that holds what the bar leaves out so that nothing is clipped at the 1024 pixel minimum.
 * The bar itself, with the build, connect and run controls, is the toolbar.
 */
import { Command, Ellipsis, PanelRight } from 'lucide-react';
import { useT } from '../i18n';
import { runCommand } from '../commands/bus';
import { commandById, type CommandId } from '../commands/registry';
import { shortcutText, withShortcut } from '../commands/shortcutLabels';
import { useIDEStore } from '../store/useIDEStore';
import { useShellLayout } from '../store/useShellLayout';
import { IconButton, MenuButton } from '../ui';

/** What the bar shows only above the compact width, and the compact shell offers here instead. */
const OVERFLOW: readonly CommandId[] = ['project.settings', 'view.themeLight', 'view.themeDark', 'view.themeHighContrast', 'view.themeSystem', 'help.shortcuts'];

export function CommandBarCenter() {
  const { t } = useT();
  const projectName = useIDEStore((state) => state.projectName);
  const inspectorShown = useShellLayout((state) => state.secondaryVisible);
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center justify-center px-2">
        <span data-project-name className="truncate text-sm text-[var(--color-surface-200)]">{projectName}</span>
      </div>
      <IconButton label={withShortcut(t('commandBar.inspector'), 'view.toggleSecondarySidebar')} icon={<PanelRight size={16} />} aria-pressed={inspectorShown} data-toggle-inspector onClick={() => { runCommand('view.toggleSecondarySidebar'); }} />
      <IconButton label={withShortcut(t('commandBar.palette'), 'view.commandPalette')} icon={<Command size={16} />} onClick={() => { runCommand('view.commandPalette'); }} />
      <MenuButton
        label={t('commandBar.more')}
        variant="ghost"
        size="sm"
        placement="bottom-end"
        className="hidden max-[1100px]:inline-flex"
        items={OVERFLOW.map((id, index) => ({
          id,
          label: t(commandById(id).titleKey),
          shortcut: shortcutText(id) ?? undefined,
          separatorBefore: index === 1 || id === 'help.shortcuts',
          onSelect: () => { runCommand(id); },
        }))}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </MenuButton>
    </>
  );
}
