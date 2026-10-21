/**
 * The three native dialogs of a project archive (IDE-022): where to save it, which archive to open, and which empty
 * folder to import into. Each one belongs to the window that asked and is answered by the user, or, in a build that
 * is not packaged, by the suite's answer file (the hook the folder dialog uses, loaded by dynamic import so that a
 * released installer holds neither the module nor the variable name).
 */

interface DialogOptions {
  title: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: string[];
}
type DialogResult = { canceled: boolean; filePaths: string[] };
type SaveResult = { canceled: boolean; filePath?: string };

export interface ArchiveDialogHost {
  showSaveDialog(window: unknown, options: DialogOptions): Promise<SaveResult>;
  showOpenDialog(window: unknown, options: DialogOptions): Promise<DialogResult>;
}

interface OwnedWindow {
  isDestroyed(): boolean;
  webContents: { id: number };
}

export interface ArchiveDialogDeps {
  dialog: ArchiveDialogHost;
  /** The main window, if there is one: it is the owner's when its web contents has the owner's id. */
  getWindow(): OwnedWindow | null;
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}

const ARCHIVE_FILTER = { name: 'ZPLC project archive', extensions: ['zip'] };

export function createArchiveDialogs(deps: ArchiveDialogDeps) {
  function windowFor(ownerId: number): OwnedWindow | null {
    const window = deps.getWindow();
    return window !== null && !window.isDestroyed() && window.webContents.id === ownerId ? window : null;
  }

  async function answeredByHook(): Promise<string | null | undefined> {
    if (deps.isPackaged) return undefined;
    const { readFolderDialogHook } = await import('./devFolderDialogHook.js');
    return readFolderDialogHook(deps.isPackaged, deps.env);
  }

  return {
    async saveFile(ownerId: number, defaultName: string): Promise<string | null> {
      const window = windowFor(ownerId);
      if (window === null) return null;
      const answer = await answeredByHook();
      if (answer !== undefined) return answer;
      const result = await deps.dialog.showSaveDialog(window, {
        title: 'Export project archive',
        defaultPath: defaultName,
        filters: [ARCHIVE_FILTER],
      });
      return result.canceled ? null : (result.filePath ?? null);
    },

    async openFile(ownerId: number): Promise<string | null> {
      const window = windowFor(ownerId);
      if (window === null) return null;
      const answer = await answeredByHook();
      if (answer !== undefined) return answer;
      const result = await deps.dialog.showOpenDialog(window, {
        title: 'Import project archive',
        filters: [ARCHIVE_FILTER],
        properties: ['openFile'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },

    async chooseFolder(ownerId: number): Promise<string | null> {
      const window = windowFor(ownerId);
      if (window === null) return null;
      const answer = await answeredByHook();
      if (answer !== undefined) return answer;
      const result = await deps.dialog.showOpenDialog(window, {
        title: 'Choose an empty folder to import the project into',
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  };
}
