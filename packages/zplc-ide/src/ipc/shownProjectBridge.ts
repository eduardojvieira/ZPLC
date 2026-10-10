/**
 * The workspace test bridge as a window uses it: every build, safety check and test run is sent with the id of the folder
 * that the window shows (IDE-002). The main process answers a request only when that id is the folder it holds for the
 * window now and the workspace is that folder's, so a request cannot reach a project other than the one on screen, whatever
 * the caller passes. The id is read when the request is made, never kept, so it follows the folder that is open.
 */
import { useIDEStore } from '../store/useIDEStore';
import { projectRootId } from './projectFilesHandles';

type Bridge = NonNullable<NonNullable<Window['electronAPI']>['workspaceTests']>;

export type ShownProjectBridge = Omit<Bridge, 'run' | 'compile' | 'safetyCheck'> & {
  run(request: { workspaceId: string; scenarioId?: string }): Promise<unknown>;
  compile(request: { workspaceId: string }): Promise<unknown>;
  safetyCheck(request: { workspaceId: string }): Promise<unknown>;
};

const bound = new WeakMap<object, ShownProjectBridge>();

/** The id of the folder the window shows now; the empty string (which the main process refuses) when none is open. */
const shownRootId = (): string => projectRootId(useIDEStore.getState().directoryHandle) ?? '';

export function shownProjectBridge(bridge: Bridge): ShownProjectBridge;
export function shownProjectBridge(bridge: Bridge | undefined): ShownProjectBridge | undefined;
export function shownProjectBridge(bridge: Bridge | undefined): ShownProjectBridge | undefined {
  if (!bridge) return undefined;
  let wrapped = bound.get(bridge);
  if (!wrapped) {
    wrapped = {
      registerProjectFile: (file) => bridge.registerProjectFile(file),
      registerProjectRoot: (request) => bridge.registerProjectRoot(request),
      cancel: () => bridge.cancel(),
      run: (request) => bridge.run({ ...request, rootId: shownRootId() }),
      compile: (request) => bridge.compile({ ...request, rootId: shownRootId() }),
      safetyCheck: (request) => bridge.safetyCheck({ ...request, rootId: shownRootId() }),
    };
    bound.set(bridge, wrapped);
  }
  return wrapped;
}
