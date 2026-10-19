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
import { Settings, FileCode, Save } from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore'; import { useActiveFileInfo, useToolbarState } from '../store/regionSubscriptions';
import { useT } from '../i18n';
import { bindCommands, publishCommandState } from '../commands/bus';
import type { CommandId } from '../commands/registry';
import { withShortcut } from '../commands/shortcutLabels';
import { useDebugController } from '../hooks/useDebugController';
import { ZPLC_CONSTANTS } from '@zplc/compiler';
import type { DebugMap } from '../compiler';
import { GeneratedCodeDialog } from './GeneratedCodeDialog';
import { canRunCurrentProgram, isCompileResultCurrent, type LastCompileResult, nextProgramLoadStateAfterCompile, nextProgramLoadStateAfterConnect, PROGRAM_LOAD_STATE, shouldAutoLoadBeforeStart } from './debugSessionState';
import { EXECUTION_MODE, selectRuntimeArtifact, type ExecutionMode } from './runtimeArtifactSelection';
import { OperationalStatusBar } from './OperationalStatusBar';
import { CommandBarCenter } from '../shell/CommandBarCenter';
import { generateStructuredText } from './visualToStructuredText';
import { downloadBlob } from '../utils/downloadBlob';
import { isWorkspaceTestRunCurrent, presentWorkspaceCompileResult, resolveWorkspaceCompileRoute } from './workspaceTestPresentation';
import { shownProjectBridge } from '../ipc/shownProjectBridge';
import { useNotifications } from '../store/notifications';
import { vmInfoNow } from '../store/vmInfo';
import { Notifications } from './Notifications';
import { useDropdownMenu } from './useDropdownMenu';
import { canLinkProjectWorkspace, linkProjectWorkspace } from '../utils/workspaceTestLink';
import { performHardwareDeploy } from './deployFlow';
import { confirmReset, confirmStop, proceedAfterConfirmation } from './physicalActions';
import { RunControls } from './ToolbarRunControls';
import { ThemeMenu } from './ToolbarThemeMenu';
import { BuildMenu } from './ToolbarBuildMenu';
import { Button } from '../ui';

// =============================================================================
// Types
// =============================================================================

