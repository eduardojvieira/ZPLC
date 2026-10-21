/**
 * The pending serial-port questions of the windows (IDE-018).
 *
 * `navigator.serial.requestPort()` makes Electron ask the main process for a port and wait for one answer. The broker
 * turns that wait into a question to the window that asked (an offer with the ports the system lists, updated as devices
 * come and go), and answers Electron once: with the port the user chose in the window's dialog, or with a cancel. Nothing
 * is chosen without the window's answer, an answer from another window is refused, and a port that went away while the
 * dialog was open is not accepted.
 */
import { SERIAL_PORT_LIMITS, cleanPortText, type SerialPortOffer, type SerialPortOffered } from './serialPortProtocol.js';

/** A port as Electron's `select-serial-port` and `serial-port-added` events give it (the numbers are decimal strings). */
export interface SystemSerialPort {
  portId: string;
  displayName?: string;
  portName?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
}

export interface SerialPortBrokerOptions {
  /** Delivers an offer to the window `ownerId`; true when it was sent. */
  send(ownerId: number, offer: SerialPortOffer): boolean;
  /** A new identifier for a request. */
  newRequestId(): string;
}

interface Pending {
  ownerId: number;
  callback: (portId: string) => void;
  ports: SerialPortOffered[];
}

/** A USB number from Electron's decimal string, or undefined when it is not one. */
function usbNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return undefined;
  const number = Number(value);
  return number <= 0xffff ? number : undefined;
}

function offered(port: SystemSerialPort, index: number): SerialPortOffered | null {
  if (typeof port.portId !== 'string' || port.portId.length === 0 || port.portId.length > SERIAL_PORT_LIMITS.maxPortIdChars) return null;
  const vendorId = usbNumber(port.vendorId);
  const productId = usbNumber(port.productId);
  const serialNumber = cleanPortText(port.serialNumber);
  return {
    portId: port.portId,
    name: cleanPortText(port.displayName) ?? cleanPortText(port.portName) ?? `Serial port ${index + 1}`,
    ...(vendorId === undefined ? {} : { vendorId }),
    ...(productId === undefined ? {} : { productId }),
    ...(serialNumber === null ? {} : { serialNumber }),
  };
}

function offeredList(ports: readonly SystemSerialPort[]): SerialPortOffered[] {
  const seen = new Set<string>();
  const list: SerialPortOffered[] = [];
  for (const port of ports) {
    const item = offered(port, list.length);
    if (item === null || seen.has(item.portId)) continue;
    seen.add(item.portId);
    list.push(item);
    if (list.length === SERIAL_PORT_LIMITS.maxPorts) break;
  }
  return list;
}

export function createSerialPortBroker(options: SerialPortBrokerOptions) {
  const pending = new Map<string, Pending>();
  const push = (requestId: string, entry: Pending): void => {
    if (!options.send(entry.ownerId, { requestId, ports: entry.ports })) {
      // the window cannot be asked: nobody can choose
      pending.delete(requestId);
      entry.callback('');
    }
  };
  const settle = (requestId: string, portId: string): void => {
    const entry = pending.get(requestId);
    if (!entry) return;
    pending.delete(requestId);
    entry.callback(portId);
  };

  return {
    /** A page of window `ownerId` asked for a port: the window is asked, and `callback` is called once with the answer. */
    open(request: { ownerId: number; ports: readonly SystemSerialPort[]; callback: (portId: string) => void }): string {
      const requestId = options.newRequestId();
      const entry: Pending = { ownerId: request.ownerId, callback: request.callback, ports: offeredList(request.ports) };
      pending.set(requestId, entry);
      push(requestId, entry);
      return requestId;
    },

    /** The window's answer. An answer that is not from the window that was asked, or that names another port, cancels. */
    choose(ownerId: number, requestId: string, portId: string | null): void {
      const entry = pending.get(requestId);
      if (!entry || entry.ownerId !== ownerId) return;
      settle(requestId, portId !== null && entry.ports.some((port) => port.portId === portId) ? portId : '');
    },

    /** The list the window may show now (the refresh of the dialog); null when the question is gone or is not its own. */
    list(ownerId: number, requestId: string): SerialPortOffer | null {
      const entry = pending.get(requestId);
      return entry && entry.ownerId === ownerId ? { requestId, ports: entry.ports } : null;
    },

    /** A device was plugged in while a question of `ownerId` is open. */
    added(ownerId: number, port: SystemSerialPort): void {
      for (const [requestId, entry] of pending) {
        if (entry.ownerId !== ownerId || entry.ports.length >= SERIAL_PORT_LIMITS.maxPorts) continue;
        const item = offered(port, entry.ports.length);
        if (item === null || entry.ports.some((each) => each.portId === item.portId)) continue;
        entry.ports = [...entry.ports, item];
        push(requestId, entry);
      }
    },

    /** A device went away: the dialog stops offering it, and it cannot be chosen any more. */
    removed(ownerId: number, portId: string): void {
      for (const [requestId, entry] of pending) {
        if (entry.ownerId !== ownerId || !entry.ports.some((port) => port.portId === portId)) continue;
        entry.ports = entry.ports.filter((port) => port.portId !== portId);
        push(requestId, entry);
      }
    },

    /** The window was closed or loaded another document: its questions are cancelled. */
    cancelOwner(ownerId: number): void {
      for (const [requestId, entry] of [...pending]) if (entry.ownerId === ownerId) settle(requestId, '');
    },

    /** Questions open now (a test asserts that none is left). */
    size(): number {
      return pending.size;
    },
  };
}

export type SerialPortBroker = ReturnType<typeof createSerialPortBroker>;
