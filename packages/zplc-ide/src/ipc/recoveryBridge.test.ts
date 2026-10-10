import { describe, expect, it } from 'bun:test';

import type { RecoveryBridge } from '../../electron/recoveryStoreProtocol';
import { discardRecovery, listRecovery, writeRecovery } from './recoveryBridge';

const bridge = (parts: Partial<RecoveryBridge> = {}): RecoveryBridge => ({
  write: async () => null,
  list: async () => [],
  discard: async () => null,
  ...parts,
});

describe('recovery bridge adapter (IDE-006)', () => {
  it('sends the folder id, the relative path and the content, and says whether the main process kept them', async () => {
    const sent: unknown[] = [];
    await expect(writeRecovery(bridge({ write: async (request) => { sent.push(request); return null; } }), 'root-1', 'src/Motor.st', 'text')).resolves.toBe(true);
    expect(sent).toEqual([{ rootId: 'root-1', path: 'src/Motor.st', content: 'text' }]);
    await expect(writeRecovery(bridge({ write: async () => { throw new Error('Request denied'); } }), 'root-1', 'src/Motor.st', 'text')).resolves.toBe(false);
  });

  it('lists what the main process kept, validated, and treats a failure or a malformed answer as nothing', async () => {
    const entry = { path: 'src/Motor.st', content: 'text', savedAt: 5 };
    const asked: unknown[] = [];
    await expect(listRecovery(bridge({ list: async (request) => { asked.push(request); return [entry]; } }), 'root-1')).resolves.toEqual([entry]);
    expect(asked).toEqual([{ rootId: 'root-1' }]);
    await expect(listRecovery(bridge({ list: async () => [entry, { path: '../x', content: 'y', savedAt: 1 }, 7, { ...entry, extra: 1 }] }), 'root-1')).resolves.toEqual([entry]);
    await expect(listRecovery(bridge({ list: async () => 'x' }), 'root-1')).resolves.toEqual([]);
    await expect(listRecovery(bridge({ list: async () => { throw new Error('Request denied'); } }), 'root-1')).resolves.toEqual([]);
  });

  it('discards one file or all of a folder, and says whether it was done', async () => {
    const sent: unknown[] = [];
    const spy = bridge({ discard: async (request) => { sent.push(request); return null; } });
    await expect(discardRecovery(spy, 'root-1', 'src/Motor.st')).resolves.toBe(true);
    await expect(discardRecovery(spy, 'root-1', null)).resolves.toBe(true);
    expect(sent).toEqual([{ rootId: 'root-1', path: 'src/Motor.st' }, { rootId: 'root-1', path: null }]);
    await expect(discardRecovery(bridge({ discard: async () => { throw new Error('x'); } }), 'root-1', null)).resolves.toBe(false);
  });
});
