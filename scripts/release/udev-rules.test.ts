// REL-013: the udev rule of the Linux packages is written from the USB identifiers the HIL tools use, so it cannot
// drift from them.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULE_FILE_NAME, RULE_TARGET, renderUdevRules, readUsbIds, type BoardEntry, type UsbIds } from './udev-rules';

const root = join(import.meta.dir, '..', '..');
const boards: BoardEntry[] = [
  { ide_id: 'rpi_pico', display_name: 'Raspberry Pi Pico (RP2040)' },
  { ide_id: 'esp32s3_devkitc', display_name: 'ESP32-S3-DevKitC-1 (N8R8)' },
];
const ids: UsbIds = {
  rpi_pico: { ids: [{ vid: '2E8A', pid: '000A', source: 'CONFIG_USB_DEVICE_VID in the board profile' }] },
  esp32s3_devkitc: { ids: [], note: 'to be filled' },
};

describe('the udev rule (REL-013)', () => {
  test('tags each known serial device for the user who is logged in, by lower case identifiers', () => {
    const text = renderUdevRules(ids, boards);
    const rules = text.split('\n').filter((line) => line.startsWith('SUBSYSTEM=='));
    expect(rules).toEqual([
      'SUBSYSTEM=="tty", SUBSYSTEMS=="usb", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="000a", TAG+="uaccess", ' +
        'ENV{ID_MM_DEVICE_IGNORE}="1"',
    ]);
  });

  test('says which boards no identifier is recorded for, and sends their users to the group fallback', () => {
    const text = renderUdevRules(ids, boards);
    expect(text).toContain('# ESP32-S3-DevKitC-1 (N8R8) (esp32s3_devkitc): no USB identifier is recorded');
    expect(text).toContain('dialout');
  });

  test('lists a vendor and product pair once, with every board that uses it', () => {
    const shared: UsbIds = {
      a: { ids: [{ vid: '2e8a', pid: '000a', source: 's' }] },
      b: { ids: [{ vid: '2E8A', pid: '000A', source: 's' }] },
    };
    const text = renderUdevRules(shared, [
      { ide_id: 'a', display_name: 'Board A' },
      { ide_id: 'b', display_name: 'Board B' },
    ]);
    expect(text.split('\n').filter((line) => line.startsWith('SUBSYSTEM=='))).toHaveLength(1);
    expect(text).toContain('Board A (a)');
    expect(text).toContain('Board B (b)');
  });

  test('refuses an identifier that is not four hexadecimal digits, and a board that the manifest does not have', () => {
    expect(() => renderUdevRules({ rpi_pico: { ids: [{ vid: '2E8', pid: '000A', source: 's' }] } }, boards)).toThrow(/vendor/);
    expect(() => renderUdevRules({ rpi_pico: { ids: [{ vid: '2E8A', pid: '0xA', source: 's' }] } }, boards)).toThrow(/product/);
    expect(() => renderUdevRules({ nope: { ids: [{ vid: '2E8A', pid: '000A', source: 's' }] } }, boards)).toThrow(/nope/);
  });

  test('is the same bytes every time (a package build must be reproducible)', () => {
    expect(renderUdevRules(ids, boards)).toBe(renderUdevRules(ids, boards));
  });

  test('covers every identifier of tools/hil/usb-ids.json and every board of the manifest', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'firmware/app/boards/boards.json'), 'utf8')) as BoardEntry[];
    const recorded = readUsbIds(join(root, 'tools/hil/usb-ids.json'));
    const text = renderUdevRules(recorded, manifest);
    for (const entry of Object.values(recorded).flatMap((board) => board.ids)) {
      expect(text).toContain(`ATTRS{idVendor}=="${entry.vid.toLowerCase()}", ATTRS{idProduct}=="${entry.pid.toLowerCase()}"`);
    }
    for (const board of manifest) expect(text).toContain(`(${board.ide_id})`);
  });

  test('the command line writes the file that the package installs, under the name that sorts before the uaccess rules', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'zplc-udev-')), RULE_FILE_NAME);
    const run = spawnSync('bun', [join(import.meta.dir, 'udev-rules.ts'), '--out', out], { encoding: 'utf8' });
    expect({ code: run.status, stderr: run.stderr }).toMatchObject({ code: 0 });
    expect(readFileSync(out, 'utf8')).toContain('TAG+="uaccess"');
    // systemd applies the uaccess tag at 70-uaccess.rules and 73-seat-late.rules: the tag must be set before them.
    expect(RULE_FILE_NAME < '73-seat-late.rules').toBe(true);
    expect(RULE_TARGET).toBe(`/usr/lib/udev/rules.d/${RULE_FILE_NAME}`);
  });
});
