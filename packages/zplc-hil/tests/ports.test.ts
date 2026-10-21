import { describe, expect, test } from 'bun:test';

import { boardUsbIds, PortSelectionError, selectPort } from '../src/ports';

const PICO = { path: '/dev/ttyACM0', vendorId: '2E8A', productId: '000A' };
const OTHER = { path: '/dev/ttyUSB0', vendorId: '10C4', productId: 'EA60' };

describe('the serial port is a parameter or found from USB identifiers (HIL-007)', () => {
  test('an explicit port, then the environment, win without listing anything', () => {
    const boom = (): never => {
      throw new Error('no scan wanted');
    };
    expect(selectPort({ port: 'COM7', board: 'rpi_pico', env: { ZPLC_SERIAL_PORT: 'COM9' }, listed: boom })).toBe('COM7');
    expect(selectPort({ board: 'rpi_pico', env: { ZPLC_SERIAL_PORT: '/dev/cu.usbmodem11' }, listed: boom })).toBe('/dev/cu.usbmodem11');
  });

  test('the board is found by its identifiers, and the two macOS names are one device', () => {
    expect(selectPort({ board: 'rpi_pico', env: {}, listed: () => [OTHER, PICO] })).toBe('/dev/ttyACM0');
    const tty = { path: '/dev/tty.usbmodem1101', vendorId: '2e8a', productId: '000a' };
    expect(selectPort({ board: 'rpi_pico', env: {}, listed: () => [tty, { ...tty, path: '/dev/cu.usbmodem1101' }] })).toBe(
      '/dev/cu.usbmodem1101',
    );
  });

  test('two matches, none, and a board with no known identifiers are errors that say what to pass', () => {
    expect(() => selectPort({ board: 'rpi_pico', env: {}, listed: () => [PICO, { ...PICO, path: '/dev/ttyACM1' }] })).toThrow(/--port/);
    expect(() => selectPort({ board: 'rpi_pico', env: {}, listed: () => [OTHER] })).toThrow(/\/dev\/ttyUSB0/);
    expect(() => selectPort({ board: 'esp32s3_devkitc', env: {}, listed: () => [PICO] })).toThrow(PortSelectionError);
  });

  test('the identifiers are the ones the Python tools read', () => {
    expect(boardUsbIds('rpi_pico')).toEqual([{ vid: '2E8A', pid: '000A' }]);
  });
});
