import { afterEach, describe, expect, it } from 'bun:test';
import { answerConfirmation, currentConfirmation, mountConfirmHost } from '../store/actionConfirm';
import {
  confirmForce,
  confirmForceChange,
  confirmRelease,
  confirmReleaseAll,
  confirmReset,
  confirmStop,
  forceValueText,
  needsPhysicalConfirmation,
  proceedAfterConfirmation,
} from './physicalActions';

let unmount: (() => void) | null = null;
afterEach(() => {
  unmount?.();
  unmount = null;
});

/** Asks the question, reads what the dialog would show, and answers it. */
async function ask(question: () => Promise<boolean>, answer = true) {
  unmount = mountConfirmHost();
  const result = question();
  const shown = currentConfirmation();
  answerConfirmation(answer);
  unmount();
  unmount = null;
  return { shown, result: await result };
}

describe('UX-020 physical actions on a device ask first', () => {
  it('UX-020 asks only when the target is real hardware, never in a simulation', () => {
    expect(needsPhysicalConfirmation('hardware')).toBe(true);
    expect(needsPhysicalConfirmation('simulate')).toBe(false);
  });

  it('UX-020 names the action on the button of STOP and RESET and treats both as destructive', async () => {
    const stop = await ask(confirmStop);
    expect(stop.shown).toMatchObject({ title: 'Stop the PLC?', actionLabel: 'Stop PLC', cancelLabel: 'Cancel', destructive: true });
    expect(stop.result).toBe(true);
    const reset = await ask(confirmReset, false);
    expect(reset.shown).toMatchObject({ title: 'Reset the PLC?', actionLabel: 'Reset PLC', destructive: true });
    expect(reset.result).toBe(false);
  });

  it('UX-020 says which variable is forced and to what value, and names the button after the action', async () => {
    const force = await ask(() => confirmForce('Motor.Start', true));
    expect(force.shown?.title).toBe('Force Motor.Start?');
    expect(force.shown?.description).toContain('Motor.Start at TRUE');
    expect(force.shown?.actionLabel).toBe('Force variable');
    const change = await ask(() => confirmForceChange('Speed', 1500));
    expect(change.shown?.description).toContain('Speed at 1500');
    expect(change.shown?.actionLabel).toBe('Change forced value');
  });

  it('UX-020 releasing one force or all forces says that outputs can change at once', async () => {
    const one = await ask(() => confirmRelease('Motor.Start'));
    expect(one.shown).toMatchObject({ actionLabel: 'Release force' });
    expect(one.shown?.description).toContain('output can change at once');
    const all = await ask(confirmReleaseAll);
    expect(all.shown).toMatchObject({ title: 'Release all forces?', actionLabel: 'Release all forces' });
  });

  it('UX-020 goes ahead in a simulation without asking, and on hardware only after a yes', async () => {
    let asked = 0;
    const ask = (answer: boolean) => async () => {
      asked += 1;
      return answer;
    };
    expect(await proceedAfterConfirmation('simulate', ask(false))).toBe(true);
    expect(asked).toBe(0);
    expect(await proceedAfterConfirmation('hardware', ask(false))).toBe(false);
    expect(await proceedAfterConfirmation('hardware', ask(true))).toBe(true);
    expect(asked).toBe(2);
  });

  it('UX-020 writes a value the way the PLC reads it', () => {
    expect([forceValueText(false), forceValueText(7), forceValueText('on'), forceValueText(null)]).toEqual(['FALSE', '7', 'on', '?']);
  });
});
