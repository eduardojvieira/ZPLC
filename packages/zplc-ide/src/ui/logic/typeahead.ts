/** Type-ahead search over the labels of a list or menu: the typed characters form a buffer that expires. */
export interface TypeaheadState {
  buffer: string;
  at: number;
}

export const TYPEAHEAD_TIMEOUT_MS = 700;

/**
 * The item a printable key selects. A repeated letter cycles through the items that start with it; a longer buffer
 * narrows to the items that start with the whole prefix, searching from the current item.
 */
export function typeahead(
  state: TypeaheadState,
  key: string,
  now: number,
  labels: readonly string[],
  current: number,
  isDisabled: (index: number) => boolean = () => false,
): { state: TypeaheadState; index: number | null } {
  if (key.length !== 1 || key === ' ') return { state, index: null };
  const expired = now - state.at > TYPEAHEAD_TIMEOUT_MS;
  const buffer = `${expired ? '' : state.buffer}${key.toLowerCase()}`;
  const next: TypeaheadState = { buffer, at: now };
  const repeated = buffer.length > 1 && [...buffer].every((char) => char === buffer[0]);
  const prefix = repeated ? buffer[0] : buffer;
  // A multi-character prefix may match the current item itself; a repeated single letter moves on to the next one.
  const from = repeated || buffer.length === 1 ? current + 1 : current;
  for (let taken = 0; taken < labels.length; taken += 1) {
    const index = (((from + taken) % labels.length) + labels.length) % labels.length;
    if (!isDisabled(index) && labels[index].toLowerCase().startsWith(prefix)) return { state: next, index };
  }
  return { state: next, index: null };
}
