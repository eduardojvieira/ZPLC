// The prebuilt runtime firmware of a release, one image set per board of the manifest (REL-022):
//
//   bun scripts/release/firmware-images.ts collect  --board <ide_id> --build-dir <west build dir> --version <v> --out <dir>
//                                                   [--commit <sha>]
//   (`<board>` in a file name is the `board_id` of the manifest, as in `rpi-pico-rp2040`; `--board` takes the `ide_id`)
//   bun scripts/release/firmware-images.ts assemble --in <dir>... --out <dir> --version <v>
//   bun scripts/release/firmware-images.ts stage    --bundle <dir> --out <dir>
//   bun scripts/release/firmware-images.ts build    --workspace <west workspace> --out <dir> [--boards a,b] [--allow-dirty]
//
// `collect` reads what one `west build` of firmware/app produced and checks it before it names anything: the build
// is for the board it is claimed for, it carries the identity of the release (version and commit), the tree was not
// dirty, and it was not built with the HIL trace (HIL-013). It copies the flashable files under
// `zplc-runtime-<version>-<board_id>.<ext>` and writes the entry of the board. `assemble` joins the entries of every
// board of firmware/app/boards/boards.json into one `zplc-runtime-<version>.manifest.json`, re-reading each file for
// its size and SHA-256, and refuses a set with a board missing: a release has the images of every board or none.
// `stage` copies the manifest and the two learner-board images for the installers (REL-025), and `build` runs the
// west builds on this machine and then the two steps above.
//
// Flashing is never done here (AGENTS.md rule 7): the manifest says which image, which checksum and which runner
// and address the build itself names; a person starts the flash.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const SCHEMA = 'zplc.firmware-release/1';
/** The two learner boards: their images travel inside the installers, so Studio shows them with no network. */
export const LEARNER_BOARDS: readonly string[] = ['rpi_pico', 'esp32s3_devkitc'];

export type ImageFormat = 'uf2' | 'bin' | 'elf';
export type EvidenceLevel = 'cross-build' | 'human-hil';

export interface BoardEntry { board_id: string; display_name: string; ide_id: string; zephyr_board: string }

export interface BuildIdentity {
  version: string;
  commit: string;
  dirty: boolean;
  /** The Zephyr board name the image was configured for, as `zplc sys build` reports it. */
  board: string;
  optionsHash: string;
  options: string;
}

export interface FlashInfo {
  /** The flash runner the build names for this image (Zephyr's runners.yaml): `uf2`, `esp32`, `dfu-util`, `stm32cubeprogrammer`, `openocd`. */
  runner: string;
  /** Where the image is written: the flash base plus the load offset of the build, or the app address of the esp32 runner. Null for UF2, which carries its own addresses. */
  address: string | null;
  /** The runner arguments that a person needs, without the paths of the build machine. */
  args: Record<string, string>;
}

export interface ImageEntry {
  board: string;
  boardId: string;
  displayName: string;
  zephyrBoard: string;
  file: string;
  format: ImageFormat;
  /** `flash` is what a person writes to the board; `debug` is the ELF with symbols, for a probe and a debugger. */
  role: 'flash' | 'debug';
  sha256: string;
  bytes: number;
  evidenceLevel: EvidenceLevel;
  learner: boolean;
  flash: FlashInfo | null;
}

export interface ReleaseManifest {
  schema: typeof SCHEMA;
  version: string;
  commit: string;
  images: ImageEntry[];
  builds: Record<string, BuildIdentity>;
}

export interface BoardEntryFile { board: string; build: BuildIdentity; images: ImageEntry[] }

// ---------------------------------------------------------------------------------------------------------------------
// What a build says
// ---------------------------------------------------------------------------------------------------------------------

/** The `CONFIG_*` assignments of a Zephyr `.config`: `y`, a number, or a string without its quotes. */
export function parseConfig(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^(CONFIG_[A-Za-z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1]!, match[2]!.replace(/^"(.*)"$/, '$1'));
  }
  return values;
}

