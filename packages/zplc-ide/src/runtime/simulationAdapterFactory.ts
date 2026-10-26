import type { IDebugAdapter } from './debugAdapter';
import { NativeAdapter } from './nativeAdapter';
import { openRecordStore } from './projectRecordStore';
import { WASMAdapter, type WasmAdapterOptions } from './wasmAdapter';

function hasNativeSimulationBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.nativeSimulation);
}

export function createSimulationAdapter(options: WasmAdapterOptions = {}): IDebugAdapter {
  if (hasNativeSimulationBridge()) {
    return new NativeAdapter();
  }

  return new WASMAdapter(options);
}

export interface SimulationOptions {
  /** The folder of the open project, where the browser runtime keeps its RETAIN records (RT-027); none keeps them in memory. */
  directory?: FileSystemDirectoryHandle | null;
  /** Where a notice about the runtime goes: the console of the IDE. */
  report?: (entry: { type: 'warning'; message: string; source: 'debugger' }) => void;
  /** The module file of the browser runtime; the default is the one this build embedded. */
  loadModule?: () => Promise<Uint8Array>;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connects the runtime a simulation runs on. The desktop app tries the native runtime first; when that cannot start
 * (no binary, a platform it was not built for, a handshake that failed) the WebAssembly runtime runs the simulation in its
 * place, and the console is told why, so that the degraded label has its reason (IDE-025). The web build has no native
 * runtime and goes straight to the browser one.
 */
export async function connectSimulationAdapter(options: SimulationOptions = {}): Promise<IDebugAdapter> {
  const report = (message: string) => options.report?.({ type: 'warning', message, source: 'debugger' });
  let nativeFailure: string | null = null;
  if (hasNativeSimulationBridge()) {
    const native = new NativeAdapter();
    try {
      await native.connect();
      return native;
    } catch (error) {
      nativeFailure = describe(error);
      await native.disconnect().catch(() => undefined);
    }
  }
  const { records, retainStorage } = await openRecordStore(options.directory ?? null, report);
  const browser = new WASMAdapter({ records, retainStorage, ...(options.loadModule ? { loadModule: options.loadModule } : {}) });
  try {
    await browser.connect();
  } catch (error) {
    throw new Error(
      nativeFailure === null ? describe(error) : `${nativeFailure} The WebAssembly runtime could not start either: ${describe(error)}`,
    );
  }
  if (nativeFailure !== null) {
    report(
      `Native simulation could not start: ${nativeFailure} Running the WebAssembly runtime instead: it is a degraded simulation with no ` +
        `network blocks and no serial, and its timing follows the app window.`,
    );
  }
  return browser;
}
