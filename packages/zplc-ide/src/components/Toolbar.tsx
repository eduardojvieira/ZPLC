/**
 * Toolbar Component - Unified Control Bar
 *
 * Single toolbar that handles:
 * - File operations (Save, Export)
 * - Build operations (Compile, Download, View ASM)
 * - Execution mode (Simulate vs Hardware)
 * - Execution controls (Run/Pause/Stop/Step/Reset)
 * - Connection status and settings
 *
 * Uses useDebugController as the single source of truth for all
 * simulation and hardware connection state.
 */

import { useState, useRef, useEffect, useEffectEvent } from 'react';
import { Settings, Save } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useActiveFileInfo, useToolbarState } from '../store/regionSubscriptions';
import { useT } from '../i18n';
import { bindCommands, publishCommandState, runCommand } from '../commands/bus';
import type { CommandId } from '../commands/registry';
import { withShortcut } from '../commands/shortcutLabels';
import { useDebugController } from '../hooks/useDebugController';
import { ZPLC_CONSTANTS } from '@zplc/compiler';
import type { DebugMap } from '../compiler';
import { GeneratedCodeDialog } from './GeneratedCodeDialog';
import {
  canRunCurrentProgram,
  isCompileResultCurrent,
  type LastCompileResult,
  nextProgramLoadStateAfterCompile,
  nextProgramLoadStateAfterConnect,
  PROGRAM_LOAD_STATE,
} from './debugSessionState';
import { EXECUTION_MODE, selectRuntimeArtifact, type ExecutionMode } from './runtimeArtifactSelection';
import { OperationalStatusBar } from './OperationalStatusBar';
import { getStatusDisplay } from './programState';
import { CommandBarCenter } from '../shell/CommandBarCenter';
import { generateStructuredText } from './visualToStructuredText';
import { downloadBlob } from '../utils/downloadBlob';
import { isWorkspaceTestRunCurrent, presentWorkspaceCompileResult, resolveWorkspaceCompileRoute } from './workspaceTestPresentation';
import { shownProjectBridge } from '../ipc/shownProjectBridge';
import { useNotifications } from '../store/notifications';
import { vmInfoNow } from '../store/vmInfo';
import { activeTransport } from '../store/useTransport';
import { Notifications } from './Notifications';
import { useDropdownMenu } from './useDropdownMenu';
import { canLinkProjectWorkspace, linkProjectWorkspace } from '../utils/workspaceTestLink';
import { performHardwareDeploy } from './deployFlow';
import { confirmReset, confirmStop, proceedAfterConfirmation } from './physicalActions';
import { RunControls } from './ToolbarRunControls';
import { BuildMenu } from './ToolbarBuildMenu';
import { Button, MenuButton } from '../ui';
import { TargetSelector } from './TargetSelector';
import { runSequence, type RunActions } from './runSequence';
import { planRun, type RunOffer, type RunSituation } from '../runtime/runPlan';
import { saveAllDocuments } from '../store/saveAll';
import { useAppSettings } from '../store/useAppSettings';
import { confirmAction } from '../store/actionConfirm';
import { reveal } from '../shell/reveal';
import { usePlantDocument } from '../store/usePlantDocument';

// =============================================================================
// Types
// =============================================================================

/** The commands whose behaviour lives in the toolbar (UX-015). */
const TOOLBAR_COMMANDS = [
  'file.save',
  'file.saveAll',
  'build.compile',
  'build.generateSt',
  'build.downloadProgram',
  'build.viewAssembly',
  'online.simulation',
  'online.hardware',
  'online.connect',
  'online.disconnect',
  'online.deploy',
  'online.restartSimulator',
  'debug.rebuildAndRestart',
  'debug.run',
  'debug.pause',
  'debug.stop',
  'debug.step',
  'debug.reset',
  'debug.liveValues',
] as const satisfies readonly CommandId[];
type ToolbarCommandId = (typeof TOOLBAR_COMMANDS)[number];

/** What a build reports to Run's sequence: whether it built, and the located message of the first problem when it did not. */
type BuildOutcome = { ok: true } | { ok: false; message?: string };

/** The saved-first notice (FLW-006) is said once per window: saving before a build writes to disk without an explicit Save. */
let savedFirstNoticeShown = false;

interface ToolbarProps {
  /** Debug controller instance from App */
  debugController: ReturnType<typeof useDebugController>;
}

// =============================================================================
// Main Component
// =============================================================================

