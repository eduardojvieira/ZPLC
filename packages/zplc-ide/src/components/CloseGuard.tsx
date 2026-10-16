/**
 * Connects the Electron close guard to the store. The main process holds back a window close or a
 * reload while files are modified; this asks the user and answers with save, discard or cancel.
 */

import { useCallback, useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { flushSession } from '../store/sessionPersistence';
import { unsavedItems, unsavedOutcome, type UnsavedChoice } from '../utils/unsavedChanges';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

/** How long the close waits for the main process to store the session before it closes anyway. */
const SESSION_FLUSH_WAIT_MS = 1_500;

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
    if (unsavedOutcome(choice, useIDEStore.getState().hasUnsavedChanges()) === 'proceed') {
      // The main process destroys the window without unloading the page, so nothing else would send the session (IDE-008).
      await Promise.race([flushSession(), new Promise((resolve) => setTimeout(resolve, SESSION_FLUSH_WAIT_MS))]);
      await guard?.closeNow();
    }
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
