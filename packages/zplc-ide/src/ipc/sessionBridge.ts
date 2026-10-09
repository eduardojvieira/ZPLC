/**
 * The renderer's side of the per-project session (IDE-008): typed calls over the `session` bridge of the preload. The
 * folder is named by the opaque id the main process gave it, never by a path. A failure is never an error for the user:
 * no session loads, and a save that fails leaves the previous one.
 */
import { parseSessionState, type SessionBridge, type SessionState } from '../../electron/sessionStoreProtocol';
import { debugLog } from '../utils/debugLog';

/** The saved session of the folder, or null when there is none, the main process refuses, or the document is not one. */
export async function loadSession(bridge: SessionBridge, rootId: string): Promise<SessionState | null> {
  try {
    return parseSessionState(await bridge.load({ rootId }));
  } catch (error) {
    debugLog('[Session] load failed', error);
    return null;
  }
}

/** True when the main process stored the document. */
export async function saveSession(bridge: SessionBridge, rootId: string, state: SessionState): Promise<boolean> {
  try {
    await bridge.save({ rootId, state });
    return true;
  } catch (error) {
    debugLog('[Session] save failed', error);
    return false;
  }
}
