import { WATCH_FORCE_STATE, type WatchForceState } from '../runtime/debugAdapter';

export const WATCH_COMMIT_ACTION = {
  SET: 'set',
  UPDATE_FORCE: 'update-force',
  BLOCKED: 'blocked',
} as const;

export type WatchCommitAction = (typeof WATCH_COMMIT_ACTION)[keyof typeof WATCH_COMMIT_ACTION];

export function resolveWatchCommitAction(
  forceState: WatchForceState | null | undefined,
  hasActiveSerialSession = false,
): WatchCommitAction {
  if (forceState === WATCH_FORCE_STATE.UNCONFIRMED) {
    return WATCH_COMMIT_ACTION.BLOCKED;
  }
  if (forceState === WATCH_FORCE_STATE.FORCED) {
    return WATCH_COMMIT_ACTION.UPDATE_FORCE;
  }
  return hasActiveSerialSession ? WATCH_COMMIT_ACTION.BLOCKED : WATCH_COMMIT_ACTION.SET;
}

export function canEditWatchValue(
  action: WatchCommitAction,
  hasSetValue: boolean,
  hasToggleForceValue: boolean,
): boolean {
  return action === WATCH_COMMIT_ACTION.SET
    ? hasSetValue
    : action === WATCH_COMMIT_ACTION.UPDATE_FORCE
      ? hasToggleForceValue
      : false;
}

export function canReleaseForces(
  hasActiveSerialSession: boolean,
  hasForceEvidence: boolean,
  busy = false,
): boolean {
  return hasActiveSerialSession && hasForceEvidence && !busy;
}
