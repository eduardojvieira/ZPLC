import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withEnglishMessages } from '../i18n/inlineMessages';
import { WATCH_FORCE_STATE } from '../runtime/debugAdapter';
import { canEditWatchValue, canReleaseForces, canToggleForce, resolveWatchCommitAction, WATCH_COMMIT_ACTION } from './debugWatchPanelLogic';

describe('resolveWatchCommitAction', () => {
  it('updates the forced value when the row is already forced', () => {
    expect(resolveWatchCommitAction(WATCH_FORCE_STATE.FORCED)).toBe(WATCH_COMMIT_ACTION.UPDATE_FORCE);
  });

  it('performs a one-shot set when the row is not forced', () => {
    expect(resolveWatchCommitAction(WATCH_FORCE_STATE.IDLE)).toBe(WATCH_COMMIT_ACTION.SET);
    expect(resolveWatchCommitAction(undefined)).toBe(WATCH_COMMIT_ACTION.SET);
  });

  it('blocks one-shot writes to hardware while retaining explicit forced-value updates', () => {
    expect(resolveWatchCommitAction(WATCH_FORCE_STATE.IDLE, true)).toBe(WATCH_COMMIT_ACTION.BLOCKED);
    expect(resolveWatchCommitAction(undefined, true)).toBe(WATCH_COMMIT_ACTION.BLOCKED);
    expect(resolveWatchCommitAction(WATCH_FORCE_STATE.FORCED, true)).toBe(WATCH_COMMIT_ACTION.UPDATE_FORCE);
  });

  it('blocks edits for an unconfirmed force', () => {
    expect(resolveWatchCommitAction(WATCH_FORCE_STATE.UNCONFIRMED)).toBe(WATCH_COMMIT_ACTION.BLOCKED);
  });
});

describe('watch direct-edit hardware boundary', () => {
  it('requires the callback that owns the resolved write operation', () => {
    expect(canEditWatchValue(WATCH_COMMIT_ACTION.SET, true, false)).toBe(true);
    expect(canEditWatchValue(WATCH_COMMIT_ACTION.SET, false, true)).toBe(false);
    expect(canEditWatchValue(WATCH_COMMIT_ACTION.UPDATE_FORCE, false, true)).toBe(true);
    expect(canEditWatchValue(WATCH_COMMIT_ACTION.UPDATE_FORCE, true, false)).toBe(false);
    expect(canEditWatchValue(WATCH_COMMIT_ACTION.BLOCKED, true, true)).toBe(false);
  });

  it('uses the serial session state before entering and committing an edit, with operator-facing guidance', () => {
    const source = withEnglishMessages(readFileSync(join(import.meta.dir, 'DebugWatchPanel.tsx'), 'utf8'));

    expect(source).toContain('resolveWatchCommitAction(forceState, hasActiveSerialSession)');
    expect(source).toContain('resolveWatchCommitAction(currentRow?.result.forceEntry?.state, hasActiveSerialSession)');
    expect(source).toContain('canEditWatchValue(action, Boolean(setValue), Boolean(toggleForceValue))');
    expect(source).toContain('if (action === WATCH_COMMIT_ACTION.UPDATE_FORCE) {');
    expect(source).toContain('Direct value edits are simulation-only. Use Force for hardware.');
  });
});

describe('canReleaseForces', () => {
  it('permits release only for an active serial session with force evidence', () => {
    expect(canReleaseForces(true, true, false)).toBe(true);
    expect(canReleaseForces(true, true)).toBe(true); // Uncertainty does not block recovery.
  });

  it('blocks release for simulation, no evidence, no session, or a busy request', () => {
    expect(canReleaseForces(false, true, false)).toBe(false);
    expect(canReleaseForces(true, false, false)).toBe(false);
    expect(canReleaseForces(false, false, false)).toBe(false);
    expect(canReleaseForces(true, true, true)).toBe(false);
  });
});

describe('canToggleForce', () => {
  it('needs a value to force: a row whose value has not been read yet offers nothing to hold', () => {
    expect(canToggleForce(true, false)).toBe(false);
    expect(canToggleForce(true, true)).toBe(true);
  });

  it('never needs a value to release a force, so a force can always be let go', () => {
    expect(canToggleForce(false, false)).toBe(true);
    expect(canToggleForce(false, true)).toBe(true);
  });

  it('is what the Force checkbox and its handler both ask, so that a click is never dropped without a word', () => {
    const source = withEnglishMessages(readFileSync(join(import.meta.dir, 'DebugWatchPanel.tsx'), 'utf8'));

    expect(source).toContain('canToggleForce(!result.forced, result.value !== null || editing?.path === path)');
    expect(source).toContain('canToggleForce(nextForced, draftValue !== null)');
    expect(source).toContain('Waiting for the first value of this variable');
    expect(source).not.toContain('if (draftValue === null) {');
  });
});
