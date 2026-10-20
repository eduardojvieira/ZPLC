// REL-022: the firmware images of a release, checked on what a build leaves behind. The builds here are small
// stand-ins with the files and the text that a west build of firmware/app writes (`.config`, `runners.yaml`, the
// generated identity header, the images): the real builds are run by the release workflow and, on a machine with the
// Zephyr SDK, by `firmware-images.ts build`.
import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LEARNER_BOARDS, SCHEMA, assembleRelease, collectBoard, evidenceLevels, flashInfo, hilTraceProblems, imageName, manifestName,
  parseConfig, parseIdentityHeader, plannedFormats, stageForInstaller, verifyFirmwareFolder,
  type BoardEntry, type BuildIdentity,
} from './firmware-images';

const root = join(import.meta.dir, '..', '..');
const COMMIT = 'a'.repeat(40);
const scratch: string[] = [];
const temp = (): string => { const path = mkdtempSync(join(tmpdir(), 'zplc-fw-')); scratch.push(path); return path; };
afterAll(() => { for (const path of scratch) rmSync(path, { recursive: true, force: true }); });

const boards = (JSON.parse(readFileSync(join(root, 'firmware/app/boards/boards.json'), 'utf8')) as BoardEntry[])
  .map(({ board_id, display_name, ide_id, zephyr_board }) => ({ board_id, display_name, ide_id, zephyr_board }));
const board = (ide: string): BoardEntry => boards.find((entry) => entry.ide_id === ide)!;

const header = (identity: Partial<BuildIdentity> = {}): string => {
  const value = { version: '2.0.0-rc.4', commit: COMMIT, dirty: false, board: 'rpi_pico', optionsHash: 'ad2fdd67', options: 'CODE_SIZE_MAX=24576,SCHEDULER=y', ...identity };
  return [
    `#define ZPLC_FW_VERSION "${value.version}"`, `#define ZPLC_FW_COMMIT "${value.commit}"`, `#define ZPLC_FW_DIRTY ${value.dirty ? 1 : 0}`,
    `#define ZPLC_FW_BOARD "${value.board}"`, `#define ZPLC_FW_OPTIONS_HASH "${value.optionsHash}"`, `#define ZPLC_FW_OPTIONS "${value.options}"`,
  ].join('\n');
};

interface FakeBuild { identity?: Partial<BuildIdentity>; config?: string; omit?: string[]; runners?: string }

const RUNNERS: Record<string, string> = {
  rp2040: 'flash-runner: openocd\nargs:\n  uf2:\n    - --board-id=RPI-RP2\n  openocd:\n    - --cmd-load\n    - flash write_image erase\n',
  esp32s3: 'flash-runner: esp32\nargs:\n  esp32:\n    - --esp-monitor-baud=\n    - --esp-idf-path=/home/someone/modules/hal/espressif\n    - --esp-app-address=0x0\n    - --esp-flash-size=8MB\n    - --esp-flash-freq=80m\n    - --esp-flash-mode=dio\n',
  dfu: 'flash-runner: dfu-util\nargs:\n  dfu-util:\n    - --pid=2341:0366\n    - --alt=0\n    - --dfuse\n',
  st: 'flash-runner: stm32cubeprogrammer\nargs:\n  stm32cubeprogrammer:\n    - --port=swd\n    - --reset-mode=hw\n',
};

