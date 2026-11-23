/** Opens an occurrence by the kind of its place (plan-u2.md, design point 8 of FND-004). */
import { requestElementSelection } from '../editors/elementSelectionRequests';
import { showPanel } from '../commands/bind/layout';
import { openConfigEditorFromNavigator } from '../navigator/openConfigEditor';
import { useIDEStore } from '../store/useIDEStore';
import { fileTreeFileId } from '../utils/fileSystem';
import type { Place } from './contracts';
import { locateJsonPointer } from './jsonPlace';

export async function openPlace(place: Place): Promise<void> {
  const navigate = useIDEStore.getState().navigateToCompilerDiagnostic;
  switch (place.kind) {
    case 'text':
      await navigate(place.file, place.line, place.column);
      return;
    case 'element':
      requestElementSelection(place.file, place.element);
      await navigate(place.file, 1, 1);
      return;
    case 'table':
      await navigate(place.file, 1, 1);
      return;
    case 'config':
      openConfigEditorFromNavigator(place.editor);
      return;
    case 'watch':
      showPanel('watch')();
      return;
    case 'scenario': {
      const textOf = (): string | undefined => useIDEStore.getState().loadedFiles.get(fileTreeFileId(place.file))?.content;
      let text = textOf();
      if (text === undefined) {
        await navigate(place.file, 1, 1); // opening the file loads it
        text = textOf();
      }
      const at = text === undefined ? undefined : locateJsonPointer(text, place.pointer);
      await navigate(place.file, at?.line ?? 1, at?.column ?? 1);
    }
  }
}
