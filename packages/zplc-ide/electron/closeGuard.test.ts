import { describe, expect, it } from 'bun:test';
import { createCloseGuard } from './closeGuard';

describe('close guard', () => {
  it('lets a close or reload through when nothing is modified', () => {
    const guard = createCloseGuard();
    expect(guard.request('close')).toBe('proceed');
    expect(guard.request('reload')).toBe('proceed');
    expect(guard.confirm()).toBeNull();
  });

  it('asks the renderer before a close or reload while files are modified', () => {
    const guard = createCloseGuard();
    guard.setDirty(true);
    expect(guard.request('close')).toBe('ask');
    expect(guard.request('reload')).toBe('ask');
  });

  it('runs the requested action once when the user chose save or discard', () => {
    const guard = createCloseGuard();
    guard.setDirty(true);
    guard.request('reload');
    expect(guard.confirm()).toBe('reload');
    expect(guard.confirm()).toBeNull();
  });

  it('keeps asking after the user cancelled, because the work is still unsaved', () => {
    const guard = createCloseGuard();
    guard.setDirty(true);
    expect(guard.request('close')).toBe('ask');
    // Cancel sends nothing to the main process; the next request asks again.
    expect(guard.request('close')).toBe('ask');
    expect(guard.confirm()).toBe('close');
  });

  it('stops asking once everything is saved', () => {
    const guard = createCloseGuard();
    guard.setDirty(true);
    guard.setDirty(false);
    expect(guard.request('close')).toBe('proceed');
  });

  it('ignores a confirmation that no request asked for', () => {
    const guard = createCloseGuard();
    guard.setDirty(true);
    expect(guard.confirm()).toBeNull();
  });

  it('never blocks a close when the renderer is gone, until it reports again', () => {
    const guard = createCloseGuard();
    guard.setDirty(true);
    guard.release();
    expect(guard.request('close')).toBe('proceed');
    guard.setDirty(true);
    expect(guard.request('close')).toBe('ask');
  });

  it('asks again once a hung renderer answers', () => {
    const guard = createCloseGuard();
    guard.setDirty(true);
    guard.release();
    guard.resume();
    expect(guard.request('close')).toBe('ask');
  });
});
