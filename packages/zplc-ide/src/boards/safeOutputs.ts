/**
 * The value an output takes in the safe state, declared by the project (RT-023).
 *
 * An output is off whenever the program does not control it (STOP, a pause, a fault, the boot, a deploy in
 * progress) unless the project says another value: `"safe": true` on a row of `io.outputs`. The declaration is
 * checked here, when the project is built, so that what reaches the device is a declaration for a digital output
 * the board has; the firmware checks the same again when it admits the program.
 */
import type { SafeEntry } from '@zplc/compiler';
import { getBoardIo, getBoardIoIdentity } from '../config/boardProfiles';
import type { IOConfig, IOPinConfig } from '../types';
import { channelAt, mappingProblem, normalizeAddress } from './boardIoMapping';

/** A declared safe value as a person reads it: the output, where it is, and the value it takes. */
export interface DeclaredSafeOutput {
  readonly name: string;
  /** The address in its normal form: `%QX0.1`. */
  readonly address: string;
  readonly value: boolean;
}

export interface DeclaredSafeOutputs {
  /** What goes in the SAFE segment of the artifact, in the order the project wrote it. */
  readonly entries: SafeEntry[];
  /** The same declarations for the confirmation of a deploy. */
  readonly declared: DeclaredSafeOutput[];
  /** Why the project cannot be built with these declarations, one sentence for each; empty when it can. */
  readonly problems: string[];
}

const BIT_ADDRESS = /^%QX(\d+)\.([0-7])$/;

/**
 * The declared safe values of a project's `io` section, checked against the board it targets.
 * A board with no I/O description (the host, a custom board) takes any bit of the output image.
 */
export function declaredSafeOutputs(io: IOConfig | undefined, board: string | undefined): DeclaredSafeOutputs {
  const entries: SafeEntry[] = [];
  const declared: DeclaredSafeOutput[] = [];
  const problems: string[] = [];
  const description = getBoardIo(board);
  const boardLabel = getBoardIoIdentity(board)?.displayName ?? board ?? 'the target';
  const seen = new Map<string, string>();

  for (const [section, rows] of [['inputs', io?.inputs], ['virtual', io?.virtual]] as const) {
    for (const row of rows ?? []) {
      if (row.safe !== undefined) {
        problems.push(
          `${section === 'inputs' ? 'Input' : 'Image address'} '${row.name}' (${row.address}) declares a safe value: `
          + 'only an output the board drives has a safe state',
        );
      }
    }
  }

  for (const row of io?.outputs ?? []) {
    const safe: unknown = (row as IOPinConfig & { safe?: unknown }).safe;
    if (safe === undefined) continue;
    if (typeof safe !== 'boolean') {
      problems.push(`Output '${row.name}' (${row.address}) declares the safe value ${JSON.stringify(safe)}: a safe value is true or false`);
      continue;
    }
    const normal = normalizeAddress(row.address);
    const bit = normal === undefined ? null : BIT_ADDRESS.exec(normal);
    if (normal === undefined || bit === null) {
      problems.push(
        `Output '${row.name}' (${row.address}) declares a safe value, which is declared for one bit of the output image, `
        + 'a digital output such as %QX0.0',
      );
      continue;
    }
    if (description !== undefined) {
      const why = mappingProblem(description, boardLabel, 'outputs', row);
      const channel = channelAt(description, 'outputs', normal);
      if (why !== undefined || channel === undefined || channel.kind !== 'digital') {
        problems.push(
          `Output '${row.name}' declares a safe value for ${normal}, and board ${boardLabel} has no digital output channel there`
          + (why === undefined ? '' : `: ${why}`),
        );
        continue;
      }
    }
    const before = seen.get(normal);
    if (before !== undefined) {
      problems.push(`Outputs '${before}' and '${row.name}' both declare a safe value for ${normal}: an output has one`);
      continue;
    }
    seen.set(normal, row.name);
    entries.push({ offset: Number(bit[1]), bit: Number(bit[2]), value: safe ? 1 : 0 });
    declared.push({ name: row.name, address: normal, value: safe });
  }

  return { entries, declared, problems };
}
