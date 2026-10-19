/**
 * EditorArea Component
 * 
 * Tabbed editor container with Monaco for text languages (ST, IL)
 * and visual editors for graphical languages (LD, FBD, SFC)
 */

import { lazy, Suspense, useMemo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n';
import { X, FileCode, File, Settings, Undo2, Redo2 } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useEditorAreaState, useOpenFiles } from '../store/regionSubscriptions';
import { PLC_LANGUAGES, type PLCLanguage } from '../types';
import { serializeFBDModel, type FBDModel } from '../models/fbd';
import { serializeLDModel, type LDModel } from '../models/ld';
import { serializeSFCModel, type SFCModel } from '../models/sfc';
import { isUnchangedVisualDocument, loadFBDFile, loadLDFile, loadSFCFile, type VisualFileLoad } from '../models/visualFileLoad';
import { disposeClosedModelsOfLoadedEditor } from './editorModels';
import { canCommitVisualEditorChange } from '../editors/visualCommitGuard';
import { displayEditorFileName } from './editorFilePresentation';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { DevFaultProbe } from './DevFaultProbe';
import { unsavedOutcome, type UnsavedChoice } from '../utils/unsavedChanges';
import {
  recordVisualSnapshot,
  redoVisualSnapshot,
  synchronizeVisualHistory,
  undoVisualSnapshot,
  visualHistoryActions,
  type VisualGesture,
  type VisualHistories,
} from '../editors/visualHistory';
import { setVisualSelection, visualFileKey } from '../editors/visualSelection';
import { useConfigEditors } from '../store/useConfigEditors';
import { ConfigEditorTab, ConfigCloseDialog } from '../navigator/ConfigEditorTab';
import { configCloseNeedsConfirmation, configEditorViewId, type ConfigEditorKind } from '../navigator/configEditors';
import { discardProjectConfigEdits } from '../navigator/discardConfigEdits';
import { Button } from '../ui';

// Each view loads when it is first shown (IDE-015): a project of Structured Text files never fetches the visual editors,
// one of diagrams never fetches Monaco, and the settings load when they are opened.
const FBDEditor = lazy(() => import('../editors/fbd').then((module) => ({ default: module.FBDEditor })));
const LDEditor = lazy(() => import('../editors/ld').then((module) => ({ default: module.LDEditor })));
const SFCEditor = lazy(() => import('../editors/sfc').then((module) => ({ default: module.SFCEditor })));
const ConfigEditorHost = lazy(() => import('../navigator/ConfigEditorHost').then((module) => ({ default: module.ConfigEditorHost })));
const ProjectSettings = lazy(() => import('./settings/ProjectSettings').then((module) => ({ default: module.ProjectSettings })));
const CodeEditor = lazy(() => import('./CodeEditor').then((module) => ({ default: module.CodeEditor })));

function ViewLoading() {
  const { t } = useT();
  return (
    <div role="status" className="flex h-full w-full items-center justify-center bg-[var(--color-surface-900)] text-sm text-[var(--color-surface-300)]">
      {t('workbench.editor.loading')}
    </div>
  );
}

const TEXT_WORKFLOW_LANGUAGES = {
  ST: 'ST',
  IL: 'IL',
} as const;

const SETTINGS_TAB_ID = 'settings';
const EDITOR_PANEL_ID = 'editor-panel';

interface VisualHistoryState {
  projectSession: number;
  histories: VisualHistories;
}

function supportsTextWorkflow(language: PLCLanguage): boolean {
  return language === TEXT_WORKFLOW_LANGUAGES.ST || language === TEXT_WORKFLOW_LANGUAGES.IL;
}

function isVisualWorkflow(language: PLCLanguage): boolean {
  return !supportsTextWorkflow(language) && PLC_LANGUAGES[language]?.isVisual === true;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches('input, textarea, select') || target.isContentEditable || target.closest('[contenteditable="true"]') !== null;
}

