/**
 * @file wasmAdapter.ts
 * @brief WASM Debug Adapter for ZPLC Runtime
 *
 * This adapter runs the ZPLC VM in the browser using WebAssembly.
 * It provides a simulation environment for testing PLC programs
 * without real hardware.
 *
 * The WASM module is built from the C core using Emscripten and
 * exposes functions via the Emscripten runtime.
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
import { loadZPLCModule, type EmscriptenModule } from './wasmLoader';

/**
 * WASM Debug Adapter
 *
 * Implements IDebugAdapter for running ZPLC programs in WebAssembly.
 */
export class WASMAdapter implements IDebugAdapter {
  readonly type = 'wasm' as const;

  private module: EmscriptenModule | null = null;
  private _connected = false;
  private _state: VMState = 'disconnected';
  private events: DebugAdapterEvents = {};
  private animationFrameId: number | null = null;
  private lastCycleTime = 0;
  private cycleTimeMs = 100; // Default 100ms cycle time

  // Virtual GPIO state
  private virtualInputs: number[] = [0, 0, 0, 0];
  private virtualOutputs: number[] = [0, 0, 0, 0];

  // Wrapped C functions — core lifecycle
  private coreInit: (() => number) | null = null;
  private coreShutdown: (() => number) | null = null;
  private coreLoadRaw: ((ptr: number, size: number) => number) | null = null;
  private coreRunCycle: (() => number) | null = null;
  private coreGetPc: (() => number) | null = null;
  private coreGetSp: (() => number) | null = null;
  private coreGetStack: ((index: number) => number) | null = null;
  private coreGetError: (() => number) | null = null;
  private coreIsHalted: (() => number) | null = null;
  private coreSetIpi: ((offset: number, value: number) => number) | null = null;
  private coreGetOpi: ((offset: number) => number) | null = null;
  private halInit: (() => number) | null = null;
  private wasmSetInput: ((channel: number, value: number) => void) | null = null;
  private wasmGetOutput: ((channel: number) => number) | null = null;

  // Wrapped C functions — typed memory access for all regions
  private ipiRead8: ((offset: number) => number) | null = null;
  private opiRead8: ((offset: number) => number) | null = null;
  private ipiWrite8: ((offset: number, value: number) => number) | null = null;
  private memGetRegion: ((base: number) => number) | null = null;

  // Wrapped C functions — breakpoints (delegated to C VM)
  private coreGetDefaultVm: (() => number) | null = null;
  private vmAddBreakpoint: ((vm: number, pc: number) => number) | null = null;
  private vmRemoveBreakpoint: ((vm: number, pc: number) => number) | null = null;
  private vmClearBreakpoints: ((vm: number) => number) | null = null;
  private vmIsPaused: ((vm: number) => number) | null = null;
  private vmResume: ((vm: number) => number) | null = null;
  private vmGetBreakpointCount: ((vm: number) => number) | null = null;
  private vmGetBreakpoint: ((vm: number, index: number) => number) | null = null;

  // Cycle counter (maintained locally since VM resets PC each cycle)
  private cycleCount = 0;

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

    // Load and initialize the WASM module
    try {
      this.module = await loadZPLCModule();
    } catch (error) {
      throw new Error(
        `Failed to load ZPLC WASM module: ${error instanceof Error ? error.message : error}`
      );
    }

    // Wrap C functions
    this.wrapFunctions();

    // Set up GPIO callbacks
    window.zplcOnGpioWrite = (channel: number, value: number) => {
      this.virtualOutputs[channel] = value;
      this.events.onGpioChange?.(channel, value);
    };

    window.zplcOnGpioRead = (channel: number) => {
      return this.virtualInputs[channel] ?? 0;
    };

    // Initialize HAL and core
    const halResult = this.halInit?.() ?? -1;
    if (halResult !== 0) {
      throw new Error(`HAL initialization failed: ${halResult}`);
    }

    const coreResult = this.coreInit?.() ?? -1;
    if (coreResult !== 0) {
      throw new Error(`Core initialization failed: ${coreResult}`);
    }

