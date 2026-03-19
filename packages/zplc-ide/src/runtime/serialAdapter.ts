/**
 * @file serialAdapter.ts
 * @brief WebSerial Debug Adapter for ZPLC Runtime
 *
 * This adapter communicates with a ZPLC-enabled Zephyr device via
 * WebSerial. It implements the IDebugAdapter interface and uses
 * the shell commands defined in shell_cmds.c for debugging.
 *
 * v1.3: Added JSON mode support for machine-readable responses,
 *       passthrough mode for terminal, and system info.
 */

import type {
  IDebugAdapter,
  VMState,
  VMInfo,
  WatchVariable,
  WatchForceEntry,
  DebugAdapterEvents,
  LoadProgramOptions,
  ReadWatchOptions,
} from './debugAdapter';
import {
  bytesToHex,
  bytesToValue,
  getTypeSize,
  WATCH_FORCE_STATE,
} from './debugAdapter';

import type { SerialConnection } from '../uploader/webserial';
import {
  isWebSerialSupported,
  requestPort,
  connect as serialConnect,
  disconnect as serialDisconnect,
  addDataListener,
  removeDataListener,
  uploadBytecode,
} from '../uploader/webserial';
import type { ZPLCProjectConfig } from '../types';
import { sanitizeUploadTraceCommand, type UploadTraceCallback } from './uploadTrace';
import { consumeSerialConsoleChunk, flushSerialConsoleRemainder } from './serialConsole';
import { buildProvisioningCommands } from './provisioningCommands';
import { parsePeekBytes, groupVariablesForBatchPeek, extractVariableBytes, parseMpeekResponse, buildMpeekArgument } from './peekParser';
import type { MpeekRequest } from './peekParser';
import { debugLog } from '../utils/debugLog';
import { deriveHardwareDebugState } from './debugStatus';

/** Command timeout in milliseconds.
 * 10 s to accommodate firmware flash writes (NVS page erase can take ~1 s
 * on ESP32-S3; the firmware fix removes per-setter flushes, but we keep this
 * generous so older firmware images do not regress). */
const COMMAND_TIMEOUT_MS = 10000;

/** Line ending for commands */
const LINE_ENDING = '\r\n';

/**
 * Extended VMInfo with additional fields from JSON responses
 */
export interface ExtendedVMInfo extends VMInfo {
  state: string;
  uptime_ms: number;
  opi: number[];
  ipi?: number[];
  active_tasks?: number;
  overruns?: number;
}

/**
 * System information from device
 */
export interface SystemInfo {
  board: string;
  zplc_version: string;
  zephyr_version: string;
  uptime_ms: number;
  cpu_freq_mhz: number;
  capabilities: {
    fpu: boolean;
    mpu: boolean;
    scheduler: boolean;
    max_tasks: number;
  };
  memory: {
    work_size: number;
    retain_size: number;
    ipi_size: number;
    opi_size: number;
  };
}

/**
 * Status information from device
 */
export interface StatusInfo {
  state: string;
  uptime_ms: number;
  stats: {
    cycles: number;
    overruns?: number;
    active_tasks?: number;
    program_size?: number;
  };
  tasks?: Array<{
    slot: number;
    id: number;
    prio: number;
    interval_us: number;
    cycles: number;
    overruns: number;
  }>;
  memory?: {
    work_total: number;
    retain_total: number;
  };
  vm?: {
    pc: number;
    sp: number;
    halted: boolean;
    error: number;
  };
  opi: number[];
}

export interface CommunicationMapEntry {
  index: number;
  kind: string;
  type: string;
  var_addr: number;
  width: number;
  value: number;
  effective_value: number;
  override: boolean;
}

export interface MqttRuntimeStatus {
  connected: boolean;
  subscribed: boolean;
  session_present: boolean;
  profile: number;
  protocol: number;
  transport: number;
  publish_qos: number;
  subscribe_qos: number;
  retain_enabled: boolean;
  lwt_enabled: boolean;
  last_error: number;
  last_publish_ms: number;
  reconnect_backoff_s: number;
  broker: string;
  client_id: string;
}

