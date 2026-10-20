/**
 * The serial link to a ZPLC device: connection, polling, the command queue, the device information and the
 * provisioning commands. The debug commands of IDebugAdapter are in serialAdapter.ts (IDE-014: split out of it).
 */

import type { VMState, VMInfo, DebugAdapterEvents } from './debugAdapter';
import { t } from '../i18n';

import type { SerialConnection } from '../uploader/webserial';
import { isWebSerialSupported, requestPort, connect as serialConnect, disconnect as serialDisconnect, addDataListener, removeDataListener } from '../uploader/webserial';
import type { ZPLCProjectConfig } from '../types';
import { sanitizeUploadTraceCommand, sanitizeUploadTraceText, type UploadTraceCallback } from './uploadTrace';
import { consumeSerialConsoleChunk, flushSerialConsoleRemainder } from './serialConsole';
import { buildProvisioningCommands } from './provisioningCommands';
import { deriveHardwareDebugState } from './debugStatus';
import { noteUnsupportedIo, parseStatusInfo } from './serialResponses';
import { joinDeviceIo, parseDeviceSystemInfo } from './deviceHandshake';
import { takeJsonReply } from './serialJson';

import { COMMAND_TIMEOUT_MS, LINE_ENDING, type CommunicationMapEntry, type CommunicationMapResponse, type MqttRuntimeStatus, type StatusInfo, type SystemInfo } from './serialAdapterTypes';

/**
 * WebSerial Debug Adapter
 *
 * Implements IDebugAdapter for communicating with real ZPLC hardware.
 */
export abstract class SerialDeviceLink {
  readonly type = 'serial' as const;

  protected connection: SerialConnection | null = null;
  protected port: SerialPort | null = null;
  protected _connected = false;
  protected _state: VMState = 'disconnected';
  protected events: DebugAdapterEvents = {};
  protected pollingInterval: ReturnType<typeof setInterval> | null = null;
  protected _passthroughMode = false;
  protected connectionAttempt = 0;
  protected readonly onUnexpectedDisconnect?: (adapter: SerialDeviceLink, message: string) => void;
  protected systemInfoCache: SystemInfo | null = null;
  protected serialConsoleRemainder = '';
  protected readonly handleLiveSerialChunk = (chunk: string): void => {
    const result = consumeSerialConsoleChunk(this.serialConsoleRemainder, chunk);
    this.serialConsoleRemainder = result.remainder;
    result.lines.forEach((line) => this.events.onSerialData?.(sanitizeUploadTraceText(line)));
  };

  /**
   * Command mutex — a promise chain that ensures all serial commands are
   * executed strictly one at a time. Every sendCommand / sendCommandWithOutput
   * / sendJsonCommand grabs the tail of this chain and appends itself. This
   * prevents concurrent commands from clearing each other's _rxBuffer and
   * corrupting responses, which was the root cause of watch-table timeouts
   * when connectionManager status polling overlapped with peek commands.
   */
  protected _commandQueue: Promise<void> = Promise.resolve();
  protected activeCommandCount = 0;

  /** When true, SerialAdapter does NOT start its own polling on connect.
   *  This is used when connectionManager handles polling externally. */
  public disableAutoPolling = false;

  constructor(onUnexpectedDisconnect?: (adapter: SerialDeviceLink, message: string) => void) {
    this.onUnexpectedDisconnect = onUnexpectedDisconnect;
  }

  // Breakpoint state (managed locally, synced to hardware when commands available)
  protected breakpoints: Set<number> = new Set();

  get connected(): boolean {
    return this._connected;
  }

  get state(): VMState {
    return this._state;
  }

  get passthroughMode(): boolean {
    return this._passthroughMode;
  }

