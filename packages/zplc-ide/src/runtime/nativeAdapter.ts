import type {
  DebugAdapterEvents,
  IDebugAdapter,
  LoadProgramOptions,
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
  type NativeProgramActivationResult,
  type NativeProgramResetResult,
  type NativeScenarioStepParams,
  type NativeSimulationInputResult,
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

function validProgramGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= 1 && value <= 0xffff_ffff;
}

function validSnapshotProgramGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= 0 && value <= 0xffff_ffff;
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isProgramActivationResult(value: unknown, programSize: number): value is NativeProgramActivationResult {
  return hasExactKeys(value, ['program_size', 'program_generation'])
    && value.program_size === programSize
    && validProgramGeneration(value.program_generation);
}

function isProgramResetResult(value: unknown): value is NativeProgramResetResult {
  return hasExactKeys(value, ['program_generation'])
    && validSnapshotProgramGeneration(value.program_generation);
}

function isSimulationInputResult(
  value: unknown,
  inputId: 'motor.start' | 'motor.stop' | 'motor.estop',
  active: boolean,
  programGeneration: number,
): value is NativeSimulationInputResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return Object.keys(result).length === 5
    && result.input_id === inputId
    && result.active === active
    && result.program_generation === programGeneration
    && typeof result.cycle_count_at_apply === 'number' && Number.isSafeInteger(result.cycle_count_at_apply)
    && result.cycle_count_at_apply >= 0 && result.cycle_count_at_apply <= 0xffff_ffff
    && result.state === 'staged';
}

