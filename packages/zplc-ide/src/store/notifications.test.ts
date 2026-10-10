import { afterEach, describe, expect, it } from 'bun:test';

import {
  NOTIFICATION_LIMIT,
  SUCCESS_VISIBLE_MS,
  beginNotification,
  dismissNotification,
  expireNotifications,
  finishNotification,
  useNotifications,
  type AppNotification,
} from './notifications';

const base = { kind: 'build' as const, title: 'Building project', details: 'output' as const };
const t0 = 1_000;

describe('the notification model (IDE-021)', () => {
  it('shows a long operation as running, with progress and a cancel action, until it ends', () => {
    let cancelled = 0;
    const list = beginNotification([], { ...base, cancel: () => { cancelled += 1; } }, 'a', t0);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', kind: 'build', status: 'running', details: 'output', startedAt: t0 });
    list[0]!.cancel?.();
    expect(cancelled).toBe(1);
    const done = finishNotification(list, 'a', { kind: 'build', status: 'success', title: 'Build succeeded', detail: 'Motor.zplc, 420 bytes', details: 'output' }, t0 + 50);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ id: 'a', status: 'success', title: 'Build succeeded', detail: 'Motor.zplc, 420 bytes', finishedAt: t0 + 50 });
    expect(done[0]!.cancel).toBeUndefined();
  });

  it('links every result to the panel that holds its details', () => {
    const failed = finishNotification(beginNotification([], base, 'a', t0), 'a', { kind: 'build', status: 'error', title: 'Build failed', details: 'problems' }, t0 + 5);
    expect(failed[0]).toMatchObject({ status: 'error', details: 'problems' });
    const saved = finishNotification([], 'b', { kind: 'save', status: 'success', title: 'Saved Motor.st', details: 'output' }, t0);
    expect(saved[0]).toMatchObject({ id: 'b', kind: 'save', status: 'success', details: 'output' });
  });

  it('shows the result of an operation that the user had already dismissed', () => {
    const running = beginNotification([], base, 'a', t0);
    const dismissed = dismissNotification(running, 'a');
    expect(dismissed).toEqual([]);
    const result = finishNotification(dismissed, 'a', { kind: 'build', status: 'error', title: 'Build failed', details: 'problems' }, t0 + 10);
    expect(result.map((entry) => entry.status)).toEqual(['error']);
  });

  it('keeps only the latest finished result of a kind, and never drops one that is still running', () => {
    let list: AppNotification[] = [];
    list = finishNotification(list, 'save-1', { kind: 'save', status: 'success', title: 'Saved A', details: 'output' }, t0);
    list = finishNotification(list, 'save-2', { kind: 'save', status: 'success', title: 'Saved B', details: 'output' }, t0 + 1);
    expect(list.map((entry) => entry.title)).toEqual(['Saved B']);
    list = beginNotification(list, { ...base }, 'build-1', t0 + 2);
    list = beginNotification(list, { ...base, title: 'Building again' }, 'build-2', t0 + 3);
    expect(list.filter((entry) => entry.kind === 'build').map((entry) => entry.id)).toEqual(['build-1', 'build-2']);
  });

  it('is bounded: the oldest finished results go first', () => {
    let list: AppNotification[] = [];
    for (let index = 0; index < NOTIFICATION_LIMIT + 4; index += 1) {
      list = finishNotification(list, `n${index}`, { kind: index % 2 === 0 ? 'tests' : 'deploy', status: 'error', title: `Result ${index}`, details: 'output' }, t0 + index);
    }
    expect(list.length).toBeLessThanOrEqual(NOTIFICATION_LIMIT);
    expect(list.at(-1)!.title).toBe(`Result ${NOTIFICATION_LIMIT + 3}`);
  });

  it('lets a success go after a few seconds, and keeps a failure, a warning and a cancellation until they are dismissed', () => {
    let list: AppNotification[] = [];
    list = finishNotification(list, 's', { kind: 'save', status: 'success', title: 'Saved', details: 'output' }, t0);
    list = finishNotification(list, 'e', { kind: 'build', status: 'error', title: 'Build failed', details: 'problems' }, t0);
    list = finishNotification(list, 'w', { kind: 'deploy', status: 'warning', title: 'Earlier build received', details: 'output' }, t0);
    list = finishNotification(list, 'c', { kind: 'tests', status: 'cancelled', title: 'Tests cancelled', details: 'tests' }, t0);
    list = beginNotification(list, { kind: 'connection', title: 'Connecting', details: 'output' }, 'r', t0);
    expect(expireNotifications(list, t0 + SUCCESS_VISIBLE_MS - 1)).toHaveLength(5);
    expect(expireNotifications(list, t0 + SUCCESS_VISIBLE_MS + 1).map((entry) => entry.id)).toEqual(['e', 'w', 'c', 'r']);
  });

  it('dismissing a notification that is not on the list changes nothing', () => {
    const list = beginNotification([], base, 'a', t0);
    expect(dismissNotification(list, 'missing')).toBe(list);
  });
});

describe('the notification store (IDE-021)', () => {
  afterEach(() => useNotifications.getState().clear());

  it('begins an operation, finishes it in place, and dismisses it', () => {
    const store = useNotifications.getState();
    const id = store.begin({ kind: 'deploy', title: 'Deploying program', details: 'output' });
    expect(useNotifications.getState().items.map((entry) => entry.status)).toEqual(['running']);
    store.finish(id, { kind: 'deploy', status: 'success', title: 'Program deployed and stopped', details: 'output' });
    expect(useNotifications.getState().items.map((entry) => [entry.id, entry.status])).toEqual([[id, 'success']]);
    store.dismiss(id);
    expect(useNotifications.getState().items).toEqual([]);
  });

  it('reports a result that had no running phase', () => {
    useNotifications.getState().report({ kind: 'save', status: 'error', title: 'Could not save Motor.st', details: 'output' });
    expect(useNotifications.getState().items[0]).toMatchObject({ kind: 'save', status: 'error', title: 'Could not save Motor.st' });
  });
});