export function EditorArea() {
  const { t } = useT();
  const {
    activeFileId,
    openTabs,
    setActiveFile,
    closeTab,
    discardFile,
    saveFile,
    updateFileContent,
    showSettings,
    toggleSettings,
    getActiveFile,
    getFile,
    projectSession,
  } = useEditorAreaState();
  // the files of the open tabs: this region shows them, so it renders again when one of them changes; a watched value does not
  useOpenFiles();

  const [unsavedTabId, setUnsavedTabId] = useState<string | null>(null);
  const [savingTab, setSavingTab] = useState(false);
  const activeFile = getActiveFile();
  const tabFiles = openTabs
    .map((id) => getFile(id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);
  const selectedFileId = tabFiles.some((file) => file.id === activeFileId) ? activeFileId : (tabFiles[0]?.id ?? null);
  const configOpen = useConfigEditors((state) => state.open);
  const configActive = useConfigEditors((state) => state.active);
  const selectedViewId = showSettings ? SETTINGS_TAB_ID : configActive ? configEditorViewId(configActive) : selectedFileId;
  const [closingConfig, setClosingConfig] = useState<ConfigEditorKind | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const activeVisualFile = activeFile && isVisualWorkflow(activeFile.language) ? activeFile : null;
  const visualHistoryKey = activeVisualFile ? `${projectSession}:${activeVisualFile.id}` : null;
  const initialVisualHistoryState: VisualHistoryState = {
    projectSession,
    histories: new Map(),
  };
  const visualHistoryRef = useRef<VisualHistoryState>(initialVisualHistoryState);
  const [visualHistoryState, setVisualHistoryState] = useState<VisualHistoryState>(initialVisualHistoryState);
  const visualHistories = useMemo(
    () => visualHistoryState.projectSession === projectSession ? visualHistoryState.histories : new Map<string, never>(),
    [projectSession, visualHistoryState],
  );

  // Another file shown, by any path (a tab, the navigator, a problem, a search result), leaves the configuration tab; a project of its own starts with none.
  useEffect(() => useIDEStore.subscribe((state, previous) => {
    if (state.activeFileId !== previous.activeFileId || state.compilerNavigationTarget !== previous.compilerNavigationTarget) useConfigEditors.getState().deselect();
    if (state.projectSession !== previous.projectSession) useConfigEditors.getState().reset();
  }), []);

  // Text files keep their Monaco model while their tab is open; closing the tab or the project drops it.
  useEffect(() => {
    disposeClosedModelsOfLoadedEditor(projectSession, openTabs);
  }, [openTabs, projectSession]);

  useEffect(() => useIDEStore.subscribe((state) => {
    const file = state.getActiveFile();
    if (!file || !isVisualWorkflow(file.language)) return;
    const key = visualFileKey(state.projectSession, file.id);
    const current = visualHistoryRef.current;
    const histories = current.projectSession === state.projectSession ? current.histories : new Map<string, never>();
    const synced = synchronizeVisualHistory(histories, key, file.content);
    if (current.projectSession === state.projectSession && synced.histories === current.histories) return;
    const next = { projectSession: state.projectSession, histories: synced.histories };
    visualHistoryRef.current = next;
    setVisualHistoryState(next);
  }), []);

  const getFileIcon = (lang: PLCLanguage) => {
    const info = PLC_LANGUAGES[lang];
    if (info?.isVisual) {
      return <FileCode size={14} className="text-[var(--color-accent-purple)]" />;
    }
    return <File size={14} className="text-[var(--color-accent-blue)]" />;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      updateFileContent(activeFileId, value);
    }
  };

  // Validate and load the visual model from the file content; an invalid file becomes an error value, never an exception.
  const fbdLoad = useMemo((): VisualFileLoad<FBDModel> | null => (
    activeFile?.language === 'FBD' ? loadFBDFile(activeFile.path || activeFile.name, activeFile.content) : null
  ), [activeFile]);
  const ldLoad = useMemo((): VisualFileLoad<LDModel> | null => (
    activeFile?.language === 'LD' ? loadLDFile(activeFile.path || activeFile.name, activeFile.content) : null
  ), [activeFile]);
  const sfcLoad = useMemo((): VisualFileLoad<SFCModel> | null => (
    activeFile?.language === 'SFC' ? loadSFCFile(activeFile.path || activeFile.name, activeFile.content) : null
  ), [activeFile]);

  const updateVisualContent = useCallback((expectedProjectSession: number, expectedFileId: string, expectedLanguage: PLCLanguage, content: string, gesture?: VisualGesture) => {
    const state = useIDEStore.getState();
    const file = state.getFile(expectedFileId);
    if (!file || !canCommitVisualEditorChange(state.projectSession, expectedProjectSession, state.activeFileId, expectedFileId, expectedLanguage, file) || !isVisualWorkflow(file.language)) return;
    // A commit that leaves the model as the file opened keeps the file's bytes (LNG-014)
    if (isUnchangedVisualDocument(file.language as 'LD' | 'FBD' | 'SFC', file.content, content)) return;
    const key = visualFileKey(state.projectSession, file.id);
    const current = visualHistoryRef.current;
    const histories = current.projectSession === state.projectSession ? current.histories : new Map<string, never>();
    const recorded = recordVisualSnapshot(histories, key, file.content, content, gesture);
    const next = { projectSession: state.projectSession, histories: recorded.histories };
    visualHistoryRef.current = next;
    setVisualHistoryState(next);
    state.updateFileContent(file.id, content);
  }, []);

  const applyVisualHistory = useCallback((direction: 'undo' | 'redo'): boolean => {
    const state = useIDEStore.getState();
    const file = state.getActiveFile();
    if (!file || !isVisualWorkflow(file.language)) return false;
    const key = visualFileKey(state.projectSession, file.id);
    const current = visualHistoryRef.current;
    const histories = current.projectSession === state.projectSession ? current.histories : new Map<string, never>();
    const result = direction === 'undo'
      ? undoVisualSnapshot(histories, key, file.content)
      : redoVisualSnapshot(histories, key, file.content);
    if (result.histories !== histories) {
      const next = { projectSession: state.projectSession, histories: result.histories };
      visualHistoryRef.current = next;
      setVisualHistoryState(next);
    }
    if (result.content === undefined) return false;
    // the editor shows the selection the gesture had: it applies it when it rebuilds the canvas from the content
    if (result.selection !== undefined) setVisualSelection(key, result.selection);
    state.updateFileContent(file.id, result.content);
    return true;
  }, []);

  const handleVisualHistoryShortcut = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if ((!event.ctrlKey && !event.metaKey) || (event.ctrlKey && event.metaKey) || event.altKey || isEditableShortcutTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const handled = key === 'z'
      ? applyVisualHistory(event.shiftKey ? 'redo' : 'undo')
      : key === 'y' && !event.shiftKey
        ? applyVisualHistory('redo')
        : false;
    if (handled) event.preventDefault();
  }, [applyVisualHistory]);

  // Handle FBD model changes
  const handleFBDChange = useCallback((model: FBDModel, gesture?: VisualGesture) => {
    if (activeFile?.language === 'FBD') updateVisualContent(projectSession, activeFile.id, 'FBD', serializeFBDModel(model), gesture);
  }, [activeFile, projectSession, updateVisualContent]);

  // Handle LD model changes
  const handleLDChange = useCallback((model: LDModel, gesture?: VisualGesture) => {
    if (activeFile?.language === 'LD') updateVisualContent(projectSession, activeFile.id, 'LD', serializeLDModel(model), gesture);
  }, [activeFile, projectSession, updateVisualContent]);

  // Handle SFC model changes
  const handleSFCChange = useCallback((model: SFCModel, gesture?: VisualGesture) => {
    if (activeFile?.language === 'SFC') updateVisualContent(projectSession, activeFile.id, 'SFC', serializeSFCModel(model), gesture);
  }, [activeFile, projectSession, updateVisualContent]);

  const focusTab = useCallback((viewId: string | null) => {
    requestAnimationFrame(() => {
      if (viewId) document.getElementById(`editor-tab-${viewId}`)?.focus();
      else document.querySelector<HTMLButtonElement>('button[data-project-settings]')?.focus();
    });
  }, []);

  const selectFileTab = useCallback((fileId: string) => {
    if (showSettings) toggleSettings();
    useConfigEditors.getState().deselect();
    setActiveFile(fileId);
  }, [setActiveFile, showSettings, toggleSettings]);

  const selectConfigTab = useCallback((kind: ConfigEditorKind) => {
    if (showSettings) toggleSettings();
    useConfigEditors.getState().show(kind);
  }, [showSettings, toggleSettings]);

  const closeConfigTab = (kind: ConfigEditorKind) => {
    useConfigEditors.getState().close(kind);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  };

  // The configuration is one document shared by its tabs and the settings tab: the last view to close asks about unsaved edits.
  const handleCloseConfigTab = (kind: ConfigEditorKind) => {
    const others = configOpen.length - 1 + (showSettings ? 1 : 0);
    if (configCloseNeedsConfirmation(useIDEStore.getState().projectConfigDirty, others)) setClosingConfig(kind);
    else closeConfigTab(kind);
  };

  const answerConfigClose = async (choice: 'save' | 'discard' | 'cancel') => {
    const kind = closingConfig;
    if (!kind) return;
    if (choice === 'save') {
      setSavingConfig(true);
      await useIDEStore.getState().saveProjectConfig();
      setSavingConfig(false);
    }
    const discarded = choice === 'discard' ? await discardProjectConfigEdits() : false;
    const stillDirty = useIDEStore.getState().projectConfigDirty;
    if (choice !== 'cancel' && (choice === 'save' ? !stillDirty : discarded)) closeConfigTab(kind);
    setClosingConfig(null);
  };

  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, viewId: string) => {
    if (!['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const editorViews = [...(showSettings ? [SETTINGS_TAB_ID] : []), ...configOpen.map(configEditorViewId), ...tabFiles.map((file) => file.id)];
    const index = editorViews.indexOf(viewId);
    if (index < 0) return;
    const destination = event.key === 'Home'
      ? editorViews[0]
      : event.key === 'End'
        ? editorViews.at(-1)
        : event.key === 'ArrowLeft'
          ? editorViews[(index - 1 + editorViews.length) % editorViews.length]
          : event.key === 'ArrowRight'
            ? editorViews[(index + 1) % editorViews.length]
            : undefined;
    if (!destination || destination === viewId) return;
    const config = configOpen.find((kind) => configEditorViewId(kind) === destination);
    if (config) selectConfigTab(config);
    else if (destination !== SETTINGS_TAB_ID) selectFileTab(destination);
    focusTab(destination);
  }, [configOpen, focusTab, selectConfigTab, selectFileTab, showSettings, tabFiles]);

  const closeTabAndFocus = useCallback((fileId: string, discard: boolean) => {
    const remainingFileIds = tabFiles.filter((file) => file.id !== fileId).map((file) => file.id);
    const nextFileId = selectedFileId === fileId ? (remainingFileIds.at(-1) ?? null) : selectedFileId;
    if (discard) discardFile(fileId);
    else closeTab(fileId);
    focusTab(showSettings ? SETTINGS_TAB_ID : nextFileId);
  }, [closeTab, discardFile, focusTab, selectedFileId, showSettings, tabFiles]);

  // Closing a modified tab asks first; an unmodified one closes at once.
  const handleCloseTab = useCallback((fileId: string) => {
    if (getFile(fileId)?.isModified) setUnsavedTabId(fileId);
    else closeTabAndFocus(fileId, false);
  }, [closeTabAndFocus, getFile]);

  const answerUnsavedTab = useCallback(async (choice: UnsavedChoice) => {
    const fileId = unsavedTabId;
    if (!fileId) return;
    if (choice === 'save') {
      setSavingTab(true);
      await saveFile(fileId);
      setSavingTab(false);
    }
    const stillModified = useIDEStore.getState().getFile(fileId)?.isModified ?? false;
    if (unsavedOutcome(choice, stillModified) === 'proceed') closeTabAndFocus(fileId, choice === 'discard');
    setUnsavedTabId(null);
  }, [closeTabAndFocus, saveFile, unsavedTabId]);

  const handleCloseSettings = useCallback(() => {
    toggleSettings();
    focusTab(selectedFileId);
  }, [focusTab, selectedFileId, toggleSettings]);

  // Render visual editor based on language
  const renderVisualEditor = () => {
    if (!activeFile) return null;

    switch (activeFile.language) {
      case 'FBD':
        return fbdLoad?.ok ? <FBDEditor model={fbdLoad.model} onChange={handleFBDChange} /> : renderFileError('FBD', fbdLoad);

      case 'LD':
        return ldLoad?.ok ? <LDEditor model={ldLoad.model} onChange={handleLDChange} /> : renderFileError('LD', ldLoad);

      case 'SFC':
        return sfcLoad?.ok ? <SFCEditor model={sfcLoad.model} onChange={handleSFCChange} /> : renderFileError('SFC', sfcLoad);
        
      default:
        return renderPlaceholder(activeFile.language, 'Unknown visual language');
    }
  };

  const visualHistory = visualHistoryActions(
    visualHistoryKey ? visualHistories.get(visualHistoryKey) : undefined,
    activeVisualFile?.content ?? '',
  );

  // An invalid visual file names itself and its first violations; nothing else in the window is affected.
  const renderFileError = (lang: string, load: VisualFileLoad<unknown> | null) => {
    if (!load || load.ok) return null;
    const { fileName, violations, more } = load.error;
    return (
      <div role="alert" data-file-error className="w-full h-full overflow-auto flex items-center justify-center bg-[var(--color-surface-800)] p-6">
        <div className="max-w-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--color-accent-red)]/30 flex items-center justify-center">
            <FileCode size={32} className="text-[var(--color-accent-red)]" />
          </div>
          <p className="text-[var(--color-accent-red)] text-lg font-medium text-center">{t('workbench.editor.invalidFile', { language: lang })}</p>
          <p className="text-[var(--color-surface-200)] text-sm mt-1 text-center font-mono break-all">{fileName}</p>
          <ul className="mt-4 list-disc pl-5 text-sm text-[var(--color-surface-300)] space-y-1">
            {violations.map((violation) => <li key={violation} className="break-words">{violation}</li>)}
          </ul>
          {more > 0 && <p className="mt-1 pl-5 text-sm text-[var(--color-surface-400)]">{t('workbench.editor.moreViolations', { count: more })}</p>}
          <p className="text-[var(--color-surface-400)] text-sm mt-4 text-center">{t('workbench.editor.fixFile')}</p>
        </div>
      </div>
    );
  };

  // Render placeholder for unimplemented editors
  const renderPlaceholder = (lang: string, message: string) => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-800)]">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-lg bg-[var(--color-surface-700)] flex items-center justify-center">
          <FileCode size={40} className="text-[var(--color-accent-purple)]" />
        </div>
        <p className="text-[var(--color-surface-100)] text-lg font-medium">
          {PLC_LANGUAGES[lang as PLCLanguage]?.fullName || lang}
        </p>
        <p className="text-[var(--color-surface-400)] text-sm mt-1">
          {message}
        </p>
        {activeFile && (
          <p className="text-[var(--color-surface-500)] text-xs mt-3 font-mono">
            {activeFile.name}
          </p>
        )}
      </div>
    </div>
  );

  // No open tabs state (only if settings not shown)
  if (tabFiles.length === 0 && !showSettings && configOpen.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-900)]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--color-surface-800)] flex items-center justify-center">
            <FileCode size={32} className="text-[var(--color-surface-400)]" />
          </div>
          <p className="text-[var(--color-surface-300)] text-lg">{t('workbench.editor.noFile')}</p>
          <p className="text-[var(--color-surface-400)] text-sm mt-1">
            {t('workbench.editor.selectFile')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--color-surface-900)] overflow-hidden">
      {/* Tab Bar */}
      <div role="tablist" aria-label={t('workbench.editor.views')} className="h-9 flex items-center bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] overflow-x-auto">
        {/* Settings Tab (if open) */}
        {showSettings && (
          <div
            role="presentation"
            className="group flex items-center gap-2 px-3 h-full border-r border-[var(--color-surface-600)] cursor-pointer select-none transition-colors bg-[var(--color-surface-700)] text-[var(--color-surface-100)]"
          >
            <Button variant="bare"
              id={`editor-tab-${SETTINGS_TAB_ID}`}
              role="tab"
              aria-selected="true"
              aria-controls={EDITOR_PANEL_ID}
              tabIndex={0}
              onKeyDown={(event) => handleTabKeyDown(event, SETTINGS_TAB_ID)}
              className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline"
            >
              <Settings size={14} className="text-[var(--color-accent-blue)]" />
              <span className="text-sm whitespace-nowrap">{t('workbench.editor.settings')}</span>
            </Button>
            <Button variant="bare"
              type="button"
              onClick={handleCloseSettings}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--color-surface-500)] focus-visible:opacity-100 focus-visible:outline transition-opacity"
              aria-label={t('workbench.editor.closeSettings')}
              tooltip={t('workbench.editor.closeSettings')}
            >
              <X size={14} />
            </Button>
          </div>
        )}
        
        {/* Configuration editors (UX-013) */}
        {configOpen.map((kind) => (
          <ConfigEditorTab key={kind} kind={kind} selected={!showSettings && configActive === kind} panelId={EDITOR_PANEL_ID} onSelect={selectConfigTab} onClose={handleCloseConfigTab} onKeyDown={handleTabKeyDown} />
        ))}

        {/* File Tabs */}
        {tabFiles.map((file) => {
          if (!file) return null;
          const isActive = file.id === selectedViewId;
          const displayName = displayEditorFileName(file.name, file.language);
          
          return (
            <div
              key={file.id}
              role="presentation"
              className={`group flex items-center gap-2 px-3 h-full border-r border-[var(--color-surface-600)] cursor-pointer select-none transition-colors ${
                isActive
                  ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-100)]'
                  : 'bg-[var(--color-surface-800)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]'
              }`}
            >
              <Button variant="bare"
                id={`editor-tab-${file.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={EDITOR_PANEL_ID}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectFileTab(file.id)}
                onKeyDown={(event) => handleTabKeyDown(event, file.id)}
                className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline"
              >
                {getFileIcon(file.language)}
                <span className="text-sm whitespace-nowrap">{displayName}</span>
                {file.isModified && (
                  <span className="text-[var(--color-accent-orange)] text-lg leading-none">
                    *
                  </span>
                )}
              </Button>
              <Button variant="bare"
                type="button"
                onClick={() => handleCloseTab(file.id)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--color-surface-500)] focus-visible:opacity-100 focus-visible:outline transition-opacity"
                aria-label={t('workbench.editor.closeFile', { name: displayName })}
                tooltip={t('workbench.editor.closeFile', { name: displayName })}
              >
                <X size={14} />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Editor Content */}
      <div
        id={EDITOR_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`editor-tab-${selectedViewId}`}
        className="flex-1 overflow-hidden"
      >
        <ErrorBoundary region="Editor" resetKey={selectedViewId}>
        <DevFaultProbe region="Editor" />
        <Suspense fallback={<ViewLoading />}>
        {showSettings ? (
          /* Project Settings Panel */
          <ProjectSettings />
        ) : configActive ? (
          <ConfigEditorHost kind={configActive} />
        ) : activeFile ? (
          !supportsTextWorkflow(activeFile.language) && PLC_LANGUAGES[activeFile.language]?.isVisual ? (
            /* Visual Editors (FBD, LD, SFC) */
            <div className="h-full min-h-0 flex flex-col" onKeyDownCapture={handleVisualHistoryShortcut}>
              <div
                role="toolbar"
                aria-label={t('workbench.editor.history')}
                className="h-9 shrink-0 flex items-center gap-1 px-2 border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]"
              >
                <Button variant="bare"
                  type="button"
                  onClick={() => applyVisualHistory('undo')}
                  disabled={!visualHistory.canUndo}
                  aria-label={t('workbench.editor.undoLabel')}
                  tooltip={t('workbench.editor.undoTitle')}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-surface-200)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline"
                >
                  <Undo2 size={14} aria-hidden="true" />
                  <span>{t('workbench.editor.undo')}</span>
                </Button>
                <Button variant="bare"
                  type="button"
                  onClick={() => applyVisualHistory('redo')}
                  disabled={!visualHistory.canRedo}
                  aria-label={t('workbench.editor.redoLabel')}
                  tooltip={t('workbench.editor.redoTitle')}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-surface-200)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline"
                >
                  <Redo2 size={14} aria-hidden="true" />
                  <span>{t('workbench.editor.redo')}</span>
                </Button>
              </div>
              <div className="min-h-0 flex-1">{renderVisualEditor()}</div>
            </div>
          ) : (
            /* Code Editor with debug support for Text Languages */
            <CodeEditor
              fileId={activeFile.id}
              content={activeFile.content}
              language={activeFile.language}
              onChange={handleEditorChange}
            />
          )
        ) : null}
        </Suspense>
        </ErrorBoundary>
      </div>
      {closingConfig && <ConfigCloseDialog busy={savingConfig} onChoice={(choice) => void answerConfigClose(choice)} />}
      {unsavedTabId && (
        <UnsavedChangesDialog
          title={t('workbench.editor.unsavedTab')}
          items={[getFile(unsavedTabId)?.name ?? unsavedTabId]}
          busy={savingTab}
          saveLabel="Save and close"
          discardLabel="Discard and close"
          onChoice={(choice) => void answerUnsavedTab(choice)}
        />
      )}
    </div>
  );
}
