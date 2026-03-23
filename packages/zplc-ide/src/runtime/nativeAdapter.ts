import type {
  DebugAdapterEvents,
  IDebugAdapter,
  LoadProgramOptions,
  ReadWatchOptions,
  RuntimeSnapshot,
  VMInfo,
  VMState,
  WatchForceEntry,
  WatchVariable,
} from './debugAdapter';
import {
  DEBUG_ADAPTER_TYPE,
  bytesToHex,
  bytesToValue,
  getTypeSize,
  WATCH_FORCE_STATE,
} from './debugAdapter';
import {
  createNativeRequest,
  hexToBytes,
  NATIVE_MESSAGE_TYPE,
  type NativeCapabilityProfile,
  type NativeParityEvidenceRecord,
  type NativeErrorPayload,
  type NativeEventMessage,
  type NativeHelloResult,
  type NativeRuntimeSnapshot,
} from './nativeProtocol';
import {
  isNativeCapabilityProfile,
  normalizeNativeRuntimeSnapshot,
} from './runtimeSnapshot';

interface NativeMemoryReadResult {
  bytes_hex: string;
}

interface NativeBreakpointsResult {
  breakpoints: number[];
}

interface NativeForceListResult {
  force_entries: Array<{
    address: number;
    size: number;
    bytes_hex: string;
    state: string;
  }>;
}

interface NativeSimulationApi {
  startSession: () => Promise<NativeHelloResult>;
  stopSession: () => Promise<void>;
  request: <TResult = unknown>(request: ReturnType<typeof createNativeRequest>) => Promise<TResult>;
  onEvent?: (callback: (event: NativeEventMessage) => void) => () => void;
}

function getNativeSimulationApi(): NativeSimulationApi {
  const api = window.electronAPI?.nativeSimulation;
  if (!api) {
    throw new Error('Native simulation is only available in the Electron desktop application');
  }
  return api;
}

function toVmState(state: string): VMState {
  if (state === 'running' || state === 'paused' || state === 'idle' || state === 'error') {
    return state;
  }
  return 'disconnected';
}

function isNativeRuntimeSnapshot(value: unknown): value is NativeRuntimeSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<NativeRuntimeSnapshot>;
  return (
    typeof candidate.state === 'string' &&
    typeof candidate.focused_vm?.pc === 'number' &&
    typeof candidate.focused_vm?.sp === 'number' &&
    typeof candidate.focused_vm?.halted === 'boolean' &&
    typeof candidate.focused_vm?.error === 'number' &&
    typeof candidate.stats?.cycles === 'number'
  );
}

export class NativeAdapter implements IDebugAdapter {
  readonly type = DEBUG_ADAPTER_TYPE.NATIVE;

  private readonly api: NativeSimulationApi;
  private events: DebugAdapterEvents = {};
  private _connected = false;
  private _state: VMState = 'disconnected';
  private capabilityProfile: NativeCapabilityProfile | null = null;
  private unsubscribe: (() => void) | null = null;
  private requestCount = 0;
  private parityEvidence: NativeParityEvidenceRecord[] = [];

  constructor(api?: NativeSimulationApi) {
    this.api = api ?? getNativeSimulationApi();
  }

  get connected(): boolean {
    return this._connected;
  }

  get state(): VMState {
    return this._state;
  }

  get capabilities(): NativeCapabilityProfile | null {
    return this.capabilityProfile;
  }

  private setState(state: VMState): void {
    if (this._state !== state) {
      this._state = state;
      this.events.onStateChange?.(state);
    }
  }

  private nextRequestId(): string {
    this.requestCount += 1;
    return `native-${this.requestCount}`;
  }

  private async request<TResult = unknown>(method: string, params: Record<string, unknown> = {}): Promise<TResult> {
    const request = createNativeRequest(this.nextRequestId(), method, params);
    return this.api.request<TResult>(request);
  }

  private bindEvents(): void {
    if (!this.api.onEvent) {
      return;
    }
    this.unsubscribe = this.api.onEvent((event) => {
      if (event.type !== NATIVE_MESSAGE_TYPE.EVENT) {
        return;
      }
      if (event.method === 'status.changed' && isNativeRuntimeSnapshot(event.params)) {
        const snapshot = event.params;
        const normalizedSnapshot = normalizeNativeRuntimeSnapshot(snapshot);
        const previousState = this._state;
        this.setState(toVmState(snapshot.state));
        this.events.onInfoUpdate?.({
          pc: snapshot.focused_vm.pc,
          sp: snapshot.focused_vm.sp,
          halted: snapshot.focused_vm.halted,
          cycles: snapshot.stats.cycles,
          error: snapshot.focused_vm.error,
        });
        if (normalizedSnapshot.state === 'paused' && previousState !== 'paused') {
          this.events.onBreakpointHit?.(snapshot.focused_vm.pc);
        }
        this.events.onRuntimeSnapshot?.(normalizedSnapshot);
      }
      if (event.method === 'capability.updated' && isNativeCapabilityProfile(event.params)) {
        const capabilityProfile = event.params;
        this.capabilityProfile = capabilityProfile;
        this.events.onCapabilitiesChange?.();
      }
      if (event.method === 'session.ready') {
        this.events.onSerialData?.('[native] session.ready received');
      }
      if (event.method === 'session.exited') {
        this._connected = false;
        this.setState('disconnected');
        this.events.onError?.('Native simulator session exited');
      }
    });
  }

  async connect(): Promise<void> {
    const hello = await this.api.startSession();
    this.capabilityProfile = hello.capability_profile;
    this._connected = true;
    this.bindEvents();
    this.setState('idle');
  }

