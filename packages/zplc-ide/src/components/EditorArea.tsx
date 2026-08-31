/**
 * EditorArea Component
 * 
 * Tabbed editor container with Monaco for text languages (ST, IL)
 * and visual editors for graphical languages (LD, FBD, SFC)
 */

import { useMemo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X, FileCode, File, Settings, Undo2, Redo2 } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { PLC_LANGUAGES, type PLCLanguage } from '../types';
import { FBDEditor } from '../editors/fbd';
import { LDEditor } from '../editors/ld';
import { SFCEditor } from '../editors/sfc';
import { parseFBDModel, serializeFBDModel, type FBDModel } from '../models/fbd';
import { parseLDModel, serializeLDModel, type LDModel } from '../models/ld';
import { parseSFCModel, serializeSFCModel, type SFCModel } from '../models/sfc';
import { ProjectSettings } from './settings/ProjectSettings';
import { CodeEditor } from './CodeEditor';
import { canCommitVisualEditorChange } from '../editors/visualCommitGuard';
import { displayEditorFileName } from './editorFilePresentation';
import {
  recordVisualSnapshot,
  redoVisualSnapshot,
  synchronizeVisualHistory,
  undoVisualSnapshot,
  visualHistoryActions,
  type VisualHistories,
} from '../editors/visualHistory';

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
  const {
    activeFileId,
    openTabs,
    setActiveFile,
    closeTab,
    updateFileContent,
    showSettings,
    toggleSettings,
    getActiveFile,
    getFile,
    projectSession,
  } = useIDEStore();

  const activeFile = getActiveFile();
  const tabFiles = openTabs
    .map((id) => getFile(id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);
  const selectedFileId = tabFiles.some((file) => file.id === activeFileId) ? activeFileId : (tabFiles[0]?.id ?? null);
  const selectedViewId = showSettings ? SETTINGS_TAB_ID : selectedFileId;
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

  useEffect(() => useIDEStore.subscribe((state) => {
    const file = state.getActiveFile();
    if (!file || !isVisualWorkflow(file.language)) return;
    const key = `${state.projectSession}:${file.id}`;
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

  // Parse FBD model from file content
  const fbdModel = useMemo((): FBDModel | null => {
    if (!activeFile || activeFile.language !== 'FBD') return null;
    try {
      return parseFBDModel(activeFile.content);
    } catch (e) {
      console.error('Failed to parse FBD model:', e);
      return null;
    }
  }, [activeFile]);

  // Parse LD model from file content
  const ldModel = useMemo((): LDModel | null => {
    if (!activeFile || activeFile.language !== 'LD') return null;
    try {
      return parseLDModel(activeFile.content);
    } catch (e) {
      console.error('Failed to parse LD model:', e);
      return null;
    }
  }, [activeFile]);

  // Parse SFC model from file content
  const sfcModel = useMemo((): SFCModel | null => {
    if (!activeFile || activeFile.language !== 'SFC') return null;
    try {
      return parseSFCModel(activeFile.content);
    } catch (e) {
      console.error('Failed to parse SFC model:', e);
      return null;
    }
  }, [activeFile]);

  const updateVisualContent = useCallback((expectedProjectSession: number, expectedFileId: string, expectedLanguage: PLCLanguage, content: string) => {
    const state = useIDEStore.getState();
    const file = state.getFile(expectedFileId);
    if (!file || !canCommitVisualEditorChange(state.projectSession, expectedProjectSession, state.activeFileId, expectedFileId, expectedLanguage, file) || !isVisualWorkflow(file.language) || content === file.content) return;
    const key = `${state.projectSession}:${file.id}`;
    const current = visualHistoryRef.current;
    const histories = current.projectSession === state.projectSession ? current.histories : new Map<string, never>();
    const recorded = recordVisualSnapshot(histories, key, file.content, content);
    const next = { projectSession: state.projectSession, histories: recorded.histories };
    visualHistoryRef.current = next;
    setVisualHistoryState(next);
    state.updateFileContent(file.id, content);
  }, []);

  const applyVisualHistory = useCallback((direction: 'undo' | 'redo'): boolean => {
    const state = useIDEStore.getState();
    const file = state.getActiveFile();
    if (!file || !isVisualWorkflow(file.language)) return false;
    const key = `${state.projectSession}:${file.id}`;
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
  const handleFBDChange = useCallback((model: FBDModel) => {
    if (activeFile?.language === 'FBD') updateVisualContent(projectSession, activeFile.id, 'FBD', serializeFBDModel(model));
  }, [activeFile, projectSession, updateVisualContent]);

  // Handle LD model changes
  const handleLDChange = useCallback((model: LDModel) => {
    if (activeFile?.language === 'LD') updateVisualContent(projectSession, activeFile.id, 'LD', serializeLDModel(model));
  }, [activeFile, projectSession, updateVisualContent]);

  // Handle SFC model changes
  const handleSFCChange = useCallback((model: SFCModel) => {
    if (activeFile?.language === 'SFC') updateVisualContent(projectSession, activeFile.id, 'SFC', serializeSFCModel(model));
  }, [activeFile, projectSession, updateVisualContent]);

  const focusTab = useCallback((viewId: string | null) => {
    requestAnimationFrame(() => {
      if (viewId) document.getElementById(`editor-tab-${viewId}`)?.focus();
      else document.querySelector<HTMLButtonElement>('button[title="Project Settings"]')?.focus();
    });
  }, []);

  const selectFileTab = useCallback((fileId: string) => {
    if (showSettings) toggleSettings();
    setActiveFile(fileId);
  }, [setActiveFile, showSettings, toggleSettings]);

  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, viewId: string) => {
    if (!['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const editorViews = showSettings ? [SETTINGS_TAB_ID, ...tabFiles.map((file) => file.id)] : tabFiles.map((file) => file.id);
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
    if (destination !== SETTINGS_TAB_ID) selectFileTab(destination);
    focusTab(destination);
  }, [focusTab, selectFileTab, showSettings, tabFiles]);

  const handleCloseTab = useCallback((fileId: string) => {
    const remainingFileIds = tabFiles.filter((file) => file.id !== fileId).map((file) => file.id);
    const nextFileId = selectedFileId === fileId ? (remainingFileIds.at(-1) ?? null) : selectedFileId;
    closeTab(fileId);
    focusTab(showSettings ? SETTINGS_TAB_ID : nextFileId);
  }, [closeTab, focusTab, selectedFileId, showSettings, tabFiles]);

  const handleCloseSettings = useCallback(() => {
    toggleSettings();
    focusTab(selectedFileId);
  }, [focusTab, selectedFileId, toggleSettings]);

  // Render visual editor based on language
  const renderVisualEditor = () => {
    if (!activeFile) return null;

    switch (activeFile.language) {
      case 'FBD':
        if (fbdModel) {
          return <FBDEditor model={fbdModel} onChange={handleFBDChange} />;
        }
        return renderParseError('FBD');
        
      case 'LD':
        if (ldModel) {
          return <LDEditor model={ldModel} onChange={handleLDChange} />;
        }
        return renderParseError('LD');
        
      case 'SFC':
        if (sfcModel) {
          return <SFCEditor model={sfcModel} onChange={handleSFCChange} />;
        }
        return renderParseError('SFC');
        
      default:
        return renderPlaceholder(activeFile.language, 'Unknown visual language');
    }
  };

  const visualHistory = visualHistoryActions(
    visualHistoryKey ? visualHistories.get(visualHistoryKey) : undefined,
    activeVisualFile?.content ?? '',
  );

  // Render parse error state
  const renderParseError = (lang: string) => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-800)]">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-red-900/30 flex items-center justify-center">
          <FileCode size={32} className="text-red-400" />
        </div>
        <p className="text-red-400 text-lg font-medium">Invalid {lang} Model</p>
        <p className="text-[var(--color-surface-400)] text-sm mt-1 max-w-md">
          Failed to parse the {lang} JSON. Check the console for details.
        </p>
      </div>
    </div>
  );

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
  if (tabFiles.length === 0 && !showSettings) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-900)]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--color-surface-800)] flex items-center justify-center">
            <FileCode size={32} className="text-[var(--color-surface-400)]" />
          </div>
          <p className="text-[var(--color-surface-300)] text-lg">No file open</p>
          <p className="text-[var(--color-surface-400)] text-sm mt-1">
            Select a file from the explorer to start editing
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--color-surface-900)] overflow-hidden">
      {/* Tab Bar */}
      <div role="tablist" aria-label="Editor views" className="h-9 flex items-center bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] overflow-x-auto">
        {/* Settings Tab (if open) */}
        {showSettings && (
          <div
            role="presentation"
            className="group flex items-center gap-2 px-3 h-full border-r border-[var(--color-surface-600)] cursor-pointer select-none transition-colors bg-[var(--color-surface-700)] text-[var(--color-surface-100)]"
          >
            <button
              id={`editor-tab-${SETTINGS_TAB_ID}`}
              role="tab"
              aria-selected="true"
              aria-controls={EDITOR_PANEL_ID}
              tabIndex={0}
              onKeyDown={(event) => handleTabKeyDown(event, SETTINGS_TAB_ID)}
              className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
            >
              <Settings size={14} className="text-[var(--color-accent-blue)]" />
              <span className="text-sm whitespace-nowrap">Settings</span>
            </button>
            <button
              type="button"
              onClick={handleCloseSettings}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--color-surface-500)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)] transition-opacity"
              aria-label="Close Settings"
              title="Close Settings"
            >
              <X size={14} />
            </button>
          </div>
        )}
        
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
              <button
                id={`editor-tab-${file.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={EDITOR_PANEL_ID}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectFileTab(file.id)}
                onKeyDown={(event) => handleTabKeyDown(event, file.id)}
                className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
              >
                {getFileIcon(file.language)}
                <span className="text-sm whitespace-nowrap">{displayName}</span>
                {file.isModified && (
                  <span className="text-[var(--color-accent-orange)] text-lg leading-none">
                    *
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleCloseTab(file.id)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--color-surface-500)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)] transition-opacity"
                aria-label={`Close ${displayName}`}
                title={`Close ${displayName}`}
              >
                <X size={14} />
              </button>
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
        {showSettings ? (
          /* Project Settings Panel */
          <ProjectSettings />
        ) : activeFile ? (
          !supportsTextWorkflow(activeFile.language) && PLC_LANGUAGES[activeFile.language]?.isVisual ? (
            /* Visual Editors (FBD, LD, SFC) */
            <div className="h-full min-h-0 flex flex-col" onKeyDownCapture={handleVisualHistoryShortcut}>
              <div
                role="toolbar"
                aria-label="Visual editor history"
                className="h-9 shrink-0 flex items-center gap-1 px-2 border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]"
              >
                <button
                  type="button"
                  onClick={() => applyVisualHistory('undo')}
                  disabled={!visualHistory.canUndo}
                  aria-label="Undo visual edit"
                  title="Undo visual edit (Ctrl+Z)"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-surface-200)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
                >
                  <Undo2 size={14} aria-hidden="true" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyVisualHistory('redo')}
                  disabled={!visualHistory.canRedo}
                  aria-label="Redo visual edit"
                  title="Redo visual edit (Ctrl+Shift+Z)"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-surface-200)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)]"
                >
                  <Redo2 size={14} aria-hidden="true" />
                  <span>Redo</span>
                </button>
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
      </div>
    </div>
  );
}