function isNativeRuntimeSnapshot(value: unknown): value is NativeRuntimeSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<NativeRuntimeSnapshot>;
  const isNonNegativeInteger = (field: unknown): field is number =>
    typeof field === 'number' && Number.isSafeInteger(field) && field >= 0 && field <= 0xffff_ffff;
  const isState = (state: unknown): state is VMState =>
    state === 'running' || state === 'paused' || state === 'idle' || state === 'error';
  const validTask = (task: unknown): boolean => {
    if (typeof task !== 'object' || task === null) return false;
    const item = task as NativeRuntimeSnapshot['tasks'][number];
    return isNonNegativeInteger(item.task_id) && item.task_id <= 0xffff
      && isState(item.state)
      && isNonNegativeInteger(item.cycles)
      && isNonNegativeInteger(item.overruns)
      && isNonNegativeInteger(item.interval_us)
      && isNonNegativeInteger(item.priority) && item.priority <= 0xff
      && isNonNegativeInteger(item.pc) && item.pc <= 0xffff
      && isNonNegativeInteger(item.sp) && item.sp <= 0xffff
      && typeof item.halted === 'boolean'
      && isNonNegativeInteger(item.error) && item.error <= 0xff;
  };
  const validForceEntry = (entry: unknown): boolean => {
    if (typeof entry !== 'object' || entry === null) return false;
    const item = entry as NativeRuntimeSnapshot['force_entries'][number];
    return isNonNegativeInteger(item.address)
      && item.address <= 0xffff
      && isNonNegativeInteger(item.size)
      && item.size > 0
      && item.size <= 260
      && typeof item.bytes_hex === 'string'
      && /^[0-9a-f]*$/i.test(item.bytes_hex)
      && item.bytes_hex.length === item.size * 2
      && item.state === 'forced';
  };
  const cadence = candidate.host_cadence;
  const validCadence = cadence === undefined || (
    typeof cadence === 'object' && cadence !== null &&
    cadence.kind === 'observed_poll_cadence' &&
    isNonNegativeInteger(cadence.missed_intervals) &&
    isNonNegativeInteger(cadence.last_dispatch_lateness_ms)
  );
  const tasks = candidate.tasks;
  const validTaskSet = Array.isArray(tasks)
    && tasks.length >= 1
    && tasks.length <= 16
    && tasks.every(validTask)
    && candidate.stats?.active_tasks === tasks.length
    && new Set(tasks.map((task) => task.task_id)).size === tasks.length
    && tasks.every((task) => task.interval_us >= 1_000 && task.interval_us <= 3_600_000_000 && task.interval_us % 1_000 === 0)
    && tasks.every((task) => task.interval_us === tasks[0]!.interval_us)
    && tasks.every((task, index) => index === 0
      || tasks[index - 1]!.priority < task.priority
      || (tasks[index - 1]!.priority === task.priority && tasks[index - 1]!.task_id < task.task_id));
  return (
    isState(candidate.state) &&
    isNonNegativeInteger(candidate.uptime_ms) &&
    validSnapshotProgramGeneration(candidate.program_generation) &&
    isNonNegativeInteger(candidate.focused_vm?.pc) && candidate.focused_vm.pc <= 0xffff &&
    isNonNegativeInteger(candidate.focused_vm?.sp) && candidate.focused_vm.sp <= 0xffff &&
    typeof candidate.focused_vm?.halted === 'boolean' &&
    isNonNegativeInteger(candidate.focused_vm?.error) && candidate.focused_vm.error <= 0xff &&
    isNonNegativeInteger(candidate.stats?.cycles) &&
    isNonNegativeInteger(candidate.stats?.active_tasks) &&
    isNonNegativeInteger(candidate.stats?.overruns) &&
    isNonNegativeInteger(candidate.stats?.program_size) &&
    validTaskSet &&
    ((candidate.program_generation === 0 && candidate.stats.program_size === 0)
      || (validProgramGeneration(candidate.program_generation) && candidate.stats.program_size > 0)) &&
    Array.isArray(candidate.opi) && candidate.opi.length === 8 && candidate.opi.every((entry) => isNonNegativeInteger(entry) && entry <= 0xff) &&
    Array.isArray(candidate.ipi) && candidate.ipi.length === 8 && candidate.ipi.every((entry) => isNonNegativeInteger(entry) && entry <= 0xff) &&
    Array.isArray(candidate.force_entries) && candidate.force_entries.length <= 8 && candidate.force_entries.every(validForceEntry) &&
    candidate.force_entries.every((entry, index, entries) => {
      const end = entry.address + entry.size;
      const regionStart = entry.address < 0x1000 ? 0 : entry.address < 0x2000 ? 0x1000 : entry.address < 0x4000 ? 0x2000 : 0x4000;
      const regionEnd = regionStart === 0 ? 0x1000 : regionStart === 0x1000 ? 0x2000 : regionStart === 0x2000 ? 0x4000 : 0x5000;
      return end <= 0x5000 && end <= regionEnd && !entries.slice(0, index).some((other) => entry.address < other.address + other.size && other.address < end);
    }) &&
    validCadence
  );
}

export class NativeAdapter implements IDebugAdapter {
  readonly type = DEBUG_ADAPTER_TYPE.NATIVE;

  private readonly api: NativeSimulationApi;
  private events: DebugAdapterEvents = {};
  private _connected = false;
  private _state: VMState = 'disconnected';
  private capabilityProfile: NativeCapabilityProfile | null = null;
  private runtimeKind: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private requestCount = 0;
  private parityEvidence: NativeParityEvidenceRecord[] = [];
  private sessionGeneration = 0;
  private programGeneration: number | null = null;

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

  get supportsSimulationInput(): boolean {
    return this.supportsSimulationInputs();
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
    if (!this._connected) {
      throw new Error('Native simulator session is not connected');
    }
    const generation = this.sessionGeneration;
    const request = createNativeRequest(this.nextRequestId(), method, params);
    const result = await this.api.request<TResult>(request);
    if (!this._connected || generation !== this.sessionGeneration) {
      throw new Error('Native simulator session is no longer active');
    }
    return result;
  }

  private syncProgramGeneration(snapshot: NativeRuntimeSnapshot): void {
    this.programGeneration = snapshot.program_generation === 0 ? null : snapshot.program_generation;
  }

  private clearProgramGeneration(): void {
    this.programGeneration = null;
  }

  private supportsSimulationInputs(): boolean {
    if (this.runtimeKind !== 'native-posix' || this.capabilityProfile?.profile_id !== 'native-posix-mvp') {
      return false;
    }
    const matches = this.capabilityProfile.features.filter((feature) => feature.name === 'simulation-inputs');
    return matches.length === 1 && matches[0]?.status === 'supported';
  }

