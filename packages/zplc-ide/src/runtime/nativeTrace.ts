import { MEMORY_MAP, type IDebugAdapter, type RuntimeSnapshot, type VMState } from './debugAdapter';
import type { DebugMap, DebugVarInfo } from '../compiler';

export const NATIVE_TRACE_LIMIT = 200;
export const LIVE_NATIVE_OUTPUT_MAX_AGE_MS = 500;

export interface NativeTraceSample {
  source: 'native';
  uptimeMs: number;
  cycles: number;
  state: VMState;
  pc: number | null;
  error: number | null;
  overruns: number;
  opi: number[];
  ipi: number[];
  programGeneration: number;
  forceCount: number;
  compilerRunId: number;
  receivedAtMs: number;
}

export interface LiveNativeMotorOutput {
  forward: boolean;
  reverse: boolean;
  uptimeMs: number;
  cycles: number;
  state: 'running' | 'paused';
}

export interface LiveNativeMotorControls {
  eStopAsserted: boolean;
  receivedAtMs: number;
}

function isByteArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 8 && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 0xff);
}

function hasValidForceEntries(value: unknown): value is RuntimeSnapshot['forceEntries'] {
  return Array.isArray(value) && value.length <= 8 && value.every((entry) => (
    typeof entry === 'object' && entry !== null
    && typeof entry.path === 'string' && entry.path.length > 0
    && Number.isSafeInteger(entry.address) && entry.address >= 0 && entry.address <= 0xffff
    && Number.isSafeInteger(entry.size) && entry.size >= 1 && entry.size <= 260
    && (entry.type === 'BOOL' || entry.type === 'INT' || entry.type === 'DINT' || entry.type === 'REAL' || entry.type === 'BYTE' || entry.type === 'WORD' || entry.type === 'DWORD' || entry.type === 'TIME' || entry.type === 'STRING')
    && typeof entry.bytesHex === 'string' && entry.bytesHex.length > 0 && entry.bytesHex.length % 2 === 0 && entry.bytesHex.length === entry.size * 2 && /^[0-9a-f]+$/i.test(entry.bytesHex)
    && entry.state === 'forced'
  ));
}

export function projectNativeTrace(snapshot: RuntimeSnapshot, seal: { compilerRunId: number; receivedAtMs: number }): NativeTraceSample | null {
  const programGeneration = snapshot.programGeneration;
  if (snapshot.source !== 'native' || !isByteArray(snapshot.opi) || !isByteArray(snapshot.ipi)
    || typeof programGeneration !== 'number' || !Number.isSafeInteger(programGeneration) || programGeneration < 0 || programGeneration > 0xffff_ffff
    || !hasValidForceEntries(snapshot.forceEntries)
    || !Number.isSafeInteger(seal.compilerRunId) || seal.compilerRunId < 0
    || !Number.isSafeInteger(seal.receivedAtMs) || seal.receivedAtMs < 0) {
    return null;
  }

  return {
    source: 'native',
    uptimeMs: snapshot.uptimeMs,
    cycles: snapshot.stats.cycles,
    state: snapshot.state,
    pc: snapshot.focusedVm?.pc ?? null,
    error: snapshot.focusedVm?.error ?? null,
    overruns: snapshot.stats.overruns,
    opi: [...snapshot.opi],
    ipi: [...snapshot.ipi],
    programGeneration,
    forceCount: snapshot.forceEntries.length,
    compilerRunId: seal.compilerRunId,
    receivedAtMs: seal.receivedAtMs,
  };
}