function fakeBuild(entry: BoardEntry, options: FakeBuild = {}): string {
  const dir = temp();
  const soc = entry.zephyr_board.split('/')[1]!;
  const gen = join(dir, 'modules', 'zplc', 'zplc_generated');
  mkdirSync(gen, { recursive: true });
  mkdirSync(join(dir, 'zephyr'), { recursive: true });
  writeFileSync(join(gen, 'zplc_fw_identity.h'), header({ board: entry.zephyr_board.split('/')[0]!, ...options.identity }));
  const base = soc === 'rp2040' ? '0x10000000' : soc === 'esp32s3' ? '0x0' : '0x8000000';
  const offset = entry.ide_id.startsWith('arduino') ? '0x40000' : soc === 'rp2040' ? '0x100' : '0';
  writeFileSync(join(dir, 'zephyr', '.config'), options.config ?? `CONFIG_BOARD_TARGET="${entry.zephyr_board}"\nCONFIG_FLASH_BASE_ADDRESS=${base}\nCONFIG_FLASH_LOAD_OFFSET=${offset}\n# CONFIG_ZPLC_HIL_DEBUG is not set\n`);
  const runners = options.runners ?? (soc === 'rp2040' ? RUNNERS.rp2040! : soc === 'esp32s3' ? RUNNERS.esp32s3! : entry.ide_id.startsWith('arduino') ? RUNNERS.dfu! : RUNNERS.st!);
  writeFileSync(join(dir, 'zephyr', 'runners.yaml'), runners);
  for (const file of ['zephyr.uf2', 'zephyr.bin', 'zephyr.elf']) {
    if (!(options.omit ?? []).includes(file)) writeFileSync(join(dir, 'zephyr', file), `${entry.ide_id} ${file}`);
  }
  return dir;
}

const collectAll = (version = '2.0.0-rc.4', configure: (entry: BoardEntry) => FakeBuild = () => ({})): string => {
  const out = temp();
  for (const entry of boards) {
    collectBoard({ board: entry, buildDir: fakeBuild(entry, configure(entry)), version, commit: COMMIT, outDir: join(out, entry.ide_id), evidenceLevel: 'cross-build' });
  }
  return out;
};

describe('what a build says (REL-022, REL-023)', () => {
  test('reads the identity header that the build generates', () => {
    expect(parseIdentityHeader(header())).toEqual({ version: '2.0.0-rc.4', commit: COMMIT, dirty: false, board: 'rpi_pico', optionsHash: 'ad2fdd67', options: 'CODE_SIZE_MAX=24576,SCHEDULER=y' });
    expect(parseIdentityHeader(header({ dirty: true })).dirty).toBe(true);
    expect(() => parseIdentityHeader('#define ZPLC_FW_VERSION "1.0.0"')).toThrow(/COMMIT/);
  });

  test('reads the configuration as Zephyr writes it', () => {
    const config = parseConfig('CONFIG_BOARD_TARGET="rpi_pico/rp2040"\nCONFIG_FLASH_LOAD_OFFSET=0x100\n# CONFIG_X is not set\nCONFIG_ZPLC_HIL_DEBUG=y\n');
    expect(config.get('CONFIG_BOARD_TARGET')).toBe('rpi_pico/rp2040');
    expect(config.get('CONFIG_FLASH_LOAD_OFFSET')).toBe('0x100');
    expect(config.has('CONFIG_X')).toBe(false);
  });

  test('never accepts the HIL trace, from the configuration or from the options the image reports (HIL-013)', () => {
    const identity = parseIdentityHeader(header());
    expect(hilTraceProblems(parseConfig('CONFIG_ZPLC_HIL_DEBUG=y'), identity)).toHaveLength(1);
    expect(hilTraceProblems(parseConfig('# CONFIG_ZPLC_HIL_DEBUG is not set'), identity)).toEqual([]);
    expect(hilTraceProblems(new Map(), { ...identity, options: 'A=1,HIL_DEBUG=y,Z=2' })).toHaveLength(1);
    expect(hilTraceProblems(new Map(), { ...identity, options: 'NO_HIL_DEBUG=y' })).toEqual([]);
  });

  test('never accepts the HIL image of the RT-020 record run, from the configuration or from the options the image reports', () => {
    const identity = parseIdentityHeader(header());
    expect(hilTraceProblems(parseConfig('CONFIG_ZPLC_HIL_IMAGE=y'), identity)).toHaveLength(1);
    expect(hilTraceProblems(parseConfig('# CONFIG_ZPLC_HIL_IMAGE is not set'), identity)).toEqual([]);
    expect(hilTraceProblems(new Map(), { ...identity, options: 'A=1,HIL_IMAGE=y,Z=2' })).toHaveLength(1);
    expect(hilTraceProblems(new Map(), { ...identity, options: 'NO_HIL_IMAGE=y' })).toEqual([]);
  });
});

