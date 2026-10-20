// The read-only view of the learner's board session (LRN-015, LRN-024): Learn reaches the connected state, the VM state, the
// Watch read and what the firmware reported, and nothing else of the session. The source here is a FAKE that records calls.
import { describe, expect, it } from 'bun:test';

import { boardSessionOf, type BoardSessionSource } from './boardSession';
import type { WatchVariable } from './debugAdapter';

function fakeSource(connected: boolean, info: BoardSessionSource['systemInfo']) {
  const calls: string[] = [];
  const adapter = new Proxy({ connected, state: 'running' } as Record<string, unknown>, {
    get: (target, key) => (key === 'connected' || key === 'state' ? target[key]
      : key === 'readWatchVariables' ? async (variables: WatchVariable[]) => { calls.push('readWatchVariables'); return variables; }
        : typeof key === 'string' ? async () => { calls.push(key); } : undefined),
  });
  return { source: { connected, serialAdapter: adapter, systemInfo: info } as unknown as BoardSessionSource, calls };
}

describe('the read-only board session (LRN-015, LRN-024)', () => {
  it('LRN-015 gives Learn the connected state, the VM state and the Watch read, and no other operation of the session', async () => {
    const { source, calls } = fakeSource(true, { zplc_version: '2.0.0', io: { board_id: 'rpi-pico-rp2040' } } as never);
    const view = boardSessionOf(source)!;
    expect(Object.keys(view.session).sort()).toEqual(['connected', 'readWatchVariables', 'state']);
    expect(view.session.connected).toBe(true);
    expect(view.session.state).toBe('running');
    await view.session.readWatchVariables([]);
    expect(calls).toEqual(['readWatchVariables']);
    for (const operation of ['connect', 'disconnect', 'loadProgram', 'start', 'stop', 'forceValue', 'setValue', 'poke']) expect(operation in view.session).toBe(false);
  });

  it('LRN-024 names the board and the ZPLC version the firmware reported, or null when it reported none', () => {
    expect(boardSessionOf(fakeSource(true, { zplc_version: '2.0.0', io: { board_id: 'esp32-s3-devkitc' } } as never).source)).toMatchObject({ boardId: 'esp32-s3-devkitc', runtimeVersion: '2.0.0' });
    expect(boardSessionOf(fakeSource(true, null).source)).toMatchObject({ boardId: null, runtimeVersion: null });
  });

  it('LRN-015 has no session to give when Studio is not connected to a board', () => {
    expect(boardSessionOf(fakeSource(false, null).source)).toBeNull();
    expect(boardSessionOf({ connected: true, serialAdapter: null, systemInfo: null })).toBeNull();
  });
});
