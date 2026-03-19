import { describe, expect, it } from 'bun:test';

import { WATCH_FORCE_STATE } from '../runtime/debugAdapter';
import { resolveWatchCommitAction, WATCH_COMMIT_ACTION } from './debugWatchPanelLogic';

describe('resolveWatchCommitAction', () => {
  it('updates the forced value when the row is already forced', () => {
    expect(resolveWatchCommitAction(WATCH_FORCE_STATE.FORCED)).toBe(WATCH_COMMIT_ACTION.UPDATE_FORCE);
  });

  it('performs a one-shot set when the row is not forced', () => {
    expect(resolveWatchCommitAction(WATCH_FORCE_STATE.IDLE)).toBe(WATCH_COMMIT_ACTION.SET);
    expect(resolveWatchCommitAction(undefined)).toBe(WATCH_COMMIT_ACTION.SET);
  });
});