  private publishSnapshot(snapshot: NativeRuntimeSnapshot, generation: number): RuntimeSnapshot {
    if (!this._connected || generation !== this.sessionGeneration) {
      throw new Error('Native simulator session is no longer active');
    }
    if (!isNativeRuntimeSnapshot(snapshot)) {
      this.clearProgramGeneration();
      throw new Error('Invalid native runtime snapshot');
    }
    const normalizedSnapshot = normalizeNativeRuntimeSnapshot(snapshot);
    this.syncProgramGeneration(snapshot);
    this.setState(normalizedSnapshot.state);
    this.events.onInfoUpdate?.({
      pc: snapshot.focused_vm.pc,
      sp: snapshot.focused_vm.sp,
      halted: snapshot.focused_vm.halted,
      cycles: snapshot.stats.cycles,
      error: snapshot.focused_vm.error,
    });
    this.events.onRuntimeSnapshot?.(normalizedSnapshot);
    return normalizedSnapshot;
  }

  private bindEvents(generation: number): void {
    if (!this.api.onEvent) {
      return;
    }
    this.unsubscribe = this.api.onEvent((event) => {
      if (!this._connected || generation !== this.sessionGeneration) {
        return;
      }
      if (event.type !== NATIVE_MESSAGE_TYPE.EVENT) {
        return;
      }
      if (event.method === 'status.changed' && !isNativeRuntimeSnapshot(event.params)) {
        this.clearProgramGeneration();
        return;
      }
      if (event.method === 'status.changed' && isNativeRuntimeSnapshot(event.params)) {
        const snapshot = event.params;
        const previousState = this._state;
        const normalizedSnapshot = this.publishSnapshot(snapshot, generation);
        if (normalizedSnapshot.state === 'paused' && previousState !== 'paused') {
          this.events.onBreakpointHit?.(snapshot.focused_vm.pc);
        }
      }
      if (event.method === 'capability.updated') {
        this.capabilityProfile = isNativeCapabilityProfile(event.params) ? event.params : null;
        this.events.onCapabilitiesChange?.();
      }
      if (event.method === 'session.ready') {
        this.events.onSerialData?.('[native] session.ready received');
      }
      if (event.method === 'session.exited') {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this._connected = false;
        this.capabilityProfile = null;
        this.runtimeKind = null;
        this.programGeneration = null;
        this.sessionGeneration += 1;
        this.setState('disconnected');
        this.events.onError?.('Native simulator session exited');
      }
    });
  }

  async connect(): Promise<void> {
    const generation = this.sessionGeneration + 1;
    this.sessionGeneration = generation;
    const hello = await this.api.startSession();
    if (generation !== this.sessionGeneration) {
      try {
        await this.api.stopSession();
      } catch {
        // The session is already invalidated locally; never publish it.
      }
      throw new Error('Native simulator session is no longer active');
    }
    const capabilityProfile = typeof hello === 'object' && hello !== null
      ? (hello as Partial<NativeHelloResult>).capability_profile
      : undefined;
    if (!isNativeCapabilityProfile(capabilityProfile)) {
      this.sessionGeneration += 1;
      this.capabilityProfile = null;
      this.runtimeKind = null;
      this.clearProgramGeneration();
      this._connected = false;
      this.setState('disconnected');
      this.events.onError?.('Invalid native simulator capability profile');
      try {
        await this.api.stopSession();
      } catch {
        // The malformed hello was never authorized locally; keep it closed.
      }
      throw new Error('Invalid native simulator capability profile');
    }
    this.capabilityProfile = capabilityProfile;
    this.runtimeKind = hello.runtime_kind;
    this.programGeneration = null;
    this._connected = true;
    this.bindEvents(generation);
    this.setState('idle');
  }

