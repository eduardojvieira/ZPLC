import { readFileSync } from 'node:fs';

/** The serial port is a parameter or is found from the USB identifiers of the board (HIL-007). Nothing here opens a port. */
const USB_IDS = new URL('../../../tools/hil/usb-ids.json', import.meta.url);

export interface ListedPort {
  path: string;
  vendorId?: string | undefined;
  productId?: string | undefined;
  serialNumber?: string | undefined;
  manufacturer?: string | undefined;
}

export class PortSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortSelectionError';
  }
}

export function boardUsbIds(board: string | undefined): Array<{ vid: string; pid: string }> {
  const boards = (JSON.parse(readFileSync(USB_IDS, 'utf8')) as { boards: Record<string, { ids?: Array<{ vid: string; pid: string }> }> })
    .boards;
  const wanted = board === undefined ? Object.values(boards) : [boards[board] ?? {}];
  return wanted.flatMap((entry) => (entry.ids ?? []).map(({ vid, pid }) => ({ vid, pid })));
}

/** macOS lists one device as /dev/tty.X and /dev/cu.X; the cu one is the one to open. */
const sameDevice = (path: string): string => (path.startsWith('/dev/tty.') ? path.replace('/dev/tty.', '/dev/cu.') : path);

export function selectPort(options: {
  port?: string | undefined;
  board?: string | undefined;
  env?: Record<string, string | undefined>;
  listed: () => ListedPort[];
}): string {
  if (options.port) return options.port;
  const named = options.env?.ZPLC_SERIAL_PORT;
  if (named) return named;
  const ids = boardUsbIds(options.board);
  if (ids.length === 0)
    throw new PortSelectionError(
      `no USB identifiers are known for board ${JSON.stringify(options.board)}: pass --port or set ZPLC_SERIAL_PORT`,
    );
  const ports = options.listed();
  const found = new Set<string>();
  for (const port of ports) {
    if (ids.some((id) => id.vid.toLowerCase() === port.vendorId?.toLowerCase() && id.pid.toLowerCase() === port.productId?.toLowerCase()))
      found.add(sameDevice(port.path));
  }
  if (found.size === 1) return [...found][0]!;
  if (found.size === 0) {
    const seen =
      ports.map((port) => (port.vendorId ? `${port.path} (${port.vendorId}:${port.productId})` : port.path)).join(', ') ||
      'no serial port at all';
    throw new PortSelectionError(
      `no port matches board ${JSON.stringify(options.board)}; seen: ${seen}. Pass --port or set ZPLC_SERIAL_PORT`,
    );
  }
  throw new PortSelectionError(
    `more than one port matches board ${JSON.stringify(options.board)}: ${[...found].sort().join(', ')}. Pass --port to say which`,
  );
}