  protected setState(newState: VMState): void {
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
  setPassthroughMode(enabled: boolean): void {
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
    const connection = this.connection;
    if (!connection || !connection.isConnected) {
      throw new Error('Not connected');
    }
    const encoder = new TextEncoder();
    await this.withCommandMutex(async () => {
      if (this.connection !== connection || !connection.isConnected) {
        throw new Error('Not connected');
      }
      await connection.writer.write(encoder.encode(data));
    });
  }

  /**
   * Get complete, sanitized receive text for passthrough mode.
   * Incomplete chunks remain internal until a line boundary prevents a
   * credential split across serial reads from reaching the terminal.
   */
  getRxBuffer(): string {
    if (this.activeCommandCount > 0) return '';
    const buffer = this.connection?._rxBuffer || '';
    if (!/[\r\n]$/.test(buffer)) return '';
    return sanitizeUploadTraceText(buffer);
  }

  /**
   * Clear the raw receive buffer
   */
  clearRxBuffer(): void {
    if (this.activeCommandCount === 0 && this.connection) {
      this.connection._rxBuffer = '';
    }
  }

  // =========================================================================
  // Connection Management
  // =========================================================================

  protected isCurrentConnection(connection: SerialConnection, attempt: number): boolean {
    return this.connection === connection && this.port === connection.port && this.connectionAttempt === attempt;
  }

  protected async closeLocalConnection(connection: SerialConnection): Promise<void> {
    connection.onReaderTerminated = undefined;
    removeDataListener(connection, this.handleLiveSerialChunk);
    try {
      await serialDisconnect(connection);
    } catch (disconnectError) {
      console.warn('[SerialAdapter] failed to close connection:', disconnectError);
    }
  }

  protected async failInitialStatusHandshake(connection: SerialConnection, attempt: number): Promise<never> {
    if (!this.isCurrentConnection(connection, attempt)) {
      throw new Error('Connection attempt cancelled');
    }
    await this.closeLocalConnection(connection);
    this.connection = null;
    this.port = null;
    this._connected = false;
    this.setState('disconnected');
    throw new Error('Initial ZPLC status handshake failed');
  }

  protected handleUnexpectedReaderTermination(connection: SerialConnection, attempt: number, message: string): void {
    if (!this.isCurrentConnection(connection, attempt)) {
      return;
    }

    this.stopPolling();
    removeDataListener(connection, this.handleLiveSerialChunk);
    this.connection = null;
    this.port = null;
    this._connected = false;
    this.setState('disconnected');
    this.onUnexpectedDisconnect?.(this, message);
    const close = () => {
      void this.closeLocalConnection(connection);
    };
    if (connection._readerTask) {
      void connection._readerTask.then(close, close);
    } else {
      queueMicrotask(close);
    }
  }

  async connect(): Promise<void> {
    if (this._connected) {
      return;
    }

    if (!isWebSerialSupported()) {
      throw new Error('WebSerial is not supported in this browser');
    }

    const attempt = ++this.connectionAttempt;
    const port = await requestPort();
    if (!port) {
      throw new Error('No serial port selected');
    }
    if (attempt !== this.connectionAttempt) {
      throw new Error('Connection attempt cancelled');
    }

    const connection = await serialConnect(port);
    if (attempt !== this.connectionAttempt) {
      await this.closeLocalConnection(connection);
      throw new Error('Connection attempt cancelled');
    }

    this.port = port;
    this.connection = connection;
    this._connected = true;
    this.serialConsoleRemainder = '';
    addDataListener(connection, this.handleLiveSerialChunk);
    connection.onReaderTerminated = (message) => this.handleUnexpectedReaderTermination(connection, attempt, message);

    // A physical port is not a ZPLC session until status validates the runtime.
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
      await this.failInitialStatusHandshake(connection, attempt);
    }

    if (!this.isCurrentConnection(connection, attempt)) {
      throw new Error('Connection attempt cancelled');
    }

    // Start polling for state updates (unless externally managed)
    if (!this._passthroughMode && !this.disableAutoPolling) {
      this.startPolling();
    }
  }

  async disconnect(): Promise<void> {
    this.connectionAttempt += 1;
    const connection = this.connection;
    if (!connection) {
      this.port = null;
      this._connected = false;
      this.setState('disconnected');
      return;
    }

    this.stopPolling();
    this._passthroughMode = false;
    flushSerialConsoleRemainder(this.serialConsoleRemainder).forEach((line) => this.events.onSerialData?.(sanitizeUploadTraceText(line)));
    this.serialConsoleRemainder = '';

    connection.onReaderTerminated = undefined;
    removeDataListener(connection, this.handleLiveSerialChunk);

    try {
      await serialDisconnect(connection);
    } finally {
      this.connection = null;
      this.port = null;
      this._connected = false;
      this.setState('disconnected');
    }
  }

