/**
 * The JSON reply of a shell command (`... --json`), found in what the serial port received so far: the first complete
 * object, by brace count, or undefined while it is still arriving. Extracted from serialAdapter.ts.
 */
export function takeJsonReply(received: string): unknown {
  let buffer = received;
  // Older firmware prints the stats object of `sys info` with an extra opening brace: '..."uptime_ms":123,{"stats":{...'.
  // Removing that brace balances the count.
  if (buffer.includes(',{"stats":')) buffer = buffer.replace(/,\s*\{\s*"stats"\s*:/g, ',"stats":');
  const start = buffer.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  for (let index = start; index < buffer.length; index++) {
    if (buffer[index] === '{') depth++;
    if (buffer[index] === '}') depth--;
    if (depth === 0) {
      try {
        return JSON.parse(buffer.slice(start, index + 1));
      } catch {
        return undefined; // not complete yet: keep waiting
      }
    }
  }
  return undefined;
}
