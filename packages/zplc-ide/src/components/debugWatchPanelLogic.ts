import { WATCH_FORCE_STATE, type WatchForceState } from '../runtime/debugAdapter';

export const WATCH_COMMIT_ACTION = {
  SET: 'set',
  UPDATE_FORCE: 'update-force',
} as const;

export type WatchCommitAction = (typeof WATCH_COMMIT_ACTION)[keyof typeof WATCH_COMMIT_ACTION];

export function resolveWatchCommitAction(forceState: WatchForceState | null | undefined): WatchCommitAction {
  return forceState === WATCH_FORCE_STATE.FORCED
    ? WATCH_COMMIT_ACTION.UPDATE_FORCE
    : WATCH_COMMIT_ACTION.SET;
}