interface CommunicationMapResponse {
  count: number;
  entries: CommunicationMapEntry[];
}

/**
 * WebSerial Debug Adapter
 *
 * Implements IDebugAdapter for communicating with real ZPLC hardware.
 */
export class SerialAdapter implements IDebugAdapter {
  readonly type = 'serial' as const;

  private connection: SerialConnection | null = null;
  private port: SerialPort | null = null;
  private _connected = false;
  private _state: VMState = 'disconnected';
  private events: DebugAdapterEvents = {};
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private _passthroughMode = false;
  private systemInfoCache: SystemInfo | null = null;
  private serialConsoleRemainder = '';
  private readonly handleLiveSerialChunk = (chunk: string): void => {
    const result = consumeSerialConsoleChunk(this.serialConsoleRemainder, chunk);
    this.serialConsoleRemainder = result.remainder;
    result.lines.forEach((line) => this.events.onSerialData?.(line));
  };

  /**
   * Command mutex — a promise chain that ensures all serial commands are
   * executed strictly one at a time. Every sendCommand / sendCommandWithOutput
   * / sendJsonCommand grabs the tail of this chain and appends itself. This
   * prevents concurrent commands from clearing each other's _rxBuffer and
   * corrupting responses, which was the root cause of watch-table timeouts
   * when connectionManager status polling overlapped with peek commands.
   */
  private _commandQueue: Promise<void> = Promise.resolve();

  /** When true, SerialAdapter does NOT start its own polling on connect.
   *  This is used when connectionManager handles polling externally. */
  public disableAutoPolling = false;

  // Breakpoint state (managed locally, synced to hardware when commands available)
  private breakpoints: Set<number> = new Set();

  get connected(): boolean {
    return this._connected;
  }

  get state(): VMState {
    return this._state;
  }

  get passthroughMode(): boolean {
    return this._passthroughMode;
  }

