/**
 * Toolbar Component
 * 
 * Top toolbar with compile/run/upload buttons, connection status, and theme switcher
 */

import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Upload,
  Hammer,
  Wifi,
  WifiOff,
  Settings,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  FileCode,
  Save,
  Download,
} from 'lucide-react';
import { useIDEStore } from '../store/useIDEStore';
import { useTheme } from '../hooks/useTheme';
import { transpileFBDToST } from '../transpiler/fbdToST';
import { transpileLDToST } from '../transpiler/ldToST';
import { transpileSFCToST } from '../transpiler/sfcToST';
import { parseFBDModel } from '../models/fbd';
import { parseLDModel } from '../models/ld';
import { parseSFCModel } from '../models/sfc';
import { compileProject, CompilerError } from '../compiler';
import type { PLCLanguage } from '../compiler';
import { AssemblerError } from '../assembler';
import { GeneratedCodeDialog } from './GeneratedCodeDialog';

export function Toolbar() {
  const { 
    connection, 
    addConsoleEntry, 
    setPlcState, 
    files, 
    activeFileId, 
    addCompilerMessage, 
    clearCompilerMessages,
    addFile,
    openTab,
    setActiveFile,
    toggleSettings,
    markFileSaved,
    exportProject,
  } = useIDEStore();
  const { theme, setTheme, isDark } = useTheme();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

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
  } | null>(null);

  // Get the active file
  const activeFile = files.find(f => f.id === activeFileId);
  const isVisualLanguage = activeFile?.language === 'FBD' || activeFile?.language === 'LD' || activeFile?.language === 'SFC';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * Generate Structured Text from visual language (FBD/LD/SFC)
   * Returns the generated ST source or null if failed
   */
  const generateSTFromVisual = (): { source: string; success: boolean } | null => {
    if (!activeFile) return null;

    try {
      if (activeFile.language === 'FBD') {
        const model = parseFBDModel(activeFile.content);
        const result = transpileFBDToST(model);
        if (!result.success) {
          result.errors.forEach(err => {
            addConsoleEntry({ type: 'error', message: err, source: 'transpiler' });
          });
          return null;
        }
        return { source: result.source, success: true };
      } else if (activeFile.language === 'LD') {
        const model = parseLDModel(activeFile.content);
        const result = transpileLDToST(model);
        if (!result.success) {
          result.errors.forEach(err => {
            addConsoleEntry({ type: 'error', message: err, source: 'transpiler' });
          });
          return null;
        }
        return { source: result.source, success: true };
      } else if (activeFile.language === 'SFC') {
        const model = parseSFCModel(activeFile.content);
        const result = transpileSFCToST(model);
        if (!result.success) {
          result.errors.forEach(err => {
            addConsoleEntry({ type: 'error', message: err, source: 'transpiler' });
          });
          return null;
        }
        return { source: result.source, success: true };
      }
    } catch (e) {
      addConsoleEntry({ 
        type: 'error', 
        message: `Transpiler error: ${e instanceof Error ? e.message : String(e)}`, 
        source: 'transpiler' 
      });
      return null;
    }

    return null;
  };

  /**
   * Handle "Generate ST" button - transpile visual language to ST and show dialog
   */
  const handleGenerateST = () => {
    if (!activeFile) return;

    addConsoleEntry({
      type: 'info',
      message: `Transpiling ${activeFile.language} to Structured Text...`,
      source: 'transpiler',
    });

    const result = generateSTFromVisual();
    if (result?.success) {
      addConsoleEntry({
        type: 'success',
        message: `Generated ${result.source.split('\n').length} lines of Structured Text`,
        source: 'transpiler',
      });
      
      // Show the dialog with generated code
      setGeneratedCode(result.source);
      setGeneratedCodeType(activeFile.language as 'FBD' | 'LD' | 'SFC');
      setShowGeneratedCode(true);
    }
  };

  /**
   * Handle creating a new ST file from generated code
   */
  const handleCreateSTFile = (code: string) => {
    if (!activeFile) return;

    // Generate a unique file name
    const baseName = activeFile.name.replace(/\.(fbd|ld|sfc)(\.json)?$/, '');
    const newFileName = `${baseName}_generated.st`;
    const newFileId = `generated_${Date.now()}`;

    const newFile = {
      id: newFileId,
      name: newFileName,
      language: 'ST' as const,
      content: code,
      isModified: false,
      path: `/generated/${newFileName}`,
    };

    addFile(newFile);
    openTab(newFileId);
    setActiveFile(newFileId);

    addConsoleEntry({
      type: 'success',
      message: `Created new file: ${newFileName}`,
      source: 'transpiler',
    });
  };

  /**
   * Save current file to disk (download)
   */
  const handleSaveFile = () => {
    if (!activeFile) {
      addConsoleEntry({
        type: 'error',
        message: 'No file selected to save',
        source: 'system',
      });
      return;
    }

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

      markFileSaved(activeFile.id);
      addConsoleEntry({
        type: 'success',
        message: `Saved: ${activeFile.name}`,
        source: 'system',
      });
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: `Failed to save: ${e instanceof Error ? e.message : String(e)}`,
        source: 'system',
      });
    }
  };

  /**
   * Export entire project as JSON
   */
  const handleExportProject = () => {
    try {
      const project = exportProject();
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.config.name || 'zplc-project'}.zplc.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addConsoleEntry({
        type: 'success',
        message: `Exported project: ${project.config.name}`,
        source: 'system',
      });
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: `Failed to export: ${e instanceof Error ? e.message : String(e)}`,
        source: 'system',
      });
    }
  };

  const handleCompile = () => {
    if (!activeFile) {
      addConsoleEntry({
        type: 'error',
        message: 'No file selected',
        source: 'compiler',
      });
      return;
    }

    clearCompilerMessages();
    addConsoleEntry({
      type: 'info',
      message: `Compiling ${activeFile.name}...`,
      source: 'compiler',
    });

    // Determine the language
    const language = activeFile.language as PLCLanguage;

    // Log transpilation for visual languages
    if (isVisualLanguage) {
      addConsoleEntry({
        type: 'info',
        message: `Transpiling ${language} to Structured Text first...`,
        source: 'transpiler',
      });
    }

    try {
      // Use unified compileProject function
      const result = compileProject(activeFile.content, language);

      // Log transpilation success for visual languages
      if (result.intermediateSTSource) {
        addConsoleEntry({
          type: 'success',
          message: `Transpiled to ST (${result.intermediateSTSource.split('\n').length} lines)`,
          source: 'transpiler',
        });
      }

      // Store the result for download
      const outputFileName = activeFile.name.replace(/\.(st|fbd|ld|sfc)(\.json)?$/i, '.zplc');
      setLastCompileResult({
        bytecode: result.bytecode,
        zplcFile: result.zplcFile,
        assembly: result.assembly,
        fileName: outputFileName,
        codeSize: result.codeSize,
      });

      addConsoleEntry({
        type: 'success',
        message: `Compilation successful! Output: ${result.zplcFile.length} bytes (${result.codeSize} bytes code). Ready to download.`,
        source: 'compiler',
      });

    } catch (e) {
      if (e instanceof CompilerError) {
        addConsoleEntry({ 
          type: 'error', 
          message: e.message, 
          source: 'compiler' 
        });
        addCompilerMessage({
          type: 'error',
          message: e.message,
          line: e.line,
          column: e.column,
          file: activeFile.name,
        });
      } else if (e instanceof AssemblerError) {
        addConsoleEntry({ 
          type: 'error', 
          message: `Assembler: ${e.message}`, 
          source: 'assembler' 
        });
      } else {
        addConsoleEntry({
          type: 'error',
          message: `Compilation error: ${e instanceof Error ? e.message : String(e)}`,
          source: 'compiler',
        });
      }
    }
  };

  const handleRun = () => {
    addConsoleEntry({
      type: 'info',
      message: 'Starting PLC execution...',
      source: 'runtime',
    });
    setPlcState('running');
  };

  const handleStop = () => {
    addConsoleEntry({
      type: 'warning',
      message: 'Stopping PLC execution',
      source: 'runtime',
    });
    setPlcState('stopped');
  };

  const handleUpload = () => {
    addConsoleEntry({
      type: 'info',
      message: 'Uploading bytecode to target...',
      source: 'upload',
    });
  };

  /**
   * Download the compiled .zplc bytecode file
   */
  const handleDownloadBytecode = () => {
    if (!lastCompileResult) {
      addConsoleEntry({
        type: 'error',
        message: 'No compiled bytecode available. Compile first!',
        source: 'system',
      });
      return;
    }

    try {
      // Create a copy to ensure ArrayBuffer compatibility
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

      addConsoleEntry({
        type: 'success',
        message: `Downloaded: ${lastCompileResult.fileName} (${lastCompileResult.zplcFile.length} bytes)`,
        source: 'system',
      });
    } catch (e) {
      addConsoleEntry({
        type: 'error',
        message: `Failed to download: ${e instanceof Error ? e.message : String(e)}`,
        source: 'system',
      });
    }
  };

  /**
   * View the generated assembly code in a dialog
   */
  const handleViewAssembly = () => {
    if (!lastCompileResult) {
      addConsoleEntry({
        type: 'error',
        message: 'No compiled code available. Compile first!',
        source: 'system',
      });
      return;
    }

    // Show assembly in the generated code dialog
    setGeneratedCode(lastCompileResult.assembly);
    setGeneratedCodeType('ASM');
    setShowGeneratedCode(true);
  };

  const isConnected = connection.status === 'connected';
  const isRunning = connection.plcState === 'running';

  const themeOptions = [
    { id: 'light' as const, label: 'Light', icon: Sun },
    { id: 'dark' as const, label: 'Dark', icon: Moon },
    { id: 'system' as const, label: 'System', icon: Monitor },
  ];

  return (
    <div className="h-12 bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] flex items-center px-4 gap-2">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-8 h-8 bg-[var(--color-accent-blue)] rounded flex items-center justify-center font-bold text-white text-sm">
          Z
        </div>
        <span className="font-semibold text-[var(--color-surface-100)]">ZPLC IDE</span>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)] mx-2" />

      {/* File Actions */}
      <button
        onClick={handleSaveFile}
        disabled={!activeFile}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-100)] text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Save File (Ctrl+S)"
      >
        <Save size={16} />
        <span>Save</span>
      </button>

      <button
        onClick={handleExportProject}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-100)] text-sm transition-colors"
        title="Export Project"
      >
        <Download size={16} />
        <span>Export</span>
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)] mx-2" />

      {/* Build Actions */}
      {/* Generate ST button - only for visual languages */}
      {isVisualLanguage && (
        <button
          onClick={handleGenerateST}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-sm transition-colors"
          title="Generate Structured Text (transpile FBD/LD to ST)"
        >
          <FileCode size={16} />
          <span>Generate ST</span>
        </button>
      )}

      <button
        onClick={handleCompile}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-100)] text-sm transition-colors"
        title="Compile (Ctrl+B)"
      >
        <Hammer size={16} />
        <span>Compile</span>
      </button>

      {/* Download and View Assembly buttons - only visible after successful compilation */}
      {lastCompileResult && (
        <>
          <button
            onClick={handleDownloadBytecode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-accent-blue)] hover:opacity-90 text-white text-sm transition-colors"
            title={`Download ${lastCompileResult.fileName} (${lastCompileResult.zplcFile.length} bytes)`}
          >
            <Download size={16} />
            <span>.zplc</span>
          </button>
          <button
            onClick={handleViewAssembly}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-100)] text-sm transition-colors"
            title="View generated assembly code"
          >
            <FileCode size={16} />
            <span>ASM</span>
          </button>
        </>
      )}

      {isRunning ? (
        <button
          onClick={handleStop}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-accent-red)] hover:opacity-90 text-white text-sm transition-colors"
          title="Stop (Ctrl+Shift+F5)"
        >
          <Square size={16} />
          <span>Stop</span>
        </button>
      ) : (
        <button
          onClick={handleRun}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-accent-green)] hover:opacity-90 text-white text-sm transition-colors"
          title="Run (F5)"
        >
          <Play size={16} />
          <span>Run</span>
        </button>
      )}

      <button
        onClick={handleUpload}
        disabled={!isConnected}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-100)] text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Upload to Target"
      >
        <Upload size={16} />
        <span>Upload</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Connection Status */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <div className="flex items-center gap-1.5 text-[var(--color-status-connected)] text-sm">
            <Wifi size={16} />
            <span>Connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[var(--color-status-disconnected)] text-sm">
            <WifiOff size={16} />
            <span>Disconnected</span>
          </div>
        )}

        {/* PLC State Indicator */}
        <div className="flex items-center gap-1.5 ml-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isRunning
                ? 'bg-[var(--color-status-running)] animate-pulse'
                : 'bg-[var(--color-status-stopped)]'
            }`}
          />
          <span className="text-sm text-[var(--color-surface-200)] uppercase">
            {connection.plcState}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[var(--color-surface-600)] mx-2" />

      {/* Theme Switcher Dropdown */}
      <div className="relative" ref={themeMenuRef}>
        <button
          onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
          className="flex items-center gap-1 p-1.5 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)] transition-colors"
          title={`Theme: ${theme}`}
        >
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
          <ChevronDown size={14} className={`transition-transform ${isThemeMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isThemeMenuOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 w-36 bg-[var(--color-surface-700)] border border-[var(--color-surface-600)] rounded-lg shadow-lg z-50">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = theme === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    setTheme(option.id);
                    setIsThemeMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-[var(--color-accent-blue)] text-white'
                      : 'text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)]'
                  }`}
                >
                  <Icon size={16} />
                  <span>{option.label}</span>
                  {isActive && (
                    <span className="ml-auto text-xs">✓</span>
                  )}
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
        <Settings size={18} />
      </button>

      {/* Generated Code Dialog - works for ST from visual languages AND assembly from compiler */}
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
