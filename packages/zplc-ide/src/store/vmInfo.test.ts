import { afterEach, describe, expect, test } from 'bun:test';
import { publishVmInfo, subscribeVmInfo, vmInfoNow } from './vmInfo';

const info = (cycles: number) => ({ pc: 4, sp: 0, halted: false, cycles, error: 0 });

describe('the runtime info of the last poll', () => {
  afterEach(() => publishVmInfo(null));

  // Fails without store/vmInfo.ts: the info was React state of the app, so every poll rendered the whole window again.
  test('notifies a subscriber of a change and not of the same values again', () => {
    let notified = 0;
    const unsubscribe = subscribeVmInfo(() => { notified += 1; });
    publishVmInfo(info(1));
    publishVmInfo(info(1));
    expect(notified).toBe(1);
    publishVmInfo(info(2));
    expect(notified).toBe(2);
    expect(vmInfoNow()?.cycles).toBe(2);
    publishVmInfo(null);
    expect(vmInfoNow()).toBeNull();
    unsubscribe();
    publishVmInfo(info(3));
    expect(notified).toBe(3);
  });
});
