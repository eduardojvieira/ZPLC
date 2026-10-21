/**
 * The shortcut reference (UX-015): every registered command with its shortcut, by menu. It opens from Help, from the
 * palette, or with Ctrl or Cmd+K followed by Ctrl or Cmd+S, and reads the same table as the menu and the tooltips.
 */
import { useT } from '../i18n';
import { Button, Dialog } from '../ui';
import { COMMAND_CATEGORIES, MENU_TITLE_KEYS, commandsIn, type CommandId } from './registry';
import { shortcutText } from './shortcutLabels';
import { closeSurfaces, useCommandSurfaces } from './surfaces';

function ReferenceBody() {
  const { t } = useT();
  return (
    <Dialog
      open
      onClose={closeSurfaces}
      title={t('shortcuts.title')}
      description={t('shortcuts.description')}
      size="lg"
      footer={
        <Button variant="primary" onClick={closeSurfaces}>
          {t('shortcuts.close')}
        </Button>
      }
    >
      {COMMAND_CATEGORIES.map((category) => {
        const commands = commandsIn(category);
        if (commands.length === 0) return null;
        return (
          <section key={category} data-shortcut-group={category} className="mb-4">
            <h3 className="mb-1 text-sm font-semibold">{t(MENU_TITLE_KEYS[category])}</h3>
            <dl className="divide-y divide-[var(--border-color)] border border-[var(--border-color)]">
              {commands.map((command) => {
                const shortcut = shortcutText(command.id as CommandId);
                return (
                  <div key={command.id} data-command={command.id} className="flex items-baseline justify-between gap-4 px-3 py-1.5 text-sm">
                    <dt>{t(command.titleKey)}</dt>
                    <dd>
                      {shortcut === null ? (
                        <span className="text-[var(--text-secondary)]">{t('shortcuts.none')}</span>
                      ) : (
                        <kbd className="font-mono">{shortcut}</kbd>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </Dialog>
  );
}

export function ShortcutReference() {
  return useCommandSurfaces().shortcuts ? <ReferenceBody /> : null;
}
