/**
 * @file deviceLink.ts
 * @brief The Studio side of the device link protocol (COM-019): one owner of the link, with sessions, requests,
 *        authenticated frames and the events a device pushes.
 *
 * A DeviceLink sits on a byte transport (a serial port, a pipe to the native runtime, a TCP socket, the lines of
 * the device shell) and speaks the frames of protocol.generated.ts. It keeps one request in flight (the device
 * answers in order), opens the session that every state-changing request needs (COM-020), signs and checks the
 * frames of an authenticated session (COM-021), turns the events the device pushes into callbacks (COM-025) and
 * counts every frame it drops.
 */

import { FrameDecoder, beginFrame, finishFrame, type DecoderCounters, type Frame } from './frame';
import {
  PayloadError,
  decodeEvent,
  decodeResponse,
  encodeRequest,
  eventNameOf,
  type EventOf,
  type RangeDetail,
  type RequestOf,
  type ResponseOf,
} from './messages';
import {
  CAPABILITY,
  ENUMS,
  ERROR,
  KIND,
  LIMITS,
  MESSAGES,
  PROTOCOL_VERSION,
  type EventName,
  type MessageName,
} from './protocol.generated';

/** A byte transport. A transport that frames its own lines hands over one whole frame per `onData` call. */
export interface LinkTransport {
  write(bytes: Uint8Array): void | Promise<void>;
  /** Subscribe to what arrives; returns the unsubscribe function. */
  onData(handler: (bytes: Uint8Array) => void): () => void;
  /** Subscribe to the end of the link; returns the unsubscribe function. */
  onClose?(handler: (reason: string) => void): () => void;
  close(): void | Promise<void>;
}

export class LinkError extends Error {
  readonly status: number;
  readonly errorName: string;
  /** For ERROR.RANGE: the address, the length and the region of the access the device refused (COM-024). */
  readonly range: RangeDetail | null;
  constructor(message: string, status: number, errorName: string, range: RangeDetail | null = null) {
    super(message);
    this.name = 'LinkError';
    this.status = status;
    this.errorName = errorName;
    this.range = range;
  }
}

export class LinkTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkTimeoutError';
  }
}

export interface DeviceLinkOptions {
  /** Milliseconds to wait for the answer to a request (default 2000). */
  requestTimeoutMs?: number;
  /** The largest payload this side accepts (default the device default, 512). */
  maxPayload?: number;
  /** Cryptographic random bytes (default `crypto.getRandomValues`). */
  random?: (length: number) => Uint8Array;
}

export interface HelloInfo {
  version: number;
  transport: 'SERIAL' | 'NETWORK';
  maxPayload: number;
  capabilities: number;
  sessionState: 'NONE' | 'THIS_LINK' | 'OTHER_LINK';
  keyProvisioned: boolean;
  idleTimeoutS: number;
}

export interface SessionInfo {
  sessionId: number;
  idleTimeoutS: number;
  authenticated: boolean;
}

export interface LinkEvent<N extends EventName = EventName> {
  name: N;
  values: EventOf<N>;
}

export interface LinkCounters extends DecoderCounters {
  framesOut: number;
  /** Frames of an authenticated session with a wrong or missing code (dropped). */
  authDrops: number;
  /** Frames whose sequence number was not the next one (dropped). */
  sequenceDrops: number;
  /** Events the device said it lost (EVT_DROPPED), summed. */
  eventsLost: number;
  /** Events this side dropped because the queue to the callbacks was full. */
  eventsDropped: number;
}

const LABEL = new TextEncoder().encode('ZPLC-LINK-SK1');

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('HMAC-SHA-256 needs the Web Crypto API');
  const imported = await subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', imported, data as BufferSource));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

const SESSION_STATE_NAMES = ['NONE', 'THIS_LINK', 'OTHER_LINK'] as const;

interface Pending {
  message: number;
  sequence: number;
  resolve: (frame: Frame) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const EVENT_QUEUE_LIMIT = 256;

export class DeviceLink {
  readonly counters: LinkCounters = {
    frames: 0, crcErrors: 0, versionErrors: 0, malformed: 0, oversize: 0, resyncs: 0,
    framesOut: 0, authDrops: 0, sequenceDrops: 0, eventsLost: 0, eventsDropped: 0,
  };

