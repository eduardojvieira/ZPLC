/**
 * The first-time empty state of a region (GDE-012, UX-021): the first time a region is shown with nothing in it, it names the one
 * action most users take next and offers it as a button wired to the registered command. Once the action was taken the region
 * shows only its quiet title, never the call to action again. The flag is persisted per region, in a key of its own (the layout
 * store keeps its own version).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useT } from '../i18n';
import { Button, EmptyState } from '../ui';
import { runCommand, useCommandState } from '../commands/bus';
import { commandById, isCommandEnabled, type CommandId } from '../commands/registry';

/** The commands that could be the next step of each region, in order of preference: the first one the state offers is shown. */
const NEXT_ACTIONS = {
  editor: ['project.newProgram', 'file.open'],
  problems: ['build.compile'],
  tests: ['build.runAllTests', 'file.open'],
  watch: ['debug.run'],
  trace: ['debug.step', 'online.connect'],
  plant: ['view.plant'],
  navigator: ['file.open', 'file.new'],
} as const satisfies Record<string, readonly CommandId[]>;

export type EmptyRegion = keyof typeof NEXT_ACTIONS;
export const EMPTY_REGIONS = Object.keys(NEXT_ACTIONS) as EmptyRegion[];
export const EMPTY_STATE_KEY = 'zplc-empty-state-seen.v1';

interface Seen {
  taken: Partial<Record<EmptyRegion, true>>;
}
// the flags are a store the tests and the shell reset, kept beside the one component that reads them
// eslint-disable-next-line react-refresh/only-export-components
export const useEmptyStateSeen = create<Seen>()(persist<Seen>(() => ({ taken: {} }), { name: EMPTY_STATE_KEY }));

export function RegionEmptyState({ region }: { region: EmptyRegion }) {
  const { t } = useT();
  const state = useCommandState();
  const taken = useEmptyStateSeen((seen) => seen.taken[region] === true);
  const title = t(`u3Learn.empty.${region}.title`);
  if (taken) return <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">{title}</p>;
  const actions: readonly CommandId[] = NEXT_ACTIONS[region];
  const id = actions.find((candidate) => isCommandEnabled(commandById(candidate), state)) ?? actions[0]!;
  const command = commandById(id);
  return (
    <EmptyState
      title={title}
      description={t(`u3Learn.empty.${region}.description`)}
      action={
        <Button
          variant="primary"
          size="sm"
          disabled={!isCommandEnabled(command, state)}
          onClick={() => {
            useEmptyStateSeen.setState((seen) => ({ taken: { ...seen.taken, [region]: true } }));
            runCommand(id, { respectEnabled: true });
          }}
        >
          {t(command.titleKey)}
        </Button>
      }
    />
  );
}
