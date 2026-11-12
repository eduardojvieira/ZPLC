/**
 * EditorArea Component
 *
 * The editor area (SHL-006): one group of tabs, or two side by side. It owns what is open, what asks before it closes and the
 * undo history of the visual editors; each `EditorGroup` shows the views it is given (Monaco for text languages, visual
 * editors for graphical ones).
 */

import { useMemo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Group, Panel, useGroupCallbackRef } from 'react-resizable-panels';
import { useT } from '../i18n';
import { FileCode } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useEditorAreaState, useOpenFiles } from '../store/regionSubscriptions';
import { restoreEditorGroups, useEditorGroups } from '../store/useEditorGroups';
import { type ProjectFileWithHandle } from '../types';
import { isUnchangedVisualDocument } from '../models/visualFileLoad';
import { disposeClosedModelsOfLoadedEditor } from './editorModels';
import { canCommitVisualEditorChange } from '../editors/visualCommitGuard';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { PanelSeparator } from './PanelSeparator';
import { EditorGroup } from './EditorGroup';
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
import { ConfigCloseDialog } from '../navigator/ConfigEditorTab';
import { configCloseNeedsConfirmation, configEditorViewId, isConfigEditorKind, type ConfigEditorKind } from '../navigator/configEditors';
import { discardProjectConfigEdits } from '../navigator/discardConfigEdits';
import { bindCommands, runCommand } from '../commands/bus';
import { shownGroups } from '../layout/editorGroups';
import { SETTINGS_VIEW_ID, isVisualWorkflow, type ViewId } from '../layout/documentKinds';
import { useShellLayout } from '../store/useShellLayout';
import { useShellDensity } from '../shell/shellDensity';

const EDITOR_PANEL_ID = 'editor-panel';
const SECOND_PANEL_ID = 'editor-panel-second';

interface VisualHistoryState {
  projectSession: number;
  histories: VisualHistories;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches('input, textarea, select') || target.isContentEditable || target.closest('[contenteditable="true"]') !== null;
}

const configKindOf = (viewId: ViewId): ConfigEditorKind | null => {
  const kind = viewId.startsWith('config:') ? viewId.slice('config:'.length) : null;
  return isConfigEditorKind(kind) ? kind : null;
};

