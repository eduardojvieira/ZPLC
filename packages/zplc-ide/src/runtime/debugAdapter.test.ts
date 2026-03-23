import { describe, expect, it } from 'bun:test';

import { bytesToHex, RUNTIME_SESSION_SOURCE } from './debugAdapter';
import {
  normalizeNativeRuntimeSnapshot,
  normalizeSerialRuntimeSnapshot,
} from './runtimeSnapshot';

describe('bytesToHex', () => {
  it('encodes a byte array as uppercase hex without separators', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x2a, 0xff]))).toBe('002AFF');
  });
});

describe('runtime snapshot normalization', () => {
  it('normalizes native runtime snapshots into shared renderer shape', () => {
    const snapshot = normalizeNativeRuntimeSnapshot({
      state: 'paused',
      uptime_ms: 1234,
      stats: {
        cycles: 7,
        active_tasks: 2,
        overruns: 1,
        program_size: 16,
      },
      focused_vm: {
        pc: 12,
        sp: 3,
        halted: true,
        error: 0,
      },
      tasks: [
        {
          task_id: 1,
          state: 'paused',
          cycles: 7,
          overruns: 1,
          interval_us: 10000,
          priority: 1,
          pc: 12,
          sp: 3,
          halted: true,
          error: 0,
        },
      ],
      opi: [0, 1, 0, 0],
      force_entries: [{ address: 0, size: 1, bytes_hex: '01', state: 'forced' }],
    });

    expect(snapshot.source).toBe(RUNTIME_SESSION_SOURCE.NATIVE);
    expect(snapshot.tasks[0]?.taskId).toBe(1);
    expect(snapshot.forceEntries[0]?.bytesHex).toBe('01');
  });

  it('normalizes serial status snapshots into the same renderer shape', () => {
    const snapshot = normalizeSerialRuntimeSnapshot(
      {
        state: 'paused',
        uptime_ms: 5678,
        stats: {
          cycles: 22,
          active_tasks: 1,
          overruns: 0,
          program_size: 64,
        },
        tasks: [
          {
            slot: 0,
            id: 3,
            prio: 2,
            interval_us: 20000,
            cycles: 22,
            overruns: 0,
          },
        ],
        vm: {
          pc: 44,
          sp: 2,
          halted: true,
          error: 0,
        },
        opi: [1, 0, 1, 0],
      },
      [
        {
          path: '0x0000',
          address: 0,
          size: 1,
          type: 'BYTE',
          bytesHex: '01',
          state: 'forced',
        },
      ],
    );

    expect(snapshot.source).toBe(RUNTIME_SESSION_SOURCE.SERIAL);
    expect(snapshot.focusedVm?.pc).toBe(44);
    expect(snapshot.tasks[0]?.name).toBe('Task 3');
    expect(snapshot.forceEntries[0]?.state).toBe('forced');
  });
});
