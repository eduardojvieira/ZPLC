/**
 * Changes made outside Studio (IDE-004). The main process watches the window's project folder and tells the window,
 * in batches, which relative paths changed; the window reads what it needs through the project operations. A burst of
 * writes is one batch, a flood is one "overflow" (look at everything), and what Studio and the tools write for
 * themselves (the temporary file of an atomic save, version-control and build folders) is never reported.
 *
 * Where a recursive watch cannot start (an older kernel or file system), the root, `src` and `tests` are watched one level
 * deep, so that `zplc.json`, the scene files, the sources and the tests are still followed (AIX-012).
 *
 * ponytail: `fs.watch` with `recursive` walks the whole folder on Linux, including folders this ignores. Upgrade: one
 * watch per listed folder, or a native watcher, if a project with a very large tree makes the start slow.
 */
import { watch as fsWatch, type FSWatcher, type WatchListener } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_CHANGE_LIMITS, type ProjectChange } from './projectFilesProtocol.js';

const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', 'build', 'dist', '.vscode']);
/** The temporary file of an atomic write: `.<name>.<12 hex digits>.tmp` (`projectFiles.ts`). */
const TEMPORARY = /^\..+\.[0-9a-f]{12}\.tmp$/;

/** The "/"-separated relative path worth reporting, or null for noise and for anything that is not a project path. */
export function relevantChange(filename: string): string | null {
  const path = filename.replace(/\\/g, '/');
  if (path === '' || path.startsWith('/') || path.length > 1024) return null;
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || IGNORED_SEGMENTS.has(segment))) return null;
  if (TEMPORARY.test(segments[segments.length - 1]!)) return null;
  return path;
}

type WatchFunction = (path: string, options: { recursive: boolean; persistent: false }, listener: WatchListener<string>) => FSWatcher;

/** The folders watched one level deep when a recursive watch cannot start, as prefixes of the paths they report. */
const FALLBACK_FOLDERS = ['', 'src', 'tests'];

export interface ProjectWatcherOptions {
  send(ownerId: number, change: ProjectChange): void;
  /** How long the changes must stop before a batch is sent. */
  debounceMs?: number;
  maxPaths?: number;
  watch?: WatchFunction;
}

export function createProjectWatcher({
  send,
  debounceMs = 150,
  maxPaths = PROJECT_CHANGE_LIMITS.maxPaths,
  watch = fsWatch as WatchFunction,
}: ProjectWatcherOptions) {
  const active = new Map<number, { watchers: FSWatcher[]; timer: ReturnType<typeof setTimeout> | null }>();

  function stop(ownerId: number): void {
    const entry = active.get(ownerId);
    if (!entry) return;
    active.delete(ownerId);
    if (entry.timer !== null) clearTimeout(entry.timer);
    for (const watcher of entry.watchers) {
      try {
        watcher.close();
      } catch {
        /* already closed */
      }
    }
  }

  return {
    /** Starts watching `root` for the window `ownerId`, replacing any watch it had. A folder that cannot be watched is not an error. */
    start(ownerId: number, rootId: string, root: string): void {
      stop(ownerId);
      const pending = new Set<string>();
      let overflow = false;
      const entry: { watchers: FSWatcher[]; timer: ReturnType<typeof setTimeout> | null } = { watchers: [], timer: null };
      const listener =
        (prefix: string): WatchListener<string> =>
        (_event, filename) => {
          if (active.get(ownerId) !== entry) return;
          const path = filename === null ? null : relevantChange(prefix + String(filename));
          if (path === null) return;
          if (pending.size >= maxPaths) overflow = true;
          else pending.add(path);
          if (entry.timer !== null) clearTimeout(entry.timer);
          entry.timer = setTimeout(() => {
            entry.timer = null;
            const paths = overflow ? [] : [...pending];
            const change: ProjectChange = { rootId, paths, overflow };
            pending.clear();
            overflow = false;
            send(ownerId, change);
          }, debounceMs);
        };
      try {
        entry.watchers.push(watch(root, { recursive: true, persistent: false }, listener('')));
      } catch {
        for (const folder of FALLBACK_FOLDERS) {
          try {
            entry.watchers.push(
              watch(
                folder === '' ? root : join(root, folder),
                { recursive: false, persistent: false },
                listener(folder === '' ? '' : `${folder}/`),
              ),
            );
          } catch {
            /* a folder the project does not have */
          }
        }
      }
      if (entry.watchers.length === 0) return;
      for (const watcher of entry.watchers) watcher.on('error', () => stop(ownerId));
      active.set(ownerId, entry);
    },
    stop,
    stopAll(): void {
      for (const ownerId of [...active.keys()]) stop(ownerId);
    },
  };
}

export type ProjectWatcher = ReturnType<typeof createProjectWatcher>;
