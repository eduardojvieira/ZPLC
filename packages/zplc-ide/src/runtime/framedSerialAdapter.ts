/**
 * @file framedSerialAdapter.ts
 * @brief The serial adapter over the framed device link, with the text shell as the older protocol (COM-019 to
 *        COM-025, COM-028, COM-029).
 *
 * It is the SerialAdapter, and where the firmware answers the framed hello it carries the data plane over the
 * link: memory reads, writes that are whole with respect to the scan, forces that end with their session, run
 * control, breakpoints and a checked download; the device pushes its state changes and faults, so this side does
 * not poll for them. A firmware that does not answer the hello is the text shell it always was, and the adapter says
 * so (`firmware`) and what that costs.
 */

import { ZPLC_REPO_VERSION } from '../version';
import {
  MEMORY_MAP,
  WATCH_FORCE_STATE,
  type DebugAdapterEvents,
  type LoadProgramOptions,
  type VMState,
  type WatchForceEntry,
} from './debugAdapter';
import { assertMemoryAccess } from './memoryAccess';
import { SerialAdapter } from './serialAdapter';
import { addDataListener, removeDataListener } from '../uploader/webserial';
import { DeviceLink, LinkError, type LinkEvent } from './link/deviceLink';
import { EventRouter, type RouterStatus } from './link/eventRouter';
import { crc32 } from './link/frame';
import { describeFirmware, type FirmwareReport } from './link/firmwareProtocol';
import { ENUMS, EVENT_MASK } from './link/protocol.generated';
import { ShellLineTransport, type ShellConsole } from './link/shellTransport';

const SESSION_NAME = 'Studio';

function vmStateOf(state: number): VMState {
  if (state === ENUMS.RUN_STATE.RUNNING) return 'running';
  if (state === ENUMS.RUN_STATE.PAUSED) return 'paused';
  if (state === ENUMS.RUN_STATE.FAULT) return 'error';
  return 'idle';
}

const decoder = new TextDecoder('utf-8', { fatal: false });
const hex4 = (value: number) => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;

export class FramedSerialAdapter extends SerialAdapter {
  /** The device events, as they were pushed: one stream for everything that wants the state of the device. */
  readonly linkEvents = new EventRouter<LinkEvent>();

  private link: DeviceLink | null = null;
  private transport: ShellLineTransport | null = null;
  private stripFrames: ((chunk: string) => void) | null = null;
  private _firmware: FirmwareReport | null = null;
  private localBreakpoints = new Set<number>();
  private signer: ((artifact: Uint8Array) => Promise<Uint8Array>) | null = null;

  /** What the firmware speaks, once the adapter is connected. */
  get firmware(): FirmwareReport | null {
    return this._firmware;
  }

  /** True when the data plane is the framed link. */
  get framed(): boolean {
    return this.link !== null;
  }

  linkStatus(): RouterStatus {
    return this.linkEvents.status();
  }

  /** The signer for a device that accepts only signed programs (COM-026); see link/signing.ts. */
  setProgramSigner(signer: ((artifact: Uint8Array) => Promise<Uint8Array>) | null): void {
    this.signer = signer;
  }

  /** Give the device the public key programs have to be signed with, over the serial link. */
  async provisionSigningKey(publicKey: Uint8Array): Promise<void> {
    if (!this.link) throw new Error('This firmware does not speak the device link, which signed programs need.');
    await this.changing((link) => link.request('SIGNING_KEY_SET', { public_key: publicKey }));
    await this.ask((link) => link.hello());
  }

  async clearSigningKey(): Promise<void> {
    if (!this.link) throw new Error('This firmware does not speak the device link, which signed programs need.');
    await this.changing((link) => link.request('SIGNING_KEY_CLEAR', {}));
    await this.ask((link) => link.hello());
  }

  override setEventHandlers(events: DebugAdapterEvents): void {
    // the frames of the link are not console text: the terminal does not show hexadecimal
    const onSerialData = events.onSerialData;
    super.setEventHandlers(onSerialData === undefined
      ? events
      : { ...events, onSerialData: (line: string) => { if (!/ZF:(?:[0-9a-fA-F]{2})+/.test(line)) onSerialData(line); } });
  }

  /** How long one request to the device may wait for its answer. Tests on a loaded machine raise it. */
  linkRequestTimeoutMs = 1200;

