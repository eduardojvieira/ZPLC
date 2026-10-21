/**
 * @file debugAdapter.ts
 * @brief Debug Adapter Interface for ZPLC Runtime
 *
 * This module defines the interface that all debug adapters must implement.
 * It provides a unified API for controlling and inspecting the ZPLC VM,
 * whether running in WASM simulation or on real hardware via WebSerial.
 */

import { ZPLC_CONTRACT } from '@zplc/compiler';

/**
 * VM execution state
 */
export type VMState = 'idle' | 'running' | 'paused' | 'error' | 'disconnected';

export const DEBUG_ADAPTER_TYPE = {
  WASM: 'wasm',
  SERIAL: 'serial',
  NATIVE: 'native',
} as const;

export type DebugAdapterType = (typeof DEBUG_ADAPTER_TYPE)[keyof typeof DEBUG_ADAPTER_TYPE];

/**
 * VM information snapshot
 */
export interface VMInfo {
  /** Program counter */
  pc: number;
  /** Stack pointer */
  sp: number;
  /** Whether VM is halted */
  halted: boolean;
  /** Cycle counter */
  cycles: number;
  /** Last error code (0 = no error) */
  error: number;
  /** Top of stack value (if sp > 0) */
  tos?: number;
}

/**
 * Memory region identifiers
 */
export type MemoryRegion = 'ipi' | 'opi' | 'work' | 'retain' | 'code';

/**
 * Memory region information
 */
export interface MemoryRegionInfo {
  name: MemoryRegion;
  baseAddress: number;
  size: number;
  writable: boolean;
}

const REGION = ZPLC_CONTRACT.MEMORY_REGION;

/**
 * ZPLC Memory Map
 *
 * Bases and sizes come from the generated contract (tools/contract/contract.json),
 * the source of zplc_isa.h; only the writable flag is the IDE's own.
 */
export const MEMORY_MAP: Record<MemoryRegion, MemoryRegionInfo> = {
  ipi: { name: 'ipi', baseAddress: REGION.IPI.base, size: REGION.IPI.size, writable: true },
  opi: { name: 'opi', baseAddress: REGION.OPI.base, size: REGION.OPI.size, writable: false },
  work: { name: 'work', baseAddress: REGION.WORK.base, size: REGION.WORK.size, writable: true },
  retain: { name: 'retain', baseAddress: REGION.RETAIN.base, size: REGION.RETAIN.size, writable: true },
  code: { name: 'code', baseAddress: REGION.CODE.base, size: REGION.CODE.size, writable: false },
};

/** End of the 16-bit address space the VM addresses (one past the last byte). */
const ADDRESS_SPACE_END = 0x10000;

/**
 * Watch variable entry
 */
export interface WatchVariable {
  /** Variable name (for display) */
  name: string;
  /** Memory address */
  address: number;
  /** Bit offset for bit-addressed BOOL variables */
  bitOffset?: number;
  /**
   * Data type. LINT, ULINT and LWORD are 8 bytes and LREAL is an IEEE 754 double: a 64-bit integer is a
   * number while it is exact as one (within 2^53) and its decimal text beyond (see bytesToValue).
   */
  type: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'BYTE' | 'WORD' | 'DWORD' | 'TIME' | 'STRING' | 'LINT' | 'ULINT' | 'LWORD' | 'LREAL';
  /** Current value (updated by polling) */
  value?: number | boolean | string;
  /** Whether value can be forced */
  forceable: boolean;
  /** For STRING: max length */
  maxLength?: number;
}

export const WATCH_FORCE_STATE = {
  IDLE: 'idle',
  FORCED: 'forced',
  PENDING: 'pending',
  UNCONFIRMED: 'unconfirmed',
} as const;

export type WatchForceState = (typeof WATCH_FORCE_STATE)[keyof typeof WATCH_FORCE_STATE];

export interface WatchForceEntry {
  path: string;
  address: number;
  size?: number;
  type: WatchVariable['type'];
  bytesHex: string;
  maxLength?: number;
  state: WatchForceState;
}

export const RUNTIME_SESSION_SOURCE = {
  NATIVE: 'native',
  SERIAL: 'serial',
  WASM: 'wasm',
} as const;

export type RuntimeSessionSource = (typeof RUNTIME_SESSION_SOURCE)[keyof typeof RUNTIME_SESSION_SOURCE];

