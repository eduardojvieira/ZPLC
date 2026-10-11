/**
 * The human-presence guard of the hardware commands (HIL-003).
 *
 * A command that drives a board needs a person at an interactive terminal, and every physical step needs that person
 * to type the identity the board reports. There is no flag that turns it off: with no terminal the command exits with
 * an error, so a script, a pipe, MCP or an AI tool cannot start a hardware run.
 */

export interface HumanIo {
  /** True when stdin and stdout are terminals. */
  readonly interactive: boolean;
  say(text: string): void;
  ask(prompt: string): Promise<string>;
}

export class NotInteractiveError extends Error {
  constructor(what: string) {
    super(`${what} needs an interactive terminal: a person at the bench starts it and confirms each physical step. It is never started from a script, a pipe, MCP or an AI tool.`);
    this.name = 'NotInteractiveError';
  }
}

export class IdentityMismatchError extends Error {
  constructor(stepId: string, expected: string) {
    super(`step ${stepId} was not confirmed: the identity typed is not ${JSON.stringify(expected)}`);
    this.name = 'IdentityMismatchError';
  }
}

export function requireInteractive(io: HumanIo, what: string): void {
  if (!io.interactive) throw new NotInteractiveError(what);
}

export interface PhysicalStep { id: string; title: string; instruction: string }
export interface Confirmation { stepId: string; confirmedAt: string; confirmedIdentity: string }

/** Tell the person what to do, then require them to type `reportedIdentity`: the board the device says it is. */
export async function confirmPhysicalStep(io: HumanIo, step: PhysicalStep, reportedIdentity: string, options: { attempts?: number; waitFirst?: boolean; now?: () => Date } = {}): Promise<Confirmation> {
  const attempts = options.attempts ?? 2;
  io.say(`\nPhysical step: ${step.title}\n  ${step.instruction}`);
  if (options.waitFirst) await io.ask('  Press Enter when it is done: ');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const typed = (await io.ask(`  Type the board identity the device reports (${reportedIdentity}) to confirm: `)).trim();
    if (typed === reportedIdentity) return { stepId: step.id, confirmedAt: (options.now?.() ?? new Date()).toISOString(), confirmedIdentity: typed };
    io.say(`  That is not the identity the device reported (${attempt} of ${attempts}).`);
  }
  throw new IdentityMismatchError(step.id, reportedIdentity);
}

/** The terminal of the person who ran the command. */
export async function terminalIo(): Promise<HumanIo & { close(): void }> {
  const { createInterface } = await import('node:readline');
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  return {
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    say: (text) => { process.stdout.write(`${text}\n`); },
    ask: (prompt) => new Promise((resolve) => { lines.question(prompt, resolve); }),
    close: () => { lines.close(); },
  };
}
