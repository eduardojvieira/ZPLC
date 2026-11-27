/**
 * The empty states of the workbench panels (UX-021): a title, one sentence, and the next action. The action of a panel that
 * leads to a registered command is that command, so the button, the menu and the palette do the same thing and the button
 * is disabled in a state where the command is not offered.
 */
import { useT } from '../i18n';
import { Button, EmptyState } from '../ui';
import { runCommand, useCommandState } from '../commands/bus';
import { commandById, isCommandEnabled, type CommandId } from '../commands/registry';
import { markEmptyStateSeen, useEmptyStateSeen, type EmptyRegion } from './emptyStateSeen';

/** Once the region's action was taken (GDE-012) only the quiet title remains. */
function QuietTitle({ title }: { title: string }) {
  return <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">{title}</p>;
}

interface CommandEmptyStateProps {
  title: string;
  description: string;
  /** The commands that could be the next step, in order of preference: the first one the state offers is shown. */
  actions: readonly CommandId[];
  /** With a region, running the action marks it seen and the empty state is then only its title. */
  region?: EmptyRegion;
}

export function CommandEmptyState({ title, description, actions, region }: CommandEmptyStateProps) {
  const { t } = useT();
  const state = useCommandState();
  const seen = useEmptyStateSeen((store) => region !== undefined && store.taken[region] === true);
  if (seen) return <QuietTitle title={title} />;
  const id = actions.find((candidate) => isCommandEnabled(commandById(candidate), state)) ?? actions[0]!;
  const command = commandById(id);
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <Button
          variant="primary"
          size="sm"
          disabled={!isCommandEnabled(command, state)}
          onClick={() => {
            if (region) markEmptyStateSeen(region);
            runCommand(id, { respectEnabled: true });
          }}
        >
          {t(command.titleKey)}
        </Button>
      }
    />
  );
}

/** An empty state whose next action belongs to the panel itself (a form it opens, a tab it shows). */
export function PanelEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  region,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  region?: EmptyRegion;
}) {
  const seen = useEmptyStateSeen((store) => region !== undefined && store.taken[region] === true);
  if (seen) return <QuietTitle title={title} />;
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            if (region) markEmptyStateSeen(region);
            onAction();
          }}
        >
          {actionLabel}
        </Button>
      }
    />
  );
}
