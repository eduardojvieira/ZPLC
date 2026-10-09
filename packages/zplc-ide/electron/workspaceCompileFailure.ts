/**
 * What the renderer may learn from a failed workspace build, built in the main process from the Tool API result.
 * Pure TypeScript with no Electron import, so that it can be tested without a window.
 */

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.includes('\0') || value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) return undefined;
  return value.split(/[\\/]/).some((part) => part === '..') ? undefined : value;
}

function safeLocation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000 ? value : undefined;
}

/** The longest compiler message the renderer receives, in characters. */
const MAX_MESSAGE_CHARS = 300;
/**
 * An absolute path: a drive (a letter, a colon, then a slash or backslash), a UNC share (two backslashes) or a "/" that
 * starts a name. A "/" inside a relative path ("src/Motor.st", "./a", "../a"), an operator ("/=") and a division ("3/4") do not.
 * ponytail: a path ends at white space or a quote, so the tail of a path that contains a space is kept. Upgrade: have
 * the compiler report the path as a field instead of inside its message.
 */
const ABSOLUTE_PATH = /(?<![\w.)\]\\/])(?:[A-Za-z]:[\\/]|\\\\|\/(?=[\w.~@+-]))[^\s'"`<>|]*/g;

/** The compiler's own message as plain text: no control character, no absolute path, at most 300 characters; undefined when nothing is left. */
function safeMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.slice(0, 4096).replace(/\p{Cc}+/gu, ' ').replace(ABSOLUTE_PATH, '<path>').replace(/\s+/g, ' ').trim();
  return text === '' ? undefined : [...text].slice(0, MAX_MESSAGE_CHARS).join('').trim();
}

export type WorkspaceCompileFailure = { ok: false; evidence: { outcome: 'failed'; diagnostics: Array<{ code: string; message?: string; path?: string; line?: number; column?: number }> } };

export function workspaceCompileFailure(value: unknown): WorkspaceCompileFailure {
  const evidence = record(record(value)?.evidence);
  const diagnostics = Array.isArray(evidence?.diagnostics) ? evidence.diagnostics.slice(0, 128).flatMap((value) => {
    const diagnostic = record(value);
    if (!diagnostic || typeof diagnostic.code !== 'string' || diagnostic.code.length === 0 || diagnostic.code.length > 96) return [];
    const message = safeMessage(diagnostic.message);
    return [{
      code: diagnostic.code,
      ...(message ? { message } : {}),
      ...(safeRelativePath(diagnostic.path) ? { path: safeRelativePath(diagnostic.path) } : {}),
      ...(safeLocation(diagnostic.line) ? { line: safeLocation(diagnostic.line) } : {}),
      ...(safeLocation(diagnostic.column) ? { column: safeLocation(diagnostic.column) } : {}),
    }];
  }) : [];
  return { ok: false, evidence: { outcome: 'failed', diagnostics } };
}
