import { describe, expect, it } from 'bun:test';

import { createHold, latestWins, sameInputValue, settleInputs } from './faceplateState';

describe('an input change that waits for the next scan (LRN-017)', () => {
  it('compares a value as the runtime holds it: a REAL as a 32-bit float, an integer exactly', () => {
    expect(sameInputValue('REAL', 0.1, Math.fround(0.1))).toBe(true);
    expect(sameInputValue('REAL', 0.1, 0.2)).toBe(false);
    expect(sameInputValue('INT', 5, 5)).toBe(true);
    expect(sameInputValue('INT', 5, 6)).toBe(false);
    expect(sameInputValue('BOOL', true, true)).toBe(true);
    expect(sameInputValue('BOOL', true, false)).toBe(false);
  });

  it('keeps a change pending while the runtime holds the old value, and reports it applied when the value arrives', () => {
    const types = new Map([['P.A', 'BOOL'], ['P.B', 'INT']]);
    const pending = new Map<string, boolean | number>([['P.A', true], ['P.B', 7]]);
    const first = settleInputs(pending, new Map<string, boolean | number>([['P.A', false], ['P.B', 7]]), types);
    expect([...first.pending.keys()]).toEqual(['P.A']);
    expect(first.applied).toEqual(['P.B']);
    const second = settleInputs(first.pending, new Map<string, boolean | number>([['P.A', true], ['P.B', 7]]), types);
    expect(second.pending.size).toBe(0);
    expect(second.applied).toEqual(['P.A']);
  });

  it('keeps a change pending when its input was not read this time', () => {
    const outcome = settleInputs(new Map([['P.A', true]]), new Map(), new Map([['P.A', 'BOOL']]));
    expect([...outcome.pending.keys()]).toEqual(['P.A']);
    expect(outcome.applied).toEqual([]);
  });
});

describe('sending the changes of one control (LRN-017)', () => {
  it('sends one change at a time and, of those that arrive meanwhile, only the last', async () => {
    const sent: number[] = [];
    let release: () => void = () => undefined;
    const send = latestWins<number>(async (value) => { sent.push(value); await new Promise<void>((resolve) => { release = resolve; }); });
    const first = send(1);
    void send(2);
    void send(3);
    expect(sent).toEqual([1]);
    release();
    await Promise.resolve(); await Promise.resolve();
    expect(sent).toEqual([1, 3]);
    release();
    await first;
  });

  it('reports a failed send to its caller and sends the next change afterwards', async () => {
    const sent: number[] = [];
    const send = latestWins<number>(async (value) => { sent.push(value); if (value === 1) throw new Error('refused'); });
    await expect(send(1)).rejects.toThrow('refused');
    await send(2);
    expect(sent).toEqual([1, 2]);
  });
});

describe('a push button on the faceplate (LRN-017)', () => {
  it('sends TRUE once when it is pressed and FALSE once when it is let go, whatever events follow', () => {
    const sent: boolean[] = [];
    const hold = createHold((down) => sent.push(down));
    hold.press();
    hold.press();
    expect(hold.held()).toBe(true);
    hold.release();
    hold.release();
    expect(hold.held()).toBe(false);
    expect(sent).toEqual([true, false]);
  });

  it('sends nothing for a release that no press came before (a pointer that leaves a button nobody pressed)', () => {
    const sent: boolean[] = [];
    createHold((down) => sent.push(down)).release();
    expect(sent).toEqual([]);
  });
});