export interface RuntimeTaskSnapshot {
  taskId: number;
  state: string;
  cycles: number;
  overruns: number;
  intervalUs: number;
  priority: number;
  pc: number;
  sp: number;
  halted: boolean;
  error: number;
  name?: string;
}

export interface RuntimeSnapshotStats {
  cycles: number;
  activeTasks: number;
  overruns: number;
  programSize: number;
}

export interface RuntimeHostCadence {
  kind: 'observed_poll_cadence';
  missedIntervals: number;
  lastDispatchLatenessMs: number;
}

export interface RuntimeSnapshot {
  source: RuntimeSessionSource;
  state: VMState;
  uptimeMs: number;
  stats: RuntimeSnapshotStats;
  hostCadence?: RuntimeHostCadence;
  focusedVm: VMInfo | null;
  tasks: RuntimeTaskSnapshot[];
  opi: number[];
  /** Native POSIX process-input image; absent for serial and WASM sessions. */
  ipi?: number[];
  /** Native POSIX program activation generation; absent for serial and WASM sessions. */
  programGeneration?: number;
  forceEntries: WatchForceEntry[];
}

/**
 * Event callbacks for debug adapter
 */
export interface DebugAdapterEvents {
  /** Called when VM state changes */
  onStateChange?: (state: VMState) => void;
  /** Called when a GPIO output changes */
  onGpioChange?: (channel: number, value: number) => void;
  /** Called when an error occurs */
  onError?: (message: string) => void;
  /** Called when VM info is updated */
  onInfoUpdate?: (info: VMInfo) => void;
  /** Called when execution hits a breakpoint */
  onBreakpointHit?: (pc: number, line?: number) => void;
  /** Called when a single step completes */
  onStepComplete?: (pc: number) => void;
  /** Called when raw serial/device output is observed during a connected session */
  onSerialData?: (line: string) => void;
  /** Called when a normalized runtime snapshot becomes available */
  onRuntimeSnapshot?: (snapshot: RuntimeSnapshot) => void;
  /** Called when adapter capability state changes */
  onCapabilitiesChange?: () => void;
}

export interface LoadProgramOptions {
  trace?: import('./uploadTrace').UploadTraceCallback;
}

/**
 * Options for readWatchVariables
 */
export interface ReadWatchOptions {
  /**
   * Whether to use the mpeek fast-path (serial adapter only).
   * Defaults to false. Only enable when the firmware has been reflashed
   * with `zplc dbg mpeek` support.
   */
  useMpeek?: boolean;
}

/**
 * Debug Adapter Interface
 *
 * All debug adapters (WASM, WebSerial) must implement this interface.
 */
export interface IDebugAdapter {
  /**
   * Get the adapter type identifier
   */
  readonly type: DebugAdapterType;

  /**
   * Get current connection state
   */
  readonly connected: boolean;

  /**
   * Get current VM state
   */
  readonly state: VMState;

  // =========================================================================
  // Connection Management
  // =========================================================================

  /**
   * Connect to the runtime
   * @returns Promise that resolves when connected
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the runtime
   */
  disconnect(): Promise<void>;

  // =========================================================================
  // Program Loading
  // =========================================================================

  /**
   * Load bytecode into the VM
   * @param bytecode Raw bytecode bytes
   * @returns Promise that resolves when loaded
   */
  loadProgram(bytecode: Uint8Array, options?: LoadProgramOptions): Promise<void>;

  // =========================================================================
  // Execution Control
  // =========================================================================

  /**
   * Start/resume VM execution
   */
  start(): Promise<void>;

  /**
   * Stop VM execution
   */
  stop(): Promise<void>;

  /**
   * Pause VM at next cycle boundary
   */
  pause(): Promise<void>;

  /**
   * Resume from paused state
   */
  resume(): Promise<void>;

  /**
   * Execute exactly one PLC cycle
   */
  step(): Promise<void>;

  /**
   * Reset VM to initial state
   */
  reset(): Promise<void>;

  // =========================================================================
  // Memory Access
  // =========================================================================

  /**
   * Read memory from the VM
   * @param address Starting address
   * @param length Number of bytes to read
   * @returns Promise with memory contents
   */
  peek(address: number, length: number): Promise<Uint8Array>;

  /**
   * Write a byte to VM memory (IPI only for forcing inputs)
   * @param address Memory address
   * @param value Byte value to write
   */
  poke(address: number, value: number): Promise<void>;

  /**
   * Write multiple bytes to VM memory.
   * @param address Starting memory address
   * @param bytes Raw bytes to write (in order, little-endian)
   */
  pokeN(address: number, bytes: Uint8Array): Promise<void>;