  private readonly transport: LinkTransport;
  private readonly options: Required<Omit<DeviceLinkOptions, 'random'>> & Pick<DeviceLinkOptions, 'random'>;
  private decoder: FrameDecoder;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly eventHandlers = new Set<(event: LinkEvent) => void>();
  private readonly closeHandlers = new Set<(reason: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private inbound: Promise<void> = Promise.resolve();
  private pending: Pending | null = null;
  private sequence = 1;
  private sessionKey: Uint8Array | null = null;
  private pendingSessionKey: Uint8Array | null = null;
  private lastEventSequence = 0;
  private _session: SessionInfo | null = null;
  private _hello: HelloInfo | null = null;
  private closed = false;
  private eventBacklog = 0;

  constructor(transport: LinkTransport, options: DeviceLinkOptions = {}) {
    this.transport = transport;
    this.options = {
      requestTimeoutMs: options.requestTimeoutMs ?? 2000,
      maxPayload: options.maxPayload ?? LIMITS.payloadMaxDefault,
      random: options.random,
    };
    this.decoder = new FrameDecoder(this.options.maxPayload);
    this.unsubscribers.push(transport.onData((bytes) => this.receive(bytes)));
    if (transport.onClose) {
      this.unsubscribers.push(transport.onClose((reason) => this.handleClose(reason)));
    }
  }

  get session(): SessionInfo | null {
    return this._session;
  }

  get info(): HelloInfo | null {
    return this._hello;
  }

  onEvent(handler: (event: LinkEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onClose(handler: (reason: string) => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  /** A copy of the counters with those of the frame decoder. */
  snapshot(): LinkCounters {
    return { ...this.counters, ...this.decoder.counters };
  }

  // -------------------------------------------------------------------------------------------------------------

  async hello(): Promise<HelloInfo> {
    const response = await this.request('HELLO', { client_version: PROTOCOL_VERSION, client_max_payload: this.options.maxPayload });
    const info: HelloInfo = {
      version: response.version,
      transport: response.transport === ENUMS.TRANSPORT.NETWORK ? 'NETWORK' : 'SERIAL',
      maxPayload: response.max_payload,
      capabilities: response.capabilities >>> 0,
      sessionState: SESSION_STATE_NAMES[response.session_state] ?? 'NONE',
      keyProvisioned: response.key_provisioned === 1,
      idleTimeoutS: response.idle_timeout_s,
    };
    this._hello = info;
    this.decoder = new FrameDecoder(Math.min(info.maxPayload, this.options.maxPayload));
    return info;
  }

  has(capability: keyof typeof CAPABILITY): boolean {
    return this._hello !== null && (this._hello.capabilities & CAPABILITY[capability]) !== 0;
  }

  /**
   * Open the session. With a `key`, the open is authenticated: a challenge, a code under the device key and a
   * session key that signs every later frame in both directions.
   */
  async openSession(options: { name?: string; takeover?: boolean; key?: Uint8Array } = {}): Promise<SessionInfo> {
    const random = this.options.random ?? ((length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)));
    const clientNonce = random(LIMITS.nonceBytes);
    let deviceNonce: Uint8Array = new Uint8Array(LIMITS.nonceBytes);
    let signWith: Uint8Array | undefined;
    if (options.key !== undefined) {
      if (options.key.length !== LIMITS.keyBytes) throw new RangeError(`the key is ${LIMITS.keyBytes} bytes`);
      deviceNonce = (await this.request('CHALLENGE', {})).nonce;
      this.pendingSessionKey = await hmacSha256(options.key, concat(LABEL, deviceNonce, clientNonce));
      signWith = options.key;
    }
    try {
      const response = await this.request('SESSION_OPEN', {
        flags: options.takeover === true ? 1 : 0,
        client_nonce: clientNonce,
        device_nonce: deviceNonce,
        name: (options.name ?? 'studio').slice(0, LIMITS.sessionNameBytes),
      }, { signWith });
      this.sessionKey = this.pendingSessionKey;
      this.lastEventSequence = 0;
      this._session = { sessionId: response.session_id, idleTimeoutS: response.idle_timeout_s, authenticated: response.authenticated === 1 };
      return this._session;
    } finally {
      this.pendingSessionKey = null;
    }
  }

  async closeSession(): Promise<number> {
    const response = await this.request('SESSION_CLOSE', {});
    this.forgetSession();
    return response.forces_released;
  }

  private forgetSession(): void {
    this._session = null;
    if (this.sessionKey) this.sessionKey.fill(0);
    this.sessionKey = null;
    this.sequence = 1;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    if (this.pending) this.failPending(new Error('The link was closed'));
    await this.transport.close();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Requests

  /** Send one request and return the fields of its response; a status that is not OK is a LinkError. */
  request<N extends MessageName>(name: N, values: RequestOf<N>, options: { signWith?: Uint8Array } = {}): Promise<ResponseOf<N>> {
    const run = async (): Promise<ResponseOf<N>> => {
      if (this.closed) throw new Error('The link is closed');
      const spec = MESSAGES[name];
      const payload = encodeRequest(name, values);
      const sequence = this.sequence;
      this.sequence = (this.sequence + 1) >>> 0;
      const key = options.signWith ?? this.sessionKey ?? undefined;
      const covered = beginFrame(KIND.REQUEST, spec.id, sequence, payload, key !== undefined);
      const mac = key !== undefined ? await hmacSha256(key, covered) : undefined;
      const wire = finishFrame(covered, mac);
      const answer = await this.exchange(spec.id, sequence, wire);
      const decoded = decodeResponse(name, answer.payload);
      if (!decoded.ok) {
        if (decoded.status === ERROR.NO_SESSION || decoded.status === ERROR.AUTH_REQUIRED) {
          if (this._session !== null && name !== 'SESSION_OPEN') this.forgetSession();
        }
        throw new LinkError(`${name} was refused: ${decoded.error}${decoded.range ? ` (${describeRange(decoded.range)})` : ''}`,
          decoded.status, decoded.error, decoded.range);
      }
      return decoded.values;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private exchange(message: number, sequence: number, wire: Uint8Array): Promise<Frame> {
    return new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.sequence === sequence) {
          this.pending = null;
          reject(new LinkTimeoutError(`No answer to message ${message} within ${this.options.requestTimeoutMs} ms`));
        }
      }, this.options.requestTimeoutMs);
      this.pending = { message, sequence, resolve, reject, timer };
      this.counters.framesOut++;
      Promise.resolve(this.transport.write(wire)).catch((error: unknown) => {
        if (this.pending?.sequence === sequence) this.failPending(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private failPending(error: Error): void {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = null;
    pending.reject(error);
  }

  // -------------------------------------------------------------------------------------------------------------
  // What arrives

  private receive(bytes: Uint8Array): void {
    for (const frame of this.decoder.push(bytes)) {
      // one at a time, in order: checking a code is asynchronous and the events have an order
      this.inbound = this.inbound.then(() => this.accept(frame));
    }
  }

  private async accept(frame: Frame): Promise<void> {
    const key = this.sessionKey ?? this.pendingSessionKey;
    if (this.sessionKey !== null && !frame.authenticated) {
      // inside an authenticated session every frame of the device carries a code
      this.counters.authDrops++;
      return;
    }
    if (frame.authenticated) {
      if (key === null || frame.mac === null || !equalBytes(await hmacSha256(key, frame.covered), frame.mac)) {
        this.counters.authDrops++;
        return;
      }
    }
    if (frame.kind === KIND.RESPONSE) {
      const pending = this.pending;
      if (pending && pending.sequence === frame.sequence && pending.message === frame.message) {
        clearTimeout(pending.timer);
        this.pending = null;
        pending.resolve(frame);
      } else {
        this.counters.sequenceDrops++;
      }
      return;
    }
    if (frame.kind === KIND.EVENT) {
      if (frame.authenticated && frame.sequence <= this.lastEventSequence) {
        this.counters.sequenceDrops++;
        return;
      }
      if (frame.authenticated) this.lastEventSequence = frame.sequence;
      this.dispatchEvent(frame);
    }
  }

  private dispatchEvent(frame: Frame): void {
    const name = eventNameOf(frame.message);
    if (name === null) return;
    let values: EventOf<EventName>;
    try {
      values = decodeEvent(name, frame.payload);
    } catch (error) {
      if (error instanceof PayloadError) return;
      throw error;
    }
    if (name === 'EVT_DROPPED') this.counters.eventsLost += (values as EventOf<'EVT_DROPPED'>).count;
    if (name === 'EVT_SESSION_END') this.forgetSession();
    if (this.eventBacklog >= EVENT_QUEUE_LIMIT) {
      this.counters.eventsDropped++;
      return;
    }
    this.eventBacklog++;
    queueMicrotask(() => {
      this.eventBacklog--;
      for (const handler of this.eventHandlers) handler({ name, values } as LinkEvent);
    });
  }

  private handleClose(reason: string): void {
    this.closed = true;
    this.failPending(new Error(`The link ended: ${reason}`));
    this.forgetSession();
    for (const handler of this.closeHandlers) handler(reason);
  }
}

export function describeRange(range: RangeDetail): string {
  const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
  const region = range.regionStart === 0xffff ? 'outside PLC memory' : `region ${hex(range.regionStart)} to ${hex(range.regionEnd - 1)}`;
  return `address ${hex(range.address)}, ${range.length} byte${range.length === 1 ? '' : 's'}, ${region}`;
}