export function EditorArea() {
  const { t } = useT();
  const compact = useShellDensity() === 'compact';
  const maximised = useShellLayout((state) => state.maximised);
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
    getFile,
    projectSession,
  } = useEditorAreaState();
  // the files of the open tabs: this region shows them, so it renders again when one of them changes; a watched value does not
  useOpenFiles();

  const [unsavedTabId, setUnsavedTabId] = useState<string | null>(null);
  const [savingTab, setSavingTab] = useState(false);
  const tabFiles = openTabs.map((id) => getFile(id)).filter((f): f is NonNullable<typeof f> => f !== undefined);
  const selectedFileId = tabFiles.some((file) => file.id === activeFileId) ? activeFileId : (tabFiles[0]?.id ?? null);
  const configOpen = useConfigEditors((state) => state.open);
  const configActive = useConfigEditors((state) => state.active);
  const selectedViewId = showSettings ? SETTINGS_VIEW_ID : configActive ? configEditorViewId(configActive) : selectedFileId;
  const [closingConfig, setClosingConfig] = useState<ConfigEditorKind | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const initialVisualHistoryState: VisualHistoryState = {
    projectSession,
    histories: new Map(),
  };
  const visualHistoryRef = useRef<VisualHistoryState>(initialVisualHistoryState);
  const [visualHistoryState, setVisualHistoryState] = useState<VisualHistoryState>(initialVisualHistoryState);
  const visualHistories = useMemo(
    () => (visualHistoryState.projectSession === projectSession ? visualHistoryState.histories : new Map<string, never>()),
    [projectSession, visualHistoryState],
  );

  // Every open view in tab order: the settings, the configuration editors, then the files. The groups split this list.
  const allViews: ViewId[] = [
    ...(showSettings ? [SETTINGS_VIEW_ID] : []),
    ...configOpen.map(configEditorViewId),
    ...tabFiles.map((file) => file.id),
  ];
  const viewsKey = allViews.join('\n');
  const groups = useEditorGroups((state) => state.groups);
  const activeFirst = useEditorGroups((state) => state.activeFirst);
  const shown = shownGroups(groups, compact);
  const secondViews = shown === 2 ? allViews.filter((id) => groups.second.includes(id)) : [];
  const firstViews = shown === 2 ? allViews.filter((id) => !groups.second.includes(id)) : allViews;
  /** What a group shows: the active view when it is the group's, otherwise the one the group showed last. */
  const activeOf = (views: readonly ViewId[], remembered: ViewId | null): ViewId | null =>
    selectedViewId !== null && views.includes(selectedViewId)
      ? selectedViewId
      : remembered !== null && views.includes(remembered)
        ? remembered
        : (views.at(-1) ?? null);
  const firstActive = activeOf(firstViews, activeFirst);
  const secondActive = activeOf(secondViews, groups.activeSecond);

  // The groups follow what is open and which view is active (SHL-006): a closed view leaves the second group, and the group of the
  // active view has the focus.
  useEffect(() => {
    useEditorGroups.getState().sync(viewsKey === '' ? [] : viewsKey.split('\n'), selectedViewId);
  }, [viewsKey, selectedViewId]);

  // The split of a saved session is applied once the project's tabs are open (IDE-008).
  useEffect(() => {
    const state = useIDEStore.getState();
    void restoreEditorGroups({
      projectSession,
      directoryHandle: state.directoryHandle,
      openTabs: state.openTabs,
      files: state.loadedFiles,
    });
  }, [projectSession]);

  // Another file shown, by any path (a tab, the navigator, a problem, a search result), leaves the configuration tab; a project of its own
  // starts with none.
  useEffect(
    () =>
      useIDEStore.subscribe((state, previous) => {
        if (state.activeFileId !== previous.activeFileId || state.compilerNavigationTarget !== previous.compilerNavigationTarget)
          useConfigEditors.getState().deselect();
        if (state.projectSession !== previous.projectSession) useConfigEditors.getState().reset();
      }),
    [],
  );

  // Text files keep their Monaco model while their tab is open; closing the tab or the project drops it.
  useEffect(() => {
    disposeClosedModelsOfLoadedEditor(projectSession, openTabs);
  }, [openTabs, projectSession]);

  useEffect(
    () =>
      useIDEStore.subscribe((state) => {
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
      }),
    [],
  );

  const handleEditorChange = (fileId: string, value: string | undefined) => {
    if (value !== undefined) updateFileContent(fileId, value);
  };

  const updateVisualContent = useCallback(
    (expectedProjectSession: number, expectedFileId: string, expectedLanguage: string, content: string, gesture?: VisualGesture) => {
      const state = useIDEStore.getState();
      const file = state.getFile(expectedFileId);
      if (
        !file ||
        !canCommitVisualEditorChange(
          state.projectSession,
          expectedProjectSession,
          state.activeFileId,
          expectedFileId,
          expectedLanguage as ProjectFileWithHandle['language'],
          file,
        ) ||
        !isVisualWorkflow(file.language)
      )
        return;
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
    },
    [setVisualHistoryState],
  );

  const applyVisualHistory = useCallback(
    (direction: 'undo' | 'redo'): boolean => {
      const state = useIDEStore.getState();
      const file = state.getActiveFile();
      if (!file || !isVisualWorkflow(file.language)) return false;
      const key = visualFileKey(state.projectSession, file.id);
      const current = visualHistoryRef.current;
      const histories = current.projectSession === state.projectSession ? current.histories : new Map<string, never>();
      const result =
        direction === 'undo' ? undoVisualSnapshot(histories, key, file.content) : redoVisualSnapshot(histories, key, file.content);
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
    },
    [setVisualHistoryState],
  );

  const handleVisualHistoryShortcut = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if ((!event.ctrlKey && !event.metaKey) || (event.ctrlKey && event.metaKey) || event.altKey || isEditableShortcutTarget(event.target))
        return;
      const key = event.key.toLowerCase();
      const handled =
        key === 'z'
          ? applyVisualHistory(event.shiftKey ? 'redo' : 'undo')
          : key === 'y' && !event.shiftKey
            ? applyVisualHistory('redo')
            : false;
      if (handled) event.preventDefault();
    },
    [applyVisualHistory],
  );

  const focusTab = useCallback((viewId: ViewId | null) => {
    requestAnimationFrame(() => {
      if (viewId) document.getElementById(`editor-tab-${viewId}`)?.focus();
      else document.querySelector<HTMLButtonElement>('button[data-project-settings]')?.focus();
    });
  }, []);

  const selectFileTab = useCallback(
    (fileId: string) => {
      if (showSettings) toggleSettings();
      useConfigEditors.getState().deselect();
      setActiveFile(fileId);
    },
    [setActiveFile, showSettings, toggleSettings],
  );

  const selectConfigTab = useCallback(
    (kind: ConfigEditorKind) => {
      if (showSettings) toggleSettings();
      useConfigEditors.getState().show(kind);
    },
    [showSettings, toggleSettings],
  );

  const selectView = useCallback(
    (viewId: ViewId) => {
      const config = configKindOf(viewId);
      if (viewId === SETTINGS_VIEW_ID) {
        if (!showSettings) toggleSettings();
      } else if (config) selectConfigTab(config);
      else selectFileTab(viewId);
    },
    [selectConfigTab, selectFileTab, showSettings, toggleSettings],
  );

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

  const closeTabAndFocus = useCallback(
    (fileId: string, discard: boolean) => {
      const remainingFileIds = tabFiles.filter((file) => file.id !== fileId).map((file) => file.id);
      const nextFileId = selectedFileId === fileId ? (remainingFileIds.at(-1) ?? null) : selectedFileId;
      if (discard) discardFile(fileId);
      else closeTab(fileId);
      focusTab(showSettings ? SETTINGS_VIEW_ID : nextFileId);
    },
    [closeTab, discardFile, focusTab, selectedFileId, showSettings, tabFiles],
  );

  // Closing a modified tab asks first; an unmodified one closes at once.
  const handleCloseTab = useCallback(
    (fileId: string) => {
      if (getFile(fileId)?.isModified) setUnsavedTabId(fileId);
      else closeTabAndFocus(fileId, false);
    },
    [closeTabAndFocus, getFile],
  );

  const answerUnsavedTab = useCallback(
    async (choice: UnsavedChoice) => {
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
    },
    [closeTabAndFocus, saveFile, unsavedTabId],
  );

  const handleCloseSettings = useCallback(() => {
    toggleSettings();
    focusTab(selectedFileId);
  }, [focusTab, selectedFileId, toggleSettings]);

  const closeView = (viewId: ViewId) => {
    const config = configKindOf(viewId);
    if (viewId === SETTINGS_VIEW_ID) handleCloseSettings();
    else if (config) handleCloseConfigTab(config);
    else handleCloseTab(viewId);
  };

  // SHL-006: the split commands act on the active view; below the compact width there is one group and they do nothing.
  const latest = useRef({ allViews, selectedViewId, firstActive, secondActive, compact, selectView, focusTab });
  useEffect(() => {
    latest.current = { allViews, selectedViewId, firstActive, secondActive, compact, selectView, focusTab };
  });
  const moveActive = useCallback((onlyToSecond: boolean) => {
    const { allViews: open, selectedViewId: view, compact: narrow, focusTab: focus } = latest.current;
    const store = useEditorGroups.getState();
    if (view === null || narrow || (onlyToSecond && store.groups.second.includes(view))) return;
    store.move(view, open);
    focus(view);
  }, []);
  useEffect(
    () =>
      bindCommands({
        'view.splitRight': () => moveActive(true),
        'view.moveToOtherGroup': () => moveActive(false),
        'view.focusOtherGroup': () => {
          const { secondActive: second, firstActive: first, compact: narrow, selectView: select, focusTab: focus } = latest.current;
          const { groups: current } = useEditorGroups.getState();
          if (narrow || current.second.length === 0) return;
          const target = current.focused === 'first' ? second : first;
          if (target === null) return;
          select(target);
          focus(target);
        },
      }),
    [moveActive],
  );

  const focusGroup = (which: 'first' | 'second') => {
    if (shown !== 2 || useEditorGroups.getState().groups.focused === which) return;
    const target = which === 'first' ? firstActive : secondActive;
    if (target !== null) selectView(target);
  };

  const [groupHandle, setGroupHandle] = useGroupCallbackRef();
  const filesById = new Map<ViewId, ProjectFileWithHandle>(tabFiles.map((file) => [file.id, file]));
  const groupProps = {
    files: filesById,
    onSelect: selectView,
    onClose: closeView,
    onTextChange: handleEditorChange,
    onVisualChange: (file: ProjectFileWithHandle, content: string, gesture?: VisualGesture) =>
      updateVisualContent(projectSession, file.id, file.language, content, gesture),
    historyOf: (file: ProjectFileWithHandle) => visualHistoryActions(visualHistories.get(`${projectSession}:${file.id}`), file.content),
    onHistory: applyVisualHistory,
    onHistoryShortcut: handleVisualHistoryShortcut,
    onMaximise: () => runCommand('view.maximiseDocument'),
    maximised,
    moveLabel: t(shown === 2 ? 'studio.document.moveToOther' : 'studio.document.splitRight'),
    onMove: () => moveActive(false),
    canMove: !compact,
  };

  // No open tabs state (only if settings not shown)
  if (allViews.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-900)]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--color-surface-800)] flex items-center justify-center">
            <FileCode size={32} className="text-[var(--color-surface-400)]" />
          </div>
          <p className="text-[var(--color-surface-300)] text-lg">{t('workbench.editor.noFile')}</p>
          <p className="text-[var(--color-surface-400)] text-sm mt-1">{t('workbench.editor.selectFile')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden">
      {shown === 2 ? (
        <Group
          orientation="horizontal"
          className="h-full min-w-0"
          defaultLayout={{ 'editor-first': groups.ratio * 100, 'editor-second': (1 - groups.ratio) * 100 }}
          groupRef={setGroupHandle}
          onLayoutChanged={(layout, meta) => {
            const first = layout['editor-first'];
            if (meta.isUserInteraction && typeof first === 'number') useEditorGroups.getState().setRatio(first / 100);
          }}
        >
          <Panel id="editor-first" minSize="20%" maxSize="80%" className="overflow-hidden">
            <EditorGroup
              {...groupProps}
              views={firstViews}
              activeViewId={firstActive}
              panelId={EDITOR_PANEL_ID}
              focused={groups.focused === 'first'}
              onFocusGroup={() => focusGroup('first')}
              label={t('studio.document.group.first')}
            />
          </Panel>
          <PanelSeparator
            id="editor-groups-separator"
            label={t('studio.document.separator')}
            group={groupHandle}
            leading="editor-first"
            trailing="editor-second"
          />
          <Panel id="editor-second" minSize="20%" maxSize="80%" className="overflow-hidden">
            <EditorGroup
              {...groupProps}
              views={secondViews}
              activeViewId={secondActive}
              panelId={SECOND_PANEL_ID}
              focused={groups.focused === 'second'}
              onFocusGroup={() => focusGroup('second')}
              label={t('studio.document.group.second')}
            />
          </Panel>
        </Group>
      ) : (
        <EditorGroup
          {...groupProps}
          views={firstViews}
          activeViewId={firstActive}
          panelId={EDITOR_PANEL_ID}
          focused
          onFocusGroup={() => {}}
        />
      )}
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