  async disconnect(): Promise<void> {
    const wasConnected = this._connected;
    this.sessionGeneration += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this._connected = false;
    this.capabilityProfile = null;
    this.runtimeKind = null;
    this.programGeneration = null;
    this.setState('disconnected');
    if (!wasConnected) {
      return;
    }
    try {
      await this.api.stopSession();
    } catch {
      throw new Error('Failed to stop native simulator session');
    }
  }

  async loadProgram(bytecode: Uint8Array, options?: LoadProgramOptions): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    options?.trace?.({
      kind: 'stage',
      message: `Loading ${bytecode.length} bytes into native simulator`,
    });

    const result = await this.request<unknown>('program.load', {
      bytecode_hex: bytesToHex(bytecode),
    });
    if (!isProgramActivationResult(result, bytecode.length)) {
      this.clearProgramGeneration();
      throw new Error('Invalid native program activation result');
    }
    this.programGeneration = result.program_generation;
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
    const generation = this.sessionGeneration;
    const snapshot = await this.request<NativeRuntimeSnapshot>('execution.step');
    const normalizedSnapshot = this.publishSnapshot(snapshot, generation);
    this.events.onStepComplete?.(normalizedSnapshot.focusedVm?.pc ?? 0);
  }

  async scenarioStep(atMs: number): Promise<void> {
    if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs > 0xffff_ffff) {
      throw new Error('Scenario step atMs must be a uint32 integer');
    }
    const generation = this.sessionGeneration;
    const params: NativeScenarioStepParams = { at_ms: atMs };
    const snapshot = await this.request<NativeRuntimeSnapshot>('scenario.step', params);
    const normalizedSnapshot = this.publishSnapshot(snapshot, generation);
    this.events.onStepComplete?.(normalizedSnapshot.focusedVm?.pc ?? 0);
  }

  async reset(): Promise<void> {
    const result = await this.request<unknown>('execution.reset');
    if (!isProgramResetResult(result)) {
      this.clearProgramGeneration();
      throw new Error('Invalid native program reset result');
    }
    this.programGeneration = result.program_generation === 0 ? null : result.program_generation;
    this.setState('idle');
  }

  async setSimulationInput(inputId: 'motor.start' | 'motor.stop' | 'motor.estop', active: boolean): Promise<NativeSimulationInputResult> {
    if (inputId !== 'motor.start' && inputId !== 'motor.stop' && inputId !== 'motor.estop') {
      throw new Error('Unknown simulation input');
    }
    if (!this.supportsSimulationInputs()) {
      throw new Error('Native simulator does not support simulation inputs');
    }
    if (this._state !== 'running' && this._state !== 'paused') {
      throw new Error('Simulation input requires a running or paused native program');
    }
    if (this.programGeneration === null) {
      throw new Error('Simulation input requires a current native program generation');
    }
    const programGeneration = this.programGeneration;
    const result = await this.request('simulation.input.set', {
      input_id: inputId,
      active,
      program_generation: programGeneration,
    });
    if (!this.supportsSimulationInputs()
      || (this._state !== 'running' && this._state !== 'paused')
      || this.programGeneration !== programGeneration
      || !isSimulationInputResult(result, inputId, active, programGeneration)) {
      throw new Error('Invalid native simulation input acknowledgement');
    }
    return result;
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
    const generation = this.sessionGeneration;
    const snapshot = await this.request<NativeRuntimeSnapshot>('status.get');
    if (!this._connected || generation !== this.sessionGeneration) {
      throw new Error('Native simulator session is no longer active');
    }
    if (!isNativeRuntimeSnapshot(snapshot)) {
      this.clearProgramGeneration();
      throw new Error('Invalid native runtime snapshot');
    }
    this.syncProgramGeneration(snapshot);
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
    const generation = this.sessionGeneration;
    const snapshot = await this.request<NativeRuntimeSnapshot>('status.get');
    return this.publishSnapshot(snapshot, generation);
  }

  getParityEvidence(): NativeParityEvidenceRecord[] {
    return [...this.parityEvidence];
  }

  setParityEvidence(records: NativeParityEvidenceRecord[]): void {
    this.parityEvidence = [...records];
  }

  async readWatchVariables(variables: WatchVariable[]): Promise<WatchVariable[]> {
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
