/**
 * Links the open project to its workspace for Build, Tests and Simulate without the user choosing a file (IDE-001).
 *
 * In the desktop app the main process owns the project folder (the native dialog). The renderer sends the opaque id of
 * that folder; the main process registers the folder's zplc.json as the workspace and answers with the workspace token
 * the compile, test and safety operations take. The renderer never names a path.
 */
import { projectRootId } from '../ipc/projectFilesHandles';
import { isWorkspaceManifestRegistrationCurrent } from '../components/workspaceTestPresentation';
import { useIDEStore } from '../store/useIDEStore';

function registerProjectRoot() {
  const workspaceTests = globalThis.window?.electronAPI?.workspaceTests;
  return typeof workspaceTests?.registerProjectRoot === 'function' ? workspaceTests.registerProjectRoot.bind(workspaceTests) : null;
}

/** Whether the open project can be linked here: a desktop host that registers a project folder, and a folder the main process owns. */
export function canLinkProjectWorkspace(): boolean {
  const { isProjectOpen, directoryHandle } = useIDEStore.getState();
  return isProjectOpen && projectRootId(directoryHandle) !== null && registerProjectRoot() !== null;
}

type ProjectWorkspaceLink = { workspaceId: string; projectSession: number };

async function register(projectSession: number, rootId: string): Promise<ProjectWorkspaceLink | null> {
  try {
    const selection = await registerProjectRoot()?.({ rootId });
    const current = useIDEStore.getState();
    if (!selection?.workspaceId || !isWorkspaceManifestRegistrationCurrent(current.projectSession, projectSession)) return null;
    return current.linkWorkspaceScenarios(selection.workspaceId, projectSession)
      ? { workspaceId: selection.workspaceId, projectSession }
      : null;
  } catch {
    return null;
  }
}

/** The registration that is running, for the project session and folder it was asked for: the main process admits one at a time. */
let running: { projectSession: number; rootId: string; link: Promise<ProjectWorkspaceLink | null> } | null = null;

/**
 * Registers the folder of the open project and links the answer to it. Callers that ask while a registration of the same
 * folder is running share it; the next call registers again, so that the registration matches the folder as it is then
 * (the main process checks the folder's identity when it registers and when it runs).
 * Resolves to the link, or to null when it cannot be made (the folder has no zplc.json, the project changed meanwhile).
 */
export function linkProjectWorkspace(): Promise<ProjectWorkspaceLink | null> {
  const { projectSession, directoryHandle } = useIDEStore.getState();
  const rootId = projectRootId(directoryHandle);
  if (rootId === null || !canLinkProjectWorkspace()) return Promise.resolve(null);
  if (running?.projectSession === projectSession && running.rootId === rootId) return running.link;
  const started = {
    projectSession,
    rootId,
    link: register(projectSession, rootId).finally(() => {
      if (running === started) running = null;
    }),
  };
  running = started;
  return started.link;
}