function readExactMotorInputBit(variable: DebugVarInfo | undefined, debugMap: DebugMap, bitOffset: number): boolean | null {
  const { memoryLayout } = debugMap;
  if (!variable
    || variable.type !== 'BOOL'
    || variable.region !== 'IPI'
    || variable.addr !== MEMORY_MAP.ipi.baseAddress
    || variable.size !== 1
    || variable.bitOffset !== bitOffset
    || memoryLayout.ipiBase !== MEMORY_MAP.ipi.baseAddress
    || !Number.isSafeInteger(memoryLayout.ipiSize) || memoryLayout.ipiSize < 8
    || memoryLayout.opiBase !== MEMORY_MAP.opi.baseAddress
    || !Number.isSafeInteger(memoryLayout.opiSize) || memoryLayout.opiSize < 8) {
    return null;
  }
  return true;
}

export function presentLiveNativeMotorControls({
  adapterType,
  connected,
  simulationInputsAuthorized,
  vmState,
  debugMap,
  sample,
  currentCompilerRunId,
  nowMs,
}: {
  adapterType: IDebugAdapter['type'] | null | undefined;
  connected: boolean;
  simulationInputsAuthorized: boolean;
  vmState: VMState;
  debugMap: DebugMap | null;
  sample: NativeTraceSample | null | undefined;
  currentCompilerRunId: number;
  nowMs: number;
}): LiveNativeMotorControls | null {
  if (adapterType !== 'native' || !connected || !simulationInputsAuthorized || !debugMap || !sample
    || (vmState !== 'running' && vmState !== 'paused')
    || sample.source !== 'native' || sample.state !== vmState
    || sample.forceCount !== 0 || !isByteArray(sample.opi) || !isByteArray(sample.ipi)
    || !Number.isSafeInteger(sample.programGeneration) || sample.programGeneration <= 0 || sample.programGeneration > 0xffff_ffff
    || !Number.isSafeInteger(currentCompilerRunId) || currentCompilerRunId < 0
    || !Number.isSafeInteger(nowMs) || nowMs < 0
    || sample.compilerRunId !== currentCompilerRunId
    || !Number.isSafeInteger(sample.receivedAtMs) || sample.receivedAtMs < 0 || sample.receivedAtMs > nowMs
    || nowMs - sample.receivedAtMs > LIVE_NATIVE_OUTPUT_MAX_AGE_MS) {
    return null;
  }
  const vars = debugMap.pou.Motor?.vars;
  if (!readExactMotorInputBit(vars?.Start, debugMap, 0)
    || !readExactMotorInputBit(vars?.Stop, debugMap, 1)
    || !readExactMotorInputBit(vars?.EStop, debugMap, 2)) {
    return null;
  }
  return { eStopAsserted: (sample.ipi[0]! & 0x04) !== 0, receivedAtMs: sample.receivedAtMs };
}

function readMotorBit(variable: DebugVarInfo | undefined, debugMap: DebugMap, opi: number[]): { key: string; value: boolean } | null {
  const { memoryLayout } = debugMap;
  const bitOffset = variable?.bitOffset;
  if (!variable
    || variable.type !== 'BOOL'
    || variable.region !== 'OPI'
    || !Number.isSafeInteger(variable.size) || variable.size < 1
    || !Number.isSafeInteger(variable.addr) || variable.addr < 0
    || typeof bitOffset !== 'number' || !Number.isInteger(bitOffset) || bitOffset < 0 || bitOffset > 7
    || !Number.isSafeInteger(memoryLayout.opiBase) || memoryLayout.opiBase < 0
    || !Number.isSafeInteger(memoryLayout.opiSize) || memoryLayout.opiSize < 1
    || memoryLayout.opiBase !== MEMORY_MAP.opi.baseAddress
    || memoryLayout.opiBase > Number.MAX_SAFE_INTEGER - memoryLayout.opiSize
    || variable.addr > Number.MAX_SAFE_INTEGER - variable.size) {
    return null;
  }
  const byteOffset = variable.addr - memoryLayout.opiBase;
  if (byteOffset < 0 || byteOffset >= memoryLayout.opiSize || variable.size > memoryLayout.opiSize - byteOffset || byteOffset >= opi.length) {
    return null;
  }
  return { key: `${variable.addr}:${bitOffset}`, value: (opi[byteOffset]! & (1 << bitOffset)) !== 0 };
}

