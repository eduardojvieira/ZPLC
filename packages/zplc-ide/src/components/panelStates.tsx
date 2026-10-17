/**
 * The empty states of the workbench panels (UX-021): a title, one sentence, and the next action. The action of a panel that
 * leads to a registered command is that command, so the button, the menu and the palette do the same thing and the button
 * is disabled in a state where the command is not offered.
 */
import { useT } from '../i18n';
import { Button, EmptyState } from '../ui';
import { runCommand, useCommandState } from '../commands/bus';
import { commandById, isCommandEnabled, type CommandId } from '../commands/registry';

interface CommandEmptyStateProps {
  title: string;
  description: string;
  /** The commands that could be the next step, in order of preference: the first one the state offers is shown. */
  actions: readonly CommandId[];
}

export function CommandEmptyState({ title, description, actions }: CommandEmptyStateProps) {
  const { t } = useT();
  const state = useCommandState();
  const id = actions.find((candidate) => isCommandEnabled(commandById(candidate), state)) ?? actions[0]!;
  const command = commandById(id);
  return (
    <EmptyState
      title={title}
      description={description}
      action={<Button variant="primary" size="sm" disabled={!isCommandEnabled(command, state)} onClick={() => runCommand(id, { respectEnabled: true })}>{t(command.titleKey)}</Button>}
    />
  );
}

/** An empty state whose next action belongs to the panel itself (a form it opens, a tab it shows). */
export function PanelEmptyState({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel: string; onAction: () => void }) {
  return <EmptyState title={title} description={description} action={<Button variant="primary" size="sm" onClick={onAction}>{actionLabel}</Button>} />;
}