/** The identity of a build, from the header that scripts/release/zplc_fw_identity.cmake generated at configure time. */
export function parseIdentityHeader(text: string): BuildIdentity {
  const define = (name: string): string => {
    const match = new RegExp(`^#define ZPLC_FW_${name} (?:"([^"]*)"|(\\S+))\\s*$`, 'm').exec(text);
    if (!match) throw new Error(`the identity header has no ZPLC_FW_${name}`);
    return match[1] ?? match[2]!;
  };
  return {
    version: define('VERSION'),
    commit: define('COMMIT'),
    dirty: define('DIRTY') !== '0',
    board: define('BOARD'),
    optionsHash: define('OPTIONS_HASH'),
    options: define('OPTIONS'),
  };
}

/** A release image never carries the HIL trace (HIL-013): it is checked in the configuration the build used, not in the profiles. */
export function hilTraceProblems(config: Map<string, string>, identity: BuildIdentity): string[] {
  const problems: string[] = [];
  if (config.get('CONFIG_ZPLC_HIL_DEBUG') === 'y') problems.push('the build sets CONFIG_ZPLC_HIL_DEBUG=y: an image with the HIL trace is never shipped');
  if (/(?:^|,)HIL_DEBUG=y(?:,|$)/.test(identity.options)) problems.push('the identity of the build lists HIL_DEBUG=y among its options');
  // The HIL image turns the hardware watchdog on for the RT-020 record run only; it is never a release image.
  if (config.get('CONFIG_ZPLC_HIL_IMAGE') === 'y') problems.push('the build sets CONFIG_ZPLC_HIL_IMAGE=y: the HIL image of the record run is never shipped (RT-020)');
  if (/(?:^|,)HIL_IMAGE=y(?:,|$)/.test(identity.options)) problems.push('the identity of the build lists HIL_IMAGE=y among its options: the HIL image is never shipped (RT-020)');
  return problems;
}

export function imageName(version: string, board: string, format: ImageFormat): string {
  return `zplc-runtime-${version}-${board}.${format}`;
}

export function manifestName(version: string): string {
  return `zplc-runtime-${version}.manifest.json`;
}

/**
 * The files that a board's release holds, by the SoC qualifier of its Zephyr target: UF2 for the RP2040 boards
 * (a drive that the boot ROM shows takes the file), the single binary that the ESP32-S3 simple boot flashes from
 * address 0 (the merged image: bootloader and application in one), and the binary with the ELF for the others.
 */
export function plannedFormats(zephyrBoard: string): Array<{ format: ImageFormat; role: 'flash' | 'debug'; source: string }> {
  const soc = zephyrBoard.split('/')[1] ?? '';
  if (soc === 'rp2040') return [{ format: 'uf2', role: 'flash', source: 'zephyr.uf2' }];
  if (soc === 'esp32s3') return [{ format: 'bin', role: 'flash', source: 'zephyr.bin' }];
  return [{ format: 'bin', role: 'flash', source: 'zephyr.bin' }, { format: 'elf', role: 'debug', source: 'zephyr.elf' }];
}

const RUNNER_ARGUMENTS: Record<string, readonly string[]> = {
  uf2: ['board-id'],
  esp32: ['esp-app-address', 'esp-flash-size', 'esp-flash-freq', 'esp-flash-mode'],
  'dfu-util': ['pid', 'alt', 'dfuse'],
  stm32cubeprogrammer: ['port', 'reset-mode'],
  openocd: [],
};

const hex = (value: number): string => `0x${value.toString(16).padStart(8, '0')}`;