  private setState(newState: VMState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.events.onStateChange?.(newState);
    }
  }

  // =========================================================================
  // Passthrough Mode (for Terminal)
  // =========================================================================

  /**
   * Enable or disable passthrough mode.
   * When enabled, polling is paused and all received data is forwarded
   * to the callback instead of being parsed.
   */
  setPassthroughMode(enabled: boolean, _callback?: (data: string) => void): void {
    this._passthroughMode = enabled;

    if (enabled) {
      this.stopPolling();
    } else {
      this.startPolling();
    }
  }

  /**
   * Send raw data in passthrough mode
   */
  async sendRaw(data: string): Promise<void> {
    if (!this.connection || !this.connection.isConnected) {
      throw new Error('Not connected');
    }
    const encoder = new TextEncoder();
    await this.connection.writer.write(encoder.encode(data));
  }

  /**
   * Get the raw receive buffer (for passthrough mode)
   */
  getRxBuffer(): string {
    return this.connection?._rxBuffer || '';
  }

  /**
   * Clear the raw receive buffer
   */
  clearRxBuffer(): void {
    if (this.connection) {
      this.connection._rxBuffer = '';
    }
  }

  // =========================================================================
  // Connection Management
  // =========================================================================

  async connect(): Promise<void> {
    if (this._connected) {
      return;
    }

    if (!isWebSerialSupported()) {
      throw new Error('WebSerial is not supported in this browser');
    }

    // Request port from user
    this.port = await requestPort();
    if (!this.port) {
      throw new Error('No serial port selected');
    }

    // Connect to the port
    this.connection = await serialConnect(this.port);
    this._connected = true;
    this.serialConsoleRemainder = '';
    addDataListener(this.connection, this.handleLiveSerialChunk);

    // Get initial state
    try {
      const status = await this.getStatus();
      const derivedState = deriveHardwareDebugState(status);
      this.setState(derivedState.vmState);

      if (status.vm) {
        this.events.onInfoUpdate?.({
          pc: status.vm.pc,
          sp: status.vm.sp,
          halted: derivedState.halted,
          cycles: status.stats.cycles,
          error: status.vm.error,
        });
      }
    } catch {
      this.setState('idle');
    }

    // Start polling for state updates (unless externally managed)
    if (!this._passthroughMode && !this.disableAutoPolling) {
      this.startPolling();
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected || !this.connection) {
      return;
    }

    this.stopPolling();
    this._passthroughMode = false;
    flushSerialConsoleRemainder(this.serialConsoleRemainder).forEach((line) => this.events.onSerialData?.(line));
    this.serialConsoleRemainder = '';

    removeDataListener(this.connection, this.handleLiveSerialChunk);

    await serialDisconnect(this.connection);
    this.connection = null;
    this.port = null;
    this._connected = false;
    this.setState('disconnected');
  }

  private startPolling(): void {
    if (this.pollingInterval !== null || this._passthroughMode || this.disableAutoPolling) {
      return;
    }

    // Poll every 200ms for state updates
    this.pollingInterval = setInterval(async () => {
      if (!this._connected || this._passthroughMode) {
        this.stopPolling();
        return;
      }

      try {
        const status = await this.getStatus();
        const derivedState = deriveHardwareDebugState(status);
        const previousState = this._state;
        const info: VMInfo = {
          pc: status.vm?.pc ?? 0,
          sp: status.vm?.sp ?? 0,
          halted: derivedState.halted,
          cycles: status.stats.cycles,
          error: status.vm?.error ?? 0,
        };

        this.setState(derivedState.vmState);

        if (derivedState.vmState === 'paused' && previousState !== 'paused') {
          this.events.onBreakpointHit?.(info.pc);
        }

        this.events.onInfoUpdate?.(info);
      } catch {
        // Ignore polling errors
      }
    }, 200);
  }

  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // =========================================================================
  // Command Communication
  // =========================================================================

  /**
   * Send a command that expects a JSON response.
   * Serialized through the command mutex.
   */
  private sendJsonCommand(command: string): Promise<unknown> {
    return this.withCommandMutex(() => this._sendJsonCommandRaw(command));
  }

  private async _sendJsonCommandRaw(command: string): Promise<unknown> {
    if (!this.connection || !this.connection.isConnected) {
      throw new Error('Not connected');
    }

    const encoder = new TextEncoder();
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;

    // Clear buffer before sending
    this.connection._rxBuffer = '';

    // Check connection before write
    if (!this.connection.isConnected) {
      throw new Error('Connection closed');
    }
    
    // Send command with --json flag
    const fullCommand = `${command} --json`;
    const data = encoder.encode(fullCommand + LINE_ENDING);
    await this.connection.writer.write(data);

    // Read response with timeout by polling _rxBuffer
    const startTime = Date.now();

    while (Date.now() - startTime < COMMAND_TIMEOUT_MS) {
      // Check buffer for JSON response (starts with { and ends with })
      let buffer = this.connection._rxBuffer.replace(ansiRegex, '');
      
      // WORKAROUND: Older firmware outputs malformed JSON for stats object:
      // '... "uptime_ms":123,{"stats":{ ...' due to an extra JSON_OBJ_START(sh).
      // We patch it in the raw buffer so the brace counting matches correctly.
      if (buffer.includes(',{"stats":')) {
        buffer = buffer.replace(/,\s*\{\s*"stats"\s*:/g, ',"stats":');
        // also we need to add a missing closing brace at the end if it was truncated,
        // but the brace matching counts braces. By removing the `{`, we fix the unbalance!
      }
      
      // Look for complete JSON object
      const jsonStart = buffer.indexOf('{');
      if (jsonStart >= 0) {
        // Try to find matching closing brace
        let braceCount = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < buffer.length; i++) {
          if (buffer[i] === '{') braceCount++;
          if (buffer[i] === '}') braceCount--;
          if (braceCount === 0) {
            jsonEnd = i;
            break;
          }
        }

        if (jsonEnd > jsonStart) {
          const jsonStr = buffer.slice(jsonStart, jsonEnd + 1);
          
          try {
            const parsed = JSON.parse(jsonStr);
            // Clear processed data from the original buffer (we matched lengths based on patched buffer)
            // Wait, since we replaced characters in the buffer, we can't slice the original _rxBuffer easily.
            // Let's just clear the whole buffer or find the original end.
            this.connection._rxBuffer = ''; // Just wipe it, we got our JSON
            return parsed;
          } catch {
            // JSON not complete yet, keep waiting
          }
        }
      }

      // Wait a bit before checking again
      await new Promise((r) => setTimeout(r, 50));
    }

    throw new Error(`Command timeout: ${command}`);
  }

  private sendCommand(command: string): Promise<string> {
    return this.withCommandMutex(() => this._sendCommandRaw(command));
  }

  private async _sendCommandRaw(command: string): Promise<string> {
    if (!this.connection || !this.connection.isConnected) {
      throw new Error('Not connected');
    }

    const encoder = new TextEncoder();
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;

    // Clear buffer before sending
    this.connection._rxBuffer = '';

    // Send command - check again before write in case disconnect happened
    if (!this.connection.isConnected) {
      throw new Error('Connection closed');
    }
    
    const data = encoder.encode(command + LINE_ENDING);
    await this.connection.writer.write(data);

    // Read response with timeout by polling _rxBuffer
    const startTime = Date.now();

    while (Date.now() - startTime < COMMAND_TIMEOUT_MS) {
      // Check buffer for response lines
      const lines = this.connection._rxBuffer.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const cleanLine = lines[i].replace(ansiRegex, '').trim();
        if (
          cleanLine.startsWith('OK:') ||
          cleanLine.startsWith('ERROR:') ||
          cleanLine.startsWith('WARN:')
        ) {
          // Found a response! Remove processed lines from buffer
          this.connection._rxBuffer = lines.slice(i + 1).join('\n');
          return cleanLine;
        }
      }

      // Wait a bit before checking again
      await new Promise((r) => setTimeout(r, 50));
    }

    throw new Error(`Command timeout: ${command}`);
  }

  /**
   * Best-effort variant of sendCommand: never throws on timeout or connection
   * errors. Returns null on failure. Use only for background/optional commands
   * that must not block or fail an upload (e.g. wifi connect).
   */
  private async sendCommandBestEffort(command: string): Promise<string | null> {
    try {
      return await this.sendCommand(command);
    } catch (e) {
      console.warn(`[serialAdapter] best-effort command failed (${command}):`, e);
      return null;
    }
  }

  private quoteShellArg(value: string): string {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  /**
   * Acquire the command mutex and run `fn` exclusively.
   * All three send variants (sendCommand, sendCommandWithOutput, sendJsonCommand)
   * go through this so they are strictly serialized on the single serial port.
   */
  private withCommandMutex<T>(fn: () => Promise<T>): Promise<T> {
    const result = this._commandQueue.then(fn, fn);
    // Swallow errors on the queue chain so a failed command doesn't break
    // all subsequent commands. Each caller gets their own rejection via `result`.
    this._commandQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async sendDebugCommand(subcommand: string): Promise<string> {
    return this.sendCommand(`zplc dbg ${subcommand}`);
  }

  // =========================================================================
  // System Information
  // =========================================================================

  /**
   * Get system information from the device (board, version, capabilities)
   */
  async getSystemInfo(): Promise<SystemInfo> {
    const result = await this.sendJsonCommand('zplc sys info') as SystemInfo;
    this.systemInfoCache = result;
    return result;
  }

  /**
   * Get detailed status information in JSON format
   */
  async getStatus(): Promise<StatusInfo> {
    const result = await this.sendJsonCommand('zplc status') as StatusInfo;
    return result;
  }

  async getCommunicationMap(): Promise<CommunicationMapEntry[]> {
    const result = await this.sendJsonCommand('zplc comm map') as CommunicationMapResponse;
    return result.entries ?? [];
  }

  async getMqttStatus(): Promise<MqttRuntimeStatus> {
    const result = await this.sendJsonCommand('zplc mqtt status') as MqttRuntimeStatus;
    return result;
  }

  async setModbusAddress(index: number, address: number): Promise<void> {
    const response = await this.sendCommand(`zplc comm set modbus ${index} ${address}`);
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
    await this.saveRuntimeConfig();
  }

  async clearModbusAddress(index: number): Promise<void> {
    const response = await this.sendCommand(`zplc comm clear modbus ${index}`);
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
    await this.saveRuntimeConfig();
  }

  async saveRuntimeConfig(): Promise<void> {
    const response = await this.sendCommand('zplc config save');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
  }

  // =========================================================================
  // Program Loading
  // =========================================================================

  async provisionProjectConfig(projectConfig: ZPLCProjectConfig, trace?: UploadTraceCallback): Promise<void> {
    if (!this._connected || !this.connection) {
      throw new Error('Not connected');
    }

    const sendConfigCommand = async (command: string): Promise<string> => {
      trace?.({ kind: 'command', message: sanitizeUploadTraceCommand(command) });
      const response = await this.sendCommand(command);
      trace?.({ kind: 'response', message: response });
      return response;
    };

    trace?.({ kind: 'stage', message: 'Applying runtime configuration to device' });
    const commands = buildProvisioningCommands(projectConfig, {
      quoteShellArg: (value) => this.quoteShellArg(value),
    });

    for (const command of commands) {
      await sendConfigCommand(command);
    }
  }

  /**
   * Triggers background network bring-up AFTER the program is loaded.
   * Uses best-effort: never throws, never blocks upload.
   * The board will attempt to connect; result is only logged, not fatal.
   */
  async triggerNetworkBringUp(projectConfig: ZPLCProjectConfig): Promise<void> {
    if (!this._connected || !this.connection) {
      return; // silently skip if disconnected
    }

    const wifiEnabled = projectConfig.network?.wifi?.enabled;
    if (wifiEnabled && projectConfig.network?.wifi?.ssid) {
      const resp = await this.sendCommandBestEffort('zplc wifi connect');
      if (resp === null) {
        console.warn('[serialAdapter] WiFi bring-up timed out (non-fatal)');
      } else if (resp.startsWith('WARN:') || resp.startsWith('ERROR:')) {
        console.warn('[serialAdapter] WiFi bring-up:', resp);
      }
    }
  }

  async loadProgram(bytecode: Uint8Array, options?: LoadProgramOptions): Promise<void> {
    if (!this._connected || !this.connection) {
      throw new Error('Not connected');
    }

    await uploadBytecode(this.connection, bytecode, undefined, {
      hasSchedulerSupport: this.systemInfoCache?.capabilities.scheduler ?? false,
      trace: options?.trace,
    });
    this.setState('running');
  }

  // =========================================================================
  // Execution Control
  // =========================================================================

  async start(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendCommand('zplc start');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    this.setState('running');
  }

  async stop(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendCommand('zplc stop');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    this.setState('idle');
  }

  async pause(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand('pause');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    const status = await this.getStatus();
    this.setState(deriveHardwareDebugState(status).vmState);
  }

  async resume(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand('resume');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    const status = await this.getStatus();
    this.setState(deriveHardwareDebugState(status).vmState);
  }

  async step(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand('step');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    const status = await this.getStatus();
    const derivedState = deriveHardwareDebugState(status);
    this.setState(derivedState.vmState);

    if (status.vm) {
      this.events.onStepComplete?.(status.vm.pc);
    }
  }

  async reset(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendCommand('zplc reset');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    this.setState('idle');
  }

  // =========================================================================
  // Memory Access
  // =========================================================================

  /**
   * Send a command and capture ALL output lines before the OK/ERROR terminator.
   * Unlike sendCommand which only returns the terminator line, this returns
   * all intermediate output lines as well.
   */
  private readMemoryDump(command: string): Promise<string[]> {
    return this.withCommandMutex(() => this._readMemoryDumpRaw(command));
  }

  private async _readMemoryDumpRaw(command: string): Promise<string[]> {
    if (!this.connection?.isConnected) {
      throw new Error('Connection closed');
    }

    const encoder = new TextEncoder();
    const LINE_ENDING = '\r\n';
    const COMMAND_TIMEOUT_MS = 3000;
    const QUIET_PERIOD_MS = 120;
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /\x1b\[[0-9;]*[mK]/g;

    this.connection._rxBuffer = '';

    await this.connection.writer.write(encoder.encode(command + LINE_ENDING));

    const startTime = Date.now();
    let lastActivityAt = startTime;
    let lastBufferSnapshot = '';
    let sawMemoryDump = false;

    while (Date.now() - startTime < COMMAND_TIMEOUT_MS) {
      const buffer = this.connection._rxBuffer;
      if (buffer !== lastBufferSnapshot) {
        lastBufferSnapshot = buffer;
        lastActivityAt = Date.now();

        const cleanBuffer = buffer.replace(ansiRegex, '');
        if (cleanBuffer.includes('Memory at 0x')) {
          sawMemoryDump = true;
        }

        // Fast-path terminator for mpeek JSON output
        if (cleanBuffer.includes('{"t":"mpeek"') && cleanBuffer.includes(']}')) {
          this.connection._rxBuffer = '';
          const lines = buffer.split(/\r?\n/)
            .map((line) => line.replace(ansiRegex, '').trim())
            .filter((line) => line && !line.startsWith('uart:~$'));
          return lines.filter((line) => line !== command);
        }
      }

      const lines = buffer.split(/\r?\n/)
        .map((line) => line.replace(ansiRegex, '').trim())
        .filter((line) => line && !line.startsWith('uart:~$'));

      // DEBUG: Log the lines if it's an mpeek command
      if (command.includes('mpeek') && lines.length > 0 && buffer !== lastBufferSnapshot) {
        debugLog('[mpeek-raw] Current lines:', lines);
      }

      const terminator = lines.find((line) => line.startsWith('OK:') || line.startsWith('ERROR:') || line.startsWith('WARN:'));
      if (terminator) {
        this.connection._rxBuffer = '';
        return lines.filter((line) => line !== command && line !== terminator);
      }

      if (sawMemoryDump && Date.now() - lastActivityAt >= QUIET_PERIOD_MS) {
        this.connection._rxBuffer = '';
        return lines.filter((line) => line !== command);
      }

      await new Promise((r) => setTimeout(r, 25));
    }

    throw new Error(`Command timeout: ${command}`);
  }

  async peek(address: number, length: number): Promise<Uint8Array> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const lines = await this.readMemoryDump(`zplc dbg peek 0x${address.toString(16)} ${length}`);
    return parsePeekBytes(lines, length);
  }

  /**
   * Read multiple non-contiguous memory addresses in a single serial round-trip.
   *
   * Sends `zplc dbg mpeek addr:len[,addr:len...]` and parses the firmware's
   * JSON response. This eliminates the per-group serial latency that still
   * exists with the batched `peek` approach when variables span multiple
   * disjoint memory regions.
   *
   * @param requests - Array of {address, size} pairs (max 16 entries, max 256
   *                   total bytes). Any order is fine; the firmware reads them
   *                   independently.
   * @returns Map from absolute address → raw bytes as Uint8Array.
   *          Entries that could not be read are absent from the map.
   */
  async mpeek(requests: MpeekRequest[]): Promise<Map<number, Uint8Array>> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    if (requests.length === 0) {
      return new Map();
    }

    const arg = buildMpeekArgument(requests);
    const lines = await this.readMemoryDump(`zplc dbg mpeek ${arg}`);
    return parseMpeekResponse(lines);
  }

  async poke(address: number, value: number): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand(`poke 0x${address.toString(16)} ${value}`);
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
  }

  async pokeN(address: number, bytes: Uint8Array): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    // Since we don't have a bulk poke command yet, send individual bytes
    for (let i = 0; i < bytes.length; i++) {
      await this.poke(address + i, bytes[i]);
    }
  }

  async setValue(address: number, bytes: Uint8Array): Promise<void> {
    await this.pokeN(address, bytes);
  }

  async forceValue(address: number, bytes: Uint8Array): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand(
      `force set 0x${address.toString(16)} ${bytesToHex(bytes)}`,
    );
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
  }

  async clearForcedValue(address: number): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand(`force clear 0x${address.toString(16)}`);
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
  }

  async clearAllForcedValues(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand('force clear_all');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
  }

  async listForcedValues(): Promise<WatchForceEntry[]> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendJsonCommand('zplc dbg force list') as {
      items?: Array<{ addr: number; size: number; bytes: string }>;
    };

    return (response.items ?? []).map((item) => ({
      path: `0x${item.addr.toString(16).toUpperCase().padStart(4, '0')}`,
      address: item.addr,
      size: item.size,
      type: item.size === 1 ? 'BYTE' : item.size === 2 ? 'WORD' : 'DWORD',
      bytesHex: item.bytes,
      state: WATCH_FORCE_STATE.FORCED,
    }));
  }

  async getOPI(offset: number): Promise<number> {
    // Use JSON status to get OPI values
    try {
      const status = await this.getStatus();
      if (status.opi && offset < status.opi.length) {
        return status.opi[offset];
      }
    } catch {
      // Fall back to 0
    }
    return 0;
  }

  async setIPI(offset: number, value: number): Promise<void> {
    await this.poke(offset, value);
  }

  // =========================================================================
  // State Inspection
  // =========================================================================

  async getInfo(): Promise<VMInfo> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    try {
      const status = await this.getStatus();
      const derivedState = deriveHardwareDebugState(status);
      return {
        pc: status.vm?.pc ?? 0,
        sp: status.vm?.sp ?? 0,
        halted: derivedState.halted,
        cycles: status.stats.cycles ?? 0,
        error: status.vm?.error ?? 0,
      };
    } catch {
      // Fallback to text parsing
      return this.getInfoLegacy();
    }
  }

  /**
   * Legacy text-based info parsing (fallback)
   */
  private async getInfoLegacy(): Promise<VMInfo> {
    const response = await this.sendDebugCommand('info');

    const lines = response.split(/\r?\n/);
    let cycles = 0;
    let pc = 0;
    let sp = 0;
    let halted = false;
    let error = 0;

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        switch (key.toLowerCase()) {
          case 'cycles':
            cycles = parseInt(value, 10) || 0;
            break;
          case 'pc':
            pc = parseInt(value, 16) || 0;
            break;
          case 'sp':
            sp = parseInt(value, 10) || 0;
            break;
          case 'halted':
            halted = value.toLowerCase() === 'yes';
            break;
          case 'error':
            error = parseInt(value, 10) || 0;
            break;
        }
      }
    }

    return {
      pc,
      sp,
      halted,
      cycles,
      error,
    };
  }

  /**
   * Get extended info using JSON format
   */
  async getExtendedInfo(): Promise<ExtendedVMInfo> {
    const result = await this.sendJsonCommand('zplc dbg info') as ExtendedVMInfo;
    return result;
  }

  async readWatchVariables(
    variables: WatchVariable[],
    options?: ReadWatchOptions,
  ): Promise<WatchVariable[]> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    if (variables.length === 0) {
      return [];
    }

    // Fast path: use mpeek only when the caller explicitly opts in.
    // This requires firmware compiled with `zplc dbg mpeek` support.
    if (options?.useMpeek) {
      // Build one mpeek request per variable (deduplicated by address).
      // The firmware reads all addresses in a single serial round-trip, so
      // there is no cross-cycle skew regardless of memory region count.
      const seen = new Set<number>();
      const requests: MpeekRequest[] = [];

      for (const v of variables) {
        const size = getTypeSize(v.type, v.maxLength);
        // Deduplicate: two variables at the same address (e.g. bit-addressed
        // BOOLs) share one read; bytes extracted individually via bitOffset.
        if (!seen.has(v.address)) {
          seen.add(v.address);
          requests.push({ address: v.address, size });
        }
      }

      // Cap at 16 entries / 256 total bytes (firmware limits).
      // If the program has more unique addresses, fall back to the group-peek
      // strategy which handles arbitrary counts at the cost of multiple RTTs.
      const MPEEK_MAX_ENTRIES = 16;
      const MPEEK_MAX_BYTES = 256;
      const totalBytes = requests.reduce((sum, r) => sum + r.size, 0);

      if (requests.length <= MPEEK_MAX_ENTRIES && totalBytes <= MPEEK_MAX_BYTES) {
        debugLog(`[mpeek] Sending batch for ${requests.length} addresses, ${totalBytes} bytes`);
        const addrMap = await this.mpeek(requests);

        return variables.map((v) => {
          const bytes = addrMap.get(v.address);
          if (bytes === undefined) {
             console.warn(`[mpeek map] Missing bytes for ${v.name} at addr ${v.address}`);
             return v;
          }
          const value = bytesToValue(bytes, v.type, v.bitOffset);
          debugLog(`[mpeek map] var ${v.name} at ${v.address} -> bytes:`, bytes, `value:`, value);
          return { ...v, value };
        });
      }

      console.warn(`[mpeek] Capacity exceeded (entries=${requests.length}/${MPEEK_MAX_ENTRIES}, bytes=${totalBytes}/${MPEEK_MAX_BYTES}). Falling back to standard peek.`);
      // Falls through to the slow path if mpeek limits are exceeded.
    }

    // Slow-path (default): group variables into contiguous regions (multiple
    // peek round-trips, but handles >16 distinct addresses and works with
    // any firmware version that supports the basic peek command).
    const groups = groupVariablesForBatchPeek(variables);
    const updated = new Map<string, WatchVariable>();

    for (const group of groups) {
      const buffer = await this.peek(group.baseAddress, group.span);

      for (const v of group.variables) {
        const bytes = extractVariableBytes(buffer, group.baseAddress, v);
        const value = bytesToValue(bytes, v.type, v.bitOffset);
        updated.set(v.name, { ...v, value });
      }
    }

    return variables.map((v) => updated.get(v.name) ?? v);
  }

  // =========================================================================
  // GPIO Simulation (not applicable for real hardware)
  // =========================================================================

  async setVirtualInput(channel: number, value: number): Promise<void> {
    // For real hardware, use poke to set IPI values
    await this.poke(channel, value);
  }

  async getVirtualOutput(channel: number): Promise<number> {
    // For real hardware, read OPI values
    return await this.getOPI(channel);
  }

  // =========================================================================
  // Event Handling
  // =========================================================================

  setEventHandlers(events: DebugAdapterEvents): void {
    this.events = events;
  }

  clearEventHandlers(): void {
    this.events = {};
  }

  // =========================================================================
  // Breakpoint Management
  // =========================================================================

  /**
   * Set a breakpoint at a specific program counter address.
   */
  async setBreakpoint(pc: number): Promise<boolean> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    if (this.breakpoints.has(pc)) {
      return false; // Already set
    }

    // Send to hardware
    try {
      const response = await this.sendDebugCommand(`bp add 0x${pc.toString(16)}`);
      if (response.startsWith('ERROR:')) {
        console.warn('Hardware breakpoint error:', response);
        return false;
      }
    } catch (e) {
      console.warn('Command timeout or not supported:', e);
      return false;
    }

    this.breakpoints.add(pc);
    return true;
  }

  /**
   * Remove a breakpoint at a specific program counter address.
   */
  async removeBreakpoint(pc: number): Promise<boolean> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    if (!this.breakpoints.has(pc)) {
      return false;
    }

    // Send to hardware
    try {
      await this.sendDebugCommand(`bp remove 0x${pc.toString(16)}`);
    } catch {
      // Ignore if not supported
    }

    return this.breakpoints.delete(pc);
  }

  /**
   * Clear all breakpoints.
   */
  async clearBreakpoints(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    // Send to hardware
    try {
      await this.sendDebugCommand('bp clear');
    } catch {
      // Ignore if not supported
    }

    this.breakpoints.clear();
  }

  /**
   * Get list of currently set breakpoint addresses.
   */
  async getBreakpoints(): Promise<number[]> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    try {
      const response = await this.sendJsonCommand('zplc dbg bp list') as {
        bps?: number[];
        ok?: boolean;
      };

      if (Array.isArray(response.bps)) {
        this.breakpoints = new Set(response.bps);
      }
    } catch {
      // Fall back to local cache only
    }

    return Array.from(this.breakpoints);
  }

  /**
   * Check if a breakpoint is set at a specific address.
   */
  async hasBreakpoint(pc: number): Promise<boolean> {
    return this.breakpoints.has(pc);
  }
}
