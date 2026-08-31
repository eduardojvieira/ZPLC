const BLOCKED_FORCE_SUBCOMMANDS = new Set(['set', 'clear', 'clear_all']);

export const TERMINAL_FORCE_COMMAND_BLOCKED_MESSAGE =
  '[Force commands are blocked in Terminal. Use Watch and Release all forces to preserve verified force state.]\n';

export function isTerminalForceMutation(command: string): boolean {
  const [runtime, debug, force, subcommand] = command.trim().split(/\s+/, 4).map((part) => part.toLowerCase());
  return runtime === 'zplc'
    && debug === 'dbg'
    && force === 'force'
    && subcommand !== undefined
    && BLOCKED_FORCE_SUBCOMMANDS.has(subcommand);
}
