/**
 * The per-project session (IDE-008): which files are open, which one is active, where the cursor and the scroll are in
 * each, and how the workbench panels are split. One definition of the document and its limits, shared by the main
 * process (`sessionStore.ts`, `security.ts`) and the renderer (`src/utils/sessionState.ts`). Pure TypeScript with no
 * Electron or Node import, so both programs can import it.
 *
 * The document holds paths relative to the project root and numbers, nothing else, and never unsaved content. Every
 * reader validates it: the main process before it stores a document sent by the renderer and again when it reads one
 * back from disk, the renderer before it applies one.
 */

export const SESSION_LIMITS = {
  /** Open tabs kept per project. */
  maxTabs: 32,
  /** Longest relative path (the same bound as a project file request). */
  maxPathChars: 1024,
  /** Largest serialised document stored or read: far above 32 tabs of the longest path. */
  maxBytes: 64 * 1024,
  maxLine: 10_000_000,
  maxColumn: 100_000,
  maxScrollTop: 100_000_000,
} as const;

export interface SessionTab { path: string; line: number; column: number; scrollTop: number }
/** The split of the workbench in percent (they add up to 100) and whether the lower panel is collapsed. */
export interface SessionPanels { editor: number; console: number; consoleCollapsed: boolean }
export interface SessionState {
  schemaVersion: 1;
  tabs: SessionTab[];
  activePath: string | null;
  panels: SessionPanels | null;
}

/** Names that the platforms cannot all address: separators, drive and stream colons, NUL, and names ending in a dot or a space. */
const UNADDRESSABLE_NAME = /[\\:\0]|[. ]$/;

/** A normalised path relative to the project root: no leading "/", no empty, "." or ".." segment, nothing unaddressable. */
export function isSessionPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > SESSION_LIMITS.maxPathChars || value.startsWith('/')) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && !UNADDRESSABLE_NAME.test(segment));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const isIntegerInRange = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max;
const isNumberInRange = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

function parseTab(value: unknown): SessionTab | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['path', 'line', 'column', 'scrollTop'])) return null;
  const { path, line, column, scrollTop } = value;
  if (!isSessionPath(path) || !isIntegerInRange(line, SESSION_LIMITS.maxLine) || !isIntegerInRange(column, SESSION_LIMITS.maxColumn) || !isNumberInRange(scrollTop, SESSION_LIMITS.maxScrollTop)) return null;
  return { path, line, column, scrollTop };
}

function parsePanels(value: unknown): SessionPanels | null | undefined {
  if (value === null) return null;
  if (!isPlainObject(value) || !hasExactKeys(value, ['editor', 'console', 'consoleCollapsed'])) return undefined;
  const { editor, console: lower, consoleCollapsed } = value;
  if (!isNumberInRange(editor, 100) || !isNumberInRange(lower, 100) || typeof consoleCollapsed !== 'boolean') return undefined;
  return { editor, console: lower, consoleCollapsed };
}

/** A fresh, validated copy of a session document, or null for anything that is not exactly one. */
export function parseSessionState(value: unknown): SessionState | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['schemaVersion', 'tabs', 'activePath', 'panels']) || value.schemaVersion !== 1) return null;
  const { tabs: rawTabs, activePath, panels: rawPanels } = value;
  if (!Array.isArray(rawTabs) || rawTabs.length > SESSION_LIMITS.maxTabs) return null;
  const tabs: SessionTab[] = [];
  for (const raw of rawTabs) {
    const tab = parseTab(raw);
    if (!tab || tabs.some((seen) => seen.path === tab.path)) return null;
    tabs.push(tab);
  }
  if (activePath !== null && (!isSessionPath(activePath) || !tabs.some((tab) => tab.path === activePath))) return null;
  const panels = parsePanels(rawPanels);
  if (panels === undefined) return null;
  const state: SessionState = { schemaVersion: 1, tabs, activePath, panels };
  return new TextEncoder().encode(JSON.stringify(state)).length <= SESSION_LIMITS.maxBytes ? state : null;
}

/** What the preload exposes for sessions: load and save for the window's project folder, named by its opaque id. */
export interface SessionBridge {
  /** The saved session of the folder, or null; rejects for a folder the window does not hold. */
  load(request: { rootId: string }): Promise<unknown>;
  save(request: { rootId: string; state: SessionState }): Promise<unknown>;
}
