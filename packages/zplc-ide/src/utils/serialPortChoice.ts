/**
 * What the serial-port dialog shows (IDE-018), as plain data: each port the system offers with its name and its USB
 * identifiers, the known boards that declare those identifiers, and the vendor. No React and no Electron here, so the
 * dialog can be rebuilt on another component kit without touching what it says.
 *
 * A board is known when a board of the manifest (`firmware/app/boards/boards.json`) has an entry with the port's vendor
 * and product numbers in the identifier file (`tools/hil/usb-ids.json`). Two boards may share identifiers (the Pico and
 * the RP2040-Zero do): the row then names both and says that the identifiers do not tell them apart.
 */
import type { SerialPortOffered } from '../../electron/serialPortProtocol';
import { currentLocale, t as translateNow, type Translator } from '../i18n';

export interface SerialBoardCatalog {
  /** `VVVV:PPPP` (upper-case hexadecimal) to the display names of the boards that declare it, in the order of the manifest. */
  boardsByUsbId: ReadonlyMap<string, readonly string[]>;
  vendorsById: ReadonlyMap<number, string>;
}

export interface SerialPortRow {
  portId: string;
  /** What the system calls the port. */
  name: string;
  /** `VVVV:PPPP`, or the vendor alone when the product is unknown, or null. */
  usbId: string | null;
  serialNumber: string | null;
  /** The boards that declare these identifiers; empty when none does. */
  boards: string[];
  /** More than one board declares these identifiers: the port does not say which of them it is. */
  ambiguous: boolean;
  /** The vendor, when it is one of those Studio offers. */
  vendor: string | null;
  kind: 'known-board' | 'known-vendor' | 'other';
}

export const hex4 = (value: number): string => value.toString(16).toUpperCase().padStart(4, '0');

export function usbIdText(vendorId: number | undefined, productId: number | undefined): string | null {
  if (vendorId === undefined) return null;
  return productId === undefined ? hex4(vendorId) : `${hex4(vendorId)}:${hex4(productId)}`;
}

interface BoardEntry {
  ide_id: string;
  display_name: string;
}
interface UsbIdFile {
  boards: Record<string, { ids: Array<{ vid: string; pid: string }> }>;
}

/**
 * The catalog from the board manifest, the USB identifier file and the vendor list; entries of the identifier file that are not boards of
 * the manifest are left out.
 */
export function buildSerialBoardCatalog(
  boards: readonly BoardEntry[],
  usbIds: UsbIdFile,
  vendors: ReadonlyArray<{ id: number; name: string }>,
): SerialBoardCatalog {
  const boardsByUsbId = new Map<string, string[]>();
  for (const board of boards) {
    for (const id of usbIds.boards[board.ide_id]?.ids ?? []) {
      const vendor = Number.parseInt(id.vid, 16);
      const product = Number.parseInt(id.pid, 16);
      if (!Number.isInteger(vendor) || !Number.isInteger(product)) continue;
      const key = `${hex4(vendor)}:${hex4(product)}`;
      const names = boardsByUsbId.get(key) ?? [];
      if (!names.includes(board.display_name)) names.push(board.display_name);
      boardsByUsbId.set(key, names);
    }
  }
  return { boardsByUsbId, vendorsById: new Map(vendors.map((vendor) => [vendor.id, vendor.name])) };
}

/** The line that says what is known about the board behind a row, or what is not. */
export function boardNote(row: SerialPortRow, t: Translator['t'] = translateNow): string | null {
  if (row.kind === 'known-board') {
    return row.ambiguous
      ? t('serialPort.knownBoards', { boards: new Intl.ListFormat(currentLocale(), { type: 'disjunction' }).format(row.boards) })
      : t('serialPort.knownBoard', { board: row.boards[0]! });
  }
  return row.vendor === null ? null : t('serialPort.vendor', { vendor: row.vendor });
}

const ORDER: Record<SerialPortRow['kind'], number> = { 'known-board': 0, 'known-vendor': 1, other: 2 };

/** One row for each port: known boards first, then known vendors, then the rest, each group in the order offered. */
export function describePorts(ports: readonly SerialPortOffered[], catalog: SerialBoardCatalog): SerialPortRow[] {
  const rows = ports.map((port): SerialPortRow => {
    const usbId = usbIdText(port.vendorId, port.productId);
    const boards =
      port.vendorId !== undefined && port.productId !== undefined
        ? [...(catalog.boardsByUsbId.get(`${hex4(port.vendorId)}:${hex4(port.productId)}`) ?? [])]
        : [];
    const vendor = port.vendorId === undefined ? null : (catalog.vendorsById.get(port.vendorId) ?? null);
    return {
      portId: port.portId,
      name: port.name,
      usbId,
      serialNumber: port.serialNumber ?? null,
      boards,
      ambiguous: boards.length > 1,
      vendor,
      kind: boards.length > 0 ? 'known-board' : vendor !== null ? 'known-vendor' : 'other',
    };
  });
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => ORDER[a.row.kind] - ORDER[b.row.kind] || a.index - b.index)
    .map(({ row }) => row);
}
