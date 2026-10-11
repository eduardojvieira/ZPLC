/**
 * The runtime of the browser simulation: the module that tools/wasm-core builds, instantiated, and the session
 * protocol of the native runtime over it (IDE-025).
 *
 * The module is the session of firmware/apps/posix_host compiled to WebAssembly, so it answers the same request
 * lines (`session.hello`, `program.load`, `execution.start`, ...) with the same response and event lines. This file
 * is the host: it supplies the five imports the module has (a clock, the three persistence calls, a log line),
 * writes a request into the module, reads what it answered and polls it the way the native process's main loop does.
 * `createWasmSimulationApi` presents all of that as the transport that NativeAdapter already speaks, so the adapter,
 * the controller and the panels have one implementation of a simulation session, not two.
 *
 * Nothing here is Electron or DOM specific: the file runs in a renderer, in a worker and under Bun.
 */
import type { NativeSimulationApi } from './nativeAdapter';
import type { NativeCapabilityProfile } from './nativeProtocol';
import { WASM_RUNTIME_KIND, wasmCapabilityProfile, type WasmRetainStorage } from './wasmCapabilities';

// ---------------------------------------------------------------------------------------------------------------------
// The records the module persists
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Where the module's persistence imports (zplc_hal_persist_*) are served from. Synchronous, because the module is: a
 * store that writes elsewhere keeps its own copy and flushes it behind.
 */
export interface WasmRecordStore {
  get(key: string): Uint8Array | undefined;
  set(key: string, bytes: Uint8Array): void;
  /** True when the key was stored. */
  delete(key: string): boolean;
  /** Resolves when what was set has reached its storage, for a store that writes behind. */
  flush?(): Promise<void>;
}

export class MemoryRecordStore implements WasmRecordStore {
  private readonly records = new Map<string, Uint8Array>();

  get(key: string): Uint8Array | undefined {
    return this.records.get(key);
  }

  set(key: string, bytes: Uint8Array): void {
    this.records.set(key, new Uint8Array(bytes));
  }

  delete(key: string): boolean {
    return this.records.delete(key);
  }
}

/** The result codes of zplc_hal_result_t that the persistence imports return. */
const HAL_OK = 0;
const HAL_ERROR = -1;
const HAL_NOT_FOUND = -4;
const HAL_CORRUPT = -5;

// ---------------------------------------------------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------------------------------------------------

export interface WasmRuntimeHost {
  /** Milliseconds, monotonic. The default is the clock of the page. */
  clock?: () => number;
  /** The records of the module. The default is the memory of this object. */
  records?: WasmRecordStore;
  /** One line of the module's diagnostics. The default drops it. */
  log?: (line: string) => void;
  /** The virtual clock of scenario.step, for scenario tests; a simulation that a person drives leaves it off. */
  scenarioClock?: boolean;
}

interface RuntimeExports {
  memory: WebAssembly.Memory;
  zplc_wasm_runtime_init(): number;
  zplc_wasm_request_buffer(): number;
  zplc_wasm_request_capacity(): number;
  zplc_wasm_response_buffer(): number;
  zplc_wasm_event_buffer(): number;
  zplc_wasm_request(): number;
  zplc_wasm_tick(nowMs: number): number;
  zplc_wasm_event_length(): number;
  zplc_wasm_poll_timeout_ms(nowMs: number, maxMs: number): number;
  zplc_wasm_should_exit(): number;
  zplc_wasm_shutdown(): void;
  zplc_wasm_set_scenario_clock(enabled: number): void;
  zplc_wasm_trace_enable(enabled: number): void;
  zplc_wasm_trace_clear(): void;
  zplc_wasm_trace_count(): number;
  zplc_wasm_trace_records(): number;
}

/** What the scheduler core decided (zplc_sched_trace_kind_t, firmware/lib/zplc_core/include/zplc_sched_core.h). */
export const SCHEDULER_TRACE_KIND = {
  ADMIT: 1, COALESCE: 2, ORDER: 3, LATCH: 4, TASK: 5, MISS: 6, FAULT: 7, COMMIT: 8, PAUSE: 9,
} as const;

export interface SchedulerDecision { kind: number; taskId: number; a: bigint; b: bigint }

const TRACE_RECORD_BYTES = 24;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The answer of the module to one request: the response line, and the event line that the request raised, if any. */
export interface WasmAnswer {
  response: string;
  event: string;
}

export class WasmRuntime {
  private readonly exports: RuntimeExports;
  private readonly clock: () => number;

  private constructor(exports: RuntimeExports, clock: () => number) {
    this.exports = exports;
    this.clock = clock;
  }

