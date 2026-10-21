/**
 * Where a command meets its behaviour (UX-015). The code that owns an action (the toolbar for build and run, the shell for
 * the panels) binds a handler to a registered id; every human control surface (menu, palette, shortcut) runs it through
 * `runCommand`, so a command has one implementation however it was started. The state the registry's `enabled` rules read
 * is published here too.
 */
import { useSyncExternalStore } from 'react';
import { INITIAL_COMMAND_STATE, commandById, isCommandEnabled, isCommandId, type CommandId, type CommandState } from './registry';

export type CommandHandler = () => void | Promise<void>;

const handlers = new Map<CommandId, CommandHandler>();

/** Binds handlers; the returned function removes exactly these (a later binding of the same id is left alone). */
export function bindCommands(bound: Partial<Record<CommandId, CommandHandler>>): () => void {
  const entries = Object.entries(bound) as Array<[CommandId, CommandHandler]>;
  for (const [id, handler] of entries) handlers.set(id, handler);
  return () => {
    for (const [id, handler] of entries) if (handlers.get(id) === handler) handlers.delete(id);
  };
}

export type CommandOutcome = 'ran' | 'unavailable' | 'unknown';

/**
 * Runs a command by id. An id outside the registry is refused; `respectEnabled` (the menu and the palette) refuses a
 * command the state does not offer, while a shortcut runs the handler, which explains in the console what is missing.
 */
export function runCommand(id: unknown, options: { respectEnabled?: boolean } = {}): CommandOutcome {
  if (!isCommandId(id)) return 'unknown';
  const handler = handlers.get(id);
  if (!handler) return 'unavailable';
  if (options.respectEnabled && !isCommandEnabled(commandById(id), commandState)) return 'unavailable';
  void Promise.resolve(handler()).catch((error: unknown) => {
    console.error(`Command ${id} failed`, error);
  });
  return 'ran';
}

let commandState: CommandState = INITIAL_COMMAND_STATE;
const listeners = new Set<() => void>();

export function getCommandState(): CommandState {
  return commandState;
}

/** Publishes part of the state; listeners hear only a real change. */
export function publishCommandState(changes: Partial<CommandState>): void {
  const next = { ...commandState, ...changes };
  if ((Object.keys(next) as Array<keyof CommandState>).every((key) => next[key] === commandState[key])) return;
  commandState = next;
  for (const listener of listeners) listener();
}

export function resetCommandsForTest(): void {
  handlers.clear();
  commandState = INITIAL_COMMAND_STATE;
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useCommandState(): CommandState {
  return useSyncExternalStore(subscribe, getCommandState, getCommandState);
}
