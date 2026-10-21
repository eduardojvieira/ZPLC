import { describe, expect, it } from 'bun:test';

import type { SessionBridge, SessionState } from '../../electron/sessionStoreProtocol';
import { loadSession, saveSession } from './sessionBridge';

const state: SessionState = {
  schemaVersion: 1,
  tabs: [{ path: 'src/Motor.st', line: 3, column: 1, scrollTop: 0 }],
  activePath: 'src/Motor.st',
  panels: null,
};
const bridge = (load: SessionBridge['load'], save: SessionBridge['save'] = async () => null): SessionBridge => ({ load, save });

describe('session bridge adapter (IDE-008)', () => {
  it('loads the saved session of a folder by its opaque id', async () => {
    const asked: unknown[] = [];
    const loaded = await loadSession(
      bridge(async (request) => {
        asked.push(request);
        return state;
      }),
      'root-1',
    );
    expect(loaded).toEqual(state);
    expect(asked).toEqual([{ rootId: 'root-1' }]);
  });

  it('treats a missing, rejected or malformed answer as no session, without throwing', async () => {
    await expect(
      loadSession(
        bridge(async () => null),
        'root-1',
      ),
    ).resolves.toBeNull();
    await expect(
      loadSession(
        bridge(async () => {
          throw new Error('Request denied');
        }),
        'root-1',
      ),
    ).resolves.toBeNull();
    for (const answer of [
      'x',
      7,
      {},
      { ...state, extra: 1 },
      { ...state, tabs: [{ path: '../x', line: 1, column: 1, scrollTop: 0 }], activePath: null },
    ]) {
      await expect(
        loadSession(
          bridge(async () => answer),
          'root-1',
        ),
      ).resolves.toBeNull();
    }
  });

  it('saves the document with the folder id, and says whether it was stored', async () => {
    const sent: unknown[] = [];
    await expect(
      saveSession(
        bridge(
          async () => null,
          async (request) => {
            sent.push(request);
            return null;
          },
        ),
        'root-1',
        state,
      ),
    ).resolves.toBe(true);
    expect(sent).toEqual([{ rootId: 'root-1', state }]);
    await expect(
      saveSession(
        bridge(
          async () => null,
          async () => {
            throw new Error('Request denied');
          },
        ),
        'root-1',
        state,
      ),
    ).resolves.toBe(false);
  });
});
