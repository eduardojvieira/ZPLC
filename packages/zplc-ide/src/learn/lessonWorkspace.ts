/**
 * The workspace of a lesson (LRN-003): starting a lesson makes its workspace from the starter, or reopens the one made before,
 * with no step in between where the learner copies anything. The window can only be given a project folder by the native folder
 * dialog or by reopening a folder it remembers, so the first start asks for a folder once (the dialog names the lesson) and
 * every later start reopens that folder by the id the main process gave it. What is remembered is a lesson id and that opaque
 * id; never a path. The steps are injected so the rules run under a test without a window.
 */
export interface RecentEntry { recentId: string; lastOpenedAt: number; available: boolean }
export interface WorkspaceMemory { get(lessonId: string): string | undefined; set(lessonId: string, recentId: string): void; forget(lessonId: string): void }
export interface WorkspaceDeps {
  memory: WorkspaceMemory;
  /** The folders the main process remembers, newest first; it asks the main process again each time. */
  recents(): Promise<readonly RecentEntry[]>;
  /** Opens a remembered folder as the project; false when it did not open (the reason is shown where it happened). */
  openRecent(recentId: string): Promise<boolean>;
  /** Asks for a folder, copies the starter into it and opens it; false when the dialog was cancelled or the copy failed. */
  createWorkspace(starterProject: string): Promise<boolean>;
  now(): number;
  wait(ms: number): Promise<void>;
}
export type WorkspaceOutcome = 'reopened' | 'created' | 'cancelled';

/** The main process records the new folder a moment after it opens; ten looks at a tenth of a second each is far more than it needs. */
const LOOKS = 10;
const LOOK_EVERY_MS = 100;
/** The clock of the renderer and the time the main process stamped are the same machine's, but allow a second between them. */
const CLOCK_SLACK_MS = 1_000;

export async function openLessonWorkspace(deps: WorkspaceDeps, lessonId: string, starterProject: string): Promise<WorkspaceOutcome> {
  const remembered = deps.memory.get(lessonId);
  if (remembered !== undefined) {
    const entry = (await deps.recents()).find((candidate) => candidate.recentId === remembered && candidate.available);
    if (entry) return (await deps.openRecent(remembered)) ? 'reopened' : 'cancelled';
    deps.memory.forget(lessonId);
  }
  const startedAt = deps.now();
  if (!(await deps.createWorkspace(starterProject))) return 'cancelled';
  for (let look = 0; look < LOOKS; look += 1) {
    const created = (await deps.recents()).filter((entry) => entry.available && entry.lastOpenedAt >= startedAt - CLOCK_SLACK_MS).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
    if (created) { deps.memory.set(lessonId, created.recentId); return 'created'; }
    await deps.wait(LOOK_EVERY_MS);
  }
  return 'created';
}

export const WORKSPACE_MEMORY_KEY = 'zplc:learn-workspaces:v1';
const LESSON_ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** The lesson to folder map in a stored text; anything damaged reads as empty, and an entry that is not a lesson id and a string is dropped. */
export function parseWorkspaceMemory(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => LESSON_ID.test(entry[0]) && typeof entry[1] === 'string' && entry[1].length > 0 && entry[1].length <= 128));
  } catch { return {}; }
}

export function createWorkspaceMemory(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | undefined): WorkspaceMemory {
  const read = (): Record<string, string> => { try { return parseWorkspaceMemory(storage?.getItem(WORKSPACE_MEMORY_KEY) ?? null); } catch { return {}; } };
  const write = (map: Record<string, string>): void => { try { storage?.setItem(WORKSPACE_MEMORY_KEY, JSON.stringify(map)); } catch { /* not remembered this session */ } };
  return {
    get: (lessonId) => read()[lessonId],
    set: (lessonId, recentId) => { write({ ...read(), [lessonId]: recentId }); },
    forget: (lessonId) => { const map = read(); delete map[lessonId]; write(map); },
  };
}
