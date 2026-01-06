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

import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Upload,
  Hammer,
  Settings,
  Sun,
  Moon,
  Monitor,
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
} from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useTheme } from '../hooks/useTheme';
import { useDebugController } from '../hooks/useDebugController';
import { transpileFBDToST } from '../transpiler/fbdToST';
import { transpileLDToST } from '../transpiler/ldToST';
import { transpileSFCToST } from '../transpiler/sfcToST';
import { parseFBDModel } from '../models/fbd';
import { parseLDModel } from '../models/ld';
import { parseSFCModel } from '../models/sfc';
import { compileSingleFileWithTask, compileMultiTaskProject, CompilerError } from '../compiler';
import type { PLCLanguage, ProgramSource } from '../compiler';
import { AssemblerError } from '../assembler';
import { GeneratedCodeDialog } from './GeneratedCodeDialog';
import { loadFileFromTree } from '../utils/fileSystem';
import type { FileTreeNode } from '../types';

// =============================================================================
// Types
// =============================================================================

type ExecutionMode = 'simulate' | 'hardware';

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
    createFile,
    toggleSettings,
    saveFile,
    getActiveFile,
    isVirtualProject,
    projectConfig,
    loadedFiles,
    isProjectOpen,
    activeFileId,
    fileTree,
  } = useIDEStore();

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
  } = debugController;

  // Local UI state
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isCompileMenuOpen, setIsCompileMenuOpen] = useState(false);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('simulate');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const themeMenuRef = useRef<HTMLDivElement>(null);
  const compileMenuRef = useRef<HTMLDivElement>(null);

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
  } | null>(null);

  // Get the active file
  const activeFile = getActiveFile();
  const isVisualLanguage = activeFile?.language === 'FBD' || activeFile?.language === 'LD' || activeFile?.language === 'SFC';

  // Derived state from adapter
  const isConnected = adapter?.connected ?? false;
  const isRunning = vmState === 'running';
  const isPaused = vmState === 'paused';
  const isIdle = vmState === 'idle';

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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
          handleResume();
        } else {
          handleStart();
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
          handlePause();
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
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, isRunning, isPaused, isIdle, activeFile]);

  // ==========================================================================
  // File Operations
  // ==========================================================================

  const handleSaveFile = async () => {
    if (!activeFile || !activeFileId) {
      addConsoleEntry({ type: 'error', message: 'No file selected to save', source: 'system' });
      return;
    }

    const success = await saveFile(activeFileId);

    if (!success && isVirtualProject) {
      try {
        const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addConsoleEntry({ type: 'success', message: `Downloaded: ${activeFile.name}`, source: 'system' });
      } catch (e) {
        addConsoleEntry({ type: 'error', message: `Failed to download: ${e instanceof Error ? e.message : String(e)}`, source: 'system' });
      }
    }
  };

  const handleExportProject = () => {
    const { loadedFiles: files, projectConfig: config } = useIDEStore.getState();

    if (!config) {
      addConsoleEntry({ type: 'error', message: 'No project open', source: 'system' });
      return;
    }

    try {
      const fileList = Array.from(files.values()).map(f => ({
        name: f.name, path: f.path, language: f.language, content: f.content,
      }));

      const exportData = {
        version: '1.0.0',
        config,
        files: fileList,
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

      addConsoleEntry({ type: 'success', message: `Exported project: ${config.name}`, source: 'system' });
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
      if (activeFile.language === 'FBD') {
        const model = parseFBDModel(activeFile.content);
        const result = transpileFBDToST(model);
        if (!result.success) {
          result.errors.forEach(err => addConsoleEntry({ type: 'error', message: err, source: 'transpiler' }));
          return null;
        }
        return { source: result.source, success: true };
      } else if (activeFile.language === 'LD') {
        const model = parseLDModel(activeFile.content);
        const result = transpileLDToST(model);
        if (!result.success) {
          result.errors.forEach(err => addConsoleEntry({ type: 'error', message: err, source: 'transpiler' }));
          return null;
        }
        return { source: result.source, success: true };
      } else if (activeFile.language === 'SFC') {
        const model = parseSFCModel(activeFile.content);
        const result = transpileSFCToST(model);
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

  const handleCreateSTFile = async (code: string) => {
    if (!activeFile) return;
    const baseName = activeFile.name.replace(/\.(fbd|ld|sfc)(\.json)?$/, '');
    const newFileName = `${baseName}_generated`;

    try {
      const newFileId = await createFile(newFileName, 'ST');
      useIDEStore.getState().updateFileContent(newFileId, code);
      addConsoleEntry({ type: 'success', message: `Created new file: ${newFileName}.st`, source: 'transpiler' });
    } catch (err) {
      addConsoleEntry({ type: 'error', message: `Failed to create file: ${err instanceof Error ? err.message : String(err)}`, source: 'transpiler' });
    }
  };

  // ==========================================================================
  // Compilation
  // ==========================================================================

  /**
   * Find program source by name.
   * Always loads fresh content from disk (via fileTree) to ensure
   * compilation uses the latest file content, avoiding stale cache issues.
   * 
   * Falls back to loadedFiles only for virtual projects with no fileTree handles.
   */
  const findProgramSource = async (programName: string): Promise<ProgramSource | null> => {
    // Helper to search fileTree recursively
    const findFileByName = (node: FileTreeNode, targetName: string): FileTreeNode | null => {
      if (node.type === 'file' && node.name.toLowerCase() === targetName.toLowerCase()) {
        return node;
      }
      if (node.children) {
        for (const child of node.children) {
          const found = findFileByName(child, targetName);
          if (found) return found;
        }
      }
      return null;
    };

    // Try to load fresh from disk first (via fileTree)
    if (fileTree) {
      const fileNode = findFileByName(fileTree, programName);
      if (fileNode) {
        try {
          // loadFileFromTree reads fresh content from disk via the file handle
          const loadedFile = await loadFileFromTree(fileNode);
          if (loadedFile) {
            const baseName = loadedFile.name.replace(/\.(st|fbd|ld|sfc|il)(\.json)?$/i, '');
            return { name: baseName, content: loadedFile.content, language: loadedFile.language as PLCLanguage };
          }
        } catch (err) {
          console.error(`Failed to load file from disk: ${programName}:`, err);
          // Fall through to check loadedFiles cache as fallback
        }
      }
    }

    // Fallback: check loadedFiles cache (for virtual projects or if disk read failed)
    for (const file of loadedFiles.values()) {
      if (file.name.toLowerCase() === programName.toLowerCase()) {
        const baseName = file.name.replace(/\.(st|fbd|ld|sfc|il)(\.json)?$/i, '');
        return { name: baseName, content: file.content, language: file.language as PLCLanguage };
      }
    }

    return null;
  };

  const hasValidProjectConfig = (): boolean => {
    if (!isProjectOpen || !projectConfig?.tasks?.length) return false;
    return projectConfig.tasks.some(task => task.programs && task.programs.length > 0);
  };

  const handleCompile = async () => {
    clearCompilerMessages();
    setIsCompileMenuOpen(false);

    const useProjectMode = hasValidProjectConfig();

    if (useProjectMode && projectConfig) {
      // PROJECT MODE - Compile all tasks from project configuration
      addConsoleEntry({ type: 'info', message: `Compiling project: ${projectConfig.name || 'Unnamed'}...`, source: 'compiler' });

      try {
        const referencedPrograms = new Set<string>();
        for (const task of projectConfig.tasks) {
          for (const progName of task.programs || []) {
            referencedPrograms.add(progName);
          }
        }

        if (referencedPrograms.size === 0) {
          addConsoleEntry({ type: 'error', message: 'No programs assigned to tasks. Configure tasks in Project Settings.', source: 'compiler' });
          return;
        }

        // Load all program sources (may need to read from disk)
        const programSources: ProgramSource[] = [];
        const missingPrograms: string[] = [];

        for (const progName of referencedPrograms) {
          const source = await findProgramSource(progName);
          if (source) {
            programSources.push(source);
          } else {
            missingPrograms.push(progName);
          }
        }

        if (missingPrograms.length > 0) {
          addConsoleEntry({ type: 'error', message: `Missing program files: ${missingPrograms.join(', ')}`, source: 'compiler' });
          return;
        }

        const result = compileMultiTaskProject(projectConfig, programSources);

        setLastCompileResult({
          bytecode: result.bytecode,
          zplcFile: result.zplcFile,
          assembly: result.programDetails.map(p => `; === ${p.name} ===\n${p.assembly}`).join('\n\n'),
          fileName: `${projectConfig.name || 'project'}.zplc`,
          codeSize: result.codeSize,
          hasTaskSegment: true,
          taskCount: result.tasks.length,
        });

        addConsoleEntry({
          type: 'success',
          message: `Compiled! ${result.zplcFile.length} bytes (${result.codeSize} code, ${result.tasks.length} tasks)`,
          source: 'compiler',
        });

      } catch (e) {
        handleCompileError(e);
      }

    } else if (activeFile) {
      // SINGLE FILE MODE - Compile active file as a single-task project
      addConsoleEntry({ type: 'info', message: `Compiling ${activeFile.name}...`, source: 'compiler' });

      try {
        const language = activeFile.language as PLCLanguage;
        const firstTask = projectConfig?.tasks?.[0];
        const taskName = firstTask?.name || 'MainTask';
        const intervalMs = firstTask?.interval || 10;
        const priority = firstTask?.priority ?? 1;
        const programName = activeFile.name.replace(/\.(st|fbd|ld|sfc)(\.json)?$/i, '') || 'Main';

        const result = compileSingleFileWithTask(activeFile.content, language, {
          taskName, intervalMs, priority, programName,
        });

        const outputFileName = activeFile.name.replace(/\.(st|fbd|ld|sfc)(\.json)?$/i, '.zplc');
        setLastCompileResult({
          bytecode: result.bytecode,
          zplcFile: result.zplcFile,
          assembly: result.assembly,
          fileName: outputFileName,
          codeSize: result.codeSize,
          hasTaskSegment: result.hasTaskSegment,
          taskCount: result.tasks.length,
        });

        addConsoleEntry({
          type: 'success',
          message: `Compiled! ${result.zplcFile.length} bytes (${result.codeSize} code, ${result.tasks.length} task)`,
          source: 'compiler',
        });

      } catch (e) {
        handleCompileError(e);
      }
    } else {
      // NO PROJECT AND NO FILE - Give helpful error
      if (isProjectOpen) {
        addConsoleEntry({
          type: 'error',
          message: 'No programs assigned to tasks. Open Project Settings and configure tasks with programs.',
          source: 'compiler'
        });
      } else {
        addConsoleEntry({
          type: 'error',
          message: 'No project or file open. Open a .zplc project or create a new file to compile.',
          source: 'compiler'
        });
      }
    }
  };

  const handleCompileError = (e: unknown) => {
    if (e instanceof CompilerError) {
      addConsoleEntry({ type: 'error', message: e.message, source: 'compiler' });
      addCompilerMessage({ type: 'error', message: e.message, line: e.line, column: e.column });
    } else if (e instanceof AssemblerError) {
      addConsoleEntry({ type: 'error', message: `Assembler: ${e.message}`, source: 'assembler' });
    } else {
      addConsoleEntry({ type: 'error', message: `Error: ${e instanceof Error ? e.message : String(e)}`, source: 'compiler' });
    }
  };

  const handleDownloadBytecode = () => {
    if (!lastCompileResult) {
      addConsoleEntry({ type: 'error', message: 'No compiled bytecode. Compile first!', source: 'system' });
      return;
    }
    setIsCompileMenuOpen(false);

    try {
      const binaryData = new Uint8Array(lastCompileResult.zplcFile);
      const blob = new Blob([binaryData.buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = lastCompileResult.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addConsoleEntry({ type: 'success', message: `Downloaded: ${lastCompileResult.fileName}`, source: 'system' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Failed to download: ${e instanceof Error ? e.message : String(e)}`, source: 'system' });
    }
  };

  const handleViewAssembly = () => {
    if (!lastCompileResult) {
      addConsoleEntry({ type: 'error', message: 'No compiled code. Compile first!', source: 'system' });
      return;
    }
    setIsCompileMenuOpen(false);
    setGeneratedCode(lastCompileResult.assembly);
    setGeneratedCodeType('ASM');
    setShowGeneratedCode(true);
  };

  // ==========================================================================
  // Connection & Execution
  // ==========================================================================

  const handleConnect = async () => {
    if (isConnected) {
      await disconnect();
      return;
    }

    setIsConnecting(true);
    try {
      if (executionMode === 'simulate') {
        await startSimulation();
        addConsoleEntry({ type: 'success', message: 'Simulator ready', source: 'runtime' });
      } else {
        await connectHardware();
        addConsoleEntry({ type: 'success', message: 'Hardware connected', source: 'runtime' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('cancelled') && !msg.includes('No port')) {
        addConsoleEntry({ type: 'error', message: `Connection failed: ${msg}`, source: 'runtime' });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUpload = async () => {
    if (!isConnected) {
      addConsoleEntry({ type: 'error', message: 'Not connected. Connect first.', source: 'runtime' });
      return;
    }
    if (!lastCompileResult) {
      addConsoleEntry({ type: 'error', message: 'No compiled bytecode. Compile first!', source: 'runtime' });
      return;
    }

    setIsUploading(true);
    try {
      // Hardware mode: Send full .zplc file with TASK segment for multi-task support
      // Simulation mode: Send raw bytecode (WASM uses coreLoadRaw)
      const dataToUpload = executionMode === 'hardware'
        ? lastCompileResult.zplcFile
        : lastCompileResult.bytecode;

      const description = executionMode === 'hardware'
        ? `Uploading .zplc file (${dataToUpload.length} bytes, ${lastCompileResult.taskCount} task(s))...`
        : `Loading bytecode (${dataToUpload.length} bytes)...`;

      addConsoleEntry({ type: 'info', message: description, source: 'runtime' });
      await loadProgram(dataToUpload);
      addConsoleEntry({ type: 'success', message: 'Program loaded', source: 'runtime' });
    } catch (e) {
      addConsoleEntry({ type: 'error', message: `Upload failed: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleStart = async () => {
    if (!isConnected) {
      // Auto-connect first
      await handleConnect();
      return;
    }

    // If we have bytecode but haven't loaded it, load it first
    if (lastCompileResult && isIdle) {
      try {
        // Hardware mode: Send full .zplc file with TASK segment for multi-task support
        // Simulation mode: Send raw bytecode (WASM uses coreLoadRaw)
        const dataToUpload = executionMode === 'hardware'
          ? lastCompileResult.zplcFile
          : lastCompileResult.bytecode;
        await loadProgram(dataToUpload);
      } catch (e) {
        addConsoleEntry({ type: 'error', message: `Failed to load: ${e instanceof Error ? e.message : String(e)}`, source: 'runtime' });
        return;
      }
    }

    await start();
    addConsoleEntry({ type: 'info', message: 'Execution started', source: 'runtime' });
  };

  const handlePause = async () => {
    await pause();
    addConsoleEntry({ type: 'info', message: `Paused at cycle ${vmInfo?.cycles || 0}`, source: 'runtime' });
  };

  const handleResume = async () => {
    await resume();
    addConsoleEntry({ type: 'info', message: 'Resumed', source: 'runtime' });
  };

  const handleStop = async () => {
    await stop();
    addConsoleEntry({ type: 'info', message: 'Stopped', source: 'runtime' });
  };

  const handleStep = async () => {
    await step();
  };

  const handleReset = async () => {
    await reset();
    addConsoleEntry({ type: 'info', message: 'Reset', source: 'runtime' });
  };

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  const themeOptions = [
    { id: 'light' as const, label: 'Light', icon: Sun },
    { id: 'dark' as const, label: 'Dark', icon: Moon },
    { id: 'system' as const, label: 'System', icon: Monitor },
  ];

  // Status text and color
  const getStatusDisplay = () => {
    if (!isConnected) {
      return { text: 'Disconnected', color: 'text-[var(--color-surface-400)]', dot: 'bg-gray-500' };
    }
    switch (vmState) {
      case 'running':
        return { text: 'Running', color: 'text-green-400', dot: 'bg-green-500 animate-pulse' };
      case 'paused':
        return { text: 'Paused', color: 'text-amber-400', dot: 'bg-amber-500' };
      case 'idle':
        return { text: 'Ready', color: 'text-blue-400', dot: 'bg-blue-500' };
      case 'error':
        return { text: 'Error', color: 'text-red-400', dot: 'bg-red-500' };
      default:
        return { text: vmState, color: 'text-[var(--color-surface-400)]', dot: 'bg-gray-500' };
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
    <div className={`h-12 bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] flex items-center px-3 gap-1.5 ${isElectronMac ? 'pl-20' : ''}`}>
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
        onClick={handleSaveFile}
        disabled={!activeFile}
        className="p-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Save (Ctrl+S)"
      >
        <Save size={18} />
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Generate ST button - only for visual languages */}
      {isVisualLanguage && (
        <button
          onClick={handleGenerateST}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
          title="Generate Structured Text"
        >
          <FileCode size={14} />
          <span className="hidden md:inline">To ST</span>
        </button>
      )}

      {/* Compile Dropdown */}
      <div className="relative" ref={compileMenuRef}>
        <button
          onClick={() => setIsCompileMenuOpen(!isCompileMenuOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-100)] text-xs font-medium transition-colors"
          title="Build options"
        >
          <Hammer size={14} />
          <span>Build</span>
          <ChevronDown size={12} className={`transition-transform ${isCompileMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isCompileMenuOpen && (
          <div className="absolute left-0 top-full mt-1 py-1 w-44 bg-[var(--color-surface-700)] border border-[var(--color-surface-600)] rounded-lg shadow-lg z-50">
            <button
              onClick={handleCompile}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] transition-colors"
            >
              <Hammer size={14} />
              <span>Compile</span>
              <span className="ml-auto text-xs text-[var(--color-surface-400)]">Ctrl+B</span>
            </button>
            <div className="h-px bg-[var(--color-surface-600)] my-1" />
            <button
              onClick={handleDownloadBytecode}
              disabled={!lastCompileResult}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={14} />
              <span>Download .zplc</span>
            </button>
            <button
              onClick={handleViewAssembly}
              disabled={!lastCompileResult}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileCode size={14} />
              <span>View Assembly</span>
            </button>
            <div className="h-px bg-[var(--color-surface-600)] my-1" />
            <button
              onClick={handleExportProject}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] transition-colors"
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
      <div className="flex items-center bg-[var(--color-surface-700)] rounded overflow-hidden">
        <button
          onClick={() => {
            if (isConnected) disconnect();
            setExecutionMode('simulate');
          }}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${executionMode === 'simulate'
            ? 'bg-cyan-600 text-white'
            : 'text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
            }`}
          title="Simulation Mode (WASM)"
        >
          <Cpu size={14} />
          <span className="hidden sm:inline">Simulate</span>
        </button>
        <button
          onClick={() => {
            if (isConnected) disconnect();
            setExecutionMode('hardware');
          }}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${executionMode === 'hardware'
            ? 'bg-green-600 text-white'
            : 'text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
            }`}
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
          onClick={handleConnect}
          disabled={isConnecting}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${isConnected
            ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-200)] hover:bg-red-600 hover:text-white'
            : executionMode === 'simulate'
              ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white'
            } disabled:opacity-50`}
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
            onClick={handleUpload}
            disabled={!lastCompileResult || isUploading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-200)] text-xs font-medium transition-colors disabled:opacity-40"
            title="Upload to device"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span className="hidden md:inline">Upload</span>
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
                onClick={handlePause}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                title="Pause (F6)"
              >
                <Pause size={14} />
                <span className="hidden sm:inline">Pause</span>
              </button>
            ) : isPaused ? (
              <button
                onClick={handleResume}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
                title="Resume (F5)"
              >
                <Play size={14} />
                <span className="hidden sm:inline">Resume</span>
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!lastCompileResult}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-40"
                title="Run (F5)"
              >
                <Play size={14} />
                <span className="hidden sm:inline">Run</span>
              </button>
            )}

            {/* Step - only when paused or idle */}
            {(isPaused || isIdle) && (
              <button
                onClick={handleStep}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-200)] text-xs font-medium transition-colors"
                title="Step one cycle (F10)"
              >
                <SkipForward size={14} />
              </button>
            )}

            {/* Stop - when running or paused */}
            {(isRunning || isPaused) && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
                title="Stop (Shift+F5)"
              >
                <Square size={14} />
              </button>
            )}

            {/* Reset */}
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-200)] text-xs font-medium transition-colors"
              title="Reset (F8)"
            >
              <RotateCcw size={14} />
            </button>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status Display */}
      <div className="flex items-center gap-2 mr-2">
        {/* Cycle counter when running */}
        {isConnected && vmInfo && vmInfo.cycles > 0 && (
          <span className="text-xs text-[var(--color-surface-400)] font-mono">
            #{vmInfo.cycles.toLocaleString()}
          </span>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${status.dot}`} />
          <span className={`text-xs font-medium ${status.color}`}>{status.text}</span>
        </div>

        {/* Mode indicator */}
        {isConnected && (
          <span className="text-xs text-[var(--color-surface-500)]">
            {executionMode === 'simulate' ? 'SIM' : 'HW'}
          </span>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)]" />

      {/* Theme Switcher */}
      <div className="relative" ref={themeMenuRef}>
        <button
          onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
          className="flex items-center gap-1 p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors"
          title={`Theme: ${theme}`}
        >
          {isDark ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {isThemeMenuOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 w-32 bg-[var(--color-surface-700)] border border-[var(--color-surface-600)] rounded-lg shadow-lg z-50">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = theme === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => { setTheme(option.id); setIsThemeMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${isActive
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
        onClick={toggleSettings}
        className="p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors"
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
        onCreateFile={generatedCodeType !== 'ASM' ? handleCreateSTFile : undefined}
      />
    </div>
  );
}

export default Toolbar;