describe('the files of each board (REL-022)', () => {
  test('are UF2 for the RP2040 boards, one merged binary for the ESP32-S3 and binary and ELF for the others', () => {
    const formats = (ide: string) => plannedFormats(board(ide).zephyr_board).map((entry) => entry.format);
    expect(formats('rpi_pico')).toEqual(['uf2']);
    expect(formats('waveshare_rp2040_zero')).toEqual(['uf2']);
    expect(formats('esp32s3_devkitc')).toEqual(['bin']);
    for (const ide of ['arduino_giga_r1', 'stm32f746g_disco', 'nucleo_h743zi', 'arduino_opta_wifi']) expect(formats(ide)).toEqual(['bin', 'elf']);
  });

  test('cover every board of the manifest, so a board added to it is given a format', () => {
    for (const entry of boards) expect(plannedFormats(entry.zephyr_board).length, entry.ide_id).toBeGreaterThan(0);
    expect(LEARNER_BOARDS.every((ide) => boards.some((entry) => entry.ide_id === ide))).toBe(true);
  });

  test('are named zplc-runtime-<version>-<board>.<ext>', () => {
    expect(imageName('2.0.0-rc.4', 'rpi-pico-rp2040', 'uf2')).toBe('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2');
    expect(manifestName('2.0.0-rc.4')).toBe('zplc-runtime-2.0.0-rc.4.manifest.json');
  });
});

describe('how an image is flashed, from the build that made it (REL-022, REL-025)', () => {
  const config = (text: string) => parseConfig(text);

  test('a UF2 image carries its own addresses and is copied to the boot drive', () => {
    expect(flashInfo(config('CONFIG_FLASH_BASE_ADDRESS=0x10000000\nCONFIG_FLASH_LOAD_OFFSET=0x100'), RUNNERS.rp2040!, 'uf2')).toEqual({ runner: 'uf2', address: null, args: { 'board-id': 'RPI-RP2' } });
  });

  test('the ESP32-S3 image is written at the app address of the esp32 runner, without the paths of the build machine', () => {
    const flash = flashInfo(config('CONFIG_FLASH_BASE_ADDRESS=0x0\nCONFIG_FLASH_LOAD_OFFSET=0x0'), RUNNERS.esp32s3!, 'bin')!;
    expect(flash).toEqual({ runner: 'esp32', address: '0x00000000', args: { 'esp-app-address': '0x0', 'esp-flash-size': '8MB', 'esp-flash-freq': '80m', 'esp-flash-mode': 'dio' } });
    expect(JSON.stringify(flash)).not.toContain('/home');
  });

  test('a DFU board is written at the flash base plus the load offset that clears its bootloader', () => {
    expect(flashInfo(config('CONFIG_FLASH_BASE_ADDRESS=0x8000000\nCONFIG_FLASH_LOAD_OFFSET=0x40000'), RUNNERS.dfu!, 'bin')).toEqual({
      runner: 'dfu-util', address: '0x08040000', args: { pid: '2341:0366', alt: '0', dfuse: 'true' },
    });
  });

  test('an ELF is for a debugger and has no flash step; a build that names no address is refused', () => {
    expect(flashInfo(config(''), RUNNERS.st!, 'elf')).toBeNull();
    expect(() => flashInfo(config('CONFIG_FLASH_BASE_ADDRESS=0x8000000'), RUNNERS.st!, 'bin')).toThrow(/load offset/);
  });
});