/** Which runner writes this image and where, from the build's own `.config` and `runners.yaml`. */
export function flashInfo(config: Map<string, string>, runnersYaml: string, format: ImageFormat): FlashInfo | null {
  if (format === 'elf') return null;
  const runners = (Bun.YAML.parse(runnersYaml) ?? {}) as { 'flash-runner'?: string; args?: Record<string, string[]> };
  const runner = format === 'uf2' ? 'uf2' : runners['flash-runner'];
  if (runner === undefined) throw new Error('runners.yaml of the build names no flash runner');
  const wanted = RUNNER_ARGUMENTS[runner] ?? [];
  const args: Record<string, string> = {};
  for (const argument of runners.args?.[runner] ?? []) {
    const match = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(argument);
    if (match && wanted.includes(match[1]!)) args[match[1]!] = match[2] ?? 'true';
  }
  if (format === 'uf2') return { runner, address: null, args };
  const app = args['esp-app-address'];
  if (app !== undefined) return { runner, address: hex(Number(app)), args };
  const base = Number(config.get('CONFIG_FLASH_BASE_ADDRESS') ?? Number.NaN);
  const offset = Number(config.get('CONFIG_FLASH_LOAD_OFFSET') ?? Number.NaN);
  if (!Number.isFinite(base) || !Number.isFinite(offset)) throw new Error('the build names neither an app address nor a flash base and load offset');
  return { runner, address: hex(base + offset), args };
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

function findIdentityHeader(buildDir: string): string {
  const known = join(buildDir, 'modules', 'zplc', 'zplc_generated', 'zplc_fw_identity.h');
  if (existsSync(known)) return known;
  const walk = (directory: string, depth: number): string | undefined => {
    if (depth > 4) return undefined;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name === 'zplc_fw_identity.h') return path;
      if (entry.isDirectory() && !['CMakeFiles', 'zephyr', 'app'].includes(entry.name)) {
        const found = walk(path, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  const found = walk(buildDir, 0);
  if (!found) throw new Error(`${buildDir} holds no zplc_fw_identity.h: it is not a build of firmware/app`);
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// collect
// ---------------------------------------------------------------------------------------------------------------------

export interface CollectOptions {
  board: BoardEntry;
  buildDir: string;
  version: string;
  /** The commit the release is made from; the identity of the build must say the same. */
  commit?: string;
  outDir: string;
  evidenceLevel: EvidenceLevel;
  allowDirty?: boolean;
}

export function collectBoard(options: CollectOptions): BoardEntryFile {
  const { board, buildDir, version, outDir } = options;
  const config = parseConfig(readFileSync(join(buildDir, 'zephyr', '.config'), 'utf8'));
  const identity = parseIdentityHeader(readFileSync(findIdentityHeader(buildDir), 'utf8'));
  const problems: string[] = [];
  if (config.get('CONFIG_BOARD_TARGET') !== board.zephyr_board) {
    problems.push(`the build is for ${config.get('CONFIG_BOARD_TARGET') ?? 'no board'}, not for ${board.zephyr_board} (${board.ide_id})`);
  }
  if (identity.version !== version) problems.push(`the build reports version ${identity.version}, this release is ${version}`);
  if (options.commit !== undefined && identity.commit !== options.commit) problems.push(`the build reports commit ${identity.commit}, this release is ${options.commit}`);
  if (!/^[0-9a-f]{40}$/.test(identity.commit)) problems.push(`the build has no commit identity (${identity.commit})`);
  if (identity.dirty && options.allowDirty !== true) problems.push('the build was made from a tree with changes that are not committed');
  problems.push(...hilTraceProblems(config, identity));
  const planned = plannedFormats(board.zephyr_board);
  const runners = join(buildDir, 'zephyr', 'runners.yaml');
  for (const { source } of planned) {
    if (!existsSync(join(buildDir, 'zephyr', source))) problems.push(`the build produced no ${source}`);
  }
  if (!existsSync(runners)) problems.push('the build produced no runners.yaml');
  if (problems.length > 0) throw new Error(`${board.ide_id}: ${problems.join('; ')}`);

  mkdirSync(outDir, { recursive: true });
  const images: ImageEntry[] = planned.map(({ format, role, source }) => {
    const file = imageName(version, board.board_id, format);
    copyFileSync(join(buildDir, 'zephyr', source), join(outDir, file));
    return {
      board: board.ide_id,
      boardId: board.board_id,
      displayName: board.display_name,
      zephyrBoard: board.zephyr_board,
      file,
      format,
      role,
      sha256: sha256(join(outDir, file)),
      bytes: statSync(join(outDir, file)).size,
      evidenceLevel: options.evidenceLevel,
      learner: LEARNER_BOARDS.includes(board.ide_id),
      flash: role === 'flash' ? flashInfo(config, readFileSync(runners, 'utf8'), format) : null,
    };
  });
  const entry: BoardEntryFile = { board: board.ide_id, build: identity, images };
  writeFileSync(join(outDir, `zplc-runtime-${version}-${board.board_id}.entry.json`), `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

// ---------------------------------------------------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------------------------------------------------

/** Every `*.entry.json` below `directory`, with the folder it was found in (the images lie beside it). */
function findEntries(directory: string): Array<{ entry: BoardEntryFile; folder: string }> {
  const found: Array<{ entry: BoardEntryFile; folder: string }> = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) found.push(...findEntries(path));
    else if (item.name.endsWith('.entry.json')) found.push({ entry: JSON.parse(readFileSync(path, 'utf8')) as BoardEntryFile, folder: directory });
  }
  return found;
}

export interface AssembleOptions {
  inDirs: string[];
  outDir: string;
  version: string;
  boards: BoardEntry[];
  allowDirty?: boolean;
}

export function assembleRelease(options: AssembleOptions): ReleaseManifest {
  const { boards, outDir, version } = options;
  const found = options.inDirs.flatMap((directory) => findEntries(directory));
  const byBoard = new Map<string, { entry: BoardEntryFile; folder: string }>();
  const problems: string[] = [];
  for (const item of found) {
    if (byBoard.has(item.entry.board)) problems.push(`${item.entry.board} was collected twice`);
    byBoard.set(item.entry.board, item);
  }
  for (const board of boards) if (!byBoard.has(board.ide_id)) problems.push(`no image set for ${board.ide_id}: a release holds every board of the manifest`);
  for (const board of byBoard.keys()) if (!boards.some((candidate) => candidate.ide_id === board)) problems.push(`${board} is not a board of the manifest`);
  const commits = new Set([...byBoard.values()].map(({ entry }) => entry.build.commit));
  if (commits.size > 1) problems.push(`the boards were built from different commits: ${[...commits].join(', ')}`);
  const images: ImageEntry[] = [];
  const builds: Record<string, BuildIdentity> = {};
  for (const board of boards) {
    const item = byBoard.get(board.ide_id);
    if (!item) continue;
    const { entry, folder } = item;
    if (entry.build.version !== version) problems.push(`${board.ide_id} was built as version ${entry.build.version}, not ${version}`);
    if (entry.build.dirty && options.allowDirty !== true) problems.push(`${board.ide_id} was built from a dirty tree`);
    builds[board.ide_id] = entry.build;
    for (const image of entry.images) {
      const path = join(folder, image.file);
      if (!existsSync(path)) { problems.push(`${image.file} is not beside its entry`); continue; }
      if (image.file !== imageName(version, board.board_id, image.format)) problems.push(`${image.file} does not follow zplc-runtime-<version>-<board>.<ext>`);
      if (sha256(path) !== image.sha256 || statSync(path).size !== image.bytes) problems.push(`${image.file} is not the file its entry describes`);
      images.push(image);
    }
  }
  if (problems.length > 0) throw new Error(`firmware release: ${problems.join('; ')}`);
  mkdirSync(outDir, { recursive: true });
  for (const image of images) {
    const source = [...byBoard.values()].find(({ entry }) => entry.board === image.board)!.folder;
    copyFileSync(join(source, image.file), join(outDir, image.file));
  }
  const manifest: ReleaseManifest = { schema: SCHEMA, version, commit: [...commits][0]!, images, builds };
  writeFileSync(join(outDir, manifestName(version)), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// ---------------------------------------------------------------------------------------------------------------------
// reading a release folder, and staging the installers' copy
// ---------------------------------------------------------------------------------------------------------------------

/** What is wrong with a firmware folder of a release: the manifest and the files it names must agree. */
export function verifyFirmwareFolder(directory: string): string[] {
  const problems: string[] = [];
  const manifests = readdirSync(directory).filter((name) => /^zplc-runtime-.+\.manifest\.json$/.test(name));
  if (manifests.length !== 1) return [`the folder holds ${manifests.length} manifests, not one`];
  const manifest = JSON.parse(readFileSync(join(directory, manifests[0]!), 'utf8')) as ReleaseManifest;
  if (manifest.schema !== SCHEMA) problems.push(`the manifest has schema ${JSON.stringify(manifest.schema)}, not ${SCHEMA}`);
  if (manifests[0] !== manifestName(manifest.version)) problems.push(`${manifests[0]} is not the manifest of version ${manifest.version}`);
  for (const image of manifest.images) {
    const path = join(directory, image.file);
    if (!existsSync(path)) continue; // a staged installer copy holds only the learner images
    if (sha256(path) !== image.sha256 || statSync(path).size !== image.bytes) problems.push(`${image.file} does not have the checksum or size that the manifest states`);
  }
  return problems;
}

/** The manifest and the learner-board images, for the installers: the images that Studio shows with no network. */
export function stageForInstaller(bundleDir: string, outDir: string): string[] {
  const problems = verifyFirmwareFolder(bundleDir);
  if (problems.length > 0) throw new Error(`firmware bundle: ${problems.join('; ')}`);
  const manifestFile = readdirSync(bundleDir).find((name) => /^zplc-runtime-.+\.manifest\.json$/.test(name))!;
  const manifest = JSON.parse(readFileSync(join(bundleDir, manifestFile), 'utf8')) as ReleaseManifest;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  copyFileSync(join(bundleDir, manifestFile), join(outDir, manifestFile));
  const staged: string[] = [manifestFile];
  for (const image of manifest.images.filter((candidate) => candidate.learner && candidate.role === 'flash')) {
    if (!existsSync(join(bundleDir, image.file))) throw new Error(`firmware bundle: ${image.file} is not in the bundle`);
    copyFileSync(join(bundleDir, image.file), join(outDir, image.file));
    staged.push(image.file);
  }
  return staged;
}

// ---------------------------------------------------------------------------------------------------------------------
// the command line
// ---------------------------------------------------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, '..', '..');

const LEVELS_SCRIPT = `
import importlib.util, json, sys
from pathlib import Path
root = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("zplc_boards", root / "firmware/zephyr/scripts/zplc_boards.py")
library = importlib.util.module_from_spec(spec); spec.loader.exec_module(library)
boards = json.loads((root / "firmware/app/boards/boards.json").read_text())
print(json.dumps({b["ide_id"]: library.support_level(b, root)["level"] for b in boards}))
`;

/** The level of each board, derived from its evidence records by the library that the docs and CI use (IO-015). */
export function evidenceLevels(root = ROOT): Record<string, EvidenceLevel> {
  const run = Bun.spawnSync(['python3', '-B', '-c', LEVELS_SCRIPT, root], { stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode !== 0) throw new Error(`the support levels could not be derived: ${run.stderr.toString().trim()}`);
  return JSON.parse(run.stdout.toString()) as Record<string, EvidenceLevel>;
}

function loadBoards(root = ROOT): BoardEntry[] {
  return (JSON.parse(readFileSync(join(root, 'firmware/app/boards/boards.json'), 'utf8')) as BoardEntry[])
    .map(({ board_id, display_name, ide_id, zephyr_board }) => ({ board_id, display_name, ide_id, zephyr_board }));
}

/** tools/hil/validate_hil_trace_profile.py: no shipped profile turns the HIL trace on. */
function validateProfiles(): void {
  const run = Bun.spawnSync(['python3', '-B', join(ROOT, 'tools/hil/validate_hil_trace_profile.py')], { stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode !== 0) throw new Error(`the HIL trace profile check failed: ${run.stdout.toString().trim()}`);
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      board: { type: 'string' }, 'build-dir': { type: 'string' }, version: { type: 'string' }, commit: { type: 'string' },
      out: { type: 'string' }, in: { type: 'string', multiple: true }, bundle: { type: 'string' }, workspace: { type: 'string' },
      boards: { type: 'string' }, 'allow-dirty': { type: 'boolean' },
    },
  });
  const need = (name: string, value: string | undefined): string => {
    if (value === undefined) throw new Error(`--${name} is required`);
    return value;
  };
  try {
    const boards = loadBoards();
    if (command === 'collect') {
      validateProfiles();
      const id = need('board', values.board);
      const board = boards.find((candidate) => candidate.ide_id === id);
      if (!board) throw new Error(`${id} is not a board of firmware/app/boards/boards.json`);
      const entry = collectBoard({
        board, buildDir: resolve(need('build-dir', values['build-dir'])), version: need('version', values.version), outDir: resolve(need('out', values.out)),
        evidenceLevel: evidenceLevels()[id] ?? 'cross-build', allowDirty: values['allow-dirty'] ?? false,
        ...(values.commit === undefined ? {} : { commit: values.commit }),
      });
      for (const image of entry.images) console.log(`firmware-images: ${image.file} ${image.bytes} bytes sha256 ${image.sha256}`);
      return 0;
    }
    if (command === 'assemble') {
      const manifest = assembleRelease({ inDirs: (values.in ?? []).map((directory) => resolve(directory)), outDir: resolve(need('out', values.out)), version: need('version', values.version), boards, allowDirty: values['allow-dirty'] ?? false });
      console.log(`firmware-images: ${manifest.images.length} images for ${Object.keys(manifest.builds).length} boards, commit ${manifest.commit}`);
      return 0;
    }
    if (command === 'stage') {
      const staged = stageForInstaller(resolve(need('bundle', values.bundle)), resolve(need('out', values.out)));
      console.log(`firmware-images: staged ${staged.join(', ')}`);
      return 0;
    }
    if (command === 'build') {
      const workspace = resolve(need('workspace', values.workspace));
      const out = resolve(need('out', values.out));
      const version = values.version ?? (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
      const wanted = values.boards === undefined ? boards : boards.filter((board) => values.boards!.split(',').includes(board.ide_id));
      validateProfiles();
      const levels = evidenceLevels();
      const collected = join(out, 'collected');
      const failures: string[] = [];
      for (const board of wanted) {
        const buildDir = join(workspace, 'out', 'release', board.ide_id);
        console.log(`firmware-images: west build ${board.zephyr_board}`);
        const run = Bun.spawnSync(['bash', '-c', `. "${join(ROOT, 'tools/firmware-test/env.sh')}" && cd "${workspace}" && west build -p always -b "${board.zephyr_board}" zplc/firmware/app -d "${buildDir}"`], { env: { ...process.env, ZPLC_FW_WS: workspace }, stdout: 'inherit', stderr: 'inherit' });
        if (run.exitCode !== 0) { failures.push(`${board.ide_id}: west build failed`); continue; }
        try {
          const entry = collectBoard({ board, buildDir, version, outDir: join(collected, board.ide_id), evidenceLevel: levels[board.ide_id] ?? 'cross-build', allowDirty: values['allow-dirty'] ?? false });
          for (const image of entry.images) console.log(`firmware-images: ${image.file} ${image.bytes} bytes sha256 ${image.sha256}`);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (failures.length > 0) { console.error(`firmware-images: ${failures.join('\n')}`); return 1; }
      if (wanted.length === boards.length) {
        const manifest = assembleRelease({ inDirs: [collected], outDir: join(out, 'bundle'), version, boards, allowDirty: values['allow-dirty'] ?? false });
        console.log(`firmware-images: ${manifest.images.length} images in ${join(out, 'bundle')}`);
      }
      return 0;
    }
    console.error('usage: firmware-images.ts collect|assemble|stage|build ...');
    return 2;
  } catch (error) {
    console.error(`firmware-images: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = main(Bun.argv.slice(2));

