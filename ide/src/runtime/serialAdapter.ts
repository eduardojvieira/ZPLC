/**
 * @file serialAdapter.ts
 * @brief WebSerial Debug Adapter for ZPLC Runtime
 *
 * This adapter communicates with a ZPLC-enabled Zephyr device via
 * WebSerial. It implements the IDebugAdapter interface and uses
 * the shell commands defined in shell_cmds.c for debugging.
 */

import type {
  IDebugAdapter,
  VMState,
  VMInfo,
  WatchVariable,
  DebugAdapterEvents,
} from './debugAdapter';
import {
  getTypeSize,
  bytesToValue,
} from './debugAdapter';

import type { SerialConnection } from '../uploader/webserial';
import {
  isWebSerialSupported,
  requestPort,
  connect as serialConnect,
  disconnect as serialDisconnect,
  uploadBytecode,
} from '../uploader/webserial';

/** Command timeout in milliseconds */
const COMMAND_TIMEOUT_MS = 3000;

/** Line ending for commands */
const LINE_ENDING = '\r\n';

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
  private lastPollCycles = 0;

  get connected(): boolean {
    return this._connected;
  }

  get state(): VMState {
    return this._state;
  }

  private setState(newState: VMState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.events.onStateChange?.(newState);
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

    // Get initial state
    const info = await this.getInfo();
    if (info.cycles > 0 && !info.halted) {
      this.setState('running');
    } else {
      this.setState('idle');
    }

    // Start polling for state updates
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    if (!this._connected || !this.connection) {
      return;
    }

    this.stopPolling();

    await serialDisconnect(this.connection);
    this.connection = null;
    this.port = null;
    this._connected = false;
    this.setState('disconnected');
  }

  private startPolling(): void {
    if (this.pollingInterval !== null) {
      return;
    }

    // Poll every 200ms for state updates
    this.pollingInterval = setInterval(async () => {
      if (!this._connected) {
        this.stopPolling();
        return;
      }

      try {
        const info = await this.getInfo();

        // Detect state changes based on cycle count changes
        if (this._state === 'running' && info.cycles === this.lastPollCycles) {
          // Cycles not advancing - might be paused or halted
          if (info.halted) {
            this.setState('paused');
          }
        }

        this.lastPollCycles = info.cycles;
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

  private async sendCommand(command: string): Promise<string> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Send command
    const data = encoder.encode(command + LINE_ENDING);
    await this.connection.writer.write(data);

    // Read response with timeout
    let response = '';
    const startTime = Date.now();

    while (Date.now() - startTime < COMMAND_TIMEOUT_MS) {
      const { value, done } = await Promise.race([
        this.connection.reader.read(),
        new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 100)
        ),
      ]);

      if (done || !value) {
        continue;
      }

      response += decoder.decode(value);

      // Check for complete response
      const lines = response.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith('OK:') ||
          trimmed.startsWith('ERROR:') ||
          trimmed.startsWith('WARN:')
        ) {
          return trimmed;
        }
      }
    }

    throw new Error(`Command timeout: ${command}`);
  }

  private async sendDebugCommand(subcommand: string): Promise<string> {
    return this.sendCommand(`zplc dbg ${subcommand}`);
  }

  // =========================================================================
  // Program Loading
  // =========================================================================

  async loadProgram(bytecode: Uint8Array): Promise<void> {
    if (!this._connected || !this.connection) {
      throw new Error('Not connected');
    }

    await uploadBytecode(this.connection, bytecode);
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

    this.setState('paused');
  }

  async resume(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand('resume');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    this.setState('running');
  }

  async step(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand('step');
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    this.setState('paused');
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

  async peek(address: number, length: number): Promise<Uint8Array> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const response = await this.sendDebugCommand(`peek 0x${address.toString(16)} ${length}`);
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }

    // Parse hex response
    // Response format: "Memory at 0xXXXX (Y bytes):"
    // Then lines like: "XXXX: AA BB CC DD ..."
    // For now, return empty array - full parsing would require multi-line reads
    return new Uint8Array(length);
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

  async getOPI(_offset: number): Promise<number> {
    // For now, get full info and extract OPI value
    // A more efficient implementation would add a dedicated command
    return 0; // Placeholder - would need to parse status output
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

    const response = await this.sendDebugCommand('info');

    // Parse the info response
    // Expected format:
    // === Debug Info ===
    // State:   RUNNING
    // Cycles:  123
    // PC:      0x0000
    // SP:      2
    // Halted:  no
    // Error:   0

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

  async readWatchVariables(variables: WatchVariable[]): Promise<WatchVariable[]> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const result: WatchVariable[] = [];

    for (const v of variables) {
      const size = getTypeSize(v.type);
      const bytes = await this.peek(v.address, size);
      const value = bytesToValue(bytes, v.type);

      result.push({
        ...v,
        value,
      });
    }

    return result;
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
}

/**
 * Create and return a Serial adapter instance
 */
export function createSerialAdapter(): SerialAdapter {
  return new SerialAdapter();
}
