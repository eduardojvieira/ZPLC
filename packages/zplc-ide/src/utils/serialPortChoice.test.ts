import { describe, expect, it } from 'bun:test';

import type { SerialPortOffered } from '../../electron/serialPortProtocol';
import { SERIAL_BOARD_CATALOG } from '../config/serialBoards';
import { SERIAL_VENDORS } from '../uploader/serialVendors';
import { buildSerialBoardCatalog, describePorts, hex4, usbIdText, type SerialBoardCatalog } from './serialPortChoice';

const catalog: SerialBoardCatalog = buildSerialBoardCatalog(
  [
    { ide_id: 'rpi_pico', display_name: 'Raspberry Pi Pico (RP2040)' },
    { ide_id: 'waveshare_rp2040_zero', display_name: 'Waveshare RP2040-Zero' },
    { ide_id: 'esp32s3_devkitc', display_name: 'ESP32-S3-DevKitC-1 (N8R8)' },
    { ide_id: 'arduino_giga_r1', display_name: 'Arduino GIGA R1' },
  ],
  {
    boards: {
      rpi_pico: { ids: [{ vid: '2E8A', pid: '000A' }] },
      waveshare_rp2040_zero: { ids: [{ vid: '2E8A', pid: '000A' }] },
      esp32s3_devkitc: { ids: [] },
      not_a_board_of_the_manifest: { ids: [{ vid: '1234', pid: '5678' }] },
    },
  },
  [
    { id: 0x0403, name: 'FTDI' },
    { id: 0x2e8a, name: 'Raspberry Pi (Pico, RP2040)' },
  ],
);

const port = (overrides: Partial<SerialPortOffered> & { portId: string }): SerialPortOffered => ({
  name: `Port ${overrides.portId}`,
  ...overrides,
});

describe('serial port choice (IDE-018)', () => {
  it('writes a USB identifier as four hexadecimal digits for the vendor and four for the product', () => {
    expect(hex4(0x2e8a)).toBe('2E8A');
    expect(hex4(10)).toBe('000A');
    expect(usbIdText(0x2e8a, 0x000a)).toBe('2E8A:000A');
    expect(usbIdText(0x0403, undefined)).toBe('0403');
    expect(usbIdText(undefined, undefined)).toBeNull();
  });

  it('marks a port whose USB identifiers a board of the manifest declares, naming every board that shares them', () => {
    const [row] = describePorts([port({ portId: 'a', name: 'Pico', vendorId: 0x2e8a, productId: 0x000a, serialNumber: 'E661' })], catalog);
    expect(row).toMatchObject({
      portId: 'a',
      name: 'Pico',
      usbId: '2E8A:000A',
      serialNumber: 'E661',
      kind: 'known-board',
      boards: ['Raspberry Pi Pico (RP2040)', 'Waveshare RP2040-Zero'],
      vendor: 'Raspberry Pi (Pico, RP2040)',
    });
    expect(row!.ambiguous).toBe(true);
  });

  it('names the vendor of a port that is no known board, and marks neither for a port with no USB identifiers', () => {
    const [ftdi, bare] = describePorts(
      [port({ portId: 'f', vendorId: 0x0403, productId: 0x6001 }), port({ portId: 'b', name: 'ttyS0' })],
      catalog,
    );
    expect(ftdi).toMatchObject({ kind: 'known-vendor', vendor: 'FTDI', usbId: '0403:6001', boards: [], ambiguous: false });
    expect(bare).toMatchObject({ kind: 'other', vendor: null, usbId: null, boards: [] });
  });

  it('puts the known boards first, then the known vendors, then the rest, each group in the order of the offer', () => {
    const rows = describePorts(
      [
        port({ portId: 'other' }),
        port({ portId: 'vendor', vendorId: 0x0403, productId: 1 }),
        port({ portId: 'board-2', vendorId: 0x2e8a, productId: 0x000a }),
        port({ portId: 'unknown-vendor', vendorId: 0x9999, productId: 1 }),
        port({ portId: 'board-1', vendorId: 0x2e8a, productId: 0x000a }),
      ],
      catalog,
    );
    expect(rows.map((row) => row.portId)).toEqual(['board-2', 'board-1', 'vendor', 'other', 'unknown-vendor']);
    expect(rows.find((row) => row.portId === 'unknown-vendor')).toMatchObject({ kind: 'other', usbId: '9999:0001' });
  });

  it('does not invent a board: an entry of the identifier file that is not a board of the manifest is ignored', () => {
    const [row] = describePorts([port({ portId: 'x', vendorId: 0x1234, productId: 0x5678 })], catalog);
    expect(row).toMatchObject({ kind: 'other', boards: [] });
  });

  it('reads the real manifest and identifier file: the Pico is a known board and every vendor of the filters is named', () => {
    const [row] = describePorts([port({ portId: 'pico', vendorId: 0x2e8a, productId: 0x000a })], SERIAL_BOARD_CATALOG);
    expect(row!.kind).toBe('known-board');
    expect(row!.boards.join(' ')).toContain('Pico');
    for (const vendor of SERIAL_VENDORS) {
      const [named] = describePorts([port({ portId: 'v', vendorId: vendor.id, productId: 0xfffe })], SERIAL_BOARD_CATALOG);
      expect(named!.vendor, vendor.name).toBe(vendor.name);
    }
  });
});
