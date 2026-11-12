/**
 * "Save all" (spec 013 FLW-005): every modified file and the project configuration, with the failures named. Files go through
 * `saveAllFiles`, which saves only the modified ones and does not touch the configuration, so the configuration is saved here
 * when it is still modified (the plan's Unconfirmed item, confirmed in `fileActions.ts`).
 */
import { useIDEStore } from './useIDEStore';

export type SaveAllResult = { saved: number; failed: readonly string[] };
export type SaveAllParticipant = () => Promise<SaveAllResult>;

const participants = new Set<SaveAllParticipant>();

/** A document outside `loadedFiles` (a plant scene, a plant map) joins "Save all" (FLW-006); returns the function that leaves. */
export function registerSaveAllParticipant(participant: SaveAllParticipant): () => void {
  participants.add(participant);
  return () => participants.delete(participant);
}

export async function saveAllDocuments(): Promise<SaveAllResult> {
  const own = await saveStoreDocuments();
  let saved = own.saved;
  const failed = [...own.failed];
  for (const participant of participants) {
    try {
      const result = await participant();
      saved += result.saved;
      failed.push(...result.failed);
    } catch (error) {
      failed.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { saved, failed };
}

async function saveStoreDocuments(): Promise<SaveAllResult> {
  const before = useIDEStore.getState();
  const modifiedIds = [...before.loadedFiles].filter(([, file]) => file.isModified).map(([id]) => id);
  const configModified = before.projectConfigDirty;
  if (modifiedIds.length === 0 && !configModified) return { saved: 0, failed: [] };

  await before.saveAllFiles({ quiet: true });
  const failed: string[] = [];
  const after = useIDEStore.getState();
  for (const id of modifiedIds) if (after.loadedFiles.get(id)?.isModified) failed.push(after.loadedFiles.get(id)?.path ?? id);
  if (configModified) {
    await after.saveProjectConfig();
    if (useIDEStore.getState().projectConfigDirty) failed.push('zplc.json');
  }
  return { saved: modifiedIds.length + (configModified ? 1 : 0) - failed.length, failed };
}
