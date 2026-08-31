export type OperationalStatusTone = 'neutral' | 'info' | 'success' | 'attention' | 'danger';

export interface OperationalStatusPresentation {
  mode: 'SIMULATION' | 'HARDWARE';
  runtime: string;
  target?: string;
  status: { text: string; tone: OperationalStatusTone };
  cycles?: number;
  taskIntervalMs?: number;
  taskCount?: number;
  overruns?: number;
  force?: { kind: 'active' | 'unconfirmed'; text: string };
}

export interface OperationalStatusInput {
  mode: 'simulate' | 'hardware';
  adapterType: 'native' | 'serial' | 'wasm' | null;
  connected: boolean;
  vmInfo: unknown;
  status: { text: string; tone: OperationalStatusTone };
  projectTargetBoard: unknown;
  projectTasks: unknown;
  controllerInfo: unknown;
  controllerStatus: unknown;
  forcedValuesCount: unknown;
  forcesUnconfirmed: unknown;
  nativeTrace: unknown;
}

const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 _./:-]{0,63}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,47}$/;
const SAFE_STATUS = /^[A-Za-z0-9][A-Za-z0-9 .,:;!?/()_\-·]{0,95}$/u;
const TONES = new Set<OperationalStatusTone>(['neutral', 'info', 'success', 'attention', 'danger']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeNonnegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function safeLabel(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_LABEL.test(value) ? value : undefined;
}

function safeStatus(value: OperationalStatusInput['status']): OperationalStatusPresentation['status'] {
  return typeof value?.text === 'string' && value.text.length <= 96 && SAFE_STATUS.test(value.text)
    && TONES.has(value.tone)
    ? value
    : { text: 'Status unavailable', tone: 'neutral' };
}

function controllerBoard(value: unknown): string | undefined {
  return record(value) ? safeLabel(value.board) : undefined;
}

function controllerVersion(value: unknown): string | undefined {
  const version = record(value) ? value.zplc_version : undefined;
  return typeof version === 'string' && SAFE_VERSION.test(version) ? version : undefined;
}

function cycles(value: unknown): number | undefined {
  return record(value) ? safeNonnegativeInteger(value.cycles) : undefined;
}

function taskMetrics(value: unknown): Pick<OperationalStatusPresentation, 'taskIntervalMs' | 'taskCount'> {
  if (!Array.isArray(value)) return {};
  if (value.length === 1) {
    const interval = record(value[0]) ? safeNonnegativeInteger(value[0].interval_ms) : undefined;
    return interval && interval > 0 ? { taskIntervalMs: interval } : {};
  }
  return value.length > 1 && value.length <= 16 ? { taskCount: value.length } : {};
}

function reportedOverruns({ adapterType, connected, nativeTrace, controllerStatus }: OperationalStatusInput): number | undefined {
  if (!connected) return undefined;
  if (adapterType === 'native' && Array.isArray(nativeTrace)) {
    const sample = nativeTrace.at(-1);
    return record(sample) && sample.source === 'native' ? safeNonnegativeInteger(sample.overruns) : undefined;
  }
  if (adapterType === 'serial' && record(controllerStatus) && record(controllerStatus.stats)) {
    return safeNonnegativeInteger(controllerStatus.stats.overruns);
  }
  return undefined;
}

/** Reduces runtime and store state to bounded operational copy; untrusted data is omitted. */
export function presentOperationalStatus(input: OperationalStatusInput): OperationalStatusPresentation {
  const mode = input.mode === 'hardware' ? 'HARDWARE' : 'SIMULATION';
  const nativeConnected = input.connected && mode === 'SIMULATION' && input.adapterType === 'native';
  const serialConnected = input.connected && mode === 'HARDWARE' && input.adapterType === 'serial';
  const wasmConnected = input.connected && mode === 'SIMULATION' && input.adapterType === 'wasm';
  const compatibleSession = nativeConnected || serialConnected || wasmConnected;
  const runtimeMismatch = input.connected && !compatibleSession;
  const configuredBoard = safeLabel(input.projectTargetBoard);
  const reportedBoard = serialConnected ? controllerBoard(input.controllerInfo) : undefined;
  const version = serialConnected ? controllerVersion(input.controllerInfo) : undefined;
  const runtime = runtimeMismatch
    ? 'No compatible runtime session'
    : nativeConnected
    ? 'Native POSIX'
    : serialConnected
      ? `Serial runtime${version ? ` · ${version}` : ''}`
      : wasmConnected
        ? 'WASM fallback · degraded'
        : 'No runtime session';
  const target = nativeConnected && mode === 'SIMULATION'
    ? 'Local POSIX'
    : reportedBoard
      ? reportedBoard
      : mode === 'HARDWARE' && configuredBoard
        ? `${configuredBoard} (configured)`
        : undefined;
  const cycleCount = compatibleSession ? cycles(input.vmInfo) : undefined;
  const overruns = compatibleSession ? reportedOverruns(input) : undefined;
  const forceCount = safeNonnegativeInteger(input.forcedValuesCount);
  const force = input.forcesUnconfirmed === true
    || (forceCount !== undefined && forceCount > 0 && !compatibleSession)
    || (forceCount !== undefined && forceCount > 8)
    ? { kind: 'unconfirmed' as const, text: 'Force state unconfirmed — verify and reconnect before operating.' }
    : (() => {
        return forceCount && forceCount <= 8
          ? { kind: 'active' as const, text: `${forceCount} active force${forceCount === 1 ? '' : 's'}` }
          : undefined;
      })();

  return {
    mode,
    runtime,
    ...(target ? { target } : {}),
    status: runtimeMismatch
      ? { text: 'Runtime mode mismatch · reconnect required', tone: 'danger' }
      : safeStatus(input.status),
    ...(cycleCount !== undefined ? { cycles: cycleCount } : {}),
    ...taskMetrics(input.projectTasks),
    ...(overruns !== undefined ? { overruns } : {}),
    ...(force ? { force } : {}),
  };
}