  override async connect(): Promise<void> {
    await super.connect();
    await this.negotiate();
  }

  override async disconnect(): Promise<void> {
    const link = this.link;
    this.link = null;
    if (link) {
      try {
        if (link.session) await Promise.race([link.closeSession(), new Promise((resolve) => setTimeout(resolve, 500))]);
      } catch {
        // the session ends with the link anyway
      }
      await link.close().catch(() => undefined);
    }
    this.releaseTransport();
    this.linkEvents.stop();
    await super.disconnect();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Negotiation (COM-029)

  private releaseTransport(): void {
    const connection = this.connection;
    if (this.stripFrames && connection) removeDataListener(connection, this.stripFrames);
    this.stripFrames = null;
    this.transport?.close();
    this.transport = null;
  }

  private async negotiate(): Promise<void> {
    const connection = this.connection;
    if (!connection) return;
    const textConsole: ShellConsole = {
      writeText: async (text) => { await connection.writer.write(new TextEncoder().encode(text)); },
      onText: (handler) => { addDataListener(connection, handler); return () => removeDataListener(connection, handler); },
    };
    // a frame the device prints inside other text is taken out of the receive buffer the text commands read
    this.stripFrames = () => { connection._rxBuffer = ShellLineTransport.withoutFrames(connection._rxBuffer); };
    addDataListener(connection, this.stripFrames);
    const transport = new ShellLineTransport(textConsole);
    const link = new DeviceLink(transport, { requestTimeoutMs: this.linkRequestTimeoutMs });

    let hello = null;
    try {
      hello = await this.withCommandMutex(() => link.hello());
    } catch {
      hello = null;
    }
    let systemInfo = null;
    try {
      systemInfo = await this.getSystemInfo();
    } catch {
      systemInfo = null;
    }
    this._firmware = describeFirmware({ studioVersion: ZPLC_REPO_VERSION, hello, systemInfo });

    if (hello === null) {
      await link.close().catch(() => undefined);
      this.releaseTransport();
      this.linkEvents.usePollingLabel();
      return;
    }
    this.link = link;
    this.transport = transport;
    link.onEvent((event) => this.handleLinkEvent(event));
    try {
      await this.withCommandMutex(() => link.request('EVENTS_SET', {
        mask: EVENT_MASK.STATUS | EVENT_MASK.FAULT | EVENT_MASK.BREAKPOINT | EVENT_MASK.FORCE | EVENT_MASK.LOG,
      }));
      this.linkEvents.useEvents();
    } catch {
      this.linkEvents.usePollingLabel();
    }
    this.stopPolling(); // the device says when its state changes: this adapter does not ask
  }

  private handleLinkEvent(event: LinkEvent): void {
    this.linkEvents.push(event);
    switch (event.name) {
      case 'EVT_STATUS':
        this.setState(vmStateOf((event.values as { state: number }).state));
        break;
      case 'EVT_BREAKPOINT':
        this.events.onBreakpointHit?.((event.values as { pc: number }).pc);
        break;
      case 'EVT_FAULT':
        this.events.onError?.('The runtime latched a fault.');
        break;
      case 'EVT_LOG': {
        const text = decoder.decode((event.values as { text: Uint8Array }).text);
        this.events.onSerialData?.(text);
        break;
      }
      case 'EVT_DROPPED':
        this.linkEvents.noteLostByDevice((event.values as { count: number }).count);
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Requests

  private async ask<R>(run: (link: DeviceLink) => Promise<R>): Promise<R> {
    const link = this.link;
    if (!link) throw new Error('Not connected');
    return this.withCommandMutex(() => run(link));
  }

  /** A request that changes the device needs a session; Studio opens it when it first needs one, and again after it ended. */
  private async changing<R>(run: (link: DeviceLink) => Promise<R>): Promise<R> {
    return this.ask(async (link) => {
      if (link.session === null) {
        try {
          await link.openSession({ name: SESSION_NAME });
        } catch (error) {
          if (error instanceof LinkError && error.errorName === 'SESSION_BUSY') {
            throw new Error('The device is in use by another session. Close it, or wait until it times out, and try again.');
          }
          throw error;
        }
      }
      return run(link);
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  // Memory (COM-023, COM-024)

  override async peek(address: number, length: number): Promise<Uint8Array> {
    if (!this.link) return super.peek(address, length);
    if (!this._connected) throw new Error('Not connected');
    assertMemoryAccess(address, length, 'read', this.regionSizes());
    const chunk = Math.max(1, (this.link.info?.maxPayload ?? 512) - 1);
    const out = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += chunk) {
      const size = Math.min(chunk, length - offset);
      const answer = await this.ask((link) => link.request('MEM_READ', { address: address + offset, length: size }));
      out.set(answer.data, offset);
    }
    return out;
  }

  override async poke(address: number, value: number): Promise<void> {
    if (!this.link) return super.poke(address, value);
    await this.pokeN(address, new Uint8Array([value & 0xff]));
  }

  override async pokeN(address: number, bytes: Uint8Array): Promise<void> {
    if (!this.link) return super.pokeN(address, bytes);
    if (!this._connected) throw new Error('Not connected');
    assertMemoryAccess(address, bytes.length, 'write', this.regionSizes());
    const largest = (this.link.info?.maxPayload ?? 512) - 2;
    if (bytes.length > largest) {
      // Two writes are not one: a value that does not fit a frame is refused, not split.
      throw new Error(`A value of ${bytes.length} bytes at ${hex4(address)} does not fit one frame (${largest} bytes). `
        + 'Studio does not write it in parts: the scan could run between them.');
    }
    await this.changing((link) => link.request('MEM_WRITE', { address, data: bytes }));
  }

  override async forceValue(address: number, bytes: Uint8Array): Promise<void> {
    if (!this.link) return super.forceValue(address, bytes);
    if (!this._connected) throw new Error('Not connected');
    assertMemoryAccess(address, bytes.length, 'force', this.regionSizes());
    await this.changing((link) => link.request('FORCE_SET', { address, data: bytes }));
  }

  override async clearForcedValue(address: number): Promise<void> {
    if (!this.link) return super.clearForcedValue(address);
    if (!this._connected) throw new Error('Not connected');
    assertMemoryAccess(address, 1, 'force', this.regionSizes());
    await this.changing((link) => link.request('FORCE_CLEAR', { address }));
  }

  override async clearAllForcedValues(): Promise<void> {
    if (!this.link) return super.clearAllForcedValues();
    await this.changing((link) => link.request('FORCE_CLEAR_ALL', {}));
  }

  override async listForcedValues(): Promise<WatchForceEntry[]> {
    if (!this.link) return super.listForcedValues();
    const answer = await this.ask((link) => link.request('FORCE_LIST', {}));
    const entries: WatchForceEntry[] = [];
    const view = new DataView(answer.entries.buffer, answer.entries.byteOffset, answer.entries.byteLength);
    let offset = 0;
    while (offset + 4 <= answer.entries.length) {
      const address = view.getUint16(offset, true);
      const size = view.getUint16(offset + 2, true);
      if (offset + 4 + size > answer.entries.length) break;
      const data = answer.entries.subarray(offset + 4, offset + 4 + size);
      entries.push({
        path: hex4(address),
        address,
        size,
        type: size === 1 ? 'BYTE' : size === 2 ? 'WORD' : 'DWORD',
        bytesHex: Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase(),
        state: WATCH_FORCE_STATE.FORCED,
      });
      offset += 4 + size;
    }
    return entries;
  }

  override async getOPI(offset: number): Promise<number> {
    if (!this.link) return super.getOPI(offset);
    const bytes = await this.peek(MEMORY_MAP.opi.baseAddress + offset, 1);
    return bytes[0] ?? 0;
  }

  override async setIPI(offset: number, value: number): Promise<void> {
    if (!this.link) return super.setIPI(offset, value);
    await this.poke(offset, value);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Run control

  private async control(name: 'RUN' | 'STOP' | 'PAUSE' | 'RESUME' | 'STEP' | 'RESET'): Promise<void> {
    const answer = await this.changing((link) => link.request(name, {}));
    this.setState(vmStateOf(answer.state));
  }

  override async start(): Promise<void> {
    if (!this.link) return super.start();
    await this.control('RUN');
  }

  override async stop(): Promise<void> {
    if (!this.link) return super.stop();
    await this.control('STOP');
  }

  override async pause(): Promise<void> {
    if (!this.link) return super.pause();
    await this.control('PAUSE');
  }

  override async resume(): Promise<void> {
    if (!this.link) return super.resume();
    await this.control('RESUME');
  }

  override async step(): Promise<void> {
    if (!this.link) return super.step();
    await this.control('STEP');
  }

  override async reset(): Promise<void> {
    if (!this.link) return super.reset();
    await this.control('RESET');
  }

  // -------------------------------------------------------------------------------------------------------------
  // Breakpoints

  override async setBreakpoint(pc: number): Promise<boolean> {
    if (!this.link) return super.setBreakpoint(pc);
    if (this.localBreakpoints.has(pc)) return false;
    try {
      await this.changing((link) => link.request('BP_ADD', { pc }));
    } catch {
      return false;
    }
    this.localBreakpoints.add(pc);
    return true;
  }

  override async removeBreakpoint(pc: number): Promise<boolean> {
    if (!this.link) return super.removeBreakpoint(pc);
    if (!this.localBreakpoints.has(pc)) return false;
    try {
      await this.changing((link) => link.request('BP_REMOVE', { pc }));
    } catch {
      return false;
    }
    return this.localBreakpoints.delete(pc);
  }

  override async clearBreakpoints(): Promise<void> {
    if (!this.link) return super.clearBreakpoints();
    await this.changing((link) => link.request('BP_CLEAR', {}));
    this.localBreakpoints.clear();
  }

  override async getBreakpoints(): Promise<number[]> {
    if (!this.link) return super.getBreakpoints();
    const answer = await this.ask((link) => link.request('BP_LIST', {}));
    const view = new DataView(answer.pcs.buffer, answer.pcs.byteOffset, answer.pcs.byteLength);
    const pcs: number[] = [];
    for (let offset = 0; offset + 2 <= answer.pcs.length; offset += 2) pcs.push(view.getUint16(offset, true));
    this.localBreakpoints = new Set(pcs);
    return pcs;
  }

  override async hasBreakpoint(pc: number): Promise<boolean> {
    if (!this.link) return super.hasBreakpoint(pc);
    return this.localBreakpoints.has(pc);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Download (COM-028): checksum announced, chunks in order, a read-back that has to be the checksum

  override async loadProgram(bytecode: Uint8Array, options?: LoadProgramOptions): Promise<void> {
    if (!this.link) return super.loadProgram(bytecode, options);
    if (!this._connected) throw new Error('Not connected');
    const trace = options?.trace;
    const checksum = crc32(bytecode);
    trace?.({ kind: 'stage', message: `Transferring ${bytecode.length} bytes over the device link (CRC-32 ${checksum.toString(16).padStart(8, '0')})` });
    try {
      const begun = await this.changing((link) => link.request('PROGRAM_BEGIN', { size: bytecode.length, crc32: checksum }));
      const chunk = Math.max(1, begun.chunk_max);
      const chunks = Math.ceil(bytecode.length / chunk);
      for (let index = 0; index < chunks; index++) {
        const offset = index * chunk;
        await this.ask((link) => link.request('PROGRAM_CHUNK', { offset, data: bytecode.subarray(offset, offset + chunk) }));
        trace?.({ kind: 'stage', message: `Sent ${Math.min(offset + chunk, bytecode.length)} of ${bytecode.length} bytes (${index + 1}/${chunks})` });
      }
      if (this.link.info?.signatureRequired) {
        const signer = this.signer;
        if (signer === null) {
          throw new Error('This device accepts only signed programs and Studio has no signing key for it.');
        }
        const signature = await signer(bytecode);
        trace?.({ kind: 'stage', message: 'Sending the signature of the program' });
        await this.ask((link) => link.request('PROGRAM_SIGN', { signature }));
      }
      const done = await this.ask((link) => link.request('PROGRAM_COMMIT', {}));
      trace?.({ kind: 'response', message: `The device holds ${done.size} bytes, CRC-32 ${done.crc32.toString(16).padStart(8, '0')}` });
      if (done.size !== bytecode.length || done.crc32 !== checksum) {
        throw new Error('The device read back a program that is not the one that was sent.');
      }
    } catch (error) {
      await this.ask((link) => link.request('PROGRAM_ABORT', {})).catch(() => undefined);
      throw error;
    }
    this.setState('idle');
  }
}
