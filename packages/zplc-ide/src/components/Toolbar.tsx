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
import {
  Play,
  Square,
  Upload,
  Hammer,
  Settings,
  Sun,
  Moon,
  Monitor,
  Contrast,
  ChevronDown,
  FileCode,
  Save,
  Download,
  Usb,
  Loader2,
  Pause,
  SkipForward,
  Cpu,
  RotateCcw,
  Radio,
  Unplug,
  Zap,
} from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useTheme } from '../hooks/useTheme';
import { useDebugController } from '../hooks/useDebugController';
import { transpileToST } from '../compiler';
import type { DebugMap } from '../compiler';
import { GeneratedCodeDialog } from './GeneratedCodeDialog';
import { collectProjectFilesForExport, redactProjectConfigForExport } from '../utils/projectExport';
import {
  canRunCurrentProgram,
  HARDWARE_DEPLOY_UNCONFIRMED_MESSAGE,
  isCompileResultCurrent,
  nextProgramLoadStateAfterDeploy,
  nextProgramLoadStateAfterCompile,
  nextProgramLoadStateAfterConnect,
  PROGRAM_LOAD_STATE,
  shouldAutoLoadBeforeStart,
} from './debugSessionState';
import { EXECUTION_MODE, selectRuntimeArtifact, type ExecutionMode } from './runtimeArtifactSelection';
import { OperationalStatusBar } from './OperationalStatusBar';
import { isWorkspaceTestRunCurrent, presentWorkspaceCompileResult, resolveWorkspaceCompileRoute } from './workspaceTestPresentation';
import { createHardwareDeployConfirmation } from './hardwareDeployConfirmation';
import { DeviceAdmissionError, DEVICE_ADMISSION_CODE } from '../runtime/deviceHandshake';

// =============================================================================
// Types
// =============================================================================

interface ToolbarProps {
  /** Debug controller instance from App */
  debugController: ReturnType<typeof useDebugController>;
}

// =============================================================================
// Main Component
// =============================================================================