/** The commands whose behaviour lives in the toolbar (UX-015). */
const TOOLBAR_COMMANDS = [
  'file.save', 'build.compile', 'build.generateSt', 'build.downloadProgram', 'build.viewAssembly', 'online.simulation', 'online.hardware',
  'online.connect', 'online.disconnect', 'online.deploy', 'debug.run', 'debug.pause', 'debug.stop', 'debug.step', 'debug.reset', 'debug.liveValues',
] as const satisfies readonly CommandId[];
type ToolbarCommandId = (typeof TOOLBAR_COMMANDS)[number];

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

  const mpeekEnabled = useIDEStore((s) => s.debug.mpeekEnabled);
  const toggleMpeek = useIDEStore((s) => s.toggleMpeek);

  // Destructure debug controller
  const {
    adapter,
    vmState,
    startSimulation,
    connectHardware,
    disconnect,
    loadProgram,
    start,
    stop,
    pause,
    resume,
    step,
    reset,
    getHardwareSystemInfo,
  } = debugController;

  // Local UI state
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(EXECUTION_MODE.SIMULATE);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  const [programLoadState, setProgramLoadState] = useState<typeof PROGRAM_LOAD_STATE[keyof typeof PROGRAM_LOAD_STATE]>(PROGRAM_LOAD_STATE.EMPTY);
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
  const isIdle = vmState === 'idle';
  const controlsBusy = isConnecting || isUploading || isModeTransitioning;
  const hasCurrentCompileResult = useIDEStore((s) => isCompileResultCurrent(lastCompileResult?.compilerRunId ?? null, s.compilerRunId));
  const currentCompileResult = () => {
    const result = lastCompileResult;
    return result && isCompileResultCurrent(result.compilerRunId, useIDEStore.getState().compilerRunId)
      ? result
      : null;
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
    useNotifications.getState().report(saved ? { kind: 'save', status: 'success', title: t('toolbarMsg.saved', { name: activeFile.name }), details: 'output' }
      : { kind: 'save', status: 'error', title: t('toolbarMsg.couldNotSave', { name: activeFile.name }), detail: t('toolbarMsg.theFileStaysModified'), details: 'output', recover: { label: t('toolbarMsg.trySavingAgain'), run: () => { void handleSaveFile(); } } });
  };

  // ==========================================================================
  // Transpiler (Visual -> ST)
  // ==========================================================================

  const handleGenerateST = () => {
    const file = getActiveFile(); if (!file) return;
    addConsoleEntry({ type: 'info', message: t('toolbarMsg.transpilingToStructuredText', { language: file.language }), source: 'transpiler' });

    const source = generateStructuredText(file, addConsoleEntry);
    if (source !== null) {
      addConsoleEntry({ type: 'success', message: t('toolbarMsg.generatedLinesOfStructured', { length: source.split('\n').length }), source: 'transpiler' });
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

  const handleCompile = async () => {
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

    if (workspaceCompileRoute === 'canonical-unavailable' || workspaceCompileRoute === 'link-required' || workspaceCompileRoute === 'save-required') {
      const current = useIDEStore.getState();
      if (current.isConsoleCollapsed) current.toggleConsole();
      current.setActiveConsoleTab('tests');
      const message = workspaceCompileRoute === 'canonical-unavailable'
        ? t('toolbarMsg.savedWorkspaceCompilerIs')
        : workspaceCompileRoute === 'link-required'
          ? t('toolbarMsg.openTestsAndChoose')
          : t('toolbarMsg.saveChangesBeforeBuilding');
      addConsoleEntry({ type: 'error', message, source: 'compiler' });
      addCompilerMessage({ type: 'error', message });
      useNotifications.getState().report({ kind: 'build', status: 'error', title: t('toolbarMsg.buildDidNotStart'), detail: message, details: 'tests' });
      return;
    }

    if (workspaceCompileRoute === 'canonical' && workspaceTests) {
      // Build the folder the main process owns, registered afresh for this build: the user never chooses a zplc.json (IDE-001).
      const link = canLinkProjectWorkspace() ? await linkProjectWorkspace() : currentWorkspaceLink;
      if (!isCurrentRun()) return;
      if (!link) {
        revealCompileProblems();
        const message = t('toolbarMsg.savedWorkspaceCouldNot');
        addConsoleEntry({ type: 'error', message, source: 'compiler' });
        addCompilerMessage({ type: 'error', message });
        markCompilerMessagesChecked();
        useNotifications.getState().report({ kind: 'build', status: 'error', title: t('toolbarMsg.buildDidNotStart'), detail: message, details: 'problems' });
        return;
      }
      const workspaceId = link.workspaceId;
      const expected = { projectSession, compilerRunId, workspaceId };
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.buildingSavedWorkspaceLocally'), source: 'compiler' });
      let cancelRequested = false;
      const notices = useNotifications.getState();
      const operation = notices.begin({
        kind: 'build', title: t('toolbarMsg.buildingProject'), details: 'output',
        cancel: () => { cancelRequested = true; void workspaceTests.cancel().catch(() => undefined); },
      });
      try {
        const response = await workspaceTests.compile({ workspaceId });
        const latest = useIDEStore.getState();
        if (!isWorkspaceTestRunCurrent(latest, expected)) { notices.dismiss(operation); return; }
        const canonical = presentWorkspaceCompileResult(response);
        if (!canonical.ok) {
          notices.finish(operation, {
            kind: 'build', status: 'error', title: t('toolbarMsg.buildFailed'), details: 'problems',
            detail: canonical.diagnostics[0] ? `${canonical.diagnostics[0].path ? `${canonical.diagnostics[0].path}: ` : ''}${canonical.diagnostics[0].message}` : undefined,
          });
          revealCompileProblems();
          addConsoleEntry({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed'), source: 'compiler' });
          if (canonical.diagnostics.length === 0) {
            addCompilerMessage({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed') });
          }
          for (const diagnostic of canonical.diagnostics) {
            addCompilerMessage({ type: 'error', message: diagnostic.message, code: diagnostic.code, ...(diagnostic.path ? { file: diagnostic.path } : {}), ...(diagnostic.line ? { line: diagnostic.line } : {}), ...(diagnostic.column ? { column: diagnostic.column } : {}), ...(diagnostic.element ? { element: diagnostic.element } : {}) });
          }
          markCompilerMessagesChecked();
          return;
        }

        setLastCompileResult({
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
        addConsoleEntry({ type: 'success', message: t('toolbarMsg.builtSavedWorkspaceLocally', { length: canonical.artifact.zplcFile.length, codeSize: canonical.summary.codeSize, taskCount: canonical.summary.taskCount, DRAFT_COUNTER: ZPLC_CONSTANTS.DRAFT_COUNTER }), source: 'compiler' });
        markCompilerMessagesChecked();
        notices.finish(operation, { kind: 'build', status: 'success', title: t('toolbarMsg.buildSucceeded'), detail: t('toolbarMsg.bytes', { name: canonical.summary.name, length: canonical.artifact.zplcFile.length, value: tn('toolbarMsg.tasks', canonical.summary.taskCount) }), details: 'output' });
      } catch {
        const latest = useIDEStore.getState();
        if (!isWorkspaceTestRunCurrent(latest, expected)) { notices.dismiss(operation); return; }
        if (cancelRequested) {
          addConsoleEntry({ type: 'warning', message: t('toolbarMsg.buildCancelled'), source: 'compiler' });
          notices.finish(operation, { kind: 'build', status: 'cancelled', title: t('toolbarMsg.buildCancelled'), detail: t('toolbarMsg.noArtifactWasKept'), details: 'output' });
          return;
        }
        revealCompileProblems();
        addConsoleEntry({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed'), source: 'compiler' });
        addCompilerMessage({ type: 'error', message: t('toolbarMsg.canonicalWorkspaceBuildFailed') });
        markCompilerMessagesChecked();
        notices.finish(operation, { kind: 'build', status: 'error', title: t('toolbarMsg.buildFailed'), detail: t('toolbarMsg.theCompilerCouldNot'), details: 'problems' });
      }
      return;
    }

    if (!isCurrentRun()) return;
    const current = useIDEStore.getState();
    if (current.isConsoleCollapsed) current.toggleConsole();
    current.setActiveConsoleTab('tests');
    const message = t('toolbarMsg.buildRequiresASaved');
    addConsoleEntry({ type: 'error', message, source: 'compiler' });
    addCompilerMessage({ type: 'error', message });
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
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.failedToDownload', { value: e instanceof Error ? e.message : String(e) }), source: 'system' });
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

  const handleConnect = async () => {
    if (controlsBusy) return;

    pendingConnectionFocusRef.current = !isConnected;
    setIsConnecting(true);
    const notices = useNotifications.getState();
    const operation = notices.begin({ kind: 'connection', title: isConnected ? t('toolbarMsg.disconnecting') : executionMode === 'simulate' ? t('toolbarMsg.startingTheSimulator') : t('toolbarMsg.connectingToTheDevice'), details: 'output' });
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
        addConsoleEntry({ type: 'success', message: t('toolbarMsg.simulatorReady'), source: 'runtime' });
        notices.finish(operation, { kind: 'connection', status: 'success', title: t('toolbarMsg.simulatorReady'), details: 'output' });
      } else {
        await connectHardware();
        setProgramLoadState(nextProgramLoadStateAfterConnect());
        addConsoleEntry({ type: 'success', message: t('toolbarMsg.hardwareConnected'), source: 'runtime' });
        notices.finish(operation, { kind: 'connection', status: 'success', title: t('toolbarMsg.deviceConnected'), details: 'output' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('cancelled') && !msg.toLowerCase().includes('canceled') && msg !== 'No serial port selected') {
        addConsoleEntry({ type: 'error', message: t('toolbarMsg.connectionFailed', { msg }), source: 'runtime' });
        notices.finish(operation, { kind: 'connection', status: 'error', title: t('toolbarMsg.connectionFailed2'), detail: msg, details: 'output' });
      } else {
        notices.finish(operation, { kind: 'connection', status: 'cancelled', title: t('toolbarMsg.connectionCancelled'), details: 'output' });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleExecutionModeChange = async (nextMode: ExecutionMode) => {
    if (nextMode === executionMode || controlsBusy) return;

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

  const handleStart = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    if (!isConnected) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.connectFirst'), source: 'runtime' });
      return;
    }
    const result = currentCompileResult();
    if (!canRunCurrentProgram(executionMode, Boolean(result), programLoadState)) {
      addConsoleEntry({
        type: 'error',
        message: executionMode === EXECUTION_MODE.HARDWARE
          ? t('toolbarMsg.deployTheCurrentBuild')
          : t('toolbarMsg.noCompiledBytecodeCompile'),
        source: 'runtime',
      });
      return;
    }

    pendingExecutionFocusRef.current = keyboardInitiated ? 'running' : null;

    // Simulation keeps the local convenience; hardware requires an explicit deploy.
    if (result && shouldAutoLoadBeforeStart(executionMode, vmState, programLoadState)) {
      try {
        const dataToUpload = selectRuntimeArtifact({
          bytecode: result.bytecode,
          zplcFile: result.zplcFile,
        });
        await loadProgram(dataToUpload, result.debugMap);
        if (!isCompileResultCurrent(result.compilerRunId, useIDEStore.getState().compilerRunId)) {
          pendingExecutionFocusRef.current = null;
          setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
          addConsoleEntry({ type: 'warning', message: t('toolbarMsg.simulatorReceivedAnEarlier'), source: 'runtime' });
          return;
        }
        setProgramLoadState(PROGRAM_LOAD_STATE.LOADED);
      } catch (e) {
        pendingExecutionFocusRef.current = null;
        addConsoleEntry({ type: 'error', message: t('toolbarMsg.failedToLoad', { value: e instanceof Error ? e.message : String(e) }), source: 'runtime' });
        return;
      }
    }

    try {
      await start();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.executionStarted'), source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.runFailed', { value: e instanceof Error ? e.message : String(e) }), source: 'runtime' });
    }
  };

  const handlePause = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    pendingExecutionFocusRef.current = keyboardInitiated ? 'paused' : null;
    try {
      await pause();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.pausedAtCycle', { value: vmInfoNow()?.cycles || 0 }), source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.pauseFailed', { value: e instanceof Error ? e.message : String(e) }), source: 'runtime' });
    }
  };

  const handleResume = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    if (!canRunCurrentProgram(executionMode, Boolean(currentCompileResult()), programLoadState)) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.deployTheCurrentBuild2'), source: 'runtime' });
      return;
    }
    pendingExecutionFocusRef.current = keyboardInitiated ? 'running' : null;
    try {
      await resume();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.resumed'), source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.resumeFailed', { value: e instanceof Error ? e.message : String(e) }), source: 'runtime' });
    }
  };

  const handleStop = async () => {
    if (controlsBusy || !await proceedAfterConfirmation(executionMode, confirmStop)) return;
    try {
      await stop();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.stopped'), source: 'runtime' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.stopFailed', { value: e instanceof Error ? e.message : String(e) }), source: 'runtime' });
    }
  };

  const handleStep = async () => {
    if (controlsBusy) return;
    if (!canRunCurrentProgram(executionMode, Boolean(currentCompileResult()), programLoadState)) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.deployTheCurrentBuild3'), source: 'runtime' });
      return;
    }
    try {
      await step();
    } catch (e) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.stepFailed', { value: e instanceof Error ? e.message : String(e) }), source: 'runtime' });
    }
  };

  const handleReset = async () => {
    if (controlsBusy || !await proceedAfterConfirmation(executionMode, confirmReset)) return;
    try {
      await reset();
      addConsoleEntry({ type: 'info', message: t('toolbarMsg.reset'), source: 'runtime' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: t('toolbarMsg.resetFailed', { value: e instanceof Error ? e.message : String(e) }), source: 'runtime' });
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
      'build.compile': handleCompile,
      'build.generateSt': () => { if (isVisualLanguage) handleGenerateST(); },
      'build.downloadProgram': handleDownloadBytecode,
      'build.viewAssembly': handleViewAssembly,
      'online.simulation': () => handleExecutionModeChange(EXECUTION_MODE.SIMULATE),
      'online.hardware': () => handleExecutionModeChange(EXECUTION_MODE.HARDWARE),
      'online.connect': () => { if (!isConnected) return handleConnect(); },
      'online.disconnect': () => { if (isConnected) return handleConnect(); },
      'online.deploy': handleUpload,
      // Already running: nothing to do. Paused: resume. Otherwise start.
      'debug.run': () => { if (isRunning) return; if (isPaused) return handleResume(true); return handleStart(true); },
      'debug.pause': () => { if (isRunning) return handlePause(true); },
      'debug.stop': () => { if (isRunning || isPaused) return handleStop(); },
      'debug.step': () => { if (isPaused || isIdle) return handleStep(); },
      'debug.reset': () => { if (isConnected) return handleReset(); },
      'debug.liveValues': () => { if (isConnected) toggleMpeek(); },
    };
    return handlers[id]();
  });

  useEffect(() => bindCommands(Object.fromEntries(TOOLBAR_COMMANDS.map((id) => [id, () => runToolbarCommand(id)]))), []);

  // What the registry's rules need to know about the toolbar: the menu and the palette offer a command only when it can work.
  useEffect(() => {
    publishCommandState({ hasActiveFile: activeFile !== null, visualFile: isVisualLanguage, mode: executionMode, connected: isConnected, vmState, compiled: hasCurrentCompileResult, busy: controlsBusy });
  }, [activeFile, isVisualLanguage, executionMode, isConnected, vmState, hasCurrentCompileResult, controlsBusy]);
  useEffect(() => () => publishCommandState({ hasActiveFile: false, visualFile: false, connected: false, vmState: 'idle', compiled: false, busy: false }), []);

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  // Status text and color
  const getStatusDisplay = () => {
    if (!isConnected) {
      return { text: t('toolbarMsg.disconnected'), tone: 'neutral' as const };
    }
    switch (vmState) {
      case 'running':
        return hasCurrentCompileResult
          ? { text: 'Running', tone: 'success' as const }
          : { text: 'Running · rebuild required', tone: 'attention' as const };
      case 'paused':
        return hasCurrentCompileResult
          ? { text: 'Paused', tone: 'attention' as const }
          : { text: 'Paused · rebuild required', tone: 'attention' as const };
      case 'idle':
        if (executionMode === EXECUTION_MODE.HARDWARE) {
          if (programLoadState === PROGRAM_LOAD_STATE.LOADED && hasCurrentCompileResult) {
            return { text: 'Deployed · stopped', tone: 'info' as const };
          }
          return hasCurrentCompileResult
            ? { text: 'Connected · deploy required', tone: 'info' as const }
            : lastCompileResult
              ? { text: 'Connected · rebuild required', tone: 'attention' as const }
              : { text: 'Connected · build required', tone: 'info' as const };
        }
        return lastCompileResult && !hasCurrentCompileResult
          ? { text: 'Ready · rebuild required', tone: 'attention' as const }
          : { text: 'Ready', tone: 'info' as const };
      case 'error':
        return { text: 'Error', tone: 'danger' as const };
      default:
        return { text: vmState, tone: 'neutral' as const };
    }
  };

  const status = getStatusDisplay();

  // Check if running in Electron on macOS
  const isElectronMac = typeof window !== 'undefined' &&
    window.electronAPI?.isElectron &&
    window.electronAPI?.platform === 'darwin';

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <>
    <div role="toolbar" aria-label={t('toolbar.label')} className={`h-12 bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] flex items-center px-3 gap-1.5 ${isElectronMac ? 'pl-20' : ''}`}>
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 bg-[var(--color-accent-blue)] rounded flex items-center justify-center font-bold text-[var(--color-on-accent)] text-xs">{t('toolbar.brandInitial')}</div>
        <span className="font-semibold text-[var(--color-surface-100)] text-sm hidden sm:inline">{t('toolbar.brand')}</span>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Save Button */}
      <Button variant="bare"
        type="button"
        onClick={() => { void handleSaveFile(); }}
        disabled={!activeFile}
        className="focus-ring p-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label={withShortcut(t('toolbar.save.label'), 'file.save')}
        tooltip={withShortcut(t('toolbar.save.title'), 'file.save')}
      >
        <Save size={18} />
      </Button>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Generate ST button - only for visual languages */}
      {isVisualLanguage && (
        <Button variant="bare"
          type="button"
          onClick={handleGenerateST}
          className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-purple)] hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors"
          aria-label={t('toolbar.toSt.label')}
          tooltip={t('toolbar.toSt.label')}
        >
          <FileCode size={14} />
          <span className="hidden md:inline">{t('toolbar.toSt.text')}</span>
        </Button>
      )}

      <BuildMenu
        menu={buildMenu}
        onCompile={() => { void handleCompile(); }}
        onDownloadBytecode={handleDownloadBytecode}
        onViewAssembly={handleViewAssembly}
        hasCurrentCompileResult={hasCurrentCompileResult}
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
        programLoadState={programLoadState}
        isRunning={isRunning}
        isPaused={isPaused}
        isIdle={isIdle}
        mpeekEnabled={mpeekEnabled}
        toggleMpeek={toggleMpeek}
        connectionButtonRef={connectionButtonRef}
        executionButtonRef={executionButtonRef}
        onExecutionModeChange={handleExecutionModeChange}
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

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      <ThemeMenu />

      {/* Settings */}
      <Button variant="bare"
        type="button"
        onClick={toggleSettings}
        className="focus-ring p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors max-[1100px]:hidden"
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