  /** Compiles and instantiates the module and starts its session; `bytes` is the file tools/wasm-core wrote. */
  static async instantiate(bytes: Uint8Array, host: WasmRuntimeHost = {}): Promise<WasmRuntime> {
    const clock = host.clock ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
    const records = host.records ?? new MemoryRecordStore();
    const linear: { memory?: WebAssembly.Memory } = {};
    const view = (): Uint8Array => new Uint8Array(linear.memory!.buffer);
    const text = (pointer: number): string => {
      const heap = view();
      let end = pointer;
      while (heap[end] !== 0) end += 1;
      return decoder.decode(heap.subarray(pointer, end));
    };
    const imports = {
      zplc_host: {
        clock_ms: () => Math.trunc(clock()) >>> 0,
        persist_save: (key: number, data: number, length: number): number => {
          try {
            records.set(text(key), view().slice(data, data + length));
            return HAL_OK;
          } catch {
            return HAL_ERROR;
          }
        },
        persist_load: (key: number, data: number, length: number): number => {
          let record: Uint8Array | undefined;
          try {
            record = records.get(text(key));
          } catch {
            return HAL_ERROR;
          }
          if (record === undefined) return HAL_NOT_FOUND;
          if (record.byteLength === 0 || record.byteLength > length) return HAL_CORRUPT;
          view().set(record, data);
          return HAL_OK;
        },
        persist_delete: (key: number): number => {
          try {
            return records.delete(text(key)) ? HAL_OK : HAL_NOT_FOUND;
          } catch {
            return HAL_ERROR;
          }
        },
        log: (line: number): void => host.log?.(text(line)),
      },
    };
    const instance = await WebAssembly.instantiate(await WebAssembly.compile(new Uint8Array(bytes)), imports);
    const exports = instance.exports as unknown as RuntimeExports;
    linear.memory = exports.memory;
    if (exports.zplc_wasm_runtime_init() !== 0) throw new Error('the WebAssembly runtime could not start its session');
    if (host.scenarioClock === true) exports.zplc_wasm_set_scenario_clock(1);
    return new WasmRuntime(exports, clock);
  }

  /** The module's own clock, so that a caller schedules against the same time the module reads. */
  now(): number {
    return Math.trunc(this.clock()) >>> 0;
  }

  private read(pointer: number, length: number): string {
    return decoder.decode(new Uint8Array(this.exports.memory.buffer, pointer, length));
  }

  /** Sends one request line (a JSON envelope without its newline) and returns the module's answer. */
  request(line: string): WasmAnswer {
    const body = encoder.encode(line);
    const capacity = this.exports.zplc_wasm_request_capacity();
    if (body.byteLength + 1 > capacity) {
      return {
        response: JSON.stringify({
          id: 'unknown',
          type: 'response',
          error: { code: 'INVALID_REQUEST', message: `request line is longer than the ${capacity - 1} bytes the runtime reads` },
        }),
        event: '',
      };
    }
    const pointer = this.exports.zplc_wasm_request_buffer();
    const heap = new Uint8Array(this.exports.memory.buffer);
    heap.set(body, pointer);
    heap[pointer + body.byteLength] = 0;
    const length = this.exports.zplc_wasm_request();
    const response = this.read(this.exports.zplc_wasm_response_buffer(), length);
    return { response, event: this.read(this.exports.zplc_wasm_event_buffer(), this.exports.zplc_wasm_event_length()) };
  }

  /** The poll of the runtime at `nowMs`: the event line of the scans that were due, empty when there is none. */
  tick(nowMs: number): string {
    const length = this.exports.zplc_wasm_tick(nowMs >>> 0);
    return this.read(this.exports.zplc_wasm_event_buffer(), length);
  }

  /** How long the host may wait before it has to poll again, at most `maxMs`. */
  pollTimeoutMs(nowMs: number, maxMs: number): number {
    return this.exports.zplc_wasm_poll_timeout_ms(nowMs >>> 0, maxMs);
  }

  shouldExit(): boolean {
    return this.exports.zplc_wasm_should_exit() !== 0;
  }

  shutdown(): void {
    this.exports.zplc_wasm_shutdown();
  }

  /** Starts (or stops) recording the decisions of the scheduler core; starting clears what was recorded. */
  traceEnable(enabled: boolean): void {
    this.exports.zplc_wasm_trace_enable(enabled ? 1 : 0);
  }

