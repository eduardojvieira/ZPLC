/** Reads the stores once when the palette opens and builds every provider over that snapshot. */
import { translatorFor, type Locale } from '../../i18n';
import { LESSON_INDEX } from '../../generated/lessonIndex';
import { useLearnUi } from '../../learn/learnUi';
import { openConfigEditorFromNavigator } from '../../navigator/openConfigEditor';
import { useProjectSources } from '../../store/projectSources';
import { useIDEStore } from '../../store/useIDEStore';
import { projectGlobalVariables } from '../../project/globalVariables';
import { runCommand } from '../bus';
import type { PaletteSnapshot } from '../palette';
import { setPreferenceAnchor } from '../preferenceAnchor';

export function buildPaletteSnapshot(locale: Locale): PaletteSnapshot {
  const ide = useIDEStore.getState();
  const sources = useProjectSources.getState();
  return {
    fileTree: ide.fileTree,
    declarations: sources.declarations.flatMap((group) => group.declarations),
    globals: projectGlobalVariables(sources.sources),
    config: ide.projectConfig,
    lessons: LESSON_INDEX.lessons.map((lesson) => ({ id: lesson.id, title: lesson.text[locale].title })),
    t: translatorFor(locale).t,
    open: {
      source: (path, line, column) => {
        if (path === 'zplc.json') openConfigEditorFromNavigator('tasks');
        else void useIDEStore.getState().navigateToCompilerDiagnostic(path, line, column);
      },
      editor: openConfigEditorFromNavigator,
      lesson: (id) => void useLearnUi.getState().startLesson(id),
      preference: (key) => {
        setPreferenceAnchor(key);
        runCommand('file.preferences');
      },
      scenes: () => runCommand('view.plant'),
    },
  };
}

export { paletteItems, paletteProviders } from './providers';
