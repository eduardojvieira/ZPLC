import { describe, expect, it } from 'bun:test';

import {
  createBreakpointSyncer,
  describeBreakpointSyncFailure,
  reportBreakpointSync,
  type BreakpointSyncOutcome,
  type BreakpointSyncTarget,
} from './useDebugControllerBreakpoints';

/** A runtime double: every call takes one macrotask, so two rounds started together really interleave. */
function fakeTarget(options: { refuseAdd?: boolean; refuseClear?: boolean } = {}) {
  const calls: string[] = [];
  /** Start (+) and end (-) of every call: shows whether two rounds overlapped. */
  const trace: string[] = [];
  const held = new Set<number>();
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const target: BreakpointSyncTarget = {
    async clearBreakpoints() {
      calls.push('clear');
      trace.push('+clear');
      await tick();
      trace.push('-clear');
      if (options.refuseClear) throw new Error('breakpoint operation requires an unambiguous task');
      held.clear();
    },
    async setBreakpoint(pc: number) {
      calls.push(`add ${pc}`);
      trace.push(`+add ${pc}`);
      await tick();
      trace.push(`-add ${pc}`);
      if (options.refuseAdd) throw new Error('breakpoint operation requires an unambiguous task');
      // The runtime answers RUNTIME_FAILURE "breakpoint.add failed" when the pc is already present.
      if (held.has(pc)) throw new Error('breakpoint.add failed');
      held.add(pc);
      return true;
    },
  };
  return { target, calls, trace, held };
}

const always = () => true;

