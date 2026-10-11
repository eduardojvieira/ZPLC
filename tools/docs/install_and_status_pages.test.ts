// The install page, the hardware support page and the safety page (DOC-005, DOC-010).
//
// A page of this kind is true only while the release configuration, the board manifest and the limits of the source say
// what it says, so each test reads the thing the page is about and compares: the installers the build produces, the
// boards and levels of the manifest (through the library that derives them), and the numbers of the generated references.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { RULE_TARGET, readUsbIds } from '../../scripts/release/udev-rules';
import { markdownFiles } from './check_doc_claims';

const ROOT = new URL('../../', import.meta.url).pathname;
const EN = 'docs/docs';
const ES = 'docs/i18n/es/docusaurus-plugin-content-docs/current';
const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const both = (page: string): Array<[string, string]> => [[`${EN}/${page}`, text(`${EN}/${page}`)], [`${ES}/${page}`, text(`${ES}/${page}`)]];

/** Headings of a page, outside code blocks, as `level text`. */
function headings(page: string): string[] {
  let fence = '';
  const found: string[] = [];
  for (const line of page.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) { if (marker && marker[1]![0] === fence[0]) fence = ''; continue; }
    if (marker) { fence = marker[1]!; continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) found.push(`${heading[1]!.length} ${heading[2]!.trim()}`);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// DOC-005
// ---------------------------------------------------------------------------------------------------------------------

describe('install page: built from the channels and installers that exist today (DOC-005)', () => {
  const builder = Bun.YAML.parse(text('packages/zplc-ide/electron-builder.yml')) as {
    win: { target: string[] }; mac: { target: string[] }; linux: { target: string[] };
    nsis: { artifactName: string }; portable: { artifactName: string };
  };
  const extensionOf: Record<string, string[]> = { nsis: ['.exe'], portable: ['.exe'], dmg: ['.dmg'], zip: ['.zip'], AppImage: ['.AppImage'], deb: ['.deb'], rpm: ['.rpm'] };
  const built = [...builder.win.target, ...builder.mac.target, ...builder.linux.target];
  const page = both('getting-started/install.md');

  it('names every installer format the build produces, and no format it does not produce', () => {
    const expected = new Set(built.flatMap((target) => extensionOf[target] ?? [`<unknown target ${target}>`]));
    expect([...expected].filter((extension) => extension.startsWith('<unknown'))).toEqual([]);
    for (const [path, content] of page) {
      const named = new Set(content.match(/\.(?:exe|dmg|zip|AppImage|deb|rpm|msi|msix|pkg|snap|flatpak)\b/g));
      // the .zip of the macOS app is mentioned only in the pipeline-name paragraph, as an asset of the release
      for (const extension of ['.exe', '.dmg', '.AppImage', '.deb', '.rpm']) expect({ path, extension, named: named.has(extension) }).toEqual({ path, extension, named: true });
      expect({ path, unbuilt: [...named].filter((extension) => !expected.has(extension)) }).toEqual({ path, unbuilt: [] });
    }
  });

  it('says that the Windows files are unsigned, as their file names do', () => {
    expect(builder.nsis.artifactName).toContain('unsigned');
    expect(builder.portable.artifactName).toContain('unsigned');
    for (const [path, content] of page) {
      expect({ path, setup: content.includes('setup-unsigned'), portable: content.includes('portable-unsigned') }).toEqual({ path, setup: true, portable: true });
    }
  });

  it('lists no channel as live that the release channels file does not say is live, and needs a rewrite when one goes live', () => {
    const channels = JSON.parse(text('scripts/release/channels.json')) as Array<{ channel: string; state: string }>;
    // REL-038: once a Windows channel is live the page must recommend it first; the page does not know one, so none may be.
    expect(channels.filter((channel) => channel.state === 'live')).toEqual([]);
  });

  it('has the parts the requirement lists, in both languages with the same shape', () => {
    const [english, spanish] = page.map(([, content]) => headings(content));
    expect(english!.length).toBe(spanish!.length);
    expect(english!.map((heading) => heading.split(' ')[0])).toEqual(spanish!.map((heading) => heading.split(' ')[0]));
    for (const wanted of ['2 Channels', '2 Download', '2 Verify the download', '2 First launch', '3 Windows', '3 macOS', '3 Linux', '2 Linux: serial port access', '2 Troubleshooting']) {
      expect(english).toContain(wanted);
    }
    for (const [path, content] of page) {
      for (const command of ['sha256sum --ignore-missing -c SHA256SUMS', 'shasum -a 256 -c SHA256SUMS', 'Get-FileHash', 'gh attestation verify']) {
        expect({ path, command, present: content.includes(command) }).toEqual({ path, command, present: true });
      }
    }
  });

  it('names the udev rule the packages install, the boards it covers and how to apply it without a reboot (REL-013)', () => {
    const covered = Object.entries(readUsbIds()).filter(([, entry]) => entry.ids.length > 0).flatMap(([, entry]) => entry.ids.map((id) => `${id.vid.toLowerCase()}:${id.pid.toLowerCase()}`));
    expect(covered.length).toBeGreaterThan(0);
    for (const [path, content] of page) {
      expect({ path, rule: content.includes(RULE_TARGET) }).toEqual({ path, rule: true });
      for (const identifier of new Set(covered)) expect({ path, identifier, named: content.includes(identifier) }).toEqual({ path, identifier, named: true });
      for (const command of ['udevadm control --reload-rules', 'udevadm trigger', 'usermod -aG dialout']) {
        expect({ path, command, present: content.includes(command) }).toEqual({ path, command, present: true });
      }
    }
  });

  it('recommends the .deb or the .rpm before the AppImage, and lists the AppImage prerequisites (REL-012)', () => {
    for (const [path, content] of page) {
      const start = content.indexOf('### Linux');
      const linux = content.slice(start, content.indexOf('\n## ', start));
      const first = (extension: string) => linux.indexOf(extension);
      expect({ path, packagesFirst: first('.deb') > -1 && first('.rpm') > -1 && first('.deb') < first('AppImage') && first('.rpm') < first('AppImage') }).toEqual({ path, packagesFirst: true });
      expect({ path, fuse: linux.includes('libfuse2'), extract: linux.includes('--appimage-extract-and-run') }).toEqual({ path, fuse: true, extract: true });
    }
  });

  it('is the page that the first-run steps of the release checklist and the getting started page point to', () => {
    const [english, spanish] = [text(`${EN}/getting-started/index.md`), text(`${ES}/getting-started/index.md`)];
    expect(english).toContain('./install.md');
    expect(spanish).toContain('./install.md');
    expect(english).not.toContain('## Open an unsigned installer');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// DOC-010
// ---------------------------------------------------------------------------------------------------------------------

const BOARDS_SCRIPT = `
import importlib.util, json, sys
from pathlib import Path
root = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("zplc_boards", root / "firmware/zephyr/scripts/zplc_boards.py")
library = importlib.util.module_from_spec(spec); spec.loader.exec_module(library)
boards = json.loads((root / "firmware/app/boards/boards.json").read_text())
print(json.dumps([{"name": b["display_name"], "ide": b["ide_id"], "level": library.support_level(b, root)["level"]} for b in boards]))
`;

describe('hardware support page: one table, derived from the manifest and its records (DOC-010)', () => {
  const boards = JSON.parse(Bun.spawnSync(['python3', '-B', '-c', BOARDS_SCRIPT, ROOT], { stdout: 'pipe' }).stdout.toString()) as Array<{ name: string; ide: string; level: string }>;
  const support = both('reference/capabilities-evidence.md');

  it('lists every board of the manifest once, with the level its records give it', () => {
    expect(boards.length).toBeGreaterThan(0);
    for (const [path, content] of support) {
      const rows = content.split('\n').filter((line) => line.startsWith('| ') && boards.some((board) => line.includes(`\`${board.ide}\``)));
      expect({ path, boards: rows.length }).toEqual({ path, boards: boards.length });
      for (const board of boards) {
        const row = rows.filter((line) => line.includes(`\`${board.ide}\``));
        expect({ path, ide: board.ide, rows: row.length }).toEqual({ path, ide: board.ide, rows: 1 });
        expect(row[0]).toContain(`\`${board.level}\``);
      }
    }
  });

  it('is fresh: the generator that writes the table finds nothing to change', () => {
    const result = Bun.spawnSync(['python3', '-B', 'tools/docs/generate_board_reference.py', '--check'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect({ code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }).toMatchObject({ code: 0 });
  });

  it('is the only page that publishes a support level, with one vocabulary', () => {
    const levels = new Set(boards.map((board) => board.level));
    const vocabulary = ['cross-build', 'human-hil'];
    for (const level of levels) expect(vocabulary).toContain(level);
    const pages = [...markdownFiles(ROOT, EN), ...markdownFiles(ROOT, ES)];
    const holders: string[] = [];
    for (const page of pages) {
      const rows = text(page).split('\n').filter((line) => line.startsWith('|') && boards.some((board) => line.includes(board.name)) && /\b(?:cross-build|human-hil)\b/.test(line));
      if (rows.length > 0) holders.push(page.split('/').slice(-2).join('/'));
    }
    // the support page, and the generated board matrix of the boards reference, which reads the same function
    expect(holders.sort()).toEqual(['reference/boards.md', 'reference/boards.md', 'reference/capabilities-evidence.md', 'reference/capabilities-evidence.md']);
  });

  it('is linked from the pages that talk about boards, in both languages', () => {
    const linking = (language: string) => markdownFiles(ROOT, language).filter((page) => /\]\((?:\.\.?\/)+(?:reference\/)?capabilities-evidence\.md/.test(text(page)) || /\]\(\.\/capabilities-evidence\.md/.test(text(page)));
    expect(linking(EN).length).toBeGreaterThanOrEqual(8);
    expect(linking(ES).length).toBeGreaterThanOrEqual(8);
  });
});

describe('safety page: what ZPLC is not, and limits that the source says (DOC-010)', () => {
  const safety = both('safety-and-limitations.md');
  const numbers = (cell: string) => [...cell.replace(/(\d) (\d{3})\b/g, '$1$2').matchAll(/\d+/g)].map((match) => Number(match[0]));
  const row = (content: string, startsWith: string): string => {
    const found = content.split('\n').find((line) => line.startsWith(`| ${startsWith}`));
    if (!found) throw new Error(`no row starting with "${startsWith}"`);
    return found;
  };

  it('states the hard limits that the schema, the Kconfig reference and the scenario reference define', () => {
    const schema = JSON.parse(text('packages/zplc-ide/zplc.schema.json')) as { properties: { tasks: { maxItems: number } } };
    const kconfig = (symbol: string) => {
      const line = text(`${EN}/reference/kconfig.md`).split('\n').find((candidate) => candidate.includes(`\`CONFIG_${symbol}\``));
      if (!line) throw new Error(`CONFIG_${symbol} is not in the Kconfig reference`);
      return Number(/`(\d+)`/.exec(line.split('|')[3] ?? '')?.[1]);
    };
    const scenario = (name: string) => Number(/`(\d+)`/.exec(text(`${EN}/reference/scenario-file.md`).split('\n').find((line) => line.startsWith(`| ${name}`)) ?? '')?.[1]);
    const english = safety[0]![1];
    const spanish = safety[1]![1];
    expect(numbers(row(english, 'Tasks in one program').split('|')[2]!)).toEqual([schema.properties.tasks.maxItems]);
    expect(numbers(row(spanish, 'Tareas en un programa').split('|')[2]!)).toEqual([schema.properties.tasks.maxItems]);
    expect(numbers(row(english, 'Size of a compiled program').split('|')[2]!)[0]).toBe(kconfig('ZPLC_CODE_SIZE_MAX'));
    expect(numbers(row(spanish, 'Tamaño de un programa compilado').split('|')[2]!)[0]).toBe(kconfig('ZPLC_CODE_SIZE_MAX'));
    expect(numbers(row(english, 'Working and retentive memory').split('|')[2]!).slice(0, 2)).toEqual([kconfig('ZPLC_WORK_MEMORY_SIZE'), kconfig('ZPLC_RETAIN_MEMORY_SIZE')]);
    expect(numbers(row(spanish, 'Memoria de trabajo y retentiva').split('|')[2]!).slice(0, 2)).toEqual([kconfig('ZPLC_WORK_MEMORY_SIZE'), kconfig('ZPLC_RETAIN_MEMORY_SIZE')]);
    const expectedScenario = [scenario('Events in one scenario'), scenario('Expectations in one scenario'), scenario('Distinct signals in one scenario'), scenario('Samples of one scenario')];
    expect(numbers(row(english, 'Scenario').split('|')[2]!)).toEqual(expectedScenario);
    expect(numbers(row(spanish, 'Escenario').split('|')[2]!)).toEqual(expectedScenario);
  });

  it('has the same shape in both languages and is linked from the front door', () => {
    const [english, spanish] = safety.map(([, content]) => headings(content));
    expect(english!.map((heading) => heading.split(' ')[0])).toEqual(spanish!.map((heading) => heading.split(' ')[0]));
    expect(english).toContain('2 What ZPLC is not');
    expect(english).toContain('2 Hard limits');
    for (const page of ['getting-started/index.md', 'getting-started/install.md', 'reference/capabilities-evidence.md', 'release-notes/index.md']) {
      for (const [path, content] of both(page)) expect({ path, linked: content.includes('safety-and-limitations.md') }).toEqual({ path, linked: true });
    }
  });

  it('says in both languages that ZPLC is not a safety PLC and must not control machinery', () => {
    const [english, spanish] = safety.map(([, content]) => content);
    expect(english).toMatch(/not a safety PLC/i);
    expect(english).toMatch(/must not control machinery/i);
    expect(spanish).toMatch(/No es un PLC de seguridad/i);
    expect(spanish).toMatch(/No debe controlar maquinaria/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// DOC-004
// ---------------------------------------------------------------------------------------------------------------------

describe('first board page: written from the manifest, and honest that no board has run it (DOC-004, stopgap: the steps have not been executed on a board)', () => {
  const manifest = JSON.parse(text('firmware/app/boards/boards.json')) as Array<{
    ide_id: string; zephyr_board: string; build_command: string; io: { channels: Array<{ id: string; address: string; pin: string }> };
  }>;
  const levels = JSON.parse(Bun.spawnSync(['python3', '-B', '-c', BOARDS_SCRIPT, ROOT], { stdout: 'pipe' }).stdout.toString()) as Array<{ ide: string; level: string }>;
  const page = both('tutorials/first-board.md');
  const boards = ['rpi_pico', 'esp32s3_devkitc'].map((ide) => manifest.find((entry) => entry.ide_id === ide)!);

  it('names the build target, the build command, the first output and its pin of each board as the manifest has them', () => {
    for (const [path, content] of page) {
      for (const board of boards) {
        const output = board.io.channels.find((channel) => channel.id === 'DO0')!;
        expect({ path, board: board.ide_id, target: content.includes(`\`${board.zephyr_board}\``) }).toEqual({ path, board: board.ide_id, target: true });
        expect({ path, board: board.ide_id, ide: content.includes(`\`${board.ide_id}\``) }).toEqual({ path, board: board.ide_id, ide: true });
        expect({ path, board: board.ide_id, output: content.includes(`\`${output.address}\``) && content.includes(output.pin.split(' ')[0]!) }).toEqual({ path, board: board.ide_id, output: true });
      }
      expect(content).toContain(boards[0]!.build_command.replace(' --pristine', '').replace('west build ', 'west build '));
    }
  });

  it('uses example projects that exist and target the board they are given for', () => {
    for (const [ide, example] of [['rpi_pico', 'pico_blinky'], ['esp32s3_devkitc', 'esp32s3_blinky']] as const) {
      const project = JSON.parse(text(`packages/zplc-ide/projects/${example}/zplc.json`)) as { target: { board: string } };
      expect({ example, board: project.target.board }).toEqual({ example, board: ide });
      for (const [path, content] of page) expect({ path, example, named: content.includes(`\`${example}\``) }).toEqual({ path, example, named: true });
    }
  });

  it('says in a banner that the steps were not executed, for as long as both boards have no hardware record', () => {
    const levelOf = (ide: string) => levels.find((entry) => entry.ide === ide)!.level;
    expect([levelOf('rpi_pico'), levelOf('esp32s3_devkitc')]).toEqual(['cross-build', 'cross-build']);
    const [english, spanish] = page.map(([, content]) => content);
    expect(english).toMatch(/:::danger Not executed on a board/);
    expect(spanish).toMatch(/:::danger No ejecutado en una placa/);
    for (const [path, content] of page) {
      // no sentence of the page says that a flash or a run worked
      expect({ path, claims: /\b(?:successfully|successful|exitosamente|con éxito)\b/i.test(content) }).toEqual({ path, claims: false });
    }
  });
});
