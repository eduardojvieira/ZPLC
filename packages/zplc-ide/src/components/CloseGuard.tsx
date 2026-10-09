/**
 * Connects the Electron close guard to the store. The main process holds back a window close or a
 * reload while files are modified; this asks the user and answers with save, discard or cancel.
 */

import { useCallback, useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { unsavedItems, unsavedOutcome, type UnsavedChoice } from '../utils/unsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

export function CloseGuard() {
  const [guard] = useState(() => window.electronAPI?.closeGuard);
  const [action, setAction] = useState<'close' | 'reload' | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useIDEStore((state) => state.hasUnsavedChanges());
  const loadedFiles = useIDEStore((state) => state.loadedFiles);
  const projectConfigDirty = useIDEStore((state) => state.projectConfigDirty);

  useEffect(() => {
    void guard?.setDirty(dirty).catch(() => undefined);
  }, [guard, dirty]);

  useEffect(() => guard?.onCloseRequested(setAction), [guard]);

  const answer = useCallback(async (choice: UnsavedChoice) => {
    if (choice === 'save') {
      setSaving(true);
      await useIDEStore.getState().saveAllFiles();
      if (useIDEStore.getState().projectConfigDirty) await useIDEStore.getState().saveProjectConfig();
      setSaving(false);
    }
    if (unsavedOutcome(choice, useIDEStore.getState().hasUnsavedChanges()) === 'proceed') await guard?.closeNow();
    setAction(null);
  }, [guard]);

  if (!action) return null;
  const verb = action === 'reload' ? 'reload' : 'close';
  return (
    <UnsavedChangesDialog
      title={`Unsaved changes before you ${verb}`}
      items={unsavedItems(loadedFiles.values(), projectConfigDirty)}
      busy={saving}
      saveLabel={`Save all and ${verb}`}
      discardLabel={`Discard and ${verb}`}
      onChoice={(choice) => void answer(choice)}
    />
  );
}