  /**
   * Write multiple bytes once without enabling runtime force semantics.
   */
  setValue(address: number, bytes: Uint8Array): Promise<void>;

  /**
   * Force multiple bytes in the runtime until explicitly cleared.
   */
  forceValue(address: number, bytes: Uint8Array): Promise<void>;

  /**
   * Clear a forced value by its starting address.
   */
  clearForcedValue(address: number): Promise<void>;

  /**
   * Clear all active forced values.
   */
  clearAllForcedValues(): Promise<void>;

  /**
   * List active force entries, if supported by the adapter/runtime.
   */
  listForcedValues(): Promise<WatchForceEntry[]>;

  /**
   * Get a single OPI byte value
   * @param offset Byte offset within OPI (0-4095)
   */
  getOPI(offset: number): Promise<number>;

  /**
   * Set a single IPI byte value (for forcing inputs)
   * @param offset Byte offset within IPI (0-4095)
   * @param value Byte value
   */
  setIPI(offset: number, value: number): Promise<void>;

  // =========================================================================
  // State Inspection
  // =========================================================================

  /**
   * Get current VM information
   */
  getInfo(): Promise<VMInfo>;

  /**
   * Get a normalized runtime snapshot for workflow parity.
   */
  getRuntimeSnapshot(): Promise<RuntimeSnapshot>;

  /**
   * Get values for multiple watch variables
   * @param variables List of variables to read
   * @returns Updated variables with current values
   */
  readWatchVariables(variables: WatchVariable[], options?: ReadWatchOptions): Promise<WatchVariable[]>;

  // =========================================================================
  // GPIO Simulation (for WASM adapter)
  // =========================================================================

  /**
   * Set a virtual input value (simulates button press)
   * @param channel Input channel (0-3)
   * @param value Input value (0 or 1)
   */
  setVirtualInput(channel: number, value: number): Promise<void>;

  /**
   * Get a virtual output value
   * @param channel Output channel (0-3)
   */
  getVirtualOutput(channel: number): Promise<number>;

  // =========================================================================
  // Breakpoint Management
  // =========================================================================

  /**
   * Set a breakpoint at a specific program counter address.
   * When execution reaches this PC, the VM will pause.
   * @param pc Program counter address for the breakpoint
   * @returns True if breakpoint was set successfully
   */
  setBreakpoint(pc: number): Promise<boolean>;

  /**
   * Remove a breakpoint at a specific program counter address.
   * @param pc Program counter address of the breakpoint to remove
   * @returns True if breakpoint was removed successfully
   */
  removeBreakpoint(pc: number): Promise<boolean>;

  /**
   * Clear all breakpoints.
   */
  clearBreakpoints(): Promise<void>;

  /**
   * Get list of currently set breakpoint addresses.
   * @returns Array of PC addresses with active breakpoints
   */
  getBreakpoints(): Promise<number[]>;

  /**
   * Check if a breakpoint is set at a specific address.
   * @param pc Program counter address to check
   */
  hasBreakpoint(pc: number): Promise<boolean>;

  // =========================================================================
  // Event Handling
  // =========================================================================

  /**
   * Register event callbacks
   */
  setEventHandlers(events: DebugAdapterEvents): void;

  /**
   * Remove event callbacks
   */
  clearEventHandlers(): void;
}

/**
 * Get the size in bytes for a variable type
 */
export function getTypeSize(type: WatchVariable['type'], maxLength?: number): number {
  switch (type) {
    case 'BOOL':
    case 'BYTE':
      return 1;
    case 'INT':
    case 'WORD':
      return 2;
    case 'DINT':
    case 'DWORD':
    case 'REAL':
    case 'TIME':
      return 4;
    case 'LINT':
    case 'ULINT':
    case 'LWORD':
    case 'LREAL':
      return 8;
    case 'STRING':
      // String: 2-byte length prefix + content + null terminator
      // Default max length is 255 if not specified
      return 2 + (maxLength ?? 255) + 1;
    default:
      return 1;
  }
}

/** The largest integer a JavaScript number holds exactly. */
const MAX_SAFE_WIDE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Convert raw bytes to a typed value
 */
