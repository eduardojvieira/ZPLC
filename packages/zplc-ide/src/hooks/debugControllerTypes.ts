/**
 * The state the debug controller exposes and the actions it offers: the contract of `useDebugController`.
 */
import type { DebugMap } from '../compiler';
import type { DebugCapabilities } from '../runtime/debugCapabilities';
import type { IDebugAdapter, VMState, WatchVariable } from '../runtime/debugAdapter';
import type { SystemInfo } from '../runtime/serialAdapter';

export interface DebugControllerState {
  /** Current debug adapter instance */
  adapter: IDebugAdapter | null;
  /** Current VM state */
  vmState: VMState;
  /** Current VM info (PC, SP, cycles, etc.) */
  /** Whether currently polling for live values */
  isPolling: boolean;
  /** Last error message */
  lastError: string | null;
  /** Capability model for the active adapter/runtime */
  debugCapabilities: DebugCapabilities | null;
}

export interface DebugControllerActions {
  /** Start simulation mode with the local runtime adapter */
  startSimulation: () => Promise<void>;
  /** Connect to hardware via WebSerial */
  connectHardware: () => Promise<void>;
  /** Disconnect from current adapter */
  disconnect: () => Promise<void>;
  /** Load bytecode into the adapter */
  loadProgram: (bytecode: Uint8Array, debugMap?: DebugMap, projectBoard?: string) => Promise<void>;
  /** Start/resume execution */
  start: () => Promise<void>;
  /** Stop execution */
  stop: () => Promise<void>;
  /** Pause execution */
  pause: () => Promise<void>;
  /** Resume from pause */
  resume: () => Promise<void>;
  /** Execute single step */
  step: () => Promise<void>;
  /** Reset VM */
  reset: () => Promise<void>;
  /** Force a value in IPI */
  setValue: (
    address: number,
    value: number | boolean | string,
    type: WatchVariable['type'],
    maxLength?: number
  ) => Promise<void>;
  /** Enable or disable a runtime-owned forced value (a release needs no value, a force needs one) */
  toggleForceValue: (
    path: string,
    address: number,
    value: number | boolean | string | null,
    type: WatchVariable['type'],
    force: boolean,
    maxLength?: number
  ) => Promise<void>;
  /** Clear all forced values before disconnecting */
  clearAllForcedValues: () => Promise<void>;
  /** Set virtual input (WASM only) */
  setVirtualInput: (channel: number, value: number) => Promise<void>;
  /** Get virtual output (WASM only) */
  getVirtualOutput: (channel: number) => Promise<number>;
  /** Stage a closed native-POSIX simulation input and publish its observed snapshot. */
  setSimulationInput: (inputId: 'motor.start' | 'motor.stop' | 'motor.estop', active: boolean) => Promise<void>;
  /** Current hardware handshake cache only; no serial transport is exposed. */
  getHardwareSystemInfo: () => Readonly<SystemInfo> | null;
}

export type DebugController = DebugControllerState & DebugControllerActions;