export function Toolbar({ debugController }: ToolbarProps) {
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
  } = useIDEStore();
  const compilerRunId = useIDEStore((s) => s.compilerRunId);
  const recordCanonicalWorkspaceBuildEvidence = useIDEStore((s) => s.recordCanonicalWorkspaceBuildEvidence);

  const mpeekEnabled = useIDEStore((s) => s.debug.mpeekEnabled);
  const toggleMpeek = useIDEStore((s) => s.toggleMpeek);

  const { theme, setTheme, isDark } = useTheme();

  // Destructure debug controller
  const {
    adapter,
    vmState,
    vmInfo,
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
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isCompileMenuOpen, setIsCompileMenuOpen] = useState(false);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(EXECUTION_MODE.SIMULATE);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  const [programLoadState, setProgramLoadState] = useState<typeof PROGRAM_LOAD_STATE[keyof typeof PROGRAM_LOAD_STATE]>(PROGRAM_LOAD_STATE.EMPTY);
  const compileRevisionRef = useRef(0);

  const themeMenuRef = useRef<HTMLDivElement>(null);
  const compileMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const themeMenuFirstItemRef = useRef<HTMLButtonElement>(null);
  const compileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const compileMenuFirstItemRef = useRef<HTMLButtonElement>(null);
  const connectionButtonRef = useRef<HTMLButtonElement>(null);
  const pendingConnectionFocusRef = useRef<boolean | null>(null);
  const executionButtonRef = useRef<HTMLButtonElement>(null);
  const pendingExecutionFocusRef = useRef<'running' | 'paused' | null>(null);
  const uploadInFlightRef = useRef(false);

  const openCompileMenu = () => {
    setIsCompileMenuOpen(true);
    requestAnimationFrame(() => compileMenuFirstItemRef.current?.focus());
  };

  const closeCompileMenu = (restoreFocus = false) => {
    setIsCompileMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => compileMenuTriggerRef.current?.focus());
  };

  const openThemeMenu = () => {
    setIsThemeMenuOpen(true);
    requestAnimationFrame(() => themeMenuFirstItemRef.current?.focus());
  };

  const closeThemeMenu = (restoreFocus = false) => {
    setIsThemeMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => themeMenuTriggerRef.current?.focus());
  };

  // State for generated code dialog
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatedCodeType, setGeneratedCodeType] = useState<'FBD' | 'LD' | 'SFC' | 'ASM'>('ASM');

  // State for last successful compilation result
  const [lastCompileResult, setLastCompileResult] = useState<{
    bytecode: Uint8Array;
    zplcFile: Uint8Array;
    assembly: string;
    fileName: string;
    codeSize: number;
    hasTaskSegment: boolean;
    taskCount: number;
    debugMap: DebugMap;
    revision: number;
    compilerRunId: number;
  } | null>(null);

  // Get the active file
  const activeFile = getActiveFile();
  const isVisualLanguage = activeFile?.language === 'FBD' || activeFile?.language === 'LD' || activeFile?.language === 'SFC';

  // Derived state from adapter
  const isConnected = adapter?.connected ?? false;
  const isRunning = vmState === 'running';
  const isPaused = vmState === 'paused';
  const isIdle = vmState === 'idle';
  const controlsBusy = isConnecting || isUploading || isModeTransitioning;
  const hasCurrentCompileResult = isCompileResultCurrent(lastCompileResult?.compilerRunId ?? null, compilerRunId);
  const currentCompileResult = () => {
    const result = lastCompileResult;
    return result && isCompileResultCurrent(result.compilerRunId, useIDEStore.getState().compilerRunId)
      ? result
      : null;
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
      if (compileMenuRef.current && !compileMenuRef.current.contains(event.target as Node)) {
        setIsCompileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // ==========================================================================
  // File Operations
  // ==========================================================================

  const handleSaveFile = async () => {
    if (!activeFile || !activeFileId) {
      addConsoleEntry({ type: 'error', message: 'No file selected to save', source: 'system' });
      return;
    }

    await saveFile(activeFileId);

  };

  const handleExportProject = async () => {
    const snapshot = useIDEStore.getState();
    const { projectSession, fileTree: tree, projectConfig: config } = snapshot;
    const files = new Map(snapshot.loadedFiles);

    if (!config || !tree) {
      addConsoleEntry({ type: 'error', message: 'No project open', source: 'system' });
      return;
    }

    try {
      const fileList = await collectProjectFilesForExport(tree, files);
      const current = useIDEStore.getState();
      if (current.projectSession !== projectSession || current.fileTree !== tree || current.projectConfig !== config) {
        throw new Error('Project changed while preparing the export; no file was downloaded');
      }

      const { config: redactedConfig, redactedPaths } = redactProjectConfigForExport(config);
      const exportData = {
        version: '1.0.0',
        config: redactedConfig,
        files: fileList,
        redactedPaths,
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.name || 'zplc-project'}.zplc.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addConsoleEntry({ type: 'success', message: `Project export download started: ${config.name} (${redactedPaths.length} sensitive fields omitted)`, source: 'system' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Failed to export: ${e instanceof Error ? e.message : String(e)}`, source: 'system' });
    }
  };

  // ==========================================================================
  // Transpiler (Visual -> ST)
  // ==========================================================================

  const generateSTFromVisual = (): { source: string; success: boolean } | null => {
    if (!activeFile) return null;

    try {
      if (activeFile.language === 'FBD' || activeFile.language === 'LD' || activeFile.language === 'SFC') {
        const result = transpileToST(activeFile.content, activeFile.language);
        if (!result.success) {
          result.errors.forEach(err => addConsoleEntry({ type: 'error', message: err, source: 'transpiler' }));
          return null;
        }
        return { source: result.source, success: true };
      }
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Transpiler error: ${e instanceof Error ? e.message : String(e)}`, source: 'transpiler' });
      return null;
    }
    return null;
  };

  const handleGenerateST = () => {
    if (!activeFile) return;
    addConsoleEntry({ type: 'info', message: `Transpiling ${activeFile.language} to Structured Text...`, source: 'transpiler' });

    const result = generateSTFromVisual();
    if (result?.success) {
      addConsoleEntry({ type: 'success', message: `Generated ${result.source.split('\n').length} lines of Structured Text`, source: 'transpiler' });
      setGeneratedCode(result.source);
      setGeneratedCodeType(activeFile.language as 'FBD' | 'LD' | 'SFC');
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
    setIsCompileMenuOpen(false);

    const workspaceTests = window.electronAPI?.workspaceTests;
    const currentWorkspaceLink = workspaceScenarioLink?.projectSession === projectSession ? workspaceScenarioLink : null;
    const workspaceCompileRoute = resolveWorkspaceCompileRoute({
      isElectronHost: window.electronAPI !== undefined || navigator.userAgent.includes('Electron/'),
      canonicalCompileAvailable: typeof workspaceTests?.compile === 'function',
      isProjectOpen: useIDEStore.getState().isProjectOpen,
      hasCurrentLink: currentWorkspaceLink !== null,
      hasUnsavedChanges: hasUnsavedChanges(),
    });

    if (workspaceCompileRoute === 'canonical-unavailable' || workspaceCompileRoute === 'link-required' || workspaceCompileRoute === 'save-required') {
      const current = useIDEStore.getState();
      if (current.isConsoleCollapsed) current.toggleConsole();
      current.setActiveConsoleTab('tests');
      const message = workspaceCompileRoute === 'canonical-unavailable'
        ? 'Saved workspace compiler is unavailable. Restart ZPLC Studio before building this project.'
        : workspaceCompileRoute === 'link-required'
          ? 'Open Tests and choose the saved zplc.json before building this project.'
          : 'Save changes before building the saved workspace.';
      addConsoleEntry({ type: 'error', message, source: 'compiler' });
      addCompilerMessage({ type: 'error', message });
      return;
    }

    if (workspaceCompileRoute === 'canonical' && workspaceTests && currentWorkspaceLink) {
      const workspaceId = currentWorkspaceLink.workspaceId;
      const expected = { projectSession, compilerRunId, workspaceId };
      addConsoleEntry({ type: 'info', message: 'Building saved workspace locally...', source: 'compiler' });
      try {
        const response = await workspaceTests.compile({ workspaceId });
        const latest = useIDEStore.getState();
        if (!isWorkspaceTestRunCurrent(latest, expected)) return;
        const canonical = presentWorkspaceCompileResult(response);
        if (!canonical.ok) {
          revealCompileProblems();
          addConsoleEntry({ type: 'error', message: 'Canonical workspace build failed', source: 'compiler' });
          if (canonical.diagnostics.length === 0) {
            addCompilerMessage({ type: 'error', message: 'Canonical workspace build failed' });
          }
          for (const diagnostic of canonical.diagnostics) {
            addCompilerMessage({ type: 'error', message: diagnostic.message, ...(diagnostic.path ? { file: diagnostic.path } : {}), ...(diagnostic.line ? { line: diagnostic.line } : {}), ...(diagnostic.column ? { column: diagnostic.column } : {}) });
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
        addConsoleEntry({ type: 'success', message: `Built saved workspace locally: ${canonical.artifact.zplcFile.length} bytes (${canonical.summary.codeSize} code, ${canonical.summary.taskCount} tasks)`, source: 'compiler' });
        markCompilerMessagesChecked();
      } catch {
        const latest = useIDEStore.getState();
        if (!isWorkspaceTestRunCurrent(latest, expected)) return;
        revealCompileProblems();
        addConsoleEntry({ type: 'error', message: 'Canonical workspace build failed', source: 'compiler' });
        addCompilerMessage({ type: 'error', message: 'Canonical workspace build failed' });
        markCompilerMessagesChecked();
      }
      return;
    }

    if (!isCurrentRun()) return;
    const current = useIDEStore.getState();
    if (current.isConsoleCollapsed) current.toggleConsole();
    current.setActiveConsoleTab('tests');
    const message = 'Build requires a saved folder opened in ZPLC Studio. Open the project folder in the desktop app, then choose zplc.json in Tests.';
    addConsoleEntry({ type: 'error', message, source: 'compiler' });
    addCompilerMessage({ type: 'error', message });
  };

  const handleDownloadBytecode = () => {
    const result = currentCompileResult();
    if (!result) {
      addConsoleEntry({ type: 'error', message: 'No current compiled bytecode. Build the current source first.', source: 'system' });
      return;
    }
    setIsCompileMenuOpen(false);

    try {
      const binaryData = new Uint8Array(result.zplcFile);
      const blob = new Blob([binaryData.buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addConsoleEntry({ type: 'success', message: `Downloaded: ${result.fileName}`, source: 'system' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Failed to download: ${e instanceof Error ? e.message : String(e)}`, source: 'system' });
    }
  };

  const handleViewAssembly = () => {
    const result = currentCompileResult();
    if (!result) {
      addConsoleEntry({ type: 'error', message: 'No current compiled code. Build the current source first.', source: 'system' });
      return;
    }
    setIsCompileMenuOpen(false);
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
    try {
      if (isConnected) {
        await disconnect();
        setProgramLoadState(nextProgramLoadStateAfterConnect());
        return;
      }
      if (executionMode === 'simulate') {
        await startSimulation();
        setProgramLoadState(nextProgramLoadStateAfterConnect());
        addConsoleEntry({ type: 'success', message: 'Simulator ready', source: 'runtime' });
      } else {
        await connectHardware();
        setProgramLoadState(nextProgramLoadStateAfterConnect());
        addConsoleEntry({ type: 'success', message: 'Hardware connected', source: 'runtime' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('cancelled') && !msg.toLowerCase().includes('canceled') && msg !== 'No serial port selected') {
        addConsoleEntry({ type: 'error', message: `Connection failed: ${msg}`, source: 'runtime' });
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
        message: `Mode change failed: ${e instanceof Error ? e.message : String(e)}`,
        source: 'runtime',
      });
    } finally {
      setIsModeTransitioning(false);
    }
  };

  const handleUpload = async () => {
    if (executionMode !== EXECUTION_MODE.HARDWARE || controlsBusy || uploadInFlightRef.current) return;
    if (!isConnected) {
      addConsoleEntry({ type: 'error', message: 'Connect first.', source: 'runtime' });
      return;
    }
    const result = currentCompileResult();
    if (!result) {
      addConsoleEntry({ type: 'error', message: 'No current compiled bytecode. Build the current source first.', source: 'runtime' });
      return;
    }
    const deployProjectSession = useIDEStore.getState().projectSession;
    const deployTargetBoard = useIDEStore.getState().projectConfig?.target?.board;
    uploadInFlightRef.current = true;
    setIsUploading(true);
    let programSendStarted = false;
    try {
      const deployedRevision = result.revision;
      const deployedCompilerRunId = result.compilerRunId;
      const dataToUpload = selectRuntimeArtifact({
        bytecode: result.bytecode,
        zplcFile: result.zplcFile,
      });
      const confirmation = await createHardwareDeployConfirmation({
        bytecode: dataToUpload,
        projectBoard: deployTargetBoard,
        systemInfo: getHardwareSystemInfo(),
        taskCount: result.taskCount,
      });
      if (!window.confirm(confirmation.message)) {
        addConsoleEntry({ type: 'info', message: 'Hardware deploy cancelled; no program was sent.', source: 'runtime' });
        return;
      }
      const current = currentCompileResult();
      const latest = useIDEStore.getState();
      if (current !== result || latest.projectSession !== deployProjectSession || latest.projectConfig?.target?.board !== deployTargetBoard) {
        addConsoleEntry({ type: 'warning', message: 'Project changed before deploy confirmation. Build the current source before deploying.', source: 'runtime' });
        return;
      }

      const description = `Deploying admitted .zplc (${confirmation.byteLength} bytes, ${confirmation.taskCount} task(s)); execution remains stopped...`;

      addConsoleEntry({ type: 'info', message: description, source: 'runtime' });
      programSendStarted = true;
      await loadProgram(dataToUpload, result.debugMap, deployTargetBoard);
      if (nextProgramLoadStateAfterDeploy(deployedRevision, compileRevisionRef.current, deployedCompilerRunId, useIDEStore.getState().compilerRunId) === PROGRAM_LOAD_STATE.LOADED) {
        setProgramLoadState(PROGRAM_LOAD_STATE.LOADED);
        addConsoleEntry({ type: 'success', message: 'Program deployed and stopped.', source: 'runtime' });
      } else {
        setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
        addConsoleEntry({
          type: 'warning',
          message: 'Device received an earlier build. Deploy the current build before Run.',
          source: 'runtime',
        });
      }
    } catch (error) {
      const preflightDenied = error instanceof DeviceAdmissionError && error.code !== DEVICE_ADMISSION_CODE.RESULT_UNKNOWN;
      setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
      addConsoleEntry({
        type: 'error',
        message: programSendStarted && !preflightDenied
          ? HARDWARE_DEPLOY_UNCONFIRMED_MESSAGE
          : 'Hardware deploy preflight failed. No program was sent.',
        source: 'runtime',
      });
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  };

  const handleStart = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    if (!isConnected) {
      addConsoleEntry({ type: 'error', message: 'Connect first.', source: 'runtime' });
      return;
    }
    const result = currentCompileResult();
    if (!canRunCurrentProgram(executionMode, Boolean(result), programLoadState)) {
      addConsoleEntry({
        type: 'error',
        message: executionMode === EXECUTION_MODE.HARDWARE
          ? 'Deploy the current build before Run.'
          : 'No compiled bytecode. Compile first!',
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
          addConsoleEntry({ type: 'warning', message: 'Simulator received an earlier build. Build the current source before Run.', source: 'runtime' });
          return;
        }
        setProgramLoadState(PROGRAM_LOAD_STATE.LOADED);
      } catch (e) {
        pendingExecutionFocusRef.current = null;
        addConsoleEntry({ type: 'error', message: `Failed to load: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
        return;
      }
    }

    try {
      await start();
      addConsoleEntry({ type: 'info', message: 'Execution started', source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({ type: 'error', message: `Run failed: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
    }
  };

  const handlePause = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    pendingExecutionFocusRef.current = keyboardInitiated ? 'paused' : null;
    try {
      await pause();
      addConsoleEntry({ type: 'info', message: `Paused at cycle ${vmInfo?.cycles || 0}`, source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({ type: 'error', message: `Pause failed: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
    }
  };

  const handleResume = async (keyboardInitiated = false) => {
    if (controlsBusy) return;
    if (!canRunCurrentProgram(executionMode, Boolean(currentCompileResult()), programLoadState)) {
      addConsoleEntry({ type: 'error', message: 'Deploy the current build before Resume.', source: 'runtime' });
      return;
    }
    pendingExecutionFocusRef.current = keyboardInitiated ? 'running' : null;
    try {
      await resume();
      addConsoleEntry({ type: 'info', message: 'Resumed', source: 'runtime' });
    } catch (e) {
      pendingExecutionFocusRef.current = null;
      addConsoleEntry({ type: 'error', message: `Resume failed: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
    }
  };

  const handleStop = async () => {
    if (controlsBusy) return;
    try {
      await stop();
      addConsoleEntry({ type: 'info', message: 'Stopped', source: 'runtime' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Stop failed: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
    }
  };

  const handleStep = async () => {
    if (controlsBusy) return;
    if (!canRunCurrentProgram(executionMode, Boolean(currentCompileResult()), programLoadState)) {
      addConsoleEntry({ type: 'error', message: 'Deploy the current build before Step.', source: 'runtime' });
      return;
    }
    try {
      await step();
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Step failed: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
    }
  };

  const handleReset = async () => {
    if (controlsBusy) return;
    try {
      await reset();
      addConsoleEntry({ type: 'info', message: 'Reset', source: 'runtime' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Reset failed: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
    }
  };

  // ==========================================================================
  // Keyboard Shortcuts - Industrial-critical: operators need fast reactions
  // ==========================================================================
  // F5        = Run/Resume
  // Shift+F5  = Stop
  // F6        = Pause
  // F10       = Step
  // F8        = Reset
  // Ctrl+B    = Compile
  // Ctrl+S    = Save
  // ==========================================================================

  const onGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea (but not Monaco - it handles its own shortcuts)
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const key = event.key;
      const ctrl = event.ctrlKey || event.metaKey;
      const shift = event.shiftKey;

      // Ctrl+S - Save
      if (ctrl && key === 's') {
        event.preventDefault();
        handleSaveFile();
        return;
      }

      // Ctrl+B - Compile
      if (ctrl && key === 'b') {
        event.preventDefault();
        handleCompile();
        return;
      }

      // F5 - Run/Resume (without shift)
      if (key === 'F5' && !shift) {
        event.preventDefault();
        if (isRunning) {
          // Already running, do nothing
        } else if (isPaused) {
          handleResume(true);
        } else {
          handleStart(true);
        }
        return;
      }

      // Shift+F5 - Stop
      if (key === 'F5' && shift) {
        event.preventDefault();
        if (isRunning || isPaused) {
          handleStop();
        }
        return;
      }

      // F6 - Pause
      if (key === 'F6') {
        event.preventDefault();
        if (isRunning) {
          handlePause(true);
        }
        return;
      }

      // F10 - Step
      if (key === 'F10') {
        event.preventDefault();
        if (isPaused || isIdle) {
          handleStep();
        }
        return;
      }

      // F8 - Reset
      if (key === 'F8') {
        event.preventDefault();
        if (isConnected) {
          handleReset();
        }
        return;
      }
  });

  useEffect(() => {
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  const themeOptions = [
    { id: 'light' as const, label: 'Light', icon: Sun },
    { id: 'dark' as const, label: 'Dark', icon: Moon },
    { id: 'high-contrast' as const, label: 'High contrast', icon: Contrast },
    { id: 'system' as const, label: 'System', icon: Monitor },
  ];

  // Status text and color
  const getStatusDisplay = () => {
    if (!isConnected) {
      return { text: 'Disconnected', tone: 'neutral' as const };
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
    <div role="toolbar" aria-label="Project operations" className={`h-12 bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] flex items-center px-3 gap-1.5 ${isElectronMac ? 'pl-20' : ''}`}>
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 bg-[var(--color-accent-blue)] rounded flex items-center justify-center font-bold text-white text-xs">
          Z
        </div>
        <span className="font-semibold text-[var(--color-surface-100)] text-sm hidden sm:inline">ZPLC</span>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Save Button */}
      <button
        type="button"
        onClick={handleSaveFile}
        disabled={!activeFile}
        className="focus-ring p-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Save active file (Ctrl+S)"
        title="Save (Ctrl+S)"
      >
        <Save size={18} />
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Generate ST button - only for visual languages */}
      {isVisualLanguage && (
        <button
          type="button"
          onClick={handleGenerateST}
          className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
          aria-label="Generate Structured Text"
          title="Generate Structured Text"
        >
          <FileCode size={14} />
          <span className="hidden md:inline">To ST</span>
        </button>
      )}

      {/* Compile Dropdown */}
      <div className="relative" ref={compileMenuRef} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeCompileMenu(true); } }}>
        <button
          ref={compileMenuTriggerRef}
          type="button"
          onClick={() => isCompileMenuOpen ? closeCompileMenu() : openCompileMenu()}
          className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-100)] text-xs font-medium transition-colors"
          aria-label="Build options"
          aria-haspopup="menu"
          aria-expanded={isCompileMenuOpen}
          aria-controls="toolbar-build-menu"
          title="Build options"
        >
          <Hammer size={14} />
          <span>Build</span>
          <ChevronDown size={12} className={`transition-transform ${isCompileMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isCompileMenuOpen && (
          <div id="toolbar-build-menu" role="menu" aria-label="Build options" className="absolute left-0 top-full mt-1 py-1 w-44 bg-[var(--color-surface-700)] border border-[var(--color-surface-600)] rounded-lg shadow-lg z-50">
            <button
              ref={compileMenuFirstItemRef}
              type="button"
              role="menuitem"
              onClick={handleCompile}
              className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] transition-colors"
              aria-label="Compile current project (Ctrl+B)"
            >
              <Hammer size={14} />
              <span>Compile</span>
              <span className="ml-auto text-xs text-[var(--color-surface-400)]">Ctrl+B</span>
            </button>
            <div className="h-px bg-[var(--color-surface-600)] my-1" />
            <button
              type="button"
              role="menuitem"
              onClick={handleDownloadBytecode}
              disabled={!hasCurrentCompileResult}
              className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Download current .zplc program"
            >
              <Download size={14} />
              <span>Download .zplc</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleViewAssembly}
              disabled={!hasCurrentCompileResult}
              className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="View current assembly"
            >
              <FileCode size={14} />
              <span>View Assembly</span>
            </button>
            <div className="h-px bg-[var(--color-surface-600)] my-1" />
            <button
              type="button"
              role="menuitem"
              onClick={handleExportProject}
              className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] transition-colors"
              aria-label="Export project"
            >
              <Download size={14} />
              <span>Export Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Mode Toggle */}
      <div role="group" aria-label="Execution mode" className="flex items-center bg-[var(--color-surface-700)] rounded overflow-hidden">
        <button
            type="button"
            onClick={() => { void handleExecutionModeChange(EXECUTION_MODE.SIMULATE); }}
            disabled={controlsBusy}
           className={`focus-ring flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${executionMode === EXECUTION_MODE.SIMULATE
            ? 'bg-[var(--color-accent-blue)] text-white'
            : 'text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
            } disabled:opacity-50`}
          aria-label="Simulation mode"
          aria-pressed={executionMode === EXECUTION_MODE.SIMULATE}
          title="Simulation Mode (local native runtime)"
        >
          <Cpu size={14} />
          <span className="hidden sm:inline">Simulate</span>
        </button>
        <button
            type="button"
            onClick={() => { void handleExecutionModeChange(EXECUTION_MODE.HARDWARE); }}
            disabled={controlsBusy}
           className={`focus-ring flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${executionMode === EXECUTION_MODE.HARDWARE
            ? 'bg-[var(--color-accent-blue)] text-white'
            : 'text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
            } disabled:opacity-50`}
          aria-label="Hardware mode"
          aria-pressed={executionMode === EXECUTION_MODE.HARDWARE}
          title="Hardware Mode (Serial)"
        >
          <Radio size={14} />
          <span className="hidden sm:inline">Hardware</span>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Connection / Execution Controls */}
      <div className="flex items-center gap-1">
        {/* Connect/Disconnect */}
        <button
          ref={connectionButtonRef}
          type="button"
          onClick={handleConnect}
          disabled={controlsBusy}
          className={`focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${isConnected
            ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-200)] hover:bg-red-600 hover:text-white'
            : executionMode === 'simulate'
              ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
              : 'bg-[var(--color-accent-blue)] hover:bg-blue-500 text-white'
          } disabled:opacity-50`}
          aria-label={isConnected ? 'Disconnect' : 'Connect'}
          title={isConnected ? 'Disconnect' : 'Connect'}
        >
          {isConnecting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isConnected ? (
            <Unplug size={14} />
          ) : executionMode === 'simulate' ? (
            <Cpu size={14} />
          ) : (
            <Usb size={14} />
          )}
          <span className="hidden md:inline">{isConnected ? 'Disconnect' : 'Connect'}</span>
        </button>

        {/* Upload - only for hardware mode when connected */}
        {executionMode === 'hardware' && isConnected && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={!hasCurrentCompileResult || controlsBusy}
            className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-200)] text-xs font-medium transition-colors disabled:opacity-40"
            aria-label="Deploy current .zplc program to connected device; execution remains stopped"
            title="Deploy current .zplc to device; execution remains stopped"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span className="hidden md:inline">Deploy</span>
          </button>
        )}

        {/* Live Values (mpeek) toggle */}
        {isConnected && (
          <button
            type="button"
            onClick={toggleMpeek}
            disabled={controlsBusy}
            className={`focus-ring flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              mpeekEnabled
                ? 'bg-amber-500 hover:bg-amber-400 text-black'
                : 'bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-400)]'
            }`}
            aria-label={mpeekEnabled ? 'Disable inline live preview' : 'Enable inline live preview'}
            title={mpeekEnabled
              ? 'Inline live preview enabled. Click to disable editor live preview.'
              : 'Inline live preview disabled. Watch table still updates. Click to enable editor live preview.'}
          >
            <Zap size={13} />
            <span className="hidden lg:inline">Live</span>
          </button>
        )}

        {/* Separator when connected */}
        {isConnected && <div className="w-px h-5 bg-[var(--color-surface-600)] mx-0.5" />}

        {/* Execution Controls - only when connected */}
        {isConnected && (
          <>
            {/* Run/Resume or Pause based on state */}
            {isRunning ? (
              <button
                type="button"
                ref={executionButtonRef}
                onClick={(event) => { void handlePause(event.detail === 0); }}
                disabled={controlsBusy}
                className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                aria-label="Pause (F6)"
                title="Pause (F6)"
              >
                <Pause size={14} />
                <span className="hidden sm:inline">Pause</span>
              </button>
            ) : isPaused ? (
              <button
                type="button"
                ref={executionButtonRef}
                onClick={(event) => { void handleResume(event.detail === 0); }}
                disabled={!canRunCurrentProgram(executionMode, hasCurrentCompileResult, programLoadState) || controlsBusy}
                className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
                aria-label="Resume (F5)"
                title="Resume (F5)"
              >
                <Play size={14} />
                <span className="hidden sm:inline">Resume</span>
              </button>
            ) : (
              <button
                type="button"
                ref={executionButtonRef}
                onClick={(event) => { void handleStart(event.detail === 0); }}
                disabled={!canRunCurrentProgram(executionMode, hasCurrentCompileResult, programLoadState) || controlsBusy}
                className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
                aria-label="Run (F5)"
                title="Run (F5)"
              >
                <Play size={14} />
                <span className="hidden sm:inline">Run</span>
              </button>
            )}

            {/* Step - only when paused or idle */}
            {(isPaused || isIdle) && (
              <button
                type="button"
                onClick={handleStep}
                disabled={!canRunCurrentProgram(executionMode, hasCurrentCompileResult, programLoadState) || controlsBusy}
                className="focus-ring flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-200)] text-xs font-medium transition-colors"
                aria-label="Step one cycle (F10)"
                title="Step one cycle (F10)"
              >
                <SkipForward size={14} />
              </button>
            )}

            {/* Stop - when running or paused */}
            {(isRunning || isPaused) && (
              <button
                type="button"
                onClick={handleStop}
                disabled={controlsBusy}
                className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
                aria-label="Stop (Shift+F5)"
                title="Stop (Shift+F5)"
              >
                <Square size={14} />
              </button>
            )}

            {/* Reset */}
            <button
              type="button"
              onClick={handleReset}
              disabled={controlsBusy}
              className="focus-ring flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-200)] text-xs font-medium transition-colors"
              aria-label="Reset runtime (F8)"
              title="Reset (F8)"
            >
              <RotateCcw size={14} />
            </button>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Theme Switcher */}
      <div className="relative" ref={themeMenuRef} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeThemeMenu(true); } }}>
        <button
          ref={themeMenuTriggerRef}
          type="button"
          onClick={() => isThemeMenuOpen ? closeThemeMenu() : openThemeMenu()}
          className="focus-ring flex items-center gap-1 p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors"
          aria-label="Theme options"
          aria-haspopup="menu"
          aria-expanded={isThemeMenuOpen}
          aria-controls="toolbar-theme-menu"
          title={`Theme: ${theme}`}
        >
          {isDark ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {isThemeMenuOpen && (
          <div id="toolbar-theme-menu" role="menu" aria-label="Theme options" className="absolute right-0 top-full mt-1 py-1 w-32 bg-[var(--color-surface-700)] border border-[var(--color-surface-600)] rounded-lg shadow-lg z-50">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = theme === option.id;
              return (
                <button
                  key={option.id}
                  ref={option.id === themeOptions[0].id ? themeMenuFirstItemRef : undefined}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  aria-label={`Use ${option.label.toLowerCase()} theme`}
                  onClick={() => { setTheme(option.id); closeThemeMenu(true); }}
                  className={`focus-ring w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${isActive
                    ? 'bg-[var(--color-accent-blue)] text-white'
                    : 'text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)]'
                    }`}
                >
                  <Icon size={14} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings */}
      <button
        type="button"
        onClick={toggleSettings}
        className="focus-ring p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors"
        aria-label="Project Settings"
        title="Project Settings"
      >
        <Settings size={16} />
      </button>

      {/* Generated Code Dialog */}
      <GeneratedCodeDialog
        isOpen={showGeneratedCode}
        onClose={() => setShowGeneratedCode(false)}
        sourceLanguage={generatedCodeType}
        generatedCode={generatedCode}
      />
    </div>
    <OperationalStatusBar
      mode={executionMode}
      adapterType={adapter?.type ?? null}
      connected={isConnected}
      vmInfo={vmInfo}
      status={status}
    />
    </>
  );
}

export default Toolbar;
