/**
 * @file wasmAdapter.ts
 * @brief The adapter of the browser simulation: the WebAssembly runtime behind the session protocol (IDE-025).
 *
 * The runtime is the session of the native runtime built to WebAssembly with the loader's verifier (tools/wasm-core), so
 * the adapter of the native runtime drives it unchanged: the same requests, the same snapshots, the same breakpoints and
 * forces. What makes this the degraded fallback is what the module reports in its handshake (wasmCapabilities.ts): no
 * network blocks, no serial, no pins, and the timing of a browser.
 *
 * It is used where the native runtime is not: the web build of the IDE, a platform the native runtime was not built for,
 * and a desktop app whose native runtime cannot start (simulationAdapterFactory.ts).
 */
import { DEBUG_ADAPTER_TYPE } from './debugAdapter';
import { NativeAdapter } from './nativeAdapter';
import type { WasmRetainStorage } from './wasmCapabilities';
import { createWasmSimulationApi, type WasmRecordStore, type WasmSimulationApi } from './wasmRuntime';
import { loadShippedWasmRuntime } from './wasmRuntimeModule';

/** The browser runtime is on: a connection that cannot be made says why (a build without clang, for one). */
export const WASM_SIMULATION_ENABLED = true;

export interface WasmAdapterOptions {
  /** Where the RETAIN records go; the memory of the page when none is given. */
  records?: WasmRecordStore;
  /** What the capability profile says about where they go. */
  retainStorage?: WasmRetainStorage;
  /** The module file; the default is the one this build embedded. */
  loadModule?: () => Promise<Uint8Array>;
  /** Milliseconds, monotonic; the default is the clock of the page. */
  clock?: () => number;
  /** The virtual clock of scenario.step, for scenario tests; a simulation that a person drives leaves it off. */
  scenarioClock?: boolean;
}

export class WASMAdapter extends NativeAdapter {
  readonly transport: WasmSimulationApi;

  override get type(): typeof DEBUG_ADAPTER_TYPE.WASM {
    return DEBUG_ADAPTER_TYPE.WASM;
  }

  constructor(options: WasmAdapterOptions = {}) {
    const transport = createWasmSimulationApi({
      loadModule: options.loadModule ?? (async () => (await loadShippedWasmRuntime()).bytes),
      ...(options.records ? { records: options.records } : {}),
      ...(options.retainStorage ? { retainStorage: options.retainStorage } : {}),
      ...(options.clock ? { clock: options.clock } : {}),
      ...(options.scenarioClock ? { scenarioClock: true } : {}),
    });
    super(transport);
    this.transport = transport;
  }
}

/** Create and return a WebAssembly runtime adapter instance. */
export function createWASMAdapter(options?: WasmAdapterOptions): WASMAdapter {
  return new WASMAdapter(options);
}
