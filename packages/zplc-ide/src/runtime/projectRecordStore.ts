/**
 * The RETAIN records of the browser runtime, kept with the project (RT-027).
 *
 * The module persists a record through `zplc_hal_persist_*`, which are synchronous calls; the project's folder is
 * reached through asynchronous handles. The store answers the module from memory and writes behind: it reads the records
 * of the project's `build/retain` folder before the session starts, and writes each record the module saves, in order,
 * after the call returns. That is the one place the browser's durability differs from a flash write, and the capability
 * profile says so (wasmCapabilities.ts): the module alternates two records (RT-025), so a write that does not finish
 * leaves the previous record valid.
 *
 * Only the RETAIN records go to the folder. Everything else the module persists (the program store of the session) lives
 * in memory for the life of the session: a program is loaded from the project every time.
 *
 * The folder handle is the one that every project file operation uses (File System Access in a browser, the typed
 * project-files bridge in the desktop app), so this adds no operation of its own.
 */
import { MemoryRecordStore, type WasmRecordStore } from './wasmRuntime';

/** The names of the records of zplc_retain.c: two slots, each cut into at most eight chunks ("retain_a0".."retain_b7"). */
const RETAIN_KEY = /^retain_[ab][0-7]$/;
const FOLDER = ['build', 'retain'] as const;
const EXTENSION = '.bin';

async function folder(root: FileSystemDirectoryHandle, create: boolean): Promise<FileSystemDirectoryHandle> {
  let directory = root;
  for (const name of FOLDER) directory = await directory.getDirectoryHandle(name, { create });
  return directory;
}

export class ProjectRecordStore implements WasmRecordStore {
  private readonly memory = new MemoryRecordStore();
  private readonly root: FileSystemDirectoryHandle;
  private readonly onError: (message: string) => void;
  private writes: Promise<void> = Promise.resolve();

  private constructor(root: FileSystemDirectoryHandle, onError: (message: string) => void) {
    this.root = root;
    this.onError = onError;
  }

  /** Reads what the project holds; a folder with no records, or no folder, is a store with none. */
  static async open(root: FileSystemDirectoryHandle, onError: (message: string) => void = () => undefined): Promise<ProjectRecordStore> {
    const store = new ProjectRecordStore(root, onError);
    let directory: FileSystemDirectoryHandle;
    try {
      directory = await folder(root, false);
    } catch {
      return store;
    }
    for (const slot of ['a', 'b']) {
      for (let chunk = 0; chunk < 8; chunk += 1) {
        const key = `retain_${slot}${chunk}`;
        try {
          const file = await (await directory.getFileHandle(`${key}${EXTENSION}`)).getFile();
          store.memory.set(key, new Uint8Array(await file.arrayBuffer()));
        } catch {
          // no such record: the chunk was never written
        }
      }
    }
    return store;
  }

  get(key: string): Uint8Array | undefined {
    return this.memory.get(key);
  }

  set(key: string, bytes: Uint8Array): void {
    this.memory.set(key, bytes);
    if (!RETAIN_KEY.test(key)) return;
    const copy = new Uint8Array(bytes);
    this.enqueue(`store ${key}`, async () => {
      const directory = await folder(this.root, true);
      const writable = await (await directory.getFileHandle(`${key}${EXTENSION}`, { create: true })).createWritable();
      await writable.write(copy);
      await writable.close();
    });
  }

  delete(key: string): boolean {
    const existed = this.memory.delete(key);
    if (existed && RETAIN_KEY.test(key)) {
      this.enqueue(`remove ${key}`, async () => {
        const directory = await folder(this.root, false);
        await directory.removeEntry(`${key}${EXTENSION}`);
      });
    }
    return existed;
  }

  /** Resolves when every record the module saved has been written (a session that stops waits for it). */
  flush(): Promise<void> {
    return this.writes;
  }

  private enqueue(what: string, write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch((error: unknown) => {
      this.onError(
        `Retained values could not be kept with the project (${what}): ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}

/** The store of a simulation session: the open project's folder when there is one, the memory of the page otherwise. */
export async function openRecordStore(
  root: FileSystemDirectoryHandle | null,
  onError?: (message: string) => void,
): Promise<{ records: WasmRecordStore; retainStorage: 'project' | 'memory' }> {
  if (root === null) return { records: new MemoryRecordStore(), retainStorage: 'memory' };
  return { records: await ProjectRecordStore.open(root, onError), retainStorage: 'project' };
}