export function Toolbar({ debugController }: ToolbarProps) {
  const { t, tn } = useT();
  const {
    addConsoleEntry,
    addCompilerMessage,
    clearCompilerMessages,
    markCompilerMessagesChecked,
    toggleSettings,
    saveFile,
    getActiveFile,
    activeFileId,
    projectSession,
    workspaceScenarioLink,
    hasUnsavedChanges,
  } = useToolbarState();
  const isProjectOpen = useIDEStore((s) => s.isProjectOpen);
  const recordCanonicalWorkspaceBuildEvidence = useIDEStore((s) => s.recordCanonicalWorkspaceBuildEvidence);

  const toggleMpeek = useIDEStore((s) => s.toggleMpeek);
  const boardName = useIDEStore((s) => s.projectConfig?.target?.board);
  // Save all differs from Save when a document other than the active one, or the project configuration, is modified (FLW-005).
  const othersModified = useIDEStore(
    (s) => s.projectConfigDirty || [...s.loadedFiles].some(([id, file]) => file.isModified && id !== s.activeFileId),
  );

  // Destructure debug controller
  const { adapter, vmState, startSimulation, connectHardware, disconnect, loadProgram, getHardwareSystemInfo } = debugController;
  // One transport (PLS-003): the plant session when a plant document registered one, else the program alone.
  const transport = activeTransport(debugController);

  // Local UI state
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(EXECUTION_MODE.SIMULATE);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  // Run's sequence is in flight: its controls wait, and a second press does nothing (FLW-001).
  const [isRunPreparing, setIsRunPreparing] = useState(false);
  const runInFlightRef = useRef(false);
  // The controller of the latest render: the steps of a sequence outlive the render that started them.
  const controllerRef = useRef(debugController);
  useEffect(() => {
    controllerRef.current = debugController;
  });
  const lastCompileRef = useRef<LastCompileResult | null>(null);
  const [programLoadState, setProgramLoadState] = useState<(typeof PROGRAM_LOAD_STATE)[keyof typeof PROGRAM_LOAD_STATE]>(
    PROGRAM_LOAD_STATE.EMPTY,
  );
  const compileRevisionRef = useRef(0);

  const connectionButtonRef = useRef<HTMLButtonElement>(null);
  const pendingConnectionFocusRef = useRef<boolean | null>(null);
  const executionButtonRef = useRef<HTMLButtonElement>(null);
  const pendingExecutionFocusRef = useRef<'running' | 'paused' | null>(null);
  const uploadInFlightRef = useRef(false);

  const buildMenu = useDropdownMenu();

  // State for generated code dialog
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatedCodeType, setGeneratedCodeType] = useState<'FBD' | 'LD' | 'SFC' | 'ASM'>('ASM');

  // State for last successful compilation result
  const [lastCompileResult, setLastCompileResult] = useState<LastCompileResult | null>(null);

  // What the toolbar shows of the active file: its name and language, not its content (IDE-013)
  const activeFile = useActiveFileInfo();
  const isVisualLanguage = activeFile?.language === 'FBD' || activeFile?.language === 'LD' || activeFile?.language === 'SFC';

  // Derived state from adapter
  const isConnected = adapter?.connected ?? false;
  const isRunning = vmState === 'running';
  const isPaused = vmState === 'paused';
  // A simulation that has not started its session is stopped too: Run starts it (FLW-008).
  const isStopped = vmState === 'idle' || vmState === 'disconnected';
  const controlsBusy = isConnecting || isUploading || isModeTransitioning || isRunPreparing;
  const hasCurrentCompileResult = useIDEStore((s) => isCompileResultCurrent(lastCompileResult?.compilerRunId ?? null, s.compilerRunId));
  // Read from a ref: a step of Run's sequence runs after the build that made the result, in the same closure.
  const currentCompileResult = () => {
    const result = lastCompileRef.current;
    return result && isCompileResultCurrent(result.compilerRunId, useIDEStore.getState().compilerRunId) ? result : null;
  };
  const storeCompileResult = (result: LastCompileResult) => {
    lastCompileRef.current = result;
    setLastCompileResult(result);
  };

  useEffect(() => {
    if (isConnecting || pendingConnectionFocusRef.current !== isConnected) return;
    pendingConnectionFocusRef.current = null;
    requestAnimationFrame(() => connectionButtonRef.current?.focus());
  }, [isConnected, isConnecting]);

  useEffect(() => {
    const pendingTarget = pendingExecutionFocusRef.current;
    if (!pendingTarget || (pendingTarget === 'running' ? !isRunning : !isPaused)) return;
    pendingExecutionFocusRef.current = null;
    requestAnimationFrame(() => executionButtonRef.current?.focus());
  }, [isPaused, isRunning]);

  // The folder is the main process's: link the project to its workspace as it opens, so that Tests finds it ready (IDE-001).
  useEffect(() => {
    if (isProjectOpen) void linkProjectWorkspace();
  }, [isProjectOpen, projectSession]);

  // The simulator session ends with the project (FLW-008): the bar goes when the project closes, and the session with it.
  const executionModeRef = useRef(executionMode);
  useEffect(() => {
    executionModeRef.current = executionMode;
  });
  useEffect(
    () => () => {
      const controller = controllerRef.current;
      if (!useIDEStore.getState().isProjectOpen && executionModeRef.current === EXECUTION_MODE.SIMULATE && controller.adapter) {
        void controller.disconnect();
      }
    },
    [],
  );

  // ==========================================================================
  // File Operations
  // ==========================================================================

  // The handlers below report their own failure in the console, so buttons and shortcuts start them with `void` and do not wait.
  const handleSaveFile = async () => {
    if (!activeFile || !activeFileId) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.noFileSelectedTo'), source: 'system' });
      return;
    }

    const saved = await saveFile(activeFileId);
    useNotifications.getState().report(
      saved
        ? { kind: 'save', status: 'success', title: t('toolbarMsg.saved', { name: activeFile.name }), details: 'output' }
        : {
            kind: 'save',
            status: 'error',
            title: t('toolbarMsg.couldNotSave', { name: activeFile.name }),
            detail: t('toolbarMsg.theFileStaysModified'),
            details: 'output',
            recover: {
              label: t('toolbarMsg.trySavingAgain'),
              run: () => {
                void handleSaveFile();
              },
            },
          },
    );
  };

  /** Saves every modified document and the configuration; says once per window that a build or a run saved by itself (FLW-006). */
  const saveModified = async (): Promise<void> => {
    const result = await saveAllDocuments();
    if (result.failed.length > 0) throw new Error(t('studio.flow.saveAll.failed', { files: result.failed.join(', ') }));
    if (result.saved > 0 && !savedFirstNoticeShown) {
      savedFirstNoticeShown = true;
      useNotifications.getState().report({
        kind: 'save',
        status: 'warning',
        title: t('studio.flow.savedFirst'),
        details: 'output',
        recover: {
          label: t('studio.flow.savedFirst.action'),
          run: () => {
            if (!useIDEStore.getState().showSettings) toggleSettings();
          },
        },
      });
    }
  };

  /** Asks before saving when the preference says Ask (FLW-006); the answer to "Save" saves. */
  const askToSave = async (): Promise<'saved' | 'cancelled'> => {
    const yes = await confirmAction({
      title: t('studio.flow.ask.title'),
      description: t('studio.flow.ask.description'),
      actionLabel: t('studio.flow.ask.action'),
      cancelLabel: t('common.cancel'),
    });
    if (!yes) return 'cancelled';
    await saveModified();
    return 'saved';
  };

  const handleSaveAll = async () => {
    const { saved, failed } = await saveAllDocuments();
    useNotifications.getState().report(
      failed.length > 0
        ? { kind: 'save', status: 'error', title: t('studio.flow.saveAll.failed', { files: failed.join(', ') }), details: 'output' }
        : {
            kind: 'save',
            status: 'success',
            title: saved > 0 ? t('studio.flow.saveAll.saved', { count: saved }) : t('studio.flow.saveAll.nothing'),
            details: 'output',
          },
    );
  };

  // ==========================================================================
  // Transpiler (Visual -> ST)
  // ==========================================================================

  const handleGenerateST = () => {
    const file = getActiveFile();
    if (!file) return;
    addConsoleEntry({
      type: 'info',
      message: t('toolbarMsg.transpilingToStructuredText', { language: file.language }),
      source: 'transpiler',
    });

    const source = generateStructuredText(file, addConsoleEntry);
    if (source !== null) {
      addConsoleEntry({
        type: 'success',
        message: t('toolbarMsg.generatedLinesOfStructured', { length: source.split('\n').length }),
        source: 'transpiler',
      });
      setGeneratedCode(source);
      setGeneratedCodeType(file.language as 'FBD' | 'LD' | 'SFC');
      setShowGeneratedCode(true);
    }
  };

  // ==========================================================================
  // Compilation
  // ==========================================================================

  const revealCompileProblems = () => {
    const current = useIDEStore.getState();
    if (current.isConsoleCollapsed) current.toggleConsole();
    current.setActiveConsoleTab('problems');
  };

  /**
   * Builds the saved project. With `quiet` (Run's sequence, FLW-001) the build opens no notice of its own: the one notice of
   * the run names the step, and a failure comes back as a located message instead of a second notice.
   */
  const compileProject = async (quiet: boolean): Promise<BuildOutcome> => {
    clearCompilerMessages();
    const compilerRunId = useIDEStore.getState().compilerRunId;
    const isCurrentRun = () => useIDEStore.getState().compilerRunId === compilerRunId;
    buildMenu.setOpen(false);

    const workspaceTests = shownProjectBridge(window.electronAPI?.workspaceTests);
    const currentWorkspaceLink = workspaceScenarioLink?.projectSession === projectSession ? workspaceScenarioLink : null;
    const workspaceCompileRoute = resolveWorkspaceCompileRoute({
      isElectronHost: window.electronAPI !== undefined || navigator.userAgent.includes('Electron/'),
      canonicalCompileAvailable: typeof workspaceTests?.compile === 'function',
      isProjectOpen: useIDEStore.getState().isProjectOpen,
      hasCurrentLink: currentWorkspaceLink !== null,
      canLinkProject: canLinkProjectWorkspace(),
      hasUnsavedChanges: hasUnsavedChanges(),
    });

    if (
      workspaceCompileRoute === 'canonical-unavailable' ||
      workspaceCompileRoute === 'link-required' ||
      workspaceCompileRoute === 'save-required'
    ) {
      const current = useIDEStore.getState();
      if (current.isConsoleCollapsed) current.toggleConsole();
      current.setActiveConsoleTab('tests');
      const message =
        workspaceCompileRoute === 'canonical-unavailable'
          ? t('toolbarMsg.savedWorkspaceCompilerIs')
          : workspaceCompileRoute === 'link-required'
            ? t('toolbarMsg.openTestsAndChoose')
            : t('toolbarMsg.saveChangesBeforeBuilding');
      addConsoleEntry({ type: 'error', message, source: 'compiler' });
      addCompilerMessage({ type: 'error', message });
      if (!quiet)
        useNotifications
          .getState()
          .report({ kind: 'build', status: 'error', title: t('toolbarMsg.buildDidNotStart'), detail: message, details: 'tests' });
      return { ok: false, message };
    }

    if (workspaceCompileRoute === 'canonical' && workspaceTests) {
      // Build the folder the main process owns, registered afresh for this build: the user never chooses a zplc.json (IDE-001).
      const link = canLinkProjectWorkspace() ? await linkProjectWorkspace() : currentWorkspaceLink;
      if (!isCurrentRun()) return { ok: false };
      if (!link) {
        revealCompileProblems();
        const message = t('toolbarMsg.savedWorkspaceCouldNot');
        addConsoleEntry({ type: 'error', message, source: 'compiler' });
        addCompilerMessage({ type: 'error', message });
        markCompilerMessagesChecked();
        if (!quiet)
          useNotifications
            .getState()
            .report({ kind: 'build', status: 'error', title: t('toolbarMsg.buildDidNotStart'), detail: message, details: 'problems' });
        return { ok: false, message };
      }
      const workspaceId = link.workspaceId;
      const expected = { projectSession, compilerRunId, workspaceId };
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.buildingSavedWorkspaceLocally'), source: 'compiler' });
      let cancelRequested = false;
      const notices = useNotifications.getState();
      const operation = quiet
        ? null
        : notices.begin({
            kind: 'build',
            title: t('toolbarMsg.buildingProject'),
            details: 'output',
            cancel: () => {
              cancelRequested = true;
              void workspaceTests.cancel().catch(() => undefined);
            },
          });
      const finishNotice = (result: Parameters<typeof notices.finish>[1]) => {
        if (operation !== null) notices.finish(operation, result);
      };
      const dismissNotice = () => {
        if (operation !== null) notices.dismiss(operation);
      };
      try {
        const response = await workspaceTests.compile({ workspaceId });
        const latest = useIDEStore.getState();
        if (!isWorkspaceTestRunCurrent(latest, expected)) {
          dismissNotice();
          return { ok: false };
        }
        const canonical = presentWorkspaceCompileResult(response);
        if (!canonical.ok) {
          const first = canonical.diagnostics[0];
          const located = first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : undefined;
          finishNotice({
            kind: 'build',
            status: 'error',
            title: t('toolbarMsg.buildFailed'),
            details: 'problems',
            detail: canonical.diagnostics[0]
              ? `${canonical.diagnostics[0].path ? `${canonical.diagnostics[0].path}: ` : ''}${canonical.diagnostics[0].message}`
              : undefined,
          });
          revealCompileProblems();
          addConsoleEntry({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed'), source: 'compiler' });
          if (canonical.diagnostics.length === 0) {
            addCompilerMessage({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed') });
          }
          for (const diagnostic of canonical.diagnostics) {
            addCompilerMessage({
              type: 'error',
              message: diagnostic.message,
              code: diagnostic.code,
              ...(diagnostic.path ? { file: diagnostic.path } : {}),
              ...(diagnostic.line ? { line: diagnostic.line } : {}),
              ...(diagnostic.column ? { column: diagnostic.column } : {}),
              ...(diagnostic.element ? { element: diagnostic.element } : {}),
            });
          }
          markCompilerMessagesChecked();
          return located === undefined ? { ok: false } : { ok: false, message: located };
        }

        storeCompileResult({
          bytecode: canonical.artifact.bytecode,
          zplcFile: canonical.artifact.zplcFile,
          assembly: canonical.artifact.assembly,
          fileName: `${canonical.summary.name}.zplc`,
          codeSize: canonical.summary.codeSize,
          hasTaskSegment: true,
          taskCount: canonical.summary.taskCount,
          debugMap: canonical.artifact.debugMap as unknown as DebugMap,
          revision: ++compileRevisionRef.current,
          compilerRunId,
        });
        recordCanonicalWorkspaceBuildEvidence({
          projectSession,
          compilerRunId,
          workspaceId,
          zplc: canonical.zplcEvidence,
        });
        setProgramLoadState(nextProgramLoadStateAfterCompile());
        addConsoleEntry({
          type: 'success',
          message: t('toolbarMsg.builtSavedWorkspaceLocally', {
            length: canonical.artifact.zplcFile.length,
            codeSize: canonical.summary.codeSize,
            taskCount: canonical.summary.taskCount,
            DRAFT_COUNTER: ZPLC_CONSTANTS.DRAFT_COUNTER,
          }),
          source: 'compiler',
        });
        markCompilerMessagesChecked();
        finishNotice({
          kind: 'build',
          status: 'success',
          title: t('toolbarMsg.buildSucceeded'),
          detail: t('toolbarMsg.bytes', {
            name: canonical.summary.name,
            length: canonical.artifact.zplcFile.length,
            value: tn('toolbarMsg.tasks', canonical.summary.taskCount),
          }),
          details: 'output',
        });
        return { ok: true };
      } catch {
        const latest = useIDEStore.getState();
        if (!isWorkspaceTestRunCurrent(latest, expected)) {
          dismissNotice();
          return { ok: false };
        }
        if (cancelRequested) {
          addConsoleEntry({ type: 'warning', message: t('toolbarMsg.buildCancelled'), source: 'compiler' });
          finishNotice({
            kind: 'build',
            status: 'cancelled',
            title: t('toolbarMsg.buildCancelled'),
            detail: t('toolbarMsg.noArtifactWasKept'),
            details: 'output',
          });
          return { ok: false };
        }
        revealCompileProblems();
        addConsoleEntry({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed'), source: 'compiler' });
        addCompilerMessage({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed') });
        markCompilerMessagesChecked();
        finishNotice({
          kind: 'build',
          status: 'error',
          title: t('toolbarMsg.buildFailed'),
          detail: t('toolbarMsg.theCompilerCouldNot'),
          details: 'problems',
        });
        return { ok: false, message: t('toolbarMsg.theCompilerCouldNot') };
      }
    }

    if (!isCurrentRun()) return { ok: false };
    const current = useIDEStore.getState();
    if (current.isConsoleCollapsed) current.toggleConsole();
    current.setActiveConsoleTab('tests');
    const message = t('toolbarMsg.buildRequiresASaved');
    addConsoleEntry({ type: 'error', message, source: 'compiler' });
    addCompilerMessage({ type: 'error', message });
    return { ok: false, message };
  };

  /** Build from the menu, the palette or a shortcut: it follows the save preference and no longer refuses (FLW-006). */
  const handleCompile = async () => {
    buildMenu.setOpen(false);
    if (hasUnsavedChanges()) {
      try {
        if (useAppSettings.getState().settings.saveBeforeRun === 'ask') {
          if ((await askToSave()) === 'cancelled') return;
        } else {
          await saveModified();
        }
      } catch (e) {
        useNotifications.getState().report({
          kind: 'build',
          status: 'error',
          title: t('toolbarMsg.buildDidNotStart'),
          detail: e instanceof Error ? e.message : String(e),
          details: 'output',
        });
        return;
      }
    }
    await compileProject(false);
  };

  const handleDownloadBytecode = () => {
    const result = currentCompileResult();
    if (!result) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.noCurrentCompiledBytecode'), source: 'system' });
      return;
    }
    buildMenu.setOpen(false);

    try {
      downloadBlob(new Blob([new Uint8Array(result.zplcFile).buffer], { type: 'application/octet-stream' }), result.fileName);
      addConsoleEntry({ type: 'success', message: t('toolbarMsg.downloaded', { fileName: result.fileName }), source: 'system' });
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.failedToDownload', { value: e instanceof Error ? e.message : String(e) }),
        source: 'system',
      });
    }
  };

  const handleViewAssembly = () => {
    const result = currentCompileResult();
    if (!result) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.noCurrentCompiledCode'), source: 'system' });
      return;
    }
    buildMenu.setOpen(false);
    setGeneratedCode(result.assembly);
    setGeneratedCodeType('ASM');
    setShowGeneratedCode(true);
  };

  // ==========================================================================
  // Connection & Execution
  // ==========================================================================

  /** Live values are on while a simulation runs and off on a board until the person turns them on (FLW-010). */
  const setLiveValues = (on: boolean) => {
    if (useIDEStore.getState().debug.mpeekEnabled !== on) toggleMpeek();
  };

  const handleConnect = async () => {
    if (controlsBusy) return;

    pendingConnectionFocusRef.current = !isConnected;
    setIsConnecting(true);
    const notices = useNotifications.getState();
    const operation = notices.begin({
      kind: 'connection',
      title: isConnected
        ? t('toolbarMsg.disconnecting')
        : executionMode === 'simulate'
          ? t('toolbarMsg.startingTheSimulator')
          : t('toolbarMsg.connectingToTheDevice'),
      details: 'output',
    });
    try {
      if (isConnected) {
        await disconnect();
        setProgramLoadState(nextProgramLoadStateAfterConnect());
        notices.finish(operation, { kind: 'connection', status: 'success', title: t('toolbarMsg.disconnected'), details: 'output' });
        return;
      }
      if (executionMode === 'simulate') {
        await startSimulation();
        setProgramLoadState(nextProgramLoadStateAfterConnect());
        setLiveValues(true);
        addConsoleEntry({ type: 'success', message: t('toolbarMsg.simulatorReady'), source: 'runtime' });
        notices.finish(operation, { kind: 'connection', status: 'success', title: t('toolbarMsg.simulatorReady'), details: 'output' });
      } else {
        await connectHardware();
        setProgramLoadState(nextProgramLoadStateAfterConnect());
        setLiveValues(false);
        addConsoleEntry({ type: 'success', message: t('toolbarMsg.hardwareConnected'), source: 'runtime' });
        notices.finish(operation, { kind: 'connection', status: 'success', title: t('toolbarMsg.deviceConnected'), details: 'output' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('cancelled') && !msg.toLowerCase().includes('canceled') && msg !== 'No serial port selected') {
        addConsoleEntry({ type: 'error', message: t('toolbarMsg.connectionFailed', { msg }), source: 'runtime' });
        notices.finish(operation, {
          kind: 'connection',
          status: 'error',
          title: t('toolbarMsg.connectionFailed2'),
          detail: msg,
          details: 'output',
        });
      } else {
        notices.finish(operation, {
          kind: 'connection',
          status: 'cancelled',
          title: t('toolbarMsg.connectionCancelled'),
          details: 'output',
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  /** Changes where Run goes. A running program is asked about first (FLW-007, UX-020): the session ends with the change. */
  const handleExecutionModeChange = async (nextMode: ExecutionMode) => {
    if (nextMode === executionMode || controlsBusy) return;
    if (isRunning || isPaused) {
      const yes = await confirmAction({
        title: t('studio.flow.target.change.title'),
        description: t('studio.flow.target.change.description'),
        actionLabel: t('studio.flow.target.change.action'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!yes) return;
    }

    setIsModeTransitioning(true);
    setProgramLoadState(nextProgramLoadStateAfterConnect());
    try {
      if (isConnected) {
        await disconnect();
      }
      setExecutionMode(nextMode);
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.modeChangeFailed', { value: e instanceof Error ? e.message : String(e) }),
        source: 'runtime',
      });
    } finally {
      setIsModeTransitioning(false);
    }
  };

  const handleUpload = async () => {
    if (executionMode !== EXECUTION_MODE.HARDWARE || controlsBusy || uploadInFlightRef.current) return;
    if (!isConnected) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.connectFirst'), source: 'runtime' });
      return;
    }
    const result = currentCompileResult();
    if (!result) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.noCurrentCompiledBytecode'), source: 'runtime' });
      return;
    }
    uploadInFlightRef.current = true;
    setIsUploading(true);
    try {
      await performHardwareDeploy({
        result,
        running: isRunning || isPaused,
        project: () => {
          const state = useIDEStore.getState();
          return { session: state.projectSession, board: state.projectConfig?.target?.board, name: state.projectConfig?.name ?? null };
        },
        currentResult: currentCompileResult,
        compilerRunId: () => useIDEStore.getState().compilerRunId,
        compileRevision: () => compileRevisionRef.current,
        systemInfo: getHardwareSystemInfo,
        loadProgram,
        setProgramLoadState,
        log: addConsoleEntry,
      });
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  };

  // ==========================================================================
  // Run (spec 013 FLW-001 to FLW-004, FLW-014): the plan is a pure function of where the project stands; these are its steps.
  // On a board a plan is never more than `run`: a missing step is an offer, and Connect and Deploy stay a person's actions.
  // ==========================================================================

  const runSituation = (): RunSituation => ({
    target: executionMode === EXECUTION_MODE.HARDWARE ? 'board' : 'simulation',
    modified: hasUnsavedChanges(),
    saveBeforeRun: useAppSettings.getState().settings.saveBeforeRun,
    buildIsCurrent: currentCompileResult() !== null,
    sessionOpen: isConnected,
    programLoaded: programLoadState === PROGRAM_LOAD_STATE.LOADED,
    state: transport.state,
    plantBound: transport.kind === 'plant',
  });

  /** A refusal is an offer: the notice names the step that is missing and has it as its button (FLW-004). */
  const offerStep = (offer: RunOffer) => {
    const actions: Record<RunOffer, () => void> = {
      connect: () => void handleConnect(),
      build: () => void handleCompile(),
      deploy: () => void handleUpload(),
    };
    useNotifications.getState().report({
      kind: 'run',
      status: 'warning',
      title: t(`studio.flow.offer.${offer}`),
      details: 'output',
      recover: { label: t(`studio.flow.offer.${offer}.action`), run: actions[offer] },
    });
  };

  /** The controller of the render after a session opened: a sequence that starts the simulator must not load through the old one. */
  const settledController = async () => {
    for (let attempt = 0; attempt < 50 && !controllerRef.current.adapter; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return controllerRef.current;
  };

  /**
   * With the plant document open, the panel binds its session once the simulator has a session and the program is loaded, and binds
   * it again when either changes. Run waits for that transport to be registered and to stay the same for four ticks (100 ms) (at most 3 s), so
   * that it does not drive the program alone and then race the re-bind (PLS-003).
   */
  const settlePlantTransport = async () => {
    if (!usePlantDocument.getState().open) return;
    let last: unknown;
    let stable = 0;
    for (let waited = 0; waited < 3000 && stable < 4; waited += 25) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const now = activeTransport(controllerRef.current);
      const same = now.kind === 'plant' && now === last;
      stable = same ? stable + 1 : 0;
      last = now;
    }
  };

  const runActions: RunActions = {
    save: async () => {
      await saveModified();
      return true;
    },
    askToSave,
    build: async () => {
      const outcome = await compileProject(true);
      if (outcome.ok) return true;
      reveal('buildFailed');
      if (outcome.message !== undefined) throw new Error(outcome.message);
      return false;
    },
    startSimulator: async () => {
      await startSimulation();
      setProgramLoadState(nextProgramLoadStateAfterConnect());
      setLiveValues(true);
      addConsoleEntry({ type: 'success', message: t('toolbarMsg.simulatorReady'), source: 'runtime' });
    },
    load: async () => {
      const result = currentCompileResult();
      if (!result) throw new Error(t('toolbarMsg.noCompiledBytecodeCompile'));
      const controller = await settledController();
      try {
        await controller.loadProgram(selectRuntimeArtifact({ bytecode: result.bytecode, zplcFile: result.zplcFile }), result.debugMap);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        addConsoleEntry({ type: 'error', message: t('toolbarMsg.failedToLoad', { value: message }), source: 'runtime' });
        throw e;
      }
      if (!isCompileResultCurrent(result.compilerRunId, useIDEStore.getState().compilerRunId)) {
        setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
        addConsoleEntry({ type: 'warning', message: t('toolbarMsg.simulatorReceivedAnEarlier'), source: 'runtime' });
        throw new Error(t('toolbarMsg.simulatorReceivedAnEarlier'));
      }
      setProgramLoadState(PROGRAM_LOAD_STATE.LOADED);
    },
    run: async () => {
      await settlePlantTransport();
      await activeTransport(controllerRef.current).run();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.executionStarted'), source: 'runtime' });
    },
    // The session is ready and nothing has scanned: the next Step runs the first scan.
    holdBeforeFirstScan: async () => undefined,
  };

  /** Runs the steps of a simulation plan under one notice. */
  const executeSteps = async (plan: Extract<ReturnType<typeof planRun>, { kind: 'steps' }>, keyboardInitiated: boolean) => {
    runInFlightRef.current = true;
    setIsRunPreparing(true);
    pendingExecutionFocusRef.current = keyboardInitiated ? 'running' : null;
    const notices = useNotifications.getState();
    try {
      const outcome = await runSequence(
        plan,
        runActions,
        {
          begin: (title, onCancel) => notices.begin({ kind: 'run', title, details: 'output', cancel: onCancel }),
          advance: (id, step) => notices.advance(id, step),
          finish: (id, result) => notices.finish(id, result),
        },
        { plantBound: transport.kind === 'plant' },
      );
      if (outcome !== 'done') pendingExecutionFocusRef.current = null;
    } finally {
      runInFlightRef.current = false;
      setIsRunPreparing(false);
    }
  };

  const handleStart = async (keyboardInitiated = false) => {
    if (controlsBusy || runInFlightRef.current) return;
    const plan = planRun(runSituation(), 'run');
    if (plan.kind === 'offer') return offerStep(plan.offer);
    if (plan.kind === 'nothing') return;
    if (executionMode === EXECUTION_MODE.SIMULATE) return executeSteps(plan, keyboardInitiated);

    // A board: the plan is `run` alone, and the program is on the board already.
    pendingExecutionFocusRef.current = keyboardInitiated ? 'running' : null;
    try {
      await transport.run();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.executionStarted'), source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.runFailed', { value: e instanceof Error ? e.message : String(e) }),
        source: 'runtime',
      });
    }
  };

  /** "Rebuild and restart" (FLW-012): in simulation the program stops, is saved, built, loaded and run again; a board gets the offer. */
  const handleRebuildAndRestart = async () => {
    if (controlsBusy || runInFlightRef.current) return;
    const plan = planRun(runSituation(), 'rebuildAndRestart');
    if (plan.kind === 'offer') return offerStep(plan.offer);
    if (plan.kind !== 'steps') return;
    if (isRunning || isPaused) await transport.stop();
    await executeSteps(plan, false);
  };

  /** "Restart the simulator" (FLW-008): a new session; the program is loaded again by the next Run. */
  const handleRestartSimulator = async () => {
    if (executionMode !== EXECUTION_MODE.SIMULATE || controlsBusy) return;
    setIsConnecting(true);
    try {
      await startSimulation();
      setProgramLoadState(nextProgramLoadStateAfterConnect());
      setLiveValues(true);
      useNotifications
        .getState()
        .report({ kind: 'connection', status: 'success', title: t('studio.flow.simulatorRestarted'), details: 'output' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.connectionFailed', { msg }), source: 'runtime' });
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePause = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    pendingExecutionFocusRef.current = keyboardInitiated ? 'paused' : null;
    try {
      await transport.pause();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.pausedAtCycle', { value: vmInfoNow()?.cycles || 0 }), source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.pauseFailed', { value: e instanceof Error ? e.message : String(e) }),
        source: 'runtime',
      });
    }
  };

  // A paused simulation resumes whatever the state of the build; a board only runs what is deployed (UX-020, P7).
  const canResumeOrStep = () =>
    executionMode === EXECUTION_MODE.SIMULATE || canRunCurrentProgram(executionMode, Boolean(currentCompileResult()), programLoadState);

  const handleResume = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    if (!canResumeOrStep()) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.deployTheCurrentBuild2'), source: 'runtime' });
      return;
    }
    pendingExecutionFocusRef.current = keyboardInitiated ? 'running' : null;
    try {
      await transport.run();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.resumed'), source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.resumeFailed', { value: e instanceof Error ? e.message : String(e) }),
        source: 'runtime',
      });
    }
  };

  const handleStop = async () => {
    if (controlsBusy || !(await proceedAfterConfirmation(executionMode, confirmStop))) return;
    try {
      await transport.stop();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.stopped'), source: 'runtime' });
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.stopFailed', { value: e instanceof Error ? e.message : String(e) }),
        source: 'runtime',
      });
    }
  };

  const stepOnce = async () => {
    try {
      await transport.step();
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.stepFailed', { value: e instanceof Error ? e.message : String(e) }),
        source: 'runtime',
      });
    }
  };

  /**
   * Step. From paused it is the transport's. From stopped in simulation it prepares the session as Run does and holds before
   * the first scan (FLW-002); when nothing is left to prepare it runs that scan. On a board it needs the program deployed.
   */
  const handleStep = async () => {
    if (controlsBusy || runInFlightRef.current) return;
    if (isPaused) {
      if (!canResumeOrStep()) {
        addConsoleEntry({ type: 'error', message: t('toolbarMsg.deployTheCurrentBuild3'), source: 'runtime' });
        return;
      }
      return stepOnce();
    }
    const plan = planRun(runSituation(), 'step');
    if (plan.kind === 'offer') return offerStep(plan.offer);
    if (plan.kind !== 'steps') return;
    if (executionMode === EXECUTION_MODE.HARDWARE || (plan.steps.length === 1 && plan.steps[0] === 'holdBeforeFirstScan'))
      return stepOnce();
    return executeSteps(plan, false);
  };

  const handleReset = async () => {
    if (controlsBusy || !(await proceedAfterConfirmation(executionMode, confirmReset))) return;
    try {
      await transport.reset();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.reset'), source: 'runtime' });
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: t('toolbarMsg.resetFailed', { value: e instanceof Error ? e.message : String(e) }),
        source: 'runtime',
      });
    }
  };

  // ==========================================================================
  // Commands (UX-015): the registry binds the keyboard, the application menu and the palette to the handlers above.
  // Industrial-critical: operators need fast reactions. Each command keeps the guard its keyboard shortcut always had;
  // physical ones (connect, deploy, run, pause, stop, step, reset) are the same actions as the buttons, with the same
  // confirmation, and the menu or palette adds no way around them.
  // ==========================================================================

  const runToolbarCommand = useEffectEvent((id: ToolbarCommandId) => {
    const handlers: Record<ToolbarCommandId, () => void | Promise<void>> = {
      'file.save': handleSaveFile,
      'file.saveAll': handleSaveAll,
      'build.compile': handleCompile,
      'build.generateSt': () => {
        if (isVisualLanguage) handleGenerateST();
      },
      'build.downloadProgram': handleDownloadBytecode,
      'build.viewAssembly': handleViewAssembly,
      'online.simulation': () => handleExecutionModeChange(EXECUTION_MODE.SIMULATE),
      'online.hardware': () => handleExecutionModeChange(EXECUTION_MODE.HARDWARE),
      // Connect and Disconnect belong to a board: the simulator session is Studio's concern (FLW-008).
      'online.connect': () => {
        if (executionMode === EXECUTION_MODE.HARDWARE && !isConnected) return handleConnect();
      },
      'online.disconnect': () => {
        if (executionMode === EXECUTION_MODE.HARDWARE && isConnected) return handleConnect();
      },
      'online.deploy': handleUpload,
      'online.restartSimulator': handleRestartSimulator,
      'debug.rebuildAndRestart': handleRebuildAndRestart,
      // Already running: nothing to do. Paused: resume. Otherwise start.
      'debug.run': () => {
        if (isRunning) return;
        if (isPaused) return handleResume(true);
        return handleStart(true);
      },
      'debug.pause': () => {
        if (isRunning) return handlePause(true);
      },
      'debug.stop': () => {
        if (isRunning || isPaused) return handleStop();
      },
      'debug.step': () => {
        if (isPaused || isStopped) return handleStep();
      },
      'debug.reset': () => {
        if (isConnected) return handleReset();
      },
      'debug.liveValues': () => {
        if (isConnected) toggleMpeek();
      },
    };
    return handlers[id]();
  });

  useEffect(() => bindCommands(Object.fromEntries(TOOLBAR_COMMANDS.map((id) => [id, () => runToolbarCommand(id)]))), []);

  // What the registry's rules need to know about the toolbar: the menu and the palette offer a command only when it can work.
  useEffect(() => {
    publishCommandState({
      hasActiveFile: activeFile !== null,
      visualFile: isVisualLanguage,
      mode: executionMode,
      connected: isConnected,
      vmState,
      compiled: hasCurrentCompileResult,
      busy: controlsBusy,
    });
  }, [activeFile, isVisualLanguage, executionMode, isConnected, vmState, hasCurrentCompileResult, controlsBusy]);
  useEffect(
    () => () =>
      publishCommandState({ hasActiveFile: false, visualFile: false, connected: false, vmState: 'idle', compiled: false, busy: false }),
    [],
  );

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  const status = getStatusDisplay(
    {
      isConnected,
      vmState,
      executionMode,
      programLoaded: programLoadState === PROGRAM_LOAD_STATE.LOADED,
      currentBuild: hasCurrentCompileResult,
      anyBuild: lastCompileResult !== null,
    },
    t,
  );

  // Check if running in Electron on macOS
  const isElectronMac = typeof window !== 'undefined' && window.electronAPI?.isElectron && window.electronAPI?.platform === 'darwin';

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('toolbar.label')}
        className={
          `h-12 bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] flex items-center px-3 ` +
          `gap-1.5 ${isElectronMac ? 'pl-20' : ''}`
        }
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <div
            className={
              'w-7 h-7 bg-[var(--color-accent-blue)] rounded flex items-center justify-center font-bold ' +
              'text-[var(--color-on-accent)] text-xs'
            }
          >
            {t('toolbar.brandInitial')}
          </div>
          <span className="font-semibold text-[var(--color-surface-100)] text-sm hidden sm:inline">{t('toolbar.brand')}</span>
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-[var(--color-surface-600)]" />

        {/* Save: one control; Save all joins it when it would save more than the active file (FLW-005) */}
        {othersModified ? (
          <MenuButton
            label={withShortcut(t('toolbar.save.label'), 'file.save')}
            variant="bare"
            size="sm"
            className="focus-ring p-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)]"
            items={[
              { id: 'save', label: t('toolbar.save.label'), disabled: !activeFile, onSelect: () => void handleSaveFile() },
              { id: 'saveAll', label: t('studio.flow.saveAll.label'), onSelect: () => void handleSaveAll() },
            ]}
          >
            <Save size={18} aria-hidden="true" />
          </MenuButton>
        ) : (
          <Button
            variant="bare"
            type="button"
            onClick={() => {
              void handleSaveFile();
            }}
            disabled={!activeFile}
            className={
              'focus-ring p-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] disabled:opacity-40 ' +
              'disabled:cursor-not-allowed transition-colors'
            }
            aria-label={withShortcut(t('toolbar.save.label'), 'file.save')}
            tooltip={withShortcut(t('toolbar.save.title'), 'file.save')}
          >
            <Save size={18} />
          </Button>
        )}

        {/* Separator */}
        <div className="w-px h-6 bg-[var(--color-surface-600)]" />

        <BuildMenu
          menu={buildMenu}
          onCompile={() => {
            void handleCompile();
          }}
          onGenerateSt={isVisualLanguage ? handleGenerateST : undefined}
          onDownloadBytecode={handleDownloadBytecode}
          onViewAssembly={handleViewAssembly}
          hasCurrentCompileResult={hasCurrentCompileResult}
        />

        <TargetSelector
          mode={executionMode}
          boardName={boardName}
          degraded={adapter?.type === 'wasm'}
          onChange={(mode) => {
            void handleExecutionModeChange(mode);
          }}
          onChangeBoard={() => {
            runCommand('project.target');
          }}
        />

        {/* Separator */}
        <div className="w-px h-6 bg-[var(--color-surface-600)]" />

        <RunControls
          executionMode={executionMode}
          isConnected={isConnected}
          isConnecting={isConnecting}
          isUploading={isUploading}
          controlsBusy={controlsBusy}
          hasCurrentCompileResult={hasCurrentCompileResult}
          isRunning={isRunning}
          isPaused={isPaused}
          isStopped={isStopped}
          connectionButtonRef={connectionButtonRef}
          executionButtonRef={executionButtonRef}
          onConnect={handleConnect}
          onUpload={handleUpload}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onStep={handleStep}
          onStop={handleStop}
          onReset={handleReset}
        />

        <CommandBarCenter />

        {/* Settings */}
        <Button
          variant="bare"
          type="button"
          onClick={toggleSettings}
          className={
            'focus-ring p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors ' +
            'max-[1100px]:hidden'
          }
          aria-label={t('toolbar.settings')}
          tooltip={t('toolbar.settings')}
          data-project-settings
        >
          <Settings size={16} />
        </Button>

        {/* Generated Code Dialog */}
        <GeneratedCodeDialog
          isOpen={showGeneratedCode}
          onClose={() => setShowGeneratedCode(false)}
          sourceLanguage={generatedCodeType}
          generatedCode={generatedCode}
        />
      </div>
      <Notifications />
      <OperationalStatusBar
        mode={executionMode}
        adapterType={adapter?.type ?? null}
        connected={isConnected}
        status={status}
        connecting={isConnecting}
        faulted={vmState === 'error'}
      />
    </>
  );
}

export default Toolbar;
