import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../electron/nativeSimulationSupervisor';
import type { NativeAdapter } from '../runtime/nativeAdapter';
import { NativeAdapter } from '../runtime/nativeAdapter';
import type { ScenarioRuntimePort } from '../test-engine';

type NativeScenarioAdapter = Pick<
  NativeAdapter,
  'loadProgram' | 'reset' | 'scenarioStep' | 'listForcedValues' | 'peek' | 'poke'
>;

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

async function readByte(adapter: NativeScenarioAdapter, address: number): Promise<number> {
  const bytes = await adapter.peek(address, 1);
  if (bytes.length !== 1) {
    throw new Error('Scenario memory read must return exactly one byte');
  }
  return bytes[0]!;
}

export function createNativeScenarioRuntime(adapter: NativeScenarioAdapter): ScenarioRuntimePort {
  return {
    loadProgram: (zplc) => adapter.loadProgram(zplc),
    reset: () => adapter.reset(),
    step: (atMs) => adapter.scenarioStep(atMs),
    hasForces: async () => (await adapter.listForcedValues()).length > 0,
    setInput: async (address, bitOffset, value) => {
      validateBit(address, bitOffset, 0, IPI_END, 'IPI');
      const current = await readByte(adapter, address);
      const mask = 1 << bitOffset;
      await adapter.poke(address, value ? current | mask : current & ~mask);
    },
    readOutput: async (address, bitOffset) => {
      validateBit(address, bitOffset, OPI_START, OPI_END, 'OPI');
      return (await readByte(adapter, address) & (1 << bitOffset)) !== 0;
    },
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function cleanupSession(adapter: NativeScenarioLifecycleAdapter, supervisor: Pick<NativeSimulationSupervisor, 'stopSession'>, persistRoot: string): Promise<void> {
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
  const lifecycle = options.createLifecycle?.(persistRoot) ?? (() => {
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-cli',
      clientVersion: productManifest.version,
      environment: {
        ...environment,
        ZPLC_PERSIST_ROOT: persistRoot,
        ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
      },
    });
    return { supervisor, adapter: new NativeAdapter(supervisor) };
  })();
  const { supervisor, adapter } = lifecycle;
  let closePromise: Promise<void> | undefined;
  const closeOnAbort = () => { void close().catch(() => undefined); };
  const close = () => {
    closePromise ??= cleanupSession(adapter, supervisor, persistRoot)
      .finally(() => options.signal?.removeEventListener('abort', closeOnAbort));
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