describe('createBreakpointSyncer', () => {
  // Fails without the single queue: two rounds started together interleave clear/add and the second add of a pc is refused.
  it('sends one coherent round when the load and the sync effect both ask right after a load', async () => {
    const { target, calls, held } = fakeTarget();
    const syncer = createBreakpointSyncer();

    const [fromLoad, fromEffect] = await Promise.all([
      syncer.sync(target, () => [56, 104], always),
      syncer.sync(target, () => [56, 104], always),
    ]);

    expect(calls).toEqual(['clear', 'add 56', 'add 104']);
    expect([...held]).toEqual([56, 104]);
    expect(fromLoad).toEqual({ pcs: [56, 104], error: null, sent: true });
    expect(fromEffect).toEqual({ pcs: [56, 104], error: null, sent: false });
  });

  // Fails without the queue: the changed list would start its clear while the first round is still adding.
  it('never starts a round before the previous one ended', async () => {
    const { target, trace, held } = fakeTarget();
    const syncer = createBreakpointSyncer();

    const first = syncer.sync(target, () => [56], always);
    await new Promise((resolve) => setTimeout(resolve, 0)); // the first round is in flight
    const second = syncer.sync(target, () => [56, 104], always);
    await Promise.all([first, second]);

    expect(trace).toEqual([
      '+clear', '-clear', '+add 56', '-add 56',
      '+clear', '-clear', '+add 56', '-add 56', '+add 104', '-add 104',
    ]);
    expect([...held]).toEqual([56, 104]);
  });

  it('reads the list when its turn comes, not when it was asked', async () => {
    const { target, calls } = fakeTarget();
    const syncer = createBreakpointSyncer();
    let wanted = [56];

    const first = syncer.sync(target, () => wanted, always);
    wanted = [56, 104];
    const second = syncer.sync(target, () => wanted, always);
    await Promise.all([first, second]);

    expect(calls).toEqual(['clear', 'add 56', 'add 104']);
  });

  it('sends a new round when the list changed', async () => {
    const { target, calls, held } = fakeTarget();
    const syncer = createBreakpointSyncer();

    await syncer.sync(target, () => [56, 104], always);
    const removed = await syncer.sync(target, () => [104], always);

    expect(calls).toEqual(['clear', 'add 56', 'add 104', 'clear', 'add 104']);
    expect([...held]).toEqual([104]);
    expect(removed?.sent).toBe(true);
  });

  // Fails without invalidate(): after a program load or a reset the runtime table is empty although the list did not change.
  it('resends an unchanged list after invalidate', async () => {
    const { target, calls, held } = fakeTarget();
    const syncer = createBreakpointSyncer();
    await syncer.sync(target, () => [56], always);

    held.clear(); // execution.reset / program.load wiped the runtime table
    syncer.invalidate();
    const outcome = await syncer.sync(target, () => [56], always);

    expect(calls).toEqual(['clear', 'add 56', 'clear', 'add 56']);
    expect([...held]).toEqual([56]);
    expect(outcome?.sent).toBe(true);
  });

  // Fails without the epoch: the round that was in flight during the load would mark the (wiped) table as in sync.
  it('does not let a round that ran during a load mark the runtime in sync', async () => {
    const { target, calls } = fakeTarget();
    const syncer = createBreakpointSyncer();

    const inFlight = syncer.sync(target, () => [56], always);
    await new Promise((resolve) => setTimeout(resolve, 0)); // the round is between its calls
    syncer.invalidate(); // program.load happens now
    const afterLoad = syncer.sync(target, () => [56], always);
    await Promise.all([inFlight, afterLoad]);

    expect(calls).toEqual(['clear', 'add 56', 'clear', 'add 56']);
    expect((await afterLoad)?.sent).toBe(true);
  });

  it('sends each pc once even when two lines map to the same pc', async () => {
    const { target, calls } = fakeTarget();
    const syncer = createBreakpointSyncer();

    const outcome = await syncer.sync(target, () => [104, 56, 104], always);

    expect(calls).toEqual(['clear', 'add 56', 'add 104']);
    expect(outcome).toEqual({ pcs: [56, 104], error: null, sent: true });
  });

  it('reports a refusal, leaves nothing half set, and does not repeat it for the same list', async () => {
    const { target, calls } = fakeTarget({ refuseAdd: true });
    const syncer = createBreakpointSyncer();

    const first = await syncer.sync(target, () => [56], always);
    const again = await syncer.sync(target, () => [56], always);

    expect(first?.sent).toBe(true);
    expect((first?.error as Error).message).toContain('unambiguous task');
    // clear, the refused add, then the best-effort clear that keeps the table all-or-nothing
    expect(calls).toEqual(['clear', 'add 56', 'clear']);
    expect(again).toEqual({ pcs: [56], error: first?.error, sent: false });
  });

  it('tries again when the list changes after a refusal', async () => {
    const { target, calls } = fakeTarget({ refuseAdd: true });
    const syncer = createBreakpointSyncer();

    await syncer.sync(target, () => [56], always);
    const next = await syncer.sync(target, () => [56, 104], always);

    expect(next?.sent).toBe(true);
    expect(calls).toEqual(['clear', 'add 56', 'clear', 'clear', 'add 56', 'clear']);
  });

  it('survives a runtime that refuses even clear', async () => {
    const { target } = fakeTarget({ refuseClear: true });
    const syncer = createBreakpointSyncer();

    const outcome = await syncer.sync(target, () => [], always);

    expect(outcome?.pcs).toEqual([]);
    expect((outcome?.error as Error).message).toContain('unambiguous task');
  });

  // Fails if a round keeps calling a runtime whose adapter was replaced or disconnected meanwhile.
  it('drops the round and reports nothing when the adapter is no longer current', async () => {
    const { target, calls } = fakeTarget({ refuseAdd: true });
    const syncer = createBreakpointSyncer();
    let current = true;

    const round = syncer.sync(target, () => [56, 104], () => current);
    await new Promise((resolve) => setTimeout(resolve, 0));
    current = false;

    expect(await round).toBeNull();
    expect(calls).toEqual(['clear']);
    // And the next round for a live adapter starts from scratch, not from a half-known state.
    expect((await syncer.sync(target, () => [56], always))?.sent).toBe(true);
  });

  it('keeps the queue going after a round that threw', async () => {
    const { target, calls } = fakeTarget();
    const syncer = createBreakpointSyncer();

    await expect(syncer.sync(target, () => { throw new Error('store unavailable'); }, always)).rejects.toThrow('store unavailable');
    const outcome = await syncer.sync(target, () => [56], always);

    expect(outcome?.sent).toBe(true);
    expect(calls).toEqual(['clear', 'add 56']);
  });

  it('forgets a runtime it knew when another adapter is synced', async () => {
    const first = fakeTarget();
    const second = fakeTarget();
    const syncer = createBreakpointSyncer();

    await syncer.sync(first.target, () => [56], always);
    const outcome = await syncer.sync(second.target, () => [56], always);

    expect(outcome?.sent).toBe(true);
    expect(second.calls).toEqual(['clear', 'add 56']);
  });
});

