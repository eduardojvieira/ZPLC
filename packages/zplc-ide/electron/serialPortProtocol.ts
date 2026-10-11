/**
 * The serial port the user chooses (IDE-018): what the main process offers to the window, and what the window answers.
 *
 * Electron asks the main process to pick the port of a `navigator.serial.requestPort()` call; the main process hands the
 * question to the window, which shows an in-application dialog, and the window answers with the identifier of one port or
 * with a cancel. One definition of the messages and their limits, shared by the main process (`serialPortBroker.ts`,
 * `ipcHandlers.ts`) and the renderer (`src/utils/serialPortChoice.ts`). Pure TypeScript with no Electron or Node import.
 *
 * Only a typed offer reaches the window: the identifier of a port is opaque to it, and what it shows (a name, the USB
 * vendor and product numbers, a serial number) is text and numbers cleaned by `cleanPortText`, never a path.
 */

export const SERIAL_PORT_LIMITS = {
  /** Ports in one offer. */
  maxPorts: 16,
  /** Characters of a port name or of a serial number shown to the user. */
  maxTextChars: 96,
  /** Characters of an opaque port identifier. */
  maxPortIdChars: 256,
  /** Characters of the identifier of one request. */
  maxRequestIdChars: 64,
} as const;

/** One port as the window sees it. `vendorId` and `productId` are the USB numbers (0 to 65535), when the port has them. */
export interface SerialPortOffered {
  portId: string;
  name: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
}

/** The question: the ports the system offers now. The same `requestId` with another list updates the dialog that is open. */
export interface SerialPortOffer {
  requestId: string;
  ports: SerialPortOffered[];
}

/** The answer: the identifier of one port of the offer, or null to cancel. */
export interface SerialPortChoice {
  requestId: string;
  portId: string | null;
}

/** A request for the list the main process holds now (the refresh of the dialog). */
export interface SerialPortListRequest {
  requestId: string;
}

function isUnsafeCodePoint(code: number): boolean {
  return code < 0x20 || code === 0x7F || code === 0x061C
    || (code >= 0x200B && code <= 0x200F)
    || (code >= 0x202A && code <= 0x202E)
    || (code >= 0x2060 && code <= 0x2069)
    || code === 0xFEFF;
}

/**
 * A text from a device or the system as one line the user can read: control and bidirectional-control characters become
 * spaces, runs of white space become one, and the text is cut at `maxTextChars`. Null when nothing readable is left.
 */
export function cleanPortText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = Array.from(value, (character) => (isUnsafeCodePoint(character.codePointAt(0) ?? 0) ? ' ' : character))
    .join('').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? Array.from(text).slice(0, SERIAL_PORT_LIMITS.maxTextChars).join('') : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key));
}

const isRequestId = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= SERIAL_PORT_LIMITS.maxRequestIdChars;
const isPortId = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= SERIAL_PORT_LIMITS.maxPortIdChars;
const isUsbNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xFFFF;

function parsePort(value: unknown): SerialPortOffered | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['portId', 'name', 'vendorId', 'productId', 'serialNumber'], ['portId', 'name'])) return null;
  const { portId, name, vendorId, productId, serialNumber } = value;
  if (!isPortId(portId) || typeof name !== 'string' || name.length < 1 || name.length > SERIAL_PORT_LIMITS.maxTextChars) return null;
  if (vendorId !== undefined && !isUsbNumber(vendorId)) return null;
  if (productId !== undefined && !isUsbNumber(productId)) return null;
  if (serialNumber !== undefined && (typeof serialNumber !== 'string' || serialNumber.length < 1 || serialNumber.length > SERIAL_PORT_LIMITS.maxTextChars)) return null;
  return {
    portId, name,
    ...(vendorId === undefined ? {} : { vendorId }),
    ...(productId === undefined ? {} : { productId }),
    ...(serialNumber === undefined ? {} : { serialNumber }),
  };
}

/** What the main process pushed, validated again by the window; null when it is not exactly an offer. */
export function parseSerialPortOffer(value: unknown): SerialPortOffer | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['requestId', 'ports'], ['requestId', 'ports'])) return null;
  const { requestId, ports } = value;
  if (!isRequestId(requestId) || !Array.isArray(ports) || ports.length > SERIAL_PORT_LIMITS.maxPorts) return null;
  const parsed = ports.map(parsePort);
  if (parsed.some((port) => port === null)) return null;
  const offered = parsed as SerialPortOffered[];
  if (new Set(offered.map((port) => port.portId)).size !== offered.length) return null;
  return { requestId, ports: offered };
}

/** The window's answer, as the main process accepts it. */
export function isSerialPortChoice(value: unknown): value is SerialPortChoice {
  return isPlainObject(value) && hasOnlyKeys(value, ['requestId', 'portId'], ['requestId', 'portId'])
    && isRequestId(value.requestId) && (value.portId === null || isPortId(value.portId));
}

export function isSerialPortListRequest(value: unknown): value is SerialPortListRequest {
  return isPlainObject(value) && hasOnlyKeys(value, ['requestId'], ['requestId']) && isRequestId(value.requestId);
}

/** The bridge of the preload: typed calls and the push of the offer. */
export interface SerialPortBridge {
  choose(choice: SerialPortChoice): Promise<unknown>;
  list(request: SerialPortListRequest): Promise<unknown>;
  onRequested(callback: (offer: unknown) => void): () => void;
}
