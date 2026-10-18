import { useIDEStore } from '../store/useIDEStore';
import type { ConfigEditorKind } from './configEditors';

/** Opens the editor of one part of the project configuration. */
export function openConfigEditorFromNavigator(editor: ConfigEditorKind): void {
  void editor;
  // until the configuration editors are tabs of their own, the settings tab holds them all
  if (!useIDEStore.getState().showSettings) useIDEStore.getState().toggleSettings();
}