describe('one board (REL-022)', () => {
  test('copies the images under their release names with their checksum, size, evidence level and flash method', () => {
    const out = temp();
    const entry = collectBoard({ board: board('esp32s3_devkitc'), buildDir: fakeBuild(board('esp32s3_devkitc')), version: '2.0.0-rc.4', commit: COMMIT, outDir: out, evidenceLevel: 'cross-build' });
    expect(entry.images).toHaveLength(1);
    const image = entry.images[0]!;
    expect(image).toMatchObject({
      board: 'esp32s3_devkitc', file: 'zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin', format: 'bin', role: 'flash', evidenceLevel: 'cross-build', learner: true,
      flash: { runner: 'esp32', address: '0x00000000' },
    });
    expect(image.sha256).toBe(createHash('sha256').update('esp32s3_devkitc zephyr.bin').digest('hex'));
    expect(image.bytes).toBe('esp32s3_devkitc zephyr.bin'.length);
    expect(readdirSync(out).sort()).toEqual(['zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin', 'zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.entry.json']);
    expect(entry.build).toMatchObject({ version: '2.0.0-rc.4', commit: COMMIT, dirty: false, optionsHash: 'ad2fdd67' });
  });

  test('keeps the ELF of a board that has one as a debug file with no flash step, and is not a learner image', () => {
    const entry = collectBoard({ board: board('nucleo_h743zi'), buildDir: fakeBuild(board('nucleo_h743zi')), version: '2.0.0-rc.4', outDir: temp(), evidenceLevel: 'cross-build' });
    expect(entry.images.map((image) => [image.format, image.role, image.flash?.runner ?? null, image.learner])).toEqual([['bin', 'flash', 'stm32cubeprogrammer', false], ['elf', 'debug', null, false]]);
  });

  const refused = (options: FakeBuild, pattern: RegExp, ide = 'rpi_pico', commit: string | undefined = COMMIT) => {
    expect(() => collectBoard({ board: board(ide), buildDir: fakeBuild(board(ide), options), version: '2.0.0-rc.4', ...(commit === undefined ? {} : { commit }), outDir: temp(), evidenceLevel: 'cross-build' })).toThrow(pattern);
  };

  test('refuses a build for another board, another version or another commit', () => {
    refused({ config: 'CONFIG_BOARD_TARGET="nucleo_h743zi/stm32h743xx"' }, /is for nucleo_h743zi/);
    refused({ identity: { version: '2.0.0-rc.3' } }, /version 2\.0\.0-rc\.3/);
    refused({ identity: { commit: 'b'.repeat(40) } }, /commit b+/);
    refused({ identity: { commit: 'unknown' } }, /no commit identity/, 'rpi_pico', undefined);
  });

  test('refuses a build from a tree with uncommitted changes, unless a local run allows it', () => {
    refused({ identity: { dirty: true } }, /not committed/);
    expect(collectBoard({ board: board('rpi_pico'), buildDir: fakeBuild(board('rpi_pico'), { identity: { dirty: true } }), version: '2.0.0-rc.4', outDir: temp(), evidenceLevel: 'cross-build', allowDirty: true }).build.dirty).toBe(true);
  });

  test('refuses a build with the HIL trace, and a build that lacks a file of its format', () => {
    refused({ config: 'CONFIG_BOARD_TARGET="rpi_pico/rp2040"\nCONFIG_ZPLC_HIL_DEBUG=y' }, /HIL trace/);
    refused({ omit: ['zephyr.uf2'] }, /no zephyr\.uf2/);
  });
});

