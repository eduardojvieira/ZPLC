import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import productManifest from '../../../../package.json';
import { withNativeCommunicationEnvironment } from '../../shared/nativeSimulationEnvironment';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { NativeAdapter } from '../runtime/nativeAdapter';
import type { NumericType, ScenarioRuntimePort } from '../test-engine';

// `pokeN` is optional so an adapter that only knows bits still builds a runtime; that runtime then has no numeric methods.
type NativeScenarioAdapter = Pick<NativeAdapter, 'loadProgram' | 'reset' | 'scenarioStep' | 'listForcedValues' | 'peek' | 'poke'> &
  Partial<Pick<NativeAdapter, 'pokeN'>>;

type NativeScenarioLifecycleAdapter = NativeScenarioAdapter & {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

type NativeScenarioLifecycle = {
  adapter: NativeScenarioLifecycleAdapter;
  supervisor: Pick<NativeSimulationSupervisor, 'stopSession'>;
};

const IPI_END = 0x1000;
const OPI_START = 0x1000;
const OPI_END = 0x2000;

export interface NativeScenarioSession {
  runtime: ScenarioRuntimePort;
  close: () => Promise<void>;
}

export interface NativeScenarioSessionOptions {
  signal?: AbortSignal;
  /** Test-only lifecycle seam; production always constructs the native supervisor. */
  createLifecycle?: (persistRoot: string) => NativeScenarioLifecycle;
}

function validateBit(address: number, bitOffset: number, start: number, end: number, region: string): void {
  if (!Number.isInteger(address) || address < start || address >= end) {
    throw new Error(`Scenario ${region} address is invalid`);
  }
  if (!Number.isInteger(bitOffset) || bitOffset < 0 || bitOffset > 7) {
    throw new Error('Scenario bitOffset must be an integer from 0 to 7');
  }
}

function validateNumber(address: number, width: number, start: number, end: number, region: string): void {
  if (!Number.isInteger(address) || address < start || address + width > end) throw new Error(`Scenario ${region} address is invalid`);
}

const widthOf = (type: NumericType) => (type === 'INT' ? 2 : 4);

const CHUNK = 64;

export function createNativeScenarioRuntime(adapter: NativeScenarioAdapter): ScenarioRuntimePort {
  // Inputs: 64-byte chunks read once, written in the shadow, flushed as one range per chunk on `step`.
  const shadow = new Map<number, Uint8Array>();
  const dirty = new Map<number, [number, number]>();
  // Outputs: 64-byte chunks read once per step.
  const cache = new Map<number, Uint8Array>();
  const clear = () => {
    shadow.clear();
    dirty.clear();
    cache.clear();
  };

  const chunk = async (store: Map<number, Uint8Array>, base: number): Promise<Uint8Array> => {
    let bytes = store.get(base);
    if (!bytes) {
      bytes = await adapter.peek(base, CHUNK);
      if (bytes.length !== CHUNK) throw new Error(`Scenario memory read must return exactly ${CHUNK} bytes`);
      store.set(base, bytes);
    }
    return bytes;
  };
  const setByte = async (address: number, apply: (current: number) => number) => {
    const base = address - (address % CHUNK);
    const bytes = await chunk(shadow, base);
    const offset = address - base;
    bytes[offset] = apply(bytes[offset]!);
    const range = dirty.get(base);
    if (range) dirty.set(base, [Math.min(range[0], offset), Math.max(range[1], offset)]);
    else dirty.set(base, [offset, offset]);
  };
  const getOutput = async (address: number) => {
    const base = address - (address % CHUNK);
    return (await chunk(cache, base))[address - base]!;
  };
  const flush = async () => {
    for (const [base, [lo, hi]] of dirty) {
      const bytes = shadow.get(base)!.slice(lo, hi + 1);
      if (adapter.pokeN) await adapter.pokeN(base + lo, bytes);
      else for (let i = 0; i < bytes.length; i++) await adapter.poke(base + lo + i, bytes[i]!);
    }
    dirty.clear();
  };

  const numeric: Pick<ScenarioRuntimePort, 'setInputNumber' | 'readOutputNumber'> =
    'pokeN' in adapter
      ? {
          setInputNumber: async (address, type, raw) => {
            validateNumber(address, widthOf(type), 0, IPI_END, 'IPI');
            const bytes = new Uint8Array(widthOf(type));
            const view = new DataView(bytes.buffer);
            if (type === 'INT') view.setInt16(0, raw, true);
            else view.setFloat32(0, raw, true);
            for (let i = 0; i < bytes.length; i++) await setByte(address + i, () => bytes[i]!);
          },
          readOutputNumber: async (address, type) => {
            validateNumber(address, widthOf(type), OPI_START, OPI_END, 'OPI');
            const bytes = new Uint8Array(widthOf(type));
            for (let i = 0; i < bytes.length; i++) bytes[i] = await getOutput(address + i);
            const view = new DataView(bytes.buffer);
            return type === 'INT' ? view.getInt16(0, true) : view.getFloat32(0, true);
          },
        }
      : {};
  return {
    ...numeric,
    loadProgram: (zplc) => (clear(), adapter.loadProgram(zplc)),
    reset: () => (clear(), adapter.reset()),
    step: async (atMs) => {
      await flush();
      cache.clear();
      await adapter.scenarioStep(atMs);
    },
    hasForces: async () => (await adapter.listForcedValues()).length > 0,
    setInput: async (address, bitOffset, value) => {
      validateBit(address, bitOffset, 0, IPI_END, 'IPI');
      const mask = 1 << bitOffset;
      await setByte(address, (current) => (value ? current | mask : current & ~mask));
    },
    readOutput: async (address, bitOffset) => {
      validateBit(address, bitOffset, OPI_START, OPI_END, 'OPI');
      return ((await getOutput(address)) & (1 << bitOffset)) !== 0;
    },
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function cleanupSession(
  adapter: NativeScenarioLifecycleAdapter,
  supervisor: Pick<NativeSimulationSupervisor, 'stopSession'>,
  persistRoot: string,
): Promise<void> {
  let failure: Error | undefined;
  for (const operation of [
    () => adapter.disconnect(),
    () => supervisor.stopSession(),
    () => rm(persistRoot, { recursive: true, force: true }),
  ]) {
    try {
      await operation();
    } catch (error) {
      failure ??= toError(error);
    }
  }
  if (failure) throw failure;
}

function preserveFailure(primary: unknown, cleanup: unknown): never {
  const primaryError = toError(primary);
  if (!cleanup) throw primaryError;
  const cleanupError = toError(cleanup);
  throw new AggregateError(
    [primaryError, cleanupError],
    `${primaryError.message}; native scenario session cleanup also failed: ${cleanupError.message}`,
  );
}

function cancelled(): Error {
  const error = new Error('Native scenario session cancelled');
  error.name = 'AbortError';
  return error;
}

export async function createNativeScenarioSession(
  environment: NodeJS.ProcessEnv = process.env,
  options: NativeScenarioSessionOptions = {},
): Promise<NativeScenarioSession> {
  if (options.signal?.aborted) throw cancelled();
  const persistRoot = await mkdtemp(join(tmpdir(), 'zplc-scenario-'));
  if (options.signal?.aborted) {
    await rm(persistRoot, { recursive: true, force: true });
    throw cancelled();
  }
  const lifecycle =
    options.createLifecycle?.(persistRoot) ??
    (() => {
      const supervisor = new NativeSimulationSupervisor({
        clientName: 'zplc-cli',
        clientVersion: productManifest.version,
        environment: {
          ...withNativeCommunicationEnvironment(environment),
          ZPLC_PERSIST_ROOT: persistRoot,
          ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
        },
      });
      return { supervisor, adapter: new NativeAdapter(supervisor) };
    })();
  const { supervisor, adapter } = lifecycle;
  let closePromise: Promise<void> | undefined;
  const closeOnAbort = () => {
    void close().catch(() => undefined);
  };
  const close = () => {
    closePromise ??= cleanupSession(adapter, supervisor, persistRoot).finally(() =>
      options.signal?.removeEventListener('abort', closeOnAbort),
    );
    return closePromise;
  };
  options.signal?.addEventListener('abort', closeOnAbort, { once: true });

  try {
    if (options.signal?.aborted) throw cancelled();
    await adapter.connect();
    if (options.signal?.aborted) throw cancelled();
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      preserveFailure(options.signal?.aborted ? cancelled() : error, cleanupError);
    }
    if (options.signal?.aborted) throw cancelled();
    throw error;
  }

  const runtime = createNativeScenarioRuntime(adapter);
  return {
    runtime,
    close,
  };
}
