/**
 * "Save all" (spec 013 FLW-005): every modified file and the project configuration, with the failures named. Files go through
 * `saveAllFiles`, which saves only the modified ones and does not touch the configuration, so the configuration is saved here
 * when it is still modified (the plan's Unconfirmed item, confirmed in `fileActions.ts`).
 */
import { useIDEStore } from './useIDEStore';

export async function saveAllDocuments(): Promise<{ saved: number; failed: readonly string[] }> {
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