describe('the release set (REL-022)', () => {
  test('names an image set for every board of the manifest, with the identity of each build and one commit', () => {
    const out = temp();
    const manifest = assembleRelease({ inDirs: [collectAll()], outDir: out, version: '2.0.0-rc.4', boards });
    expect(manifest.schema).toBe(SCHEMA);
    expect(manifest.commit).toBe(COMMIT);
    expect(Object.keys(manifest.builds)).toEqual(boards.map((entry) => entry.ide_id));
    // 2 UF2 + 1 binary + 4 boards with a binary and an ELF
    expect(manifest.images).toHaveLength(2 + 1 + 4 * 2);
    expect(manifest.images.filter((image) => image.learner).map((image) => image.board).sort()).toEqual(['esp32s3_devkitc', 'rpi_pico']);
    expect(verifyFirmwareFolder(out)).toEqual([]);
    const names = readdirSync(out).sort();
    expect(names).toContain(manifestName('2.0.0-rc.4'));
    for (const image of manifest.images) expect(names).toContain(image.file);
    // every file of the folder is a release asset: an image or the manifest, never an entry or a build log
    expect(names.every((name) => /^zplc-runtime-2\.0\.0-rc\.4(?:-[a-z0-9-]+\.(?:uf2|bin|elf)|\.manifest\.json)$/.test(name))).toBe(true);
  });

  test('is the same bytes for the same builds (a release is reproducible from its builds)', () => {
    const first = temp();
    const second = temp();
    const inDirs = [collectAll()];
    assembleRelease({ inDirs, outDir: first, version: '2.0.0-rc.4', boards });
    assembleRelease({ inDirs, outDir: second, version: '2.0.0-rc.4', boards });
    expect(readFileSync(join(first, manifestName('2.0.0-rc.4')), 'utf8')).toBe(readFileSync(join(second, manifestName('2.0.0-rc.4')), 'utf8'));
  });

  test('refuses a set with a board missing, a board of another commit, or a tampered image', () => {
    const missing = collectAll();
    rmSync(join(missing, 'nucleo_h743zi'), { recursive: true });
    expect(() => assembleRelease({ inDirs: [missing], outDir: temp(), version: '2.0.0-rc.4', boards })).toThrow(/no image set for nucleo_h743zi/);

    const other = temp();
    for (const entry of boards) {
      collectBoard({ board: entry, buildDir: fakeBuild(entry, entry.ide_id === 'rpi_pico' ? { identity: { commit: 'c'.repeat(40) } } : {}), version: '2.0.0-rc.4', outDir: join(other, entry.ide_id), evidenceLevel: 'cross-build' });
    }
    expect(() => assembleRelease({ inDirs: [other], outDir: temp(), version: '2.0.0-rc.4', boards })).toThrow(/different commits/);

    const tampered = collectAll();
    writeFileSync(join(tampered, 'rpi_pico', imageName('2.0.0-rc.4', 'rpi-pico-rp2040', 'uf2')), 'not the image');
    expect(() => assembleRelease({ inDirs: [tampered], outDir: temp(), version: '2.0.0-rc.4', boards })).toThrow(/not the file its entry describes/);
  });

  test('refuses a set built as another version', () => {
    const earlier = collectAll('2.0.0-rc.3', () => ({ identity: { version: '2.0.0-rc.3' } }));
    expect(() => assembleRelease({ inDirs: [earlier], outDir: temp(), version: '2.0.0-rc.4', boards })).toThrow(/built as version 2\.0\.0-rc\.3/);
  });
});

describe('the copy that the installers carry (REL-025)', () => {
  test('holds the manifest and the two learner-board images, and nothing else', () => {
    const bundle = temp();
    assembleRelease({ inDirs: [collectAll()], outDir: bundle, version: '2.0.0-rc.4', boards });
    const out = join(temp(), 'dist-firmware');
    const expected = [manifestName('2.0.0-rc.4'), 'zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin', 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2'].sort();
    expect(stageForInstaller(bundle, out).sort()).toEqual(expected);
    expect(readdirSync(out).sort()).toEqual(expected);
    expect(verifyFirmwareFolder(out)).toEqual([]);
  });

  test('refuses a bundle whose image is not the one the manifest states', () => {
    const bundle = temp();
    assembleRelease({ inDirs: [collectAll()], outDir: bundle, version: '2.0.0-rc.4', boards });
    writeFileSync(join(bundle, 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2'), 'changed');
    expect(() => stageForInstaller(bundle, temp())).toThrow(/checksum/);
  });
});

describe('the evidence level of a board (REL-022)', () => {
  test('is derived from the evidence records, for every board of the manifest, and no board has a record yet', () => {
    const levels = evidenceLevels(root);
    expect(Object.keys(levels).sort()).toEqual(boards.map((entry) => entry.ide_id).sort());
    expect(new Set(Object.values(levels))).toEqual(new Set(['cross-build']));
  });
});
