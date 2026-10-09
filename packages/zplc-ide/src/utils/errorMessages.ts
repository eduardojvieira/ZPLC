/** Plain-language messages for failures the user must see, and the reset rule of an error boundary. */

const MAX_MESSAGE_LENGTH = 200;

/** First line of an error's message (or of a thrown string), bounded; empty when there is none. */
function firstLine(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  const line = text.split('\n', 1)[0].trim();
  return line.length > MAX_MESSAGE_LENGTH ? `${line.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : line;
}

/** Why a folder could not be opened, created or copied into, from the error the browser raised. */
export function folderErrorReason(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Access to the folder was denied. Allow access to the folder and try again.';
  if (name === 'NotFoundError') return 'The folder, or a file in it, was not found.';
  if (name === 'NoModificationAllowedError' || name === 'InvalidStateError') return 'The folder is read-only or in use by another program.';
  return firstLine(error) || 'Unknown error.';
}

/** The message shown in a region whose component threw while rendering. */
export function describeRenderError(error: unknown): string {
  return firstLine(error) || 'Unexpected error.';
}

/** A boundary clears its error when what it shows changes (another file, another panel tab). */
export function shouldResetBoundary(previousKey: unknown, nextKey: unknown): boolean {
  return !Object.is(previousKey, nextKey);
}
