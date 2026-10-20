// The flashing page names the image and the way to write it for every board of the manifest, in both languages (REL-024).
//
// The page is written by hand, because the boot-mode steps are the words of a person to a person, but the board table
// of it follows the manifest (firmware/app/boards/boards.json) and the naming and the formats of the release images
// (scripts/release/firmware-images.ts), so a board added to the manifest, or an image that changes its format, fails here
// until the page says it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { plannedFormats } from '../../scripts/release/firmware-images';

const ROOT = new URL('../../', import.meta.url).pathname;
const PAGES = {
  en: { path: 'docs/docs/guides/flash-firmware.md', version: '<version>' },
  es: { path: 'docs/i18n/es/docusaurus-plugin-content-docs/current/guides/flash-firmware.md', version: '<versión>' },
} as const;

interface Board { board_id: string; display_name: string; ide_id: string; zephyr_board: string }
const boards = JSON.parse(readFileSync(join(ROOT, 'firmware/app/boards/boards.json'), 'utf8')) as Board[];

/** What is missing from a page for a list of boards, as sentences that name the board. */
export function problemsOf(page: string, version: string, list: Board[]): string[] {
  const problems: string[] = [];
  const rows = page.split('\n').filter((line) => line.startsWith('|'));
  for (const board of list) {
    const flash = plannedFormats(board.zephyr_board).find((entry) => entry.role === 'flash')!;
    const image = `zplc-runtime-${version}-${board.board_id}.${flash.format}`;
    const own = rows.filter((row) => row.includes(`\`${board.board_id}\``));
    if (!page.includes(`\`${image}\``)) problems.push(`${board.board_id}: the page does not name its image ${image}`);
    if (own.length === 0) problems.push(`${board.board_id}: no row of the table of images names it`);
    const commands = rows.filter((row) => /west flash/.test(row) && row.includes(board.display_name.replace(/ \(.*/, '').replace('ESP32-S3-DevKitC-1 (N8R8)', 'ESP32-S3-DevKitC-1')));
    if (commands.length === 0) problems.push(`${board.board_id}: no command line for ${board.display_name}`);
    if (flash.format === 'uf2' && !commands.some((row) => row.includes('`uf2`'))) problems.push(`${board.board_id}: an RP2040 board is written by the uf2 runner`);
  }
  return problems;
}

describe('flashing page: every board of the manifest has its image and its command line (REL-024, stopgap: the browser flasher is tested without a board; no flash on a board is recorded)', () => {
  for (const [lang, { path, version }] of Object.entries(PAGES)) {
    const page = readFileSync(join(ROOT, path), 'utf8');

    it(`${lang}: names the image of each board with the format its SoC is flashed in, and a command line for each`, () => {
      expect(problemsOf(page, version, boards)).toEqual([]);
    });

    it(`${lang}: has the boot-mode steps of the Pico and of the ESP32-S3, and says that a person starts the flash`, () => {
      expect(page).toContain('RPI-RP2');
      expect(page).toMatch(/BOOTSEL/);
      // esptool v5 spelling (no .py, a hyphenated command), the one the Zephyr 4.4 runner calls.
      expect(page).toMatch(/esptool --chip esp32s3 .* write-flash 0x0 /);
      // The DevKitC-1 labels its reset button RST.
      expect(page).toMatch(/BOOT[\s\S]{0,80}(RST|RESET)/);
      expect(page).toMatch(/MCP/);
    });

    it(`${lang}: offers the browser flasher of the ESP32-S3, says it works in Chrome and Edge only, and keeps the command line`, () => {
      expect(page).toContain(`<FirmwareFlasher lang="${lang}" />`);
      expect(page).toMatch(lang === 'en' ? /Chrome or Edge/ : /Chrome o Edge/);
      expect(page).toMatch(/Firefox/);
      expect(page).toMatch(/0x0/);
      expect(page).not.toMatch(/not offered yet|Todavía no se ofrece/);
    });
  }

  it('fails a page that leaves a board out, or names an image in the wrong format', () => {
    const page = readFileSync(join(ROOT, PAGES.en.path), 'utf8');
    const extra: Board = { board_id: 'future-board', display_name: 'Future Board', ide_id: 'future', zephyr_board: 'future/rp2040' };
    expect(problemsOf(page, '<version>', [...boards, extra]).filter((problem) => problem.startsWith('future-board'))).toHaveLength(3 + 1);
    const wrongFormat = page.replaceAll('rpi-pico-rp2040.uf2', 'rpi-pico-rp2040.bin');
    expect(problemsOf(wrongFormat, '<version>', boards).some((problem) => problem.startsWith('rpi-pico-rp2040'))).toBe(true);
  });
});
