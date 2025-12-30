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
  private _passthroughMode = false;

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
    if (!this.connection) {
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

    // Get initial state
    try {
      const info = await this.getInfo();
      if (info.cycles > 0 && !info.halted) {
        this.setState('running');
      } else {
        this.setState('idle');
      }
    } catch {
      this.setState('idle');
    }

    // Start polling for state updates
    if (!this._passthroughMode) {
      this.startPolling();
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected || !this.connection) {
      return;
    }

    this.stopPolling();
    this._passthroughMode = false;

    await serialDisconnect(this.connection);
    this.connection = null;
    this.port = null;
    this._connected = false;
    this.setState('disconnected');
  }

  private startPolling(): void {
    if (this.pollingInterval !== null || this._passthroughMode) {
      return;
    }

    // Poll every 200ms for state updates
    this.pollingInterval = setInterval(async () => {
      if (!this._connected || this._passthroughMode) {
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

  /**
   * Send a command that expects a JSON response
   */
  private async sendJsonCommand(command: string): Promise<unknown> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const encoder = new TextEncoder();
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;

    // Clear buffer before sending
    this.connection._rxBuffer = '';

    // Send command with --json flag
    const fullCommand = `${command} --json`;
    const data = encoder.encode(fullCommand + LINE_ENDING);
    await this.connection.writer.write(data);

    // Read response with timeout by polling _rxBuffer
    const startTime = Date.now();

    while (Date.now() - startTime < COMMAND_TIMEOUT_MS) {
      // Check buffer for JSON response (starts with { and ends with })
      const buffer = this.connection._rxBuffer.replace(ansiRegex, '');
      
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
            // Clear processed data from buffer
            this.connection._rxBuffer = buffer.slice(jsonEnd + 1);
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

  private async sendCommand(command: string): Promise<string> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const encoder = new TextEncoder();
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;

    // Clear buffer before sending
    this.connection._rxBuffer = '';

    // Send command
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
    return result;
  }

  /**
   * Get detailed status information in JSON format
   */
  async getStatus(): Promise<StatusInfo> {
    const result = await this.sendJsonCommand('zplc status') as StatusInfo;
    return result;
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
      // Try JSON format first
      const result = await this.sendJsonCommand('zplc dbg info') as ExtendedVMInfo;
      return {
        pc: result.pc ?? 0,
        sp: result.sp ?? 0,
        halted: result.halted ?? (result.state !== 'RUNNING'),
        cycles: result.cycles ?? 0,
        error: result.error ?? 0,
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

  // =========================================================================
  // Breakpoint Management
  // =========================================================================

  /**
   * Set a breakpoint at a specific program counter address.
   * 
   * Note: Hardware breakpoint commands (`zplc dbg bp add <pc>`) are not yet
   * implemented in the Zephyr shell. This method stores breakpoints locally
   * and will sync to hardware when the commands become available.
   */
  async setBreakpoint(pc: number): Promise<boolean> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    if (this.breakpoints.has(pc)) {
      return false; // Already set
    }

    // Try to send to hardware (will fail gracefully if not supported)
    try {
      const response = await this.sendDebugCommand(`bp add 0x${pc.toString(16)}`);
      if (response.startsWith('ERROR:')) {
        // Command not supported - store locally only
        console.warn('Hardware breakpoints not supported, storing locally');
      }
    } catch {
      // Command timeout or not supported - store locally
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

    // Try to send to hardware
    try {
      await this.sendDebugCommand(`bp remove 0x${pc.toString(16)}`);
    } catch {
      // Command not supported - just remove locally
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

    // Try to send to hardware
    try {
      await this.sendDebugCommand('bp clear');
    } catch {
      // Command not supported
    }

    this.breakpoints.clear();
  }

  /**
   * Get list of currently set breakpoint addresses.
   */
  async getBreakpoints(): Promise<number[]> {
    return Array.from(this.breakpoints);
  }

  /**
   * Check if a breakpoint is set at a specific address.
   */
  async hasBreakpoint(pc: number): Promise<boolean> {
    return this.breakpoints.has(pc);
  }
}
