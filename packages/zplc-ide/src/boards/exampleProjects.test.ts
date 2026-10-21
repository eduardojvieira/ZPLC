/**
 * IO-017: every example project targets the board its name and text state, its I/O exists in that board's
 * description, and each one builds for its declared target.
 */
import { describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compilerCheck } from '../cli/toolApi';
import { BOARD_OPTIONS, getBoardIo } from '../config/boardProfiles';
import { mappingProblem, type IoSection } from './boardIoMapping';

const PROJECTS = join(import.meta.dir, '../../projects');
/** Host targets: a program on the native runtime or the simulator has no pins to describe. */
const HOST_TARGETS = new Set(['posix', 'host', 'native']);

const BOARD_WORDS: Record<string, RegExp> = {
  rpi_pico: /raspberry pi pico|\bpico\b|rp2040/i,
  esp32s3_devkitc: /esp32/i,
  arduino_opta_wifi: /\bopta\b/i,
  arduino_giga_r1: /\bgiga\b/i,
  stm32f746g_disco: /\bdisco\b|f746/i,
  nucleo_h743zi: /nucleo|h743/i,
};

interface IoRow {
  name: string;
  address: string;
  description?: string;
}
interface Manifest {
  name?: string;
  description?: string;
  target?: { board?: string };
  io?: { inputs?: IoRow[]; outputs?: IoRow[]; virtual?: IoRow[]; analog?: { adc?: IoRow[]; dac?: IoRow[] } };
}

/** What is wrong with an example project directory, as sentences that name the project. */
async function problemsOf(directory: string, name: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(join(directory, 'zplc.json'), 'utf8')) as Manifest;
  const problems: string[] = [];
  const board = manifest.target?.board;
  const catalogue = new Set(BOARD_OPTIONS.map((option) => option.value));
  if (!board || !(catalogue.has(board) || HOST_TARGETS.has(board))) {
    problems.push(`${name}: target.board ${JSON.stringify(board)} is neither a catalogue board nor a host target`);
    return problems;
  }

  const text = [
    name,
    manifest.name ?? '',
    manifest.description ?? '',
    ...[
      ...(manifest.io?.inputs ?? []),
      ...(manifest.io?.outputs ?? []),
      ...(manifest.io?.analog?.adc ?? []),
      ...(manifest.io?.analog?.dac ?? []),
    ].map((row) => row.description ?? ''),
  ].join('\n');
  const mentioned = Object.entries(BOARD_WORDS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([id]) => id);
  if (mentioned.length > 0 && (mentioned.length !== 1 || mentioned[0] !== board)) {
    problems.push(`${name}: its name or text states ${mentioned.join(', ')} but it targets ${board}`);
  }
  if (HOST_TARGETS.has(board) && /\b(gp\d+|gpio\d+)\b/i.test(text)) {
    problems.push(`${name}: it targets the host but its text names a pin`);
  }

  const io = getBoardIo(board);
  const label = BOARD_OPTIONS.find((option) => option.value === board)?.label ?? board;
  if (io) {
    const rows: Array<[IoSection, IoRow]> = [
      ...(manifest.io?.inputs ?? []).map((row): [IoSection, IoRow] => ['inputs', row]),
      ...(manifest.io?.analog?.adc ?? []).map((row): [IoSection, IoRow] => ['inputs', row]),
      ...(manifest.io?.outputs ?? []).map((row): [IoSection, IoRow] => ['outputs', row]),
      ...(manifest.io?.analog?.dac ?? []).map((row): [IoSection, IoRow] => ['outputs', row]),
    ];
    for (const [section, row] of rows) {
      const problem = mappingProblem(io, label, section, row);
      if (problem) problems.push(`${name}: ${row.name}: ${problem}`);
    }
  }

  const checked = await compilerCheck(directory);
  if (!checked.ok) {
    const first = checked.evidence.diagnostics[0];
    problems.push(`${name}: does not build for ${board}: ${first?.message ?? first?.code ?? 'unknown'}`);
  }
  return problems;
}

describe('example projects (IO-017)', () => {
  test('every bundled example targets its board, uses channels the board has, and builds', async () => {
    const names = (await readdir(PROJECTS, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(names.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const name of names) problems.push(...(await problemsOf(join(PROJECTS, name), name)));
    expect(problems).toEqual([]);
  }, 120_000);

  test('the check finds an example that targets another board than its name states', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zplc-example-'));
    try {
      await cp(join(PROJECTS, 'pico_blinky'), directory, { recursive: true });
      const path = join(directory, 'zplc.json');
      const manifest = JSON.parse(await readFile(path, 'utf8')) as Manifest;
      manifest.target = { board: 'esp32s3_devkitc' };
      await writeFile(path, JSON.stringify(manifest));
      const problems = await problemsOf(directory, 'pico_blinky');
      expect(problems.join('\n')).toContain('states rpi_pico but it targets esp32s3_devkitc');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('the check finds an example whose I/O is not on the board', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zplc-example-'));
    try {
      await cp(join(PROJECTS, 'pico_blinky'), directory, { recursive: true });
      const path = join(directory, 'zplc.json');
      const manifest = JSON.parse(await readFile(path, 'utf8')) as Manifest;
      manifest.io!.outputs![0]!.address = '%Q0.7';
      await writeFile(path, JSON.stringify(manifest));
      const problems = await problemsOf(directory, 'pico_blinky');
      expect(problems.join('\n')).toContain('has no output channel at %QX0.7');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