describe('describeBreakpointSyncFailure', () => {
  // Fails without the mapping: the owner would read the runtime's internal wording.
  it('explains the several-task refusal in plain words, also when Electron wraps the message', () => {
    const plain = describeBreakpointSyncFailure(new Error('breakpoint operation requires an unambiguous task'));
    const wrapped = describeBreakpointSyncFailure(
      new Error("Error invoking remote method 'native:request': Error: breakpoint operation requires an unambiguous task"),
    );

    expect(plain).toBe('the runtime accepts breakpoints only in a program with one task, and this program has several');
    expect(wrapped).toBe(plain);
  });

  it('quotes any other refusal of the runtime', () => {
    expect(describeBreakpointSyncFailure(new Error('breakpoint.add failed'))).toBe('the runtime refused them (breakpoint.add failed)');
    expect(describeBreakpointSyncFailure('timeout')).toBe('the runtime refused them (timeout)');
  });
});

describe('reportBreakpointSync', () => {
  function sinks() {
    const entries: Array<{ type: string; message: string; source: string }> = [];
    const reasons: Array<string | null> = [];
    return {
      entries,
      reasons,
      sinks: {
        addConsoleEntry: (entry: { type: 'warning'; message: string; source: string }) => entries.push(entry),
        setBreakpointsInactiveReason: (reason: string | null) => reasons.push(reason),
      },
    };
  }
  const refused: BreakpointSyncOutcome = {
    pcs: [56, 104],
    error: new Error('breakpoint operation requires an unambiguous task'),
    sent: true,
  };

  // Fails while a refusal only reaches devtools: the Console must say the dots are not active and why.
  it('tells the Console and marks the dots inactive when the runtime refused a round', () => {
    const out = sinks();

    reportBreakpointSync(refused, out.sinks);

    expect(out.entries).toEqual([{
      type: 'warning',
      message: 'Breakpoints are not active: the runtime accepts breakpoints only in a program with one task, and this program has several. '
        + 'The dots stay in the editor, but the program will not stop at them.',
      source: 'debugger',
    }]);
    expect(out.reasons).toEqual(['the runtime accepts breakpoints only in a program with one task, and this program has several']);
  });

  it('marks the dots active again after a round the runtime accepted', () => {
    const out = sinks();

    reportBreakpointSync({ pcs: [56], error: null, sent: true }, out.sinks);

    expect(out.entries).toEqual([]);
    expect(out.reasons).toEqual([null]);
  });

  // Fails if a refused clear with no dots at all (a several-task program without breakpoints) warns the owner.
  it('stays quiet about a refusal when there are no dots to be inactive', () => {
    const out = sinks();

    reportBreakpointSync({ ...refused, pcs: [] }, out.sinks);

    expect(out.entries).toEqual([]);
    expect(out.reasons).toEqual([null]);
  });

  // Fails if a skipped round repeated the warning (the effect asks again after every load and capability event).
  it('says nothing for a round that sent nothing, or for a stale one', () => {
    const out = sinks();

    reportBreakpointSync({ ...refused, sent: false }, out.sinks);
    reportBreakpointSync(null, out.sinks);

    expect(out.entries).toEqual([]);
    expect(out.reasons).toEqual([]);
  });

  it('reports the refusal of a real syncer round once, not on every ask', async () => {
    const { target } = fakeTarget({ refuseAdd: true });
    const syncer = createBreakpointSyncer();
    const out = sinks();

    for (let ask = 0; ask < 3; ask += 1) {
      reportBreakpointSync(await syncer.sync(target, () => [56], always), out.sinks);
    }

    expect(out.entries).toHaveLength(1);
  });
});
