import { useIDEStore } from '../store/useIDEStore';
import { readProjectConfig } from '../utils/fileSystem';

/** Puts the configuration back as `zplc.json` holds it. True when it did; false when the file could not be read (the edits stay). */
export async function discardProjectConfigEdits(): Promise<boolean> {
  const { directoryHandle, projectSession } = useIDEStore.getState();
  if (!directoryHandle) return false;
  const read = await readProjectConfig(directoryHandle);
  if (read.kind !== 'valid' || useIDEStore.getState().projectSession !== projectSession) return false;
  useIDEStore.setState({ projectConfig: read.config, projectConfigDirty: false });
  return true;
}
