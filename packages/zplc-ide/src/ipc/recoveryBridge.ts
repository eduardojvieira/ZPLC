/**
 * The renderer's side of the recovery store (IDE-006): typed calls over the `recovery` bridge of the preload. The folder
 * is named by the opaque id the main process gave it, never by a path. A failure is never an error for the user: a write
 * that fails leaves the previous entry, and a list that fails offers nothing.
 */
import { parseRecoveryEntry, type RecoveryBridge, type RecoveryEntry } from '../../electron/recoveryStoreProtocol';
import { debugLog } from '../utils/debugLog';

/** True when the main process kept the content of the file. */
export async function writeRecovery(bridge: RecoveryBridge, rootId: string, path: string, content: string): Promise<boolean> {
  try {
    await bridge.write({ rootId, path, content });
    return true;
  } catch (error) {
    debugLog('[Recovery] write failed', error);
    return false;
  }
}

/** The kept content of the folder's modified files, each validated again here. Empty when there is none or it fails. */
export async function listRecovery(bridge: RecoveryBridge, rootId: string): Promise<RecoveryEntry[]> {
  try {
    const answer = await bridge.list({ rootId });
    if (!Array.isArray(answer)) return [];
    return answer.flatMap((value) => { const entry = parseRecoveryEntry(value); return entry ? [entry] : []; });
  } catch (error) {
    debugLog('[Recovery] list failed', error);
    return [];
  }
}

/** Removes the kept content of one file, or of every file of the folder when `path` is null. True when it was done. */
export async function discardRecovery(bridge: RecoveryBridge, rootId: string, path: string | null): Promise<boolean> {
  try {
    await bridge.discard({ rootId, path });
    return true;
  } catch (error) {
    debugLog('[Recovery] discard failed', error);
    return false;
  }
}
