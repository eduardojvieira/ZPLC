import type {
  RuntimeSnapshot,
  RuntimeTaskSnapshot,
  VMInfo,
  VMState,
  WatchForceEntry,
} from './debugAdapter';
import {
  RUNTIME_SESSION_SOURCE,
  WATCH_FORCE_STATE,
  type RuntimeSessionSource,
} from './debugAdapter';
import type { NativeCapabilityProfile, NativeRuntimeSnapshot } from './nativeProtocol';
import type { StatusInfo } from './serialAdapter';
import { deriveHardwareDebugState } from './debugStatus';

export function isNativeCapabilityProfile(value: unknown): value is NativeCapabilityProfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<NativeCapabilityProfile>;
  return typeof candidate.profile_id === 'string' && Array.isArray(candidate.features);
}

function mapForceEntries(
  _source: RuntimeSessionSource,
  entries: Array<{ address: number; size?: number; bytesHex: string; state: string; path?: string }>,
): WatchForceEntry[] {
  return entries.map((entry) => ({
    path: entry.path ?? `0x${entry.address.toString(16).toUpperCase().padStart(4, '0')}`,
    address: entry.address,
    size: entry.size,
    type: entry.size === 1 ? 'BYTE' : entry.size === 2 ? 'WORD' : 'DWORD',
    bytesHex: entry.bytesHex,
    state: entry.state === 'forced' ? WATCH_FORCE_STATE.FORCED : WATCH_FORCE_STATE.IDLE,
  }));
}

export function normalizeNativeRuntimeSnapshot(snapshot: NativeRuntimeSnapshot): RuntimeSnapshot {
  return {
    source: RUNTIME_SESSION_SOURCE.NATIVE,
    state: snapshot.state as VMState,
    uptimeMs: snapshot.uptime_ms,
    stats: {
      cycles: snapshot.stats.cycles,
      activeTasks: snapshot.stats.active_tasks,
      overruns: snapshot.stats.overruns,
      programSize: snapshot.stats.program_size,
    },
    focusedVm: {
      pc: snapshot.focused_vm.pc,
      sp: snapshot.focused_vm.sp,
      halted: snapshot.focused_vm.halted,
      cycles: snapshot.stats.cycles,
      error: snapshot.focused_vm.error,
    },
    tasks: snapshot.tasks.map<RuntimeTaskSnapshot>((task) => ({
      taskId: task.task_id,
      state: task.state,
      cycles: task.cycles,
      overruns: task.overruns,
      intervalUs: task.interval_us,
      priority: task.priority,
      pc: task.pc,
      sp: task.sp,
      halted: task.halted,
      error: task.error,
    })),
    opi: snapshot.opi,
    forceEntries: mapForceEntries(
      RUNTIME_SESSION_SOURCE.NATIVE,
      snapshot.force_entries.map((entry) => ({
        address: entry.address,
        size: entry.size,
        bytesHex: entry.bytes_hex,
        state: entry.state,
      })),
    ),
  };
}

export function normalizeSerialRuntimeSnapshot(status: StatusInfo, forceEntries: WatchForceEntry[]): RuntimeSnapshot {
  const derivedState = deriveHardwareDebugState(status);
  const focusedVm: VMInfo | null = status.vm
    ? {
        pc: status.vm.pc,
        sp: status.vm.sp,
        halted: derivedState.halted,
        cycles: status.stats.cycles ?? 0,
        error: status.vm.error,
      }
    : null;

  return {
    source: RUNTIME_SESSION_SOURCE.SERIAL,
    state: derivedState.vmState,
    uptimeMs: status.uptime_ms,
    stats: {
      cycles: status.stats.cycles ?? 0,
      activeTasks: status.stats.active_tasks ?? status.tasks?.length ?? 0,
      overruns: status.stats.overruns ?? 0,
      programSize: status.stats.program_size ?? 0,
    },
    focusedVm,
    tasks: (status.tasks ?? []).map<RuntimeTaskSnapshot>((task) => ({
      taskId: task.id,
      state: derivedState.vmState,
      cycles: task.cycles,
      overruns: task.overruns,
      intervalUs: task.interval_us,
      priority: task.prio,
      pc: status.vm?.pc ?? 0,
      sp: status.vm?.sp ?? 0,
      halted: derivedState.halted,
      error: status.vm?.error ?? 0,
      name: `Task ${task.id}`,
    })),
    opi: status.opi,
    forceEntries,
  };
}
