/**
 * The processes that Studio starts for compile, test and firmware build (IDE-017), as a closed list.
 *
 * A caller names one entry of `SpawnEntry` and the values that entry takes; this module alone builds the command and the
 * argument vector, and always starts the process without a shell. Nothing the renderer sends is ever a command or an
 * argument: the values here come from the main process (the native runtime path, a board of the manifest, a build
 * directory it created, a checkout the user picked in a native dialog), and each is checked against the shape its slot
 * allows, so a value that is not that shape stops the spawn instead of reaching an argument vector.
 *
 * Pure TypeScript over `node:child_process` and `node:path`, importable by the main process and by the Tool API bundle.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import path from 'node:path';

/** Version probes of the toolchain doctor: the command and its arguments are literals, never a parameter. */
export const TOOLCHAIN_PROBES = {
  west: { command: 'west', args: ['--version'] },
  cmake: { command: 'cmake', args: ['--version'] },
  ninja: { command: 'ninja', args: ['--version'] },
  python3: { command: 'python3', args: ['--version'] },
  'python-launcher': { command: 'py', args: ['-3', '--version'] },
  python: { command: 'python', args: ['--version'] },
} as const;

export type ToolchainProbe = keyof typeof TOOLCHAIN_PROBES;

export type SpawnEntry =
  /** The native POSIX runtime that simulates and tests a program: no arguments, it speaks over standard input and output. */
  | { kind: 'native-runtime'; binary: string }
  /** `west build` of the runtime firmware for one board of the manifest, into a directory the main process created. */
  | { kind: 'firmware-build'; zephyrBoard: string; buildPath: string }
  | { kind: 'toolchain-probe'; probe: ToolchainProbe }
  /** The revision of the Zephyr checkout that the user picked. */
  | { kind: 'zephyr-revision'; zephyrBase: string };

export interface SpawnVector { command: string; args: string[] }

/** The same rule as the board manifest reader of the Tool API: lower case, digits, `_`, `/` and `-`. */
const ZEPHYR_BOARD = /^[a-z0-9][a-z0-9_/-]{0,127}$/;

const hasNul = (value: string): boolean => value.includes('\0');

function absolute(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || hasNul(value)) throw new Error(`Refused to spawn: ${what} is not a path`);
  return path.resolve(value);
}

/** The command and arguments of an entry, or a refusal when a value is not the shape its slot allows. */
export function spawnVector(entry: SpawnEntry): SpawnVector {
  switch (entry.kind) {
    case 'native-runtime':
      return { command: absolute(entry.binary, 'the runtime binary'), args: [] };
    case 'firmware-build': {
      if (typeof entry.zephyrBoard !== 'string' || !ZEPHYR_BOARD.test(entry.zephyrBoard)) throw new Error('Refused to spawn: the board is not a manifest board id');
      return { command: 'west', args: ['build', '-b', entry.zephyrBoard, 'firmware/app', '-d', absolute(entry.buildPath, 'the build directory'), '--pristine'] };
    }
    case 'toolchain-probe': {
      if (!Object.hasOwn(TOOLCHAIN_PROBES, entry.probe)) throw new Error('Refused to spawn: unknown toolchain probe');
      const probe = TOOLCHAIN_PROBES[entry.probe];
      return { command: probe.command, args: [...probe.args] };
    }
    case 'zephyr-revision':
      return { command: 'git', args: ['-C', absolute(entry.zephyrBase, 'the Zephyr checkout'), 'rev-parse', '--verify', 'HEAD'] };
    default:
      throw new Error('Refused to spawn: not an entry of the allow-list');
  }
}

export type SpawnImplementation = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

/** Starts an entry of the allow-list. The options cannot turn a shell on: `shell` is set last. */
export function spawnAllowed(entry: SpawnEntry, options: SpawnOptions = {}, implementation: SpawnImplementation = spawn): ChildProcess {
  const { command, args } = spawnVector(entry);
  return implementation(command, args, { ...options, shell: false });
}
