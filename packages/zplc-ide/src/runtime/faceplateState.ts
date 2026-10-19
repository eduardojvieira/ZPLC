/**
 * The state of an input change on the faceplate (LRN-017): written by Studio, waiting for the start of the next scan,
 * then in the image. The runtime applies a write to the input image at a scan boundary, so the value read back is the
 * truth: a change is pending while the runtime still holds the old value and applied once the new one is read.
 *
 * Pure TypeScript with no Electron, store or component import.
 */

/** Whether the value the runtime holds is the value that was written; a REAL is held as a 32-bit float. */
export function sameInputValue(type: string, written: boolean | number, held: boolean | number): boolean {
  if (typeof written === 'number' && typeof held === 'number' && type === 'REAL') return Math.fround(written) === held;
  return written === held;
}

/** Splits the pending changes into those the runtime now holds (applied) and those it does not (still pending). */
export function settleInputs(
  pending: ReadonlyMap<string, boolean | number>,
  read: ReadonlyMap<string, boolean | number>,
  types: ReadonlyMap<string, string>,
): { pending: Map<string, boolean | number>; applied: string[] } {
  const still = new Map<string, boolean | number>();
  const applied: string[] = [];
  for (const [path, written] of pending) {
    const held = read.get(path);
    if (held !== undefined && sameInputValue(types.get(path) ?? '', written, held)) applied.push(path);
    else still.set(path, written);
  }
  return { pending: still, applied };
}

/**
 * One change in flight at a time per control, and of those that arrive while it is, only the last: a slider dragged
 * across its range sends the value it ends on, not every step, and the runtime queue stays short. Every call returns
 * when its own value has been sent (or replaced by a later one); a failed send is reported to the call that made it.
 */
export function latestWins<T>(send: (value: T) => Promise<void>): (value: T) => Promise<void> {
  let inFlight = false;
  let waiting: { value: T } | null = null;
  const drain = async (first: T): Promise<void> => {
    inFlight = true;
    try {
      await send(first);
      while (waiting !== null) {
        const next: { value: T } = waiting;
        waiting = null;
        await send(next.value);
      }
    } finally {
      inFlight = false;
    }
  };
  return (value) => {
    if (inFlight) { waiting = { value }; return Promise.resolve(); }
    return drain(value);
  };
}

/**
 * A momentary control: a press sends TRUE once and a release sends FALSE once, whatever events follow (a key that
 * repeats, a pointer that leaves a button after the key was let go). A release with no press before it sends nothing.
 */
export function createHold(onChange: (down: boolean) => void): { press: () => void; release: () => void; held: () => boolean } {
  let held = false;
  const change = (down: boolean) => {
    if (held === down) return;
    held = down;
    onChange(down);
  };
  return { press: () => change(true), release: () => change(false), held: () => held };
}

export type FaceplateUnavailable = 'noMap' | 'notConnected' | 'hardware' | 'faulted' | 'paused' | 'notRunning' | 'noCapability';

/**
 * Why the faceplate cannot apply an input change now, or null when it can. A paused program is not offered the change: the
 * runtime may be holding a scan at a breakpoint, and a change must reach the program at a scan boundary, never inside one;
 * the Watch table is where a paused program is edited.
 */
export function faceplateUnavailable(state: { hasMap: boolean; connected: boolean; simulated: boolean; vmState: string; supported: boolean }): FaceplateUnavailable | null {
  if (!state.hasMap) return 'noMap';
  if (!state.connected) return 'notConnected';
  if (!state.simulated) return 'hardware';
  if (state.vmState === 'error') return 'faulted';
  if (state.vmState === 'paused') return 'paused';
  if (state.vmState !== 'running') return 'notRunning';
  return state.supported ? null : 'noCapability';
}
