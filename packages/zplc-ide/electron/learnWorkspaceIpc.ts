/**
 * The handler of the one Learn workspace channel (LRN-003), as an entry of the table in `ipcHandlers.ts`.
 *
 * It takes exactly one argument, a lesson id, and answers the window's new project folder: the main process builds the path
 * (`learnWorkspace.ts`), makes the folder the window's project as the folder dialog does, and says whether the starter still has
 * to be copied in. The renderer never sends or receives a path. Pure TypeScript over the two steps handed in.
 */
import { LEARN_WORKSPACE_CHANNEL } from './ipcContract.js';
import type { IpcHandler } from './ipcRegistry.js';
import { IPC_DENIED } from './ipcRegistry.js';
import { isLessonId } from './learnProgressModel.js';
import { prepareLearnWorkspace } from './learnWorkspace.js';

export interface LearnWorkspaceDeps {
  /** `<userData>/learn-workspaces`, or null before the user-data folder is known. */
  root(): string | null;
  /** Makes `directory` the project folder of the window `ownerId`, exactly as the folder dialog would. */
  adopt(ownerId: number, directory: string): Promise<{ rootId: string; name: string }>;
}

export function createLearnWorkspaceHandlers<Owner extends { ownerId: number }>(deps: LearnWorkspaceDeps): Record<string, IpcHandler<Owner>> {
  return {
    [LEARN_WORKSPACE_CHANNEL.OPEN]: {
      accepts: (args) => args.length === 1 && isLessonId(args[0]),
      run: async (owner, [lessonId]) => {
        const root = deps.root();
        if (root === null) throw new Error(IPC_DENIED);
        const prepared = await prepareLearnWorkspace(root, lessonId as string);
        const folder = await deps.adopt(owner.ownerId, prepared.directory);
        return { rootId: folder.rootId, name: folder.name, fresh: prepared.fresh };
      },
    },
  };
}
