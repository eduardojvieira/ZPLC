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
  VMInfo,
  RuntimeSnapshot,
  WatchVariable,
  WatchForceEntry,
  DebugAdapterEvents,
  LoadProgramOptions,
  ReadWatchOptions,
} from './debugAdapter';
import { bytesToHex, bytesToValue, getTypeSize, MEMORY_MAP } from './debugAdapter';
import { assertMemoryAccess, CONTRACT_REGION_SIZES, type RegionSizes } from './memoryAccess';

import { uploadBytecode } from '../uploader/webserial';
import { parsePeekBytes, groupVariablesForBatchPeek, extractVariableBytes, parseMpeekResponse, buildMpeekArgument } from './peekParser';
import type { MpeekRequest } from './peekParser';
import { debugLog } from '../utils/debugLog';
import { deriveHardwareDebugState } from './debugStatus';
import { parseForcedValues, requireForceCommandConfirmation } from './serialResponses';
import { normalizeSerialRuntimeSnapshot } from './runtimeSnapshot';

import { SerialDeviceLink } from './serialDeviceLink';
import type { ExtendedVMInfo } from './serialAdapterTypes';
export * from './serialAdapterTypes';

/**
 * WebSerial Debug Adapter
 *
 * Implements IDebugAdapter for communicating with real ZPLC hardware.
 */
export class SerialAdapter extends SerialDeviceLink implements IDebugAdapter {
  readonly type = 'serial' as const;

  constructor(onUnexpectedDisconnect?: (adapter: SerialAdapter, message: string) => void) {
    super(onUnexpectedDisconnect as ((adapter: SerialDeviceLink, message: string) => void) | undefined);
  }

  async loadProgram(bytecode: Uint8Array, options?: LoadProgramOptions): Promise<void> {
    if (!this._connected || !this.connection) {
      throw new Error('Not connected');
    }

    await uploadBytecode(this.connection, bytecode, undefined, {
      hasSchedulerSupport: this.systemInfoCache?.capabilities.scheduler ?? false,
      trace: options?.trace,
    });
    this.setState('idle');
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
          const lines = buffer
            .split(/\r?\n/)
            .map((line) => line.replace(ansiRegex, '').trim())
            .filter((line) => line && !line.startsWith('uart:~$'));
          return lines.filter((line) => line !== command);
        }
      }

      const lines = buffer
        .split(/\r?\n/)
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

    throw new Error('Command timeout');
  }

  /** The sizes of the regions this device reports (`sys info`), or the contract's until it has been asked. */
  protected regionSizes(): RegionSizes {
    const memory = this.systemInfoCache?.memory;
    return memory
      ? { ipi: memory.ipi_size, opi: memory.opi_size, work: memory.work_size, retain: memory.retain_size }
      : CONTRACT_REGION_SIZES;
  }

  async peek(address: number, length: number): Promise<Uint8Array> {
    if (!this._connected) {
      throw new Error('Not connected');
    }
    assertMemoryAccess(address, length, 'read', this.regionSizes());

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
    assertMemoryAccess(address, 1, 'write', this.regionSizes());

    const response = await this.sendDebugCommand(`poke 0x${address.toString(16)} ${value}`);
    if (response.startsWith('ERROR:')) {
      throw new Error(response);
    }
  }

  async pokeN(address: number, bytes: Uint8Array): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    assertMemoryAccess(address, bytes.length, 'write', this.regionSizes());

    // Firmware without the framed protocol has no atomic write: one byte at a time, the scan may run between them
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
    assertMemoryAccess(address, bytes.length, 'force', this.regionSizes());

    try {
      requireForceCommandConfirmation(await this.sendDebugCommand(`force set 0x${address.toString(16)} ${bytesToHex(bytes)}`));
    } catch {
      throw new Error('Force command confirmation failed');
    }
  }

  async clearForcedValue(address: number): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }
    assertMemoryAccess(address, 1, 'force', this.regionSizes());

    try {
      requireForceCommandConfirmation(await this.sendDebugCommand(`force clear 0x${address.toString(16)}`));
    } catch {
      throw new Error('Force command confirmation failed');
    }
  }

  async clearAllForcedValues(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    try {
      requireForceCommandConfirmation(await this.sendDebugCommand('force clear_all'));
    } catch {
      throw new Error('Force command confirmation failed');
    }
  }

  async listForcedValues(): Promise<WatchForceEntry[]> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    return parseForcedValues(await this.sendJsonCommand('zplc dbg force list'));
  }

  async getOPI(offset: number): Promise<number> {
    assertMemoryAccess(MEMORY_MAP.opi.baseAddress + offset, 1, 'read', this.regionSizes());
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

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const status = await this.getStatus();
    const forceEntries = await this.listForcedValues();
    const snapshot = normalizeSerialRuntimeSnapshot(status, forceEntries);
    this.events.onRuntimeSnapshot?.(snapshot);
    return snapshot;
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
    const result = (await this.sendJsonCommand('zplc dbg info')) as ExtendedVMInfo;
    return result;
  }

  async readWatchVariables(variables: WatchVariable[], options?: ReadWatchOptions): Promise<WatchVariable[]> {
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

      console.warn(
        `[mpeek] Capacity exceeded (entries=${requests.length}/${
          MPEEK_MAX_ENTRIES
        }, bytes=${totalBytes}/${MPEEK_MAX_BYTES}). Falling back to standard peek.`,
      );
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
      const response = (await this.sendJsonCommand('zplc dbg bp list')) as {
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