  async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.api.stopSession();
    this._connected = false;
    this.capabilityProfile = null;
    this.setState('disconnected');
  }

  async loadProgram(bytecode: Uint8Array, options?: LoadProgramOptions): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    options?.trace?.({
      kind: 'stage',
      message: `Loading ${bytecode.length} bytes into native simulator`,
    });

    await this.request('program.load', {
      bytecode_hex: bytesToHex(bytecode),
    });
    this.setState('idle');
  }

  async start(): Promise<void> {
    await this.request('execution.start');
    this.setState('running');
  }

  async stop(): Promise<void> {
    await this.request('execution.stop');
    this.setState('idle');
  }

  async pause(): Promise<void> {
    await this.request('execution.pause');
    this.setState('paused');
  }

  async resume(): Promise<void> {
    await this.request('execution.resume');
    this.setState('running');
  }

  async step(): Promise<void> {
    const snapshot = await this.request<NativeRuntimeSnapshot>('execution.step');
    this.setState('paused');
    this.events.onStepComplete?.(snapshot.focused_vm.pc);
  }

  async reset(): Promise<void> {
    await this.request('execution.reset');
    this.setState('idle');
  }

  async peek(address: number, length: number): Promise<Uint8Array> {
    const result = await this.request<NativeMemoryReadResult>('memory.read', {
      address,
      length,
    });
    return hexToBytes(result.bytes_hex);
  }

  async poke(address: number, value: number): Promise<void> {
    await this.pokeN(address, new Uint8Array([value & 0xff]));
  }

  async pokeN(address: number, bytes: Uint8Array): Promise<void> {
    await this.request('memory.write', {
      address,
      bytes_hex: bytesToHex(bytes),
    });
  }

  async setValue(address: number, bytes: Uint8Array): Promise<void> {
    await this.pokeN(address, bytes);
  }

  async forceValue(address: number, bytes: Uint8Array): Promise<void> {
    await this.request('force.set', {
      address,
      bytes_hex: bytesToHex(bytes),
    });
  }

  async clearForcedValue(address: number): Promise<void> {
    await this.request('force.clear', { address });
  }

  async clearAllForcedValues(): Promise<void> {
    await this.request('force.clear_all');
  }

  async listForcedValues(): Promise<WatchForceEntry[]> {
    const result = await this.request<NativeForceListResult>('force.list');
    return result.force_entries.map((entry) => ({
      path: `0x${entry.address.toString(16).toUpperCase().padStart(4, '0')}`,
      address: entry.address,
      size: entry.size,
      type: entry.size === 1 ? 'BYTE' : entry.size === 2 ? 'WORD' : 'DWORD',
      bytesHex: entry.bytes_hex,
      state: entry.state === 'forced' ? WATCH_FORCE_STATE.FORCED : WATCH_FORCE_STATE.IDLE,
    }));
  }

  async getOPI(offset: number): Promise<number> {
    const bytes = await this.peek(0x1000 + offset, 1);
    return bytes[0] ?? 0;
  }

  async setIPI(offset: number, value: number): Promise<void> {
    await this.poke(offset, value);
  }

  async getInfo(): Promise<VMInfo> {
    const snapshot = await this.request<NativeRuntimeSnapshot>('status.get');
    this.setState(toVmState(snapshot.state));
    return {
      pc: snapshot.focused_vm.pc,
      sp: snapshot.focused_vm.sp,
      halted: snapshot.focused_vm.halted,
      cycles: snapshot.stats.cycles,
      error: snapshot.focused_vm.error,
    };
  }

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const snapshot = await this.request<NativeRuntimeSnapshot>('status.get');
    const normalizedSnapshot = normalizeNativeRuntimeSnapshot(snapshot);
    this.setState(normalizedSnapshot.state);
    return normalizedSnapshot;
  }

  getParityEvidence(): NativeParityEvidenceRecord[] {
    return [...this.parityEvidence];
  }

  setParityEvidence(records: NativeParityEvidenceRecord[]): void {
    this.parityEvidence = [...records];
  }

  async readWatchVariables(
    variables: WatchVariable[],
    _options?: ReadWatchOptions,
  ): Promise<WatchVariable[]> {
    const results: WatchVariable[] = [];
    for (const variable of variables) {
      const size = getTypeSize(variable.type, variable.maxLength);
      const bytes = await this.peek(variable.address, size);
      results.push({
        ...variable,
        value: bytesToValue(bytes, variable.type, variable.bitOffset),
      });
    }
    return results;
  }

  async setVirtualInput(channel: number, value: number): Promise<void> {
    await this.setIPI(channel, value);
  }

  async getVirtualOutput(channel: number): Promise<number> {
    return this.getOPI(channel);
  }

  async setBreakpoint(pc: number): Promise<boolean> {
    const result = await this.request<NativeBreakpointsResult>('breakpoint.add', { pc });
    return result.breakpoints.includes(pc);
  }

  async removeBreakpoint(pc: number): Promise<boolean> {
    const result = await this.request<NativeBreakpointsResult>('breakpoint.remove', { pc });
    return !result.breakpoints.includes(pc);
  }

  async clearBreakpoints(): Promise<void> {
    await this.request('breakpoint.clear');
  }

  async getBreakpoints(): Promise<number[]> {
    const result = await this.request<NativeBreakpointsResult>('breakpoint.list');
    return result.breakpoints;
  }

  async hasBreakpoint(pc: number): Promise<boolean> {
    const breakpoints = await this.getBreakpoints();
    return breakpoints.includes(pc);
  }

  setEventHandlers(events: DebugAdapterEvents): void {
    this.events = events;
  }

  clearEventHandlers(): void {
    this.events = {};
  }
}

export function getNativeAdapterErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as NativeErrorPayload & { message?: string }).message);
  }
  return error instanceof Error ? error.message : String(error);
}