  /** The decisions recorded since the trace was enabled or last drained, oldest first; the record is emptied. */
  traceDrain(): SchedulerDecision[] {
    const count = this.exports.zplc_wasm_trace_count();
    const view = new DataView(this.exports.memory.buffer, this.exports.zplc_wasm_trace_records(), count * TRACE_RECORD_BYTES);
    const decisions: SchedulerDecision[] = [];
    for (let index = 0; index < count; index += 1) {
      const at = index * TRACE_RECORD_BYTES;
      decisions.push({
        kind: view.getUint32(at, true),
        taskId: view.getUint32(at + 4, true),
        a: view.getBigUint64(at + 8, true),
        b: view.getBigUint64(at + 16, true),
      });
    }
    this.exports.zplc_wasm_trace_clear();
    return decisions;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The session transport
// ---------------------------------------------------------------------------------------------------------------------

/** The longest the host waits between two polls, as the main loop of the native process does. */
const POLL_MS = 10;

export interface WasmSimulationOptions extends WasmRuntimeHost {
  /** The module file. Called when a session starts, so that a page that never simulates never loads it. */
  loadModule: () => Promise<Uint8Array>;
  /** Where the RETAIN records land; reported in the capability profile. Defaults to the memory of the page. */
  retainStorage?: WasmRetainStorage;
  /** The timer of the poll loop; the default is setTimeout. A test replaces it to run the loop by hand. */
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/** The transport, and the module behind it for a caller that has to look at it (a test, a diagnostics view). */
export type WasmSimulationApi = NativeSimulationApi & { readonly runtime: WasmRuntime | null };

interface EnvelopeError { code?: string; message?: string }
interface Envelope { id?: string; type?: string; method?: string; params?: unknown; result?: unknown; error?: EnvelopeError }

/**
 * A native-session transport over a WebAssembly runtime. `startSession` instantiates the module and shakes hands
 * (`session.hello`), `request` is one call of the module, and a timer polls it for events until the session stops.
 * The handshake is the module's own, with the one thing it cannot know replaced: how it is hosted. It reports
 * `runtime_kind: "wasm"` and the capability profile of wasmCapabilities.ts, in place of the native runtime's.
 */
export function createWasmSimulationApi(options: WasmSimulationOptions): WasmSimulationApi {
  const listeners = new Set<(event: { type: 'event'; method: string; params: Record<string, unknown> }) => void>();
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let runtime: WasmRuntime | null = null;
  let timer: unknown = null;
  let requestCount = 0;

  const emit = (line: string): void => {
    if (line === '') return;
    let event: Envelope;
    try {
      event = JSON.parse(line) as Envelope;
    } catch {
      return;
    }
    if (event.type !== 'event' || typeof event.method !== 'string') return;
    for (const listener of listeners) {
      listener({ type: 'event', method: event.method, params: (event.params ?? {}) as Record<string, unknown> });
    }
  };

  const stopPolling = (): void => {
    if (timer !== null) cancel(timer);
    timer = null;
  };

  const poll = (): void => {
    timer = null;
    if (runtime === null) return;
    try {
      emit(runtime.tick(runtime.now()));
      timer = schedule(poll, Math.max(1, runtime.pollTimeoutMs(runtime.now(), POLL_MS)));
    } catch (error) {
      trapped(error);
    }
  };

  /** A trap leaves the module's memory in an unknown state: the session ends, as a crashed native process does. */
  const trapped = (error: unknown): never => {
    stopPolling();
    runtime = null;
    emit(JSON.stringify({ type: 'event', method: 'session.exited', params: { code: null, signal: 'trap' } }));
    throw new Error(`the WebAssembly runtime stopped: ${error instanceof Error ? error.message : String(error)}`);
  };

  const call = (line: string): Envelope => {
    if (runtime === null) throw new Error('Native simulator session is not active');
    let answer: WasmAnswer;
    try {
      answer = runtime.request(line);
    } catch (error) {
      return trapped(error);
    }
    emit(answer.event);
    return JSON.parse(answer.response) as Envelope;
  };

  const hello = (profile: NativeCapabilityProfile): unknown => {
    requestCount += 1;
    const answer = call(JSON.stringify({
      id: `wasm-hello-${requestCount}`,
      type: 'request',
      method: 'session.hello',
      params: { client_name: 'zplc-ide', client_version: '0', protocol_version: '1.0' },
    }));
    if (answer.error) throw new Error(answer.error.message ?? 'session.hello failed');
    return { ...(answer.result as Record<string, unknown>), runtime_kind: WASM_RUNTIME_KIND, capability_profile: profile };
  };

  return {
    get runtime() {
      return runtime;
    },

    async startSession() {
      const bytes = await options.loadModule();
      runtime = await WasmRuntime.instantiate(bytes, options);
      const profile = wasmCapabilityProfile(options.retainStorage ?? 'memory');
      const result = hello(profile) as Awaited<ReturnType<NativeSimulationApi['startSession']>>;
      timer = schedule(poll, 0);
      return result;
    },

    async stopSession() {
      if (runtime === null) return;
      stopPolling();
      const finished = runtime;
      // a clean shutdown keeps the values of the last complete scan, like a STOP (the session's own rule)
      requestCount += 1;
      try {
        finished.request(JSON.stringify({ id: `wasm-shutdown-${requestCount}`, type: 'request', method: 'session.shutdown', params: {} }));
        finished.shutdown();
      } finally {
        runtime = null;
      }
      // the shutdown stored the last complete scan: wait until it is where the project keeps it
      await options.records?.flush?.();
    },

    async request<TResult = unknown>(request: { id: string; type: 'request'; method: string; params: Record<string, unknown> }) {
      const answer = call(JSON.stringify(request));
      // events that the request raised were delivered before this reply resolves, as they are in the native process
      if (answer.error) throw new Error(answer.error.message ?? answer.error.code ?? 'the runtime refused the request');
      // the next poll follows the request at once, like the main loop of the native runtime
      if (runtime !== null && timer !== null) {
        cancel(timer);
        timer = schedule(poll, 0);
      }
      return answer.result as TResult;
    },

    onEvent(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}
