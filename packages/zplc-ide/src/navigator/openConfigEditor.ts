import { useConfigEditors } from '../store/useConfigEditors';
import { useIDEStore } from '../store/useIDEStore';
import type { ConfigEditorKind } from './configEditors';

/** Opens the editor of one part of the project configuration as a tab and shows it (the settings tab steps aside). */
export function openConfigEditorFromNavigator(editor: ConfigEditorKind): void {
  if (useIDEStore.getState().showSettings) useIDEStore.getState().toggleSettings();
  useConfigEditors.getState().show(editor);
}
