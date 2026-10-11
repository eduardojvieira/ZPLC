/**
 * The USB vendors whose serial adapters and boards Studio offers when the user connects to a device. One list for the
 * filters of `navigator.serial.requestPort()` and for the dialog that names the vendor of a port (IDE-018).
 */
export const SERIAL_VENDORS: ReadonlyArray<{ id: number; name: string }> = [
  { id: 0x0403, name: 'FTDI' },
  { id: 0x10C4, name: 'Silicon Labs CP210x' },
  { id: 0x1A86, name: 'CH340' },
  { id: 0x0483, name: 'STMicroelectronics (ST-Link, Nucleo)' },
  { id: 0x239A, name: 'Adafruit' },
  { id: 0x2341, name: 'Arduino' },
  { id: 0x1366, name: 'SEGGER J-Link' },
  { id: 0x303A, name: 'Espressif' },
  { id: 0x2E8A, name: 'Raspberry Pi (Pico, RP2040)' },
  { id: 0x2FE3, name: 'Zephyr USB CDC ACM (Arduino Opta, etc.)' },
];
