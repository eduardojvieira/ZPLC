const ANSI_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;
const PROMPT_ONLY_REGEX = /^[A-Za-z0-9_-]+:~\$\s*$/;
const LEADING_PROMPT_REGEX = /^(?:[A-Za-z0-9_-]+:~\$\s*)+/;

export interface SerialConsoleChunkResult {
  lines: string[];
  remainder: string;
}

function normalizeLine(rawLine: string): string | null {
  const withoutAnsi = rawLine.replace(ANSI_REGEX, '').replace(/\r/g, '').replace(/\x08/g, '');
  const withoutPrompt = withoutAnsi.replace(LEADING_PROMPT_REGEX, '');
  const line = withoutPrompt.trimEnd();

  if (!line.trim()) {
    return null;
  }

  if (PROMPT_ONLY_REGEX.test(line.trim())) {
    return null;
  }

  return line;
}

export function consumeSerialConsoleChunk(remainder: string, chunk: string): SerialConsoleChunkResult {
  const combined = `${remainder}${chunk}`;
  const parts = combined.split(/\r?\n/);
  const nextRemainder = parts.pop() ?? '';
  const lines = parts
    .map(normalizeLine)
    .filter((line): line is string => line !== null);

  return {
    lines,
    remainder: nextRemainder,
  };
}

export function flushSerialConsoleRemainder(remainder: string): string[] {
  const line = normalizeLine(remainder);
  return line ? [line] : [];
}