export function bytesToValue(bytes: Uint8Array, type: WatchVariable['type'], bitOffset?: number): number | boolean | string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (type) {
    case 'BOOL':
      if (bitOffset !== undefined) {
        return ((bytes[0] >> bitOffset) & 0x01) !== 0;
      }
      return bytes[0] !== 0;
    case 'BYTE':
      return bytes[0];
    case 'INT':
      return view.getInt16(0, true); // Little-endian
    case 'WORD':
      return view.getUint16(0, true);
    case 'DINT':
    case 'TIME':
      return view.getInt32(0, true);
    case 'DWORD':
      return view.getUint32(0, true);
    case 'REAL':
      return view.getFloat32(0, true);
    case 'LREAL':
      return view.getFloat64(0, true);
    case 'LINT':
    case 'ULINT':
    case 'LWORD': {
      // 64 bits are not all exact as a JavaScript number: within 2^53 the value is a number (it compares,
      // sums and plots as one), beyond it its decimal text, which keeps every bit
      const wide = type === 'LINT' ? view.getBigInt64(0, true) : view.getBigUint64(0, true);
      return wide >= -MAX_SAFE_WIDE && wide <= MAX_SAFE_WIDE ? Number(wide) : wide.toString();
    }
    case 'STRING': {
      // String format: 2-byte length + content
      if (bytes.length < 2) return '';
      const length = view.getUint16(0, true);
      if (length === 0 || bytes.length < 2 + length) return '';
      // Decode UTF-8 content
      const contentBytes = bytes.slice(2, 2 + length);
      return new TextDecoder('utf-8').decode(contentBytes);
    }
    default:
      return bytes[0];
  }
}

/**
 * Convert a typed value to bytes
 */
export function valueToBytes(value: number | boolean | string, type: WatchVariable['type'], maxLength?: number): Uint8Array {
  // Handle string separately
  if (type === 'STRING') {
    const strValue = String(value);
    const maxLen = maxLength ?? 255;
    const truncated = strValue.slice(0, maxLen);
    const encoded = new TextEncoder().encode(truncated);
    const bytes = new Uint8Array(2 + encoded.length + 1);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, encoded.length, true);
    bytes.set(encoded, 2);
    bytes[2 + encoded.length] = 0; // Null terminator
    return bytes;
  }

  const size = getTypeSize(type);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);

  const numValue = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);

  switch (type) {
    case 'BOOL':
    case 'BYTE':
      bytes[0] = numValue & 0xff;
      break;
    case 'INT':
      view.setInt16(0, numValue, true);
      break;
    case 'WORD':
      view.setUint16(0, numValue, true);
      break;
    case 'DINT':
    case 'TIME':
      view.setInt32(0, numValue, true);
      break;
    case 'DWORD':
      view.setUint32(0, numValue, true);
      break;
    case 'REAL':
      view.setFloat32(0, numValue, true);
      break;
    case 'LREAL':
      view.setFloat64(0, numValue, true);
      break;
    case 'LINT':
    case 'ULINT':
    case 'LWORD': {
      // the value of a 64-bit integer may be its decimal text (beyond 2^53): read it as an integer, not through a double
      const wide = typeof value === 'string' ? BigInt(value.trim() === '' ? 0 : value.trim()) : BigInt(Math.trunc(numValue));
      view.setBigUint64(0, BigInt.asUintN(64, wide), true);
      break;
    }
  }

  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

/**
 * Determine which memory region an address belongs to
 */
export function getMemoryRegion(address: number): MemoryRegion | null {
  const { ipi, opi, work, retain, code } = MEMORY_MAP;
  if (address >= ipi.baseAddress && address < opi.baseAddress) return 'ipi';
  if (address >= opi.baseAddress && address < work.baseAddress) return 'opi';
  if (address >= work.baseAddress && address < retain.baseAddress) return 'work';
  if (address >= retain.baseAddress && address < code.baseAddress) return 'retain';
  if (address >= code.baseAddress && address < ADDRESS_SPACE_END) return 'code';
  return null;
}

/**
 * Bounds a forced range has to stay inside: the region that holds the address,
 * where RETAIN runs up to the start of CODE (the runtime force table rule).
 */
export function getForceRegionBounds(address: number): { start: number; end: number } {
  const { ipi, opi, work, retain, code } = MEMORY_MAP;
  if (address < opi.baseAddress) return { start: ipi.baseAddress, end: opi.baseAddress };
  if (address < work.baseAddress) return { start: opi.baseAddress, end: work.baseAddress };
  if (address < retain.baseAddress) return { start: work.baseAddress, end: retain.baseAddress };
  return { start: retain.baseAddress, end: code.baseAddress };
}