  protected startPolling(): void {
    if (this.pollingInterval !== null || this._passthroughMode || this.disableAutoPolling) {
      return;
    }

    // Poll every 200ms for state updates. The poll swallows its own errors, so the timer only starts it.
    const poll = async (): Promise<void> => {
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
    };
    this.pollingInterval = setInterval(() => { void poll(); }, 200);
  }

  protected stopPolling(): void {
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
  protected sendJsonCommand(command: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<unknown> {
    return this.withCommandMutex(() => this._sendJsonCommandRaw(command, timeoutMs));
  }

  protected async _sendJsonCommandRaw(command: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<unknown> {
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

    while (Date.now() - startTime < timeoutMs) {
      const parsed = takeJsonReply(this.connection._rxBuffer.replace(ansiRegex, ''));
      if (parsed !== undefined) {
        this.connection._rxBuffer = ''; // the reply was read whole: what came before it is the echo
        return parsed;
      }

      // Wait a bit before checking again
      await new Promise((r) => setTimeout(r, 50));
    }

    throw new Error('Command timeout');
  }

  /** One `zplc dbg trace` command of the board's I/O trace (LRN-024), read-only for the program; see deviceTrace.ts. */
  deviceTraceCommand(command: string): Promise<unknown> {
    return this.sendJsonCommand(command, 3000);
  }

  protected sendCommand(command: string): Promise<string> {
    return this.withCommandMutex(() => this._sendCommandRaw(command));
  }

  protected async _sendCommandRaw(command: string): Promise<string> {
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

    throw new Error('Command timeout');
  }

  /**
   * Best-effort variant of sendCommand: never throws on timeout or connection
   * errors. Returns null on failure. Use only for background/optional commands
   * that must not block or fail an upload (e.g. wifi connect).
   */
  protected async sendCommandBestEffort(command: string): Promise<string | null> {
    try {
      return await this.sendCommand(command);
    } catch (e) {
      console.warn('[serialAdapter] best-effort command failed:', e);
      return null;
    }
  }

  /**
   * Acquire the command mutex and run `fn` exclusively.
   * All three send variants (sendCommand, sendCommandWithOutput, sendJsonCommand)
   * go through this so they are strictly serialized on the single serial port.
   */
  protected withCommandMutex<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      this.activeCommandCount += 1;
      try {
        return await fn();
      } finally {
        this.activeCommandCount -= 1;
      }
    };
    const result = this._commandQueue.then(run, run);
    // Swallow errors on the queue chain so a failed command doesn't break
    // all subsequent commands. Each caller gets their own rejection via `result`.
    this._commandQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  protected async sendDebugCommand(subcommand: string): Promise<string> {
    return this.sendCommand(`zplc dbg ${subcommand}`);
  }

  // =========================================================================
  // System Information
  // =========================================================================

  /**
   * Get system information from the device (board, version, capabilities)
   */
  async getSystemInfo(): Promise<SystemInfo> {
    try {
      const result = await joinDeviceIo(parseDeviceSystemInfo(await this.sendJsonCommand('zplc sys info')), () => this.sendJsonCommand('zplc sys io', 2000));
      this.systemInfoCache = result;
      return result;
    } catch {
      this.systemInfoCache = null;
      throw new Error('ZPLC_DEVICE_HANDSHAKE_INVALID');
    }
  }

  /**
   * Get detailed status information in JSON format
   */
  async getStatus(): Promise<StatusInfo> {
    return noteUnsupportedIo(this, parseStatusInfo(await this.sendJsonCommand('zplc status')), this.events.onSerialData);
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

    trace?.({ kind: 'stage', message: t('link.applyingConfig') });
    const commands = buildProvisioningCommands(projectConfig);

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
}
