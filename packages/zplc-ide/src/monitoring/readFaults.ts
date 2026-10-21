/**
 * The variables the poll of the debug controller asked for and did not get (UX-009).
 *
 * A variable whose read failed is a fault, and a display shows it as one (red, a triangle and a word) until a later poll
 * reads it. The keys are the ones of the poll: a diagram variable is named with its file (`monitorKey`), so the same
 * name in two programs is two entries. The set keeps its identity while nothing changes, so an editor that reads it is
 * not rendered again for a poll that read everything.
 */

let faults: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

const publish = (next: ReadonlySet<string>): void => {
  if (next.size === faults.size && [...next].every((key) => faults.has(key))) return;
  faults = next;
  for (const listener of listeners) listener();
};

/** `polled` is what a poll asked for and `read` what it got back: the difference is faulted, the rest is not. */
export function recordReadFaults(polled: Iterable<string>, read: Iterable<string>): void {
  const got = new Set(read);
  const next = new Set([...faults].filter((key) => !got.has(key)));
  for (const key of polled) if (!got.has(key)) next.add(key);
  publish(next);
}

/** A session ended: nothing is faulted any more. */
export function clearReadFaults(): void {
  publish(new Set());
}

export function readFaultKeys(): ReadonlySet<string> {
  return faults;
}

export function subscribeReadFaults(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
