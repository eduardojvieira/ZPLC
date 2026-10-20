/**
 * The Learn home of the window (LRN-001, LRN-002): binds `LearnHomeView` to the progress, the settings and the lesson start, and
 * moves progress to and from a file. It is shown over the editor when a project is open and in place of the Welcome screen when
 * none is; it opens with no project and no network.
 */
import { useEffect, useRef } from 'react';
import { LEARN_PROGRESS_MAX_BYTES, type LearnProgress } from '../../shared/learnProgressModel';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT } from '../i18n';
import { buildCourseView, continueTarget } from '../learn/course';
import { useLearnUi } from '../learn/learnUi';
import { useLearnProgress } from '../learn/progressState';
import { useIDEStore } from '../store/useIDEStore';
import { useAppSettings } from '../store/useAppSettings';
import { isFileSystemAccessSupported } from '../types';
import { announce } from '../utils/announce';
import { LearnHomeView } from './LearnHomeView';
import { LearnBoardTrack } from './LearnBoardTrack';

/** The home of the window: reads the stores, starts lessons and moves progress to and from a file. */
export function LearnHome() {
  const { t, locale } = useT();
  const document = useLearnProgress((state) => state.document);
  const loaded = useLearnProgress((state) => state.loaded);
  const failed = useLearnProgress((state) => state.failed);
  const transfer = useLearnProgress((state) => state.transfer);
  const unlockAll = useAppSettings((state) => state.settings.unlockAllLessons);
  const hideSolutions = useAppSettings((state) => state.settings.hideSolutions);
  const updateSettings = useAppSettings((state) => state.update);
  const projectOpenError = useIDEStore((state) => state.projectOpenError);
  const busyRef = useRef(false);
  const busy = useLearnUi((state) => state.starting);
  useEffect(() => { if (!useLearnProgress.getState().loaded) void useLearnProgress.getState().load(); }, []);
  // Escape closes the home from wherever the focus is, unless a dialog or a menu has it (they close first).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || window.document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      useLearnUi.getState().hideHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const view = buildCourseView(LESSON_INDEX, document, { locale, unlockAll });
  const progress: LearnProgress | null = document;
  const start = (id: string): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    void useLearnUi.getState().startLesson(id).finally(() => { busyRef.current = false; });
  };
  const exportFile = (): void => {
    void useLearnProgress.getState().exportText().then((text) => {
      if (text === undefined) return;
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = 'zplc-learn-progress.v2.json'; window.document.body.appendChild(anchor); anchor.click(); window.document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      useLearnProgress.getState().setTransfer('exported');
    });
  };
  const importFile = (file: File): void => {
    if (file.size > LEARN_PROGRESS_MAX_BYTES) { useLearnProgress.getState().setTransfer({ error: 'too-large', version: null }); return; }
    void file.text().then((text) => useLearnProgress.getState().importText(text));
  };
  return (<LearnBoardTrack>
    <LearnHomeView
      view={view} index={LESSON_INDEX} locale={locale} continueId={continueTarget(view, progress)} fresh={!progress?.last} loaded={loaded} failed={failed}
      unlockAll={unlockAll} hideSolutions={hideSolutions} folderAccess={isFileSystemAccessSupported()} busy={busy} transfer={transfer} error={projectOpenError}
      onHideSolutions={(on) => { updateSettings({ hideSolutions: on }); announce(t(on ? 'learn.home.hideSolutions.on' : 'learn.home.hideSolutions.off')); }}
      onUnlockAll={(on) => { updateSettings({ unlockAllLessons: on }); announce(t(on ? 'learn.home.unlockAll.on' : 'learn.home.unlockAll.off')); }}
      onStart={start} onClose={() => useLearnUi.getState().hideHome()} onExport={exportFile} onImportFile={importFile}
    />
  </LearnBoardTrack>);
}
