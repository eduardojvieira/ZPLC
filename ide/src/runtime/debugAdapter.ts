/**
 * @file debugAdapter.ts
 * @brief Debug Adapter Interface for ZPLC Runtime
 *
 * This module defines the interface that all debug adapters must implement.
 * It provides a unified API for controlling and inspecting the ZPLC VM,
 * whether running in WASM simulation or on real hardware via WebSerial.
 */

/**
 * VM execution state
 */
export type VMState = 'idle' | 'running' | 'paused' | 'error' | 'disconnected';

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

/**
 * ZPLC Memory Map
 */
export const MEMORY_MAP: Record<MemoryRegion, MemoryRegionInfo> = {
  ipi: { name: 'ipi', baseAddress: 0x0000, size: 4096, writable: true },
  opi: { name: 'opi', baseAddress: 0x1000, size: 4096, writable: false },
  work: { name: 'work', baseAddress: 0x2000, size: 8192, writable: true },
  retain: { name: 'retain', baseAddress: 0x4000, size: 4096, writable: true },
  code: { name: 'code', baseAddress: 0x5000, size: 45056, writable: false },
};

/**
 * Watch variable entry
 */
export interface WatchVariable {
  /** Variable name (for display) */
  name: string;
  /** Memory address */
  address: number;
  /** Data type */
  type: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'BYTE' | 'WORD' | 'DWORD';
  /** Current value (updated by polling) */
  value?: number | boolean;
  /** Whether value can be forced */
  forceable: boolean;
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
  readonly type: 'wasm' | 'serial';

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
  loadProgram(bytecode: Uint8Array): Promise<void>;

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
   * Get values for multiple watch variables
   * @param variables List of variables to read
   * @returns Updated variables with current values
   */
  readWatchVariables(variables: WatchVariable[]): Promise<WatchVariable[]>;

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
export function getTypeSize(type: WatchVariable['type']): number {
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
      return 4;
    default:
      return 1;
  }
}

/**
 * Convert raw bytes to a typed value
 */
export function bytesToValue(
  bytes: Uint8Array,
  type: WatchVariable['type']
): number | boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (type) {
    case 'BOOL':
      return bytes[0] !== 0;
    case 'BYTE':
      return bytes[0];
    case 'INT':
      return view.getInt16(0, true); // Little-endian
    case 'WORD':
      return view.getUint16(0, true);
    case 'DINT':
      return view.getInt32(0, true);
    case 'DWORD':
      return view.getUint32(0, true);
    case 'REAL':
      return view.getFloat32(0, true);
    default:
      return bytes[0];
  }
}

/**
 * Convert a typed value to bytes
 */
export function valueToBytes(
  value: number | boolean,
  type: WatchVariable['type']
): Uint8Array {
  const size = getTypeSize(type);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);

  const numValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;

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
      view.setInt32(0, numValue, true);
      break;
    case 'DWORD':
      view.setUint32(0, numValue, true);
      break;
    case 'REAL':
      view.setFloat32(0, numValue, true);
      break;
  }

  return bytes;
}

/**
 * Determine which memory region an address belongs to
 */
export function getMemoryRegion(address: number): MemoryRegion | null {
  if (address >= 0x0000 && address < 0x1000) return 'ipi';
  if (address >= 0x1000 && address < 0x2000) return 'opi';
  if (address >= 0x2000 && address < 0x4000) return 'work';
  if (address >= 0x4000 && address < 0x5000) return 'retain';
  if (address >= 0x5000 && address < 0x10000) return 'code';
  return null;
}
