import { afterEach, describe, expect, it } from 'bun:test';
import { bindIoModeLink, createFakeIoModeLink, getIoModeStatus, requestFeedBoard, setIoModeMirroring, startIoMode } from './ioModeStatus';

let unbind: (() => void) | undefined;
afterEach(() => unbind?.());

describe('plant I/O mode status (LNK-008, LNK-010, LNK-014)', () => {
  it('LNK-008 binding a link starts nothing, and with no link the mode is off', () => {
    expect(getIoModeStatus().state).toBe('off');
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    expect(link.calls).toEqual([]);
    expect(getIoModeStatus().state).toBe('off');
  });

  it('PLS-008 only startIoMode starts the mode, and the status follows the link', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    await startIoMode();
    expect(link.calls).toEqual(['start']);
    expect(getIoModeStatus().state).toBe('running');
  });

  it('LNK-010 mirroring is off by default and is turned on only by a person, for the session', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    await startIoMode();
    expect(getIoModeStatus().mirroring).toBe(false);
    await setIoModeMirroring(true);
    expect(getIoModeStatus().mirroring).toBe(true);
  });

  it('LNK-014 the measured latency is the link\'s, and null before the first measure', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    await startIoMode();
    expect(getIoModeStatus().latencyMs).toBeNull();
    link.measure({ last: 4, worst: 9 });
    expect(getIoModeStatus().latencyMs).toEqual({ last: 4, worst: 9 });
  });

  it('PLS-008 a failed start keeps its reason as text', async () => {
    const link = createFakeIoModeLink({ failStart: 'the board did not answer the entry' });
    unbind = bindIoModeLink(link);
    await startIoMode();
    expect(getIoModeStatus().state).toBe('failed');
    expect(getIoModeStatus().failure).toBe('the board did not answer the entry');
  });

  it('LNK-008 asking to feed the board only opens the question, and cancelling changes nothing', () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    requestFeedBoard(true);
    expect(getIoModeStatus().confirming).toBe(true);
    requestFeedBoard(false);
    expect(getIoModeStatus().confirming).toBe(false);
    expect(link.calls).toEqual([]);
  });
});