export function presentLiveNativeMotorOutput({
  adapterType,
  connected,
  vmState,
  debugMap,
  sample,
  currentCompilerRunId,
  nowMs,
}: {
  adapterType: IDebugAdapter['type'] | null | undefined;
  connected: boolean;
  vmState: VMState;
  debugMap: DebugMap | null;
  sample: NativeTraceSample | null | undefined;
  currentCompilerRunId: number;
  nowMs: number;
}): LiveNativeMotorOutput | null {
  if (adapterType !== 'native' || !connected || !debugMap || !sample
    || (vmState !== 'running' && vmState !== 'paused')
    || sample.source !== 'native' || sample.state !== vmState
    || sample.forceCount !== 0 || !isByteArray(sample.opi)
    || !Number.isSafeInteger(currentCompilerRunId) || currentCompilerRunId < 0
    || !Number.isSafeInteger(nowMs) || nowMs < 0
    || !Number.isSafeInteger(sample.compilerRunId) || sample.compilerRunId !== currentCompilerRunId
    || !Number.isSafeInteger(sample.receivedAtMs) || sample.receivedAtMs < 0 || sample.receivedAtMs > nowMs
    || nowMs - sample.receivedAtMs > LIVE_NATIVE_OUTPUT_MAX_AGE_MS) {
    return null;
  }
  const forward = readMotorBit(debugMap.pou.Motor?.vars.Forward, debugMap, sample.opi);
  const reverse = readMotorBit(debugMap.pou.Motor?.vars.Reverse, debugMap, sample.opi);
  if (!forward || !reverse || forward.key === reverse.key) {
    return null;
  }
  return { forward: forward.value, reverse: reverse.value, uptimeMs: sample.uptimeMs, cycles: sample.cycles, state: vmState };
}

export function canCaptureNativeTrace({
  activeAdapter,
  owner,
  snapshot,
  capturedCompilerRunId,
  currentCompilerRunId,
  capturedTraceEpoch,
  currentTraceEpoch,
}: {
  activeAdapter: IDebugAdapter | null;
  owner: IDebugAdapter;
  snapshot: RuntimeSnapshot;
  capturedCompilerRunId: number;
  currentCompilerRunId: number;
  capturedTraceEpoch: number;
  currentTraceEpoch: number;
}): boolean {
  return activeAdapter === owner
    && owner.type === 'native'
    && snapshot.source === 'native'
    && capturedCompilerRunId === currentCompilerRunId
    && capturedTraceEpoch === currentTraceEpoch;
}

export function canCommitNativeLoad(
  ownerIsCurrent: boolean,
  loadedCompilerRunId: number,
  currentCompilerRunId: number,
): boolean {
  return ownerIsCurrent && loadedCompilerRunId === currentCompilerRunId;
}

export function canReenableNativeTrace(
  captureWasEnabled: boolean,
  boundCompilerRunId: number | null,
  currentCompilerRunId: number,
): boolean {
  return captureWasEnabled && boundCompilerRunId === currentCompilerRunId;
}

export function appendNativeTrace(
  trace: NativeTraceSample[],
  activeAdapter: IDebugAdapter | null,
  owner: IDebugAdapter,
  snapshot: RuntimeSnapshot,
  seal: { compilerRunId: number; receivedAtMs: number },
): NativeTraceSample[] {
  if (!canCaptureNativeTrace({
    activeAdapter,
    owner,
    snapshot,
    capturedCompilerRunId: 0,
    currentCompilerRunId: 0,
    capturedTraceEpoch: 0,
    currentTraceEpoch: 0,
  })) {
    return trace;
  }
  const sample = projectNativeTrace(snapshot, seal);
  if (!sample) {
    return trace;
  }
  return [...trace, sample].slice(-NATIVE_TRACE_LIMIT);
}