    this._connected = true;
    this.setState('idle');
  }

  async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }

    // Stop execution loop
    this.stopExecutionLoop();

    // Cleanup
    this.coreShutdown?.();

    // Remove callbacks
    window.zplcOnGpioWrite = undefined;
    window.zplcOnGpioRead = undefined;

    this.module = null;
    this._connected = false;
    this.setState('disconnected');
  }

  private wrapFunctions(): void {
    if (!this.module) return;

    const m = this.module;

    // Core lifecycle
    this.coreInit = m.cwrap('zplc_core_init', 'number', []) as () => number;
    this.coreShutdown = m.cwrap('zplc_core_shutdown', 'number', []) as () => number;
    this.coreLoadRaw = m.cwrap('zplc_core_load_raw', 'number', [
      'number',
      'number',
    ]) as (ptr: number, size: number) => number;
    this.coreRunCycle = m.cwrap('zplc_core_run_cycle', 'number', []) as () => number;
    this.coreGetPc = m.cwrap('zplc_core_get_pc', 'number', []) as () => number;
    this.coreGetSp = m.cwrap('zplc_core_get_sp', 'number', []) as () => number;
    this.coreGetStack = m.cwrap('zplc_core_get_stack', 'number', [
      'number',
    ]) as (index: number) => number;
    this.coreGetError = m.cwrap('zplc_core_get_error', 'number', []) as () => number;
    this.coreIsHalted = m.cwrap('zplc_core_is_halted', 'number', []) as () => number;
    this.coreSetIpi = m.cwrap('zplc_core_set_ipi', 'number', [
      'number',
      'number',
    ]) as (offset: number, value: number) => number;
    this.coreGetOpi = m.cwrap('zplc_core_get_opi', 'number', [
      'number',
    ]) as (offset: number) => number;
    this.halInit = m.cwrap('zplc_hal_init', 'number', []) as () => number;
    this.wasmSetInput = m.cwrap('zplc_wasm_set_input', null, [
      'number',
      'number',
    ]) as (channel: number, value: number) => void;
    this.wasmGetOutput = m.cwrap('zplc_wasm_get_output', 'number', [
      'number',
    ]) as (channel: number) => number;

    // Typed memory access for all regions
    this.ipiRead8 = m.cwrap('zplc_ipi_read8', 'number', ['number']) as (offset: number) => number;
    this.opiRead8 = m.cwrap('zplc_opi_read8', 'number', ['number']) as (offset: number) => number;
    this.ipiWrite8 = m.cwrap('zplc_ipi_write8', 'number', ['number', 'number']) as (offset: number, value: number) => number;
    this.memGetRegion = m.cwrap('zplc_mem_get_region', 'number', ['number']) as (base: number) => number;

    // Breakpoints — delegate to C VM for proper instruction-level checking
    this.coreGetDefaultVm = m.cwrap('zplc_core_get_default_vm', 'number', []) as () => number;
    this.vmAddBreakpoint = m.cwrap('zplc_vm_add_breakpoint', 'number', ['number', 'number']) as (vm: number, pc: number) => number;
    this.vmRemoveBreakpoint = m.cwrap('zplc_vm_remove_breakpoint', 'number', ['number', 'number']) as (vm: number, pc: number) => number;
    this.vmClearBreakpoints = m.cwrap('zplc_vm_clear_breakpoints', 'number', ['number']) as (vm: number) => number;
    this.vmIsPaused = m.cwrap('zplc_vm_is_paused', 'number', ['number']) as (vm: number) => number;
    this.vmResume = m.cwrap('zplc_vm_resume', 'number', ['number']) as (vm: number) => number;
    this.vmGetBreakpointCount = m.cwrap('zplc_vm_get_breakpoint_count', 'number', ['number']) as (vm: number) => number;
    this.vmGetBreakpoint = m.cwrap('zplc_vm_get_breakpoint', 'number', ['number', 'number']) as (vm: number, index: number) => number;
  }

  // =========================================================================
  // Program Loading
  // =========================================================================

  async loadProgram(bytecode: Uint8Array): Promise<void> {
    if (!this._connected || !this.module) {
      throw new Error('Not connected');
    }

    // Stop any running execution
    this.stopExecutionLoop();

    // Allocate memory for bytecode
    const ptr = this.module._malloc(bytecode.length);
    if (ptr === 0) {
      throw new Error('Failed to allocate memory for bytecode');
    }

    try {
      // Copy bytecode to WASM memory
      this.module.HEAPU8.set(bytecode, ptr);

      // Re-initialize core
      this.coreInit?.();

      // Load the program
      const result = this.coreLoadRaw?.(ptr, bytecode.length) ?? -1;
      if (result !== 0) {
        throw new Error(`Failed to load program: ${result}`);
      }

      // Reset state but preserve breakpoints (user might want to debug same program)
      this.cycleCount = 0;

      this.setState('idle');
    } finally {
      this.module._free(ptr);
    }
  }

  // =========================================================================
  // Execution Control
  // =========================================================================

  async start(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    this.setState('running');
    this.startExecutionLoop();
  }

  async stop(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    this.stopExecutionLoop();

    // Reset outputs
    for (let i = 0; i < 4; i++) {
      this.virtualOutputs[i] = 0;
      this.events.onGpioChange?.(i, 0);
    }

    this.setState('idle');
  }

  async pause(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    this.stopExecutionLoop();
    this.setState('paused');
  }

  async resume(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    this.setState('running');
    this.startExecutionLoop();
  }

  async step(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    // Ensure we're paused
    this.stopExecutionLoop();

    // Execute one cycle
    this.executeCycle();

    this.setState('paused');
  }

  async reset(): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    this.stopExecutionLoop();

    // Re-initialize core
    this.coreInit?.();

    // Reset outputs
    for (let i = 0; i < 4; i++) {
      this.virtualOutputs[i] = 0;
      this.events.onGpioChange?.(i, 0);
    }

    // Reset inputs
    this.virtualInputs = [0, 0, 0, 0];

    // Clear breakpoints on reset
    await this.clearBreakpoints();

    this.cycleCount = 0;

    this.setState('idle');
  }

  private startExecutionLoop(): void {
    if (this.animationFrameId !== null) {
      return;
    }

    this.lastCycleTime = performance.now();

    const loop = (timestamp: number) => {
      if (this._state !== 'running') {
        this.animationFrameId = null;
        return;
      }

      // Check if enough time has passed for next cycle
      const elapsed = timestamp - this.lastCycleTime;
      if (elapsed >= this.cycleTimeMs) {
        this.executeCycle();
        this.lastCycleTime = timestamp;
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopExecutionLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private executeCycle(): void {
    // Update virtual inputs to IPI via WASM HAL
    for (let i = 0; i < this.virtualInputs.length; i++) {
      this.wasmSetInput?.(i, this.virtualInputs[i]);
    }

    // If VM was paused at a breakpoint, resume before running next cycle
    const vm = this.coreGetDefaultVm?.() ?? 0;
    if (vm && this.vmIsPaused?.(vm)) {
      this.vmResume?.(vm);
    }

    // Run one PLC cycle — the C VM checks breakpoints internally
    const result = this.coreRunCycle?.() ?? -1;

    if (result < 0) {
      const error = this.coreGetError?.() ?? -1;
      this.events.onError?.(`VM error: ${error}`);
      this.stopExecutionLoop();
      this.setState('error');
      return;
    }

    this.cycleCount++;

    // Check if VM hit a breakpoint during this cycle
    if (vm && this.vmIsPaused?.(vm)) {
      const pc = this.coreGetPc?.() ?? 0;
      this.stopExecutionLoop();
      this.setState('paused');
      this.events.onBreakpointHit?.(pc);
      return;
    }

    // Read virtual outputs
    for (let i = 0; i < 4; i++) {
      const value = this.wasmGetOutput?.(i) ?? 0;
      if (value !== this.virtualOutputs[i]) {
        this.virtualOutputs[i] = value;
        this.events.onGpioChange?.(i, value);
      }
    }

    // Emit info update
    this.getInfo().then((info) => {
      this.events.onInfoUpdate?.(info);
    });
  }

  // =========================================================================
  // Memory Access
  // =========================================================================

  /**
   * Read bytes from any memory region via WASM.
   * Uses typed C API for IPI/OPI, and direct HEAPU8 access
   * via zplc_mem_get_region() for WORK/RETAIN.
   */
  async peek(address: number, length: number): Promise<Uint8Array> {
    if (!this._connected || !this.module) {
      throw new Error('Not connected');
    }

    const result = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
      const addr = address + i;
      let byte = 0;

      if (addr < 0x1000) {
        // IPI region (0x0000-0x0FFF)
        byte = (this.ipiRead8?.(addr) ?? 0) & 0xff;
      } else if (addr < 0x2000) {
        // OPI region (0x1000-0x1FFF)
        byte = (this.opiRead8?.(addr - 0x1000) ?? 0) & 0xff;
      } else if (addr < 0x4000) {
        // WORK region (0x2000-0x3FFF) — read via HEAPU8 + region pointer
        byte = this.readRegionByte(0x2000, addr - 0x2000);
      } else if (addr < 0x5000) {
        // RETAIN region (0x4000-0x4FFF) — read via HEAPU8 + region pointer
        byte = this.readRegionByte(0x4000, addr - 0x4000);
      }
      // addr >= 0x5000 is CODE region — read-only, could add later

      result[i] = byte;
    }

    return result;
  }

  /**
   * Read a single byte from a memory region using HEAPU8 + zplc_mem_get_region.
   * The C function returns a pointer into WASM linear memory.
   */
  private readRegionByte(base: number, offset: number): number {
    if (!this.module || !this.memGetRegion) return 0;

    const regionPtr = this.memGetRegion(base);
    if (regionPtr === 0) return 0;

    return this.module.HEAPU8[regionPtr + offset] ?? 0;
  }

  /**
   * Write a single byte to a memory region using HEAPU8 + zplc_mem_get_region.
   */
  private writeRegionByte(base: number, offset: number, value: number): void {
    if (!this.module || !this.memGetRegion) return;

    const regionPtr = this.memGetRegion(base);
    if (regionPtr === 0) return;

    this.module.HEAPU8[regionPtr + offset] = value & 0xff;
  }

  /**
   * Write to any writable memory region.
   * Supports IPI (typed 8/16/32-bit), WORK, and RETAIN.
   */
  async poke(address: number, value: number): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    if (address >= 0 && address < 0x1000) {
      // IPI — use typed 8-bit write
      this.ipiWrite8?.(address, value & 0xff);
    } else if (address >= 0x2000 && address < 0x4000) {
      // WORK region — direct HEAPU8 write
      this.writeRegionByte(0x2000, address - 0x2000, value);
    } else if (address >= 0x4000 && address < 0x5000) {
      // RETAIN region — direct HEAPU8 write
      this.writeRegionByte(0x4000, address - 0x4000, value);
    } else {
      throw new Error(
        `Cannot write to address 0x${address.toString(16)}: region not writable`
      );
    }
  }

  async pokeN(address: number, bytes: Uint8Array): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    for (let i = 0; i < bytes.length; i++) {
      const addr = address + i;
      const val = bytes[i];

      if (addr >= 0 && addr < 0x1000) {
        this.ipiWrite8?.(addr, val);
      } else if (addr >= 0x2000 && addr < 0x4000) {
        this.writeRegionByte(0x2000, addr - 0x2000, val);
      } else if (addr >= 0x4000 && addr < 0x5000) {
        this.writeRegionByte(0x4000, addr - 0x4000, val);
      }
    }
  }

  async getOPI(offset: number): Promise<number> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    return (this.coreGetOpi?.(offset) ?? 0) & 0xff;
  }

  async setIPI(offset: number, value: number): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    this.coreSetIpi?.(offset, value & 0xff);
  }

  // =========================================================================
  // State Inspection
  // =========================================================================

  async getInfo(): Promise<VMInfo> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const sp = this.coreGetSp?.() ?? 0;
    const pc = this.coreGetPc?.() ?? 0;
    const halted = (this.coreIsHalted?.() ?? 0) !== 0;
    const error = this.coreGetError?.() ?? 0;
    const tos = sp > 0 ? this.coreGetStack?.(sp - 1) ?? 0 : undefined;



    return {
      pc,
      sp,
      halted,
      cycles: this.cycleCount,
      error,
      tos,
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
  // GPIO Simulation
  // =========================================================================

  async setVirtualInput(channel: number, value: number): Promise<void> {
    if (channel >= 0 && channel < this.virtualInputs.length) {
      this.virtualInputs[channel] = value ? 1 : 0;
    }
  }

  async getVirtualOutput(channel: number): Promise<number> {
    if (channel >= 0 && channel < this.virtualOutputs.length) {
      return this.virtualOutputs[channel];
    }
    return 0;
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
  // Breakpoint Management — delegated to C VM for proper instruction checking
  // =========================================================================

  async setBreakpoint(pc: number): Promise<boolean> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const vm = this.coreGetDefaultVm?.() ?? 0;
    if (!vm) return false;

    const result = this.vmAddBreakpoint?.(vm, pc) ?? -1;
    return result === 0;
  }

  async removeBreakpoint(pc: number): Promise<boolean> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    const vm = this.coreGetDefaultVm?.() ?? 0;
    if (!vm) return false;

    const result = this.vmRemoveBreakpoint?.(vm, pc) ?? -1;
    return result === 0;
  }

  async clearBreakpoints(): Promise<void> {
    const vm = this.coreGetDefaultVm?.() ?? 0;
    if (vm) {
      this.vmClearBreakpoints?.(vm);
    }
  }

  async getBreakpoints(): Promise<number[]> {
    const vm = this.coreGetDefaultVm?.() ?? 0;
    if (!vm) return [];

    const count = this.vmGetBreakpointCount?.(vm) ?? 0;
    const breakpoints: number[] = [];
    for (let i = 0; i < count; i++) {
      const pc = this.vmGetBreakpoint?.(vm, i) ?? 0xFFFF;
      if (pc !== 0xFFFF) {
        breakpoints.push(pc);
      }
    }
    return breakpoints;
  }

  async hasBreakpoint(pc: number): Promise<boolean> {
    const breakpoints = await this.getBreakpoints();
    return breakpoints.includes(pc);
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * Set the cycle time for simulation
   * @param ms Cycle time in milliseconds
   */
  setCycleTime(ms: number): void {
    this.cycleTimeMs = Math.max(10, ms); // Minimum 10ms
  }

  /**
   * Get the current cycle time
   */
  getCycleTime(): number {
    return this.cycleTimeMs;
  }
}

/**
 * Create and return a WASM adapter instance
 */
export function createWASMAdapter(): WASMAdapter {
  return new WASMAdapter();
}
