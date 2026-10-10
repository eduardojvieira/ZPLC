import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { TOOLCHAIN_PROBES, spawnAllowed, spawnVector, type SpawnEntry, type SpawnImplementation } from './spawnAllowList';

describe('the spawn allow-list (IDE-017)', () => {
  it('builds the fixed argument vector of each entry', () => {
    expect(spawnVector({ kind: 'native-runtime', binary: '/opt/zplc/zplc_runtime' })).toEqual({ command: '/opt/zplc/zplc_runtime', args: [] });
    expect(spawnVector({ kind: 'firmware-build', zephyrBoard: 'rpi_pico/rp2040', buildPath: '/tmp/zplc-firmware-build-1/build' })).toEqual({
      command: 'west',
      args: ['build', '-b', 'rpi_pico/rp2040', 'firmware/app', '-d', '/tmp/zplc-firmware-build-1/build', '--pristine'],
    });
    expect(spawnVector({ kind: 'zephyr-revision', zephyrBase: '/opt/zephyr' })).toEqual({ command: 'git', args: ['-C', '/opt/zephyr', 'rev-parse', '--verify', 'HEAD'] });
    for (const probe of Object.keys(TOOLCHAIN_PROBES) as Array<keyof typeof TOOLCHAIN_PROBES>) {
      const { command, args } = TOOLCHAIN_PROBES[probe];
      expect(spawnVector({ kind: 'toolchain-probe', probe })).toEqual({ command, args: [...args] });
      expect(args.every((argument) => /^-{0,2}[a-z0-9]+$/.test(argument))).toBe(true);
    }
  });

  it('resolves a relative runtime path, so that the command is never a bare name looked up on PATH', () => {
    expect(path.isAbsolute(spawnVector({ kind: 'native-runtime', binary: 'build/zplc_runtime' }).command)).toBe(true);
  });

  it('refuses a board that is not a manifest board id, whatever it contains', () => {
    for (const zephyrBoard of ['', 'UPPER', 'a b', 'x; rm -rf /', '$(id)', '`id`', 'a|b', 'a&&b', '-x', '--help', '../../etc', 'a\nb', 'a'.repeat(129)]) {
      expect(() => spawnVector({ kind: 'firmware-build', zephyrBoard, buildPath: '/tmp/x' })).toThrow('Refused to spawn');
    }
  });

  it('refuses a path with a NUL byte and an empty path, and an entry or a probe that is not on the list', () => {
    expect(() => spawnVector({ kind: 'native-runtime', binary: '/opt/zplc\0/runtime' })).toThrow('Refused to spawn');
    expect(() => spawnVector({ kind: 'zephyr-revision', zephyrBase: '' })).toThrow('Refused to spawn');
    expect(() => spawnVector({ kind: 'firmware-build', zephyrBoard: 'ok', buildPath: '/tmp/a\0b' })).toThrow('Refused to spawn');
    expect(() => spawnVector({ kind: 'toolchain-probe', probe: 'sh' as never })).toThrow('Refused to spawn');
    expect(() => spawnVector({ kind: 'shell', command: 'rm -rf /' } as unknown as SpawnEntry)).toThrow('Refused to spawn');
  });

  it('starts the process without a shell, whatever the options say, and passes only the vector it built', () => {
    const seen: Array<{ command: string; args: string[]; shell: unknown; cwd: unknown }> = [];
    const implementation = ((command: string, args: string[], options: { shell?: unknown; cwd?: unknown }) => {
      seen.push({ command, args, shell: options.shell, cwd: options.cwd });
      return {} as never;
    }) as unknown as SpawnImplementation;
    spawnAllowed({ kind: 'toolchain-probe', probe: 'west' }, { shell: true, cwd: '/work' }, implementation);
    expect(seen).toEqual([{ command: 'west', args: ['--version'], shell: false, cwd: '/work' }]);
    expect(() => spawnAllowed({ kind: 'firmware-build', zephyrBoard: 'a b', buildPath: '/tmp/x' }, {}, implementation)).toThrow();
    expect(seen).toHaveLength(1);
  });
});
