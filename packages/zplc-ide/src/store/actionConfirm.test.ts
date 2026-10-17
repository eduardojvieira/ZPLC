import { afterEach, describe, expect, it } from 'bun:test';
import { answerConfirmation, confirmAction, currentConfirmation, mountConfirmHost, type ActionConfirmRequest } from './actionConfirm';

const request: ActionConfirmRequest = { title: 'Stop the PLC?', description: 'The outputs go to their safe values.', actionLabel: 'Stop PLC', cancelLabel: 'Cancel', destructive: true };

let unmount: (() => void) | null = null;
afterEach(() => { unmount?.(); unmount = null; });

describe('UX-020 action confirmation service', () => {
  it('UX-020 never says yes when no dialog host is mounted, so an action cannot run unasked', async () => {
    expect(await confirmAction(request)).toBe(false);
    expect(currentConfirmation()).toBeNull();
  });

  it('UX-020 resolves true only when the person chooses the action, and false on cancel', async () => {
    unmount = mountConfirmHost();
    const yes = confirmAction(request);
    expect(currentConfirmation()?.title).toBe('Stop the PLC?');
    answerConfirmation(true);
    expect(await yes).toBe(true);
    expect(currentConfirmation()).toBeNull();

    const no = confirmAction(request);
    answerConfirmation(false);
    expect(await no).toBe(false);
  });

  it('UX-020 refuses a second request while one is open and leaves the first one asking', async () => {
    unmount = mountConfirmHost();
    const first = confirmAction(request);
    expect(await confirmAction({ ...request, title: 'Reset the PLC?' })).toBe(false);
    expect(currentConfirmation()?.title).toBe('Stop the PLC?');
    answerConfirmation(true);
    expect(await first).toBe(true);
  });

  it('UX-020 answers an open question as no when the host goes away', async () => {
    unmount = mountConfirmHost();
    const open = confirmAction(request);
    unmount();
    unmount = null;
    expect(await open).toBe(false);
  });
});
