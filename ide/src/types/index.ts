/**
 * ZPLC IDE Type Definitions
 * 
 * Core types for the IEC 61131-3 Web IDE
 */

// =============================================================================
// Electron API (exposed via preload script)
// =============================================================================

declare global {
  interface Window {
    electronAPI?: {
      getAppInfo: () => Promise<{
        version: string;
        platform: string;
        arch: string;
        isPackaged: boolean;
      }>;
      openExternal: (url: string) => Promise<void>;
      isElectron: boolean;
      platform: string;
    };
  }
}

// =============================================================================
// IEC 61131-3 Language Types
// =============================================================================

export type PLCLanguage = 'ST' | 'IL' | 'LD' | 'FBD' | 'SFC';

export interface PLCLanguageInfo {
  id: PLCLanguage;
  name: string;
  fullName: string;
  extension: string;
  isVisual: boolean;
  description: string;
}

export const PLC_LANGUAGES: Record<PLCLanguage, PLCLanguageInfo> = {
  ST: {
    id: 'ST',
    name: 'ST',
    fullName: 'Structured Text',
    extension: '.st',
    isVisual: false,
    description: 'High-level Pascal-like language',
  },
  IL: {
    id: 'IL',
    name: 'IL',
    fullName: 'Instruction List',
    extension: '.il',
    isVisual: false,
    description: 'Low-level assembly-like language',
  },
  LD: {
    id: 'LD',
    name: 'LD',
    fullName: 'Ladder Diagram',
    extension: '.ld',
    isVisual: true,
    description: 'Relay ladder logic representation',
  },
  FBD: {
    id: 'FBD',
    name: 'FBD',
    fullName: 'Function Block Diagram',
    extension: '.fbd',
    isVisual: true,
    description: 'Graphical function block network',
  },
  SFC: {
    id: 'SFC',
    name: 'SFC',
    fullName: 'Sequential Function Chart',
    extension: '.sfc',
    isVisual: true,
    description: 'State machine for sequential processes',
  },
};

// =============================================================================
// Project Structure
// =============================================================================

export interface ProjectFile {
  id: string;
  name: string;
  language: PLCLanguage;
  content: string;
  isModified: boolean;
  path: string;
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  activeFileId: string | null;
  targetDevice: TargetDevice | null;
}

// =============================================================================
// Target Device / Connection
// =============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type PLCState = 'stopped' | 'running' | 'paused' | 'error' | 'unknown';

export interface TargetDevice {
  id: string;
  name: string;
  type: 'zephyr' | 'posix' | 'simulator';
  address: string;
  port: number;
}

export interface ConnectionState {
  status: ConnectionStatus;
  device: TargetDevice | null;
  plcState: PLCState;
  lastError: string | null;
  cycleTime: number | null;
  uptime: number | null;
}

// =============================================================================
// Compiler / Build
// =============================================================================

export type CompilerMessageType = 'info' | 'warning' | 'error';

export interface CompilerMessage {
  type: CompilerMessageType;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  timestamp: Date;
}

export interface BuildResult {
  success: boolean;
  messages: CompilerMessage[];
  bytecodeSize: number | null;
  buildTime: number;
}

// =============================================================================
// Console / Output
// =============================================================================

export type ConsoleTab = 'output' | 'problems' | 'terminal' | 'watch';

export interface ConsoleEntry {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'command';
  message: string;
  timestamp: Date;
  source?: string;
}

// =============================================================================
// Project Configuration (from project.yaml)
// =============================================================================

export type TaskMode = 'cyclic' | 'freewheeling';

// =============================================================================
// IEC 61131-3 POU Types
// =============================================================================

/** Program Organization Unit types per IEC 61131-3 */
export type POUType = 'PRG' | 'FB' | 'FUN' | 'GVL';

export interface POUInfo {
  type: POUType;
  name: string;
  fullName: string;
  extension: string;
  description: string;
}

export const POU_TYPES: Record<POUType, POUInfo> = {
  PRG: {
    type: 'PRG',
    name: 'Program',
    fullName: 'Program',
    extension: '.st',
    description: 'Main executable unit, can be assigned to tasks',
  },
  FB: {
    type: 'FB',
    name: 'Function Block',
    fullName: 'Function Block',
    extension: '.st',
    description: 'Reusable block with internal state (instances)',
  },
  FUN: {
    type: 'FUN',
    name: 'Function',
    fullName: 'Function',
    extension: '.st',
    description: 'Stateless function, returns a value',
  },
  GVL: {
    type: 'GVL',
    name: 'Global Variables',
    fullName: 'Global Variable List',
    extension: '.gvl',
    description: 'Global variable declarations',
  },
};

// =============================================================================
// Task Definition (IEC 61131-3 Task Configuration)
// =============================================================================

/** Task trigger type */
export type TaskTrigger = 'cyclic' | 'event' | 'freewheeling';

/** Task definition for zplc.json */
export interface TaskDefinition {
  name: string;
  trigger: TaskTrigger;
  interval?: number;          // Cycle time in ms (for cyclic tasks)
  priority: number;           // 0 = highest, 255 = lowest
  watchdog?: number;          // Watchdog timeout in ms
  programs: string[];         // List of program names assigned to this task
}

// =============================================================================
// zplc.json - Project Configuration File
// =============================================================================

/** I/O Pin configuration */
export interface IOPinConfig {
  name: string;
  address: string;       // e.g., "%I0.0", "%Q0.0", "%IW0", "%QW0"
  description?: string;
  pin?: number;          // Physical GPIO pin
  channel?: number;      // ADC/DAC channel index (e.g., 0 for ADC0/GP26)
  type?: 'BOOL' | 'INT' | 'REAL';
}

/** Target hardware configuration */
export interface TargetConfig {
  board: string;         // e.g., "rpi_pico", "arduino_giga_r1"
  cpu?: string;          // e.g., "rp2040", "stm32h747"
  clock_mhz?: number;
}

/** Compiler settings */
export interface CompilerConfig {
  optimization?: 'none' | 'speed' | 'size';
  debug?: boolean;
  warnings?: 'none' | 'default' | 'all';
}

/** I/O configuration */
export interface IOConfig {
  inputs?: IOPinConfig[];
  outputs?: IOPinConfig[];
}

/** 
 * zplc.json - Main project configuration file
 * This is the new standard format replacing project.yaml
 */
export interface ZPLCProjectConfig {
  // Metadata
  name: string;
  version: string;
  description?: string;
  author?: string;

  // Hardware target
  target?: TargetConfig;

  // Compiler settings
  compiler?: CompilerConfig;

  // I/O Mapping
  io?: IOConfig;

  // Task configuration (IEC 61131-3 style)
  tasks: TaskDefinition[];

  // Build settings
  build?: {
    outDir?: string;           // Output directory (default: "build")
    entryPoints?: string[];    // Override: explicit entry points
  };
}

/** Alias for ZPLCProjectConfig (shorter name for common usage) */
export type ZPLCConfig = ZPLCProjectConfig;

/** Default project configuration */
export const DEFAULT_ZPLC_CONFIG: ZPLCProjectConfig = {
  name: 'New Project',
  version: '1.0.0',
  tasks: [
    {
      name: 'MainTask',
      trigger: 'cyclic',
      interval: 10,
      priority: 1,
      watchdog: 100,
      programs: ['Main'],
    },
  ],
};

// =============================================================================
// Legacy Project Configuration (for backward compatibility)
// =============================================================================

/** @deprecated Use ZPLCProjectConfig instead */
export interface ProjectConfig {
  name: string;
  taskMode: TaskMode;
  cycleTimeMs: number;
  priority: number;
  watchdogMs: number;
  startPOU: string;      // Entry point program name
}

/** @deprecated */
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  name: 'ZPLC Demo',
  taskMode: 'cyclic',
  cycleTimeMs: 10,
  priority: 1,
  watchdogMs: 100,
  startPOU: 'Main',
};

/** Complete project.yaml structure - legacy format */
export interface ProjectYAML {
  name: string;
  description?: string;
  version: string;
  author?: string;

  target?: TargetConfig;
  compiler?: CompilerConfig;
  io?: IOConfig;
  tasks?: {
    name: string;
    description?: string;
    command: 'compile' | 'upload' | 'simulate' | 'clean';
    default?: boolean;
    depends_on?: string;
  }[];

  entry_point: string;
  include?: string[];
  exclude?: string[];
}

// =============================================================================
// Serializable Project (for Import/Export)
// =============================================================================

export interface SerializableProject {
  version: string;
  config: ProjectConfig;
  files: Omit<ProjectFile, 'isModified'>[];
  exportedAt: string;
}

/** Loaded project with all files and configuration */
export interface LoadedProject {
  path: string;                    // Folder path
  zplcConfig: ZPLCProjectConfig;   // Parsed zplc.json
  files: ProjectFile[];            // All source files
  config: ProjectConfig;           // Runtime config (derived from zplcConfig)
}

// =============================================================================
// File System Types (File System Access API)
// =============================================================================

/** Extended ProjectFile with file handle for direct disk access */
export interface ProjectFileWithHandle extends ProjectFile {
  handle?: FileSystemFileHandle;   // Browser file handle (if opened from disk)
  parentPath: string;              // Parent directory path
}

/** Directory tree node for sidebar rendering */
export interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileTreeNode[];
  // File-specific
  language?: PLCLanguage;
  pouType?: POUType;
  handle?: FileSystemFileHandle;
  // Directory-specific
  dirHandle?: FileSystemDirectoryHandle;
  isExpanded?: boolean;
}

/** Project state when opened from file system */
export interface FileSystemProject {
  rootHandle: FileSystemDirectoryHandle;
  rootPath: string;                 // Display name of root folder
  config: ZPLCProjectConfig;        // Parsed zplc.json
  fileTree: FileTreeNode;           // Recursive file tree
  files: Map<string, ProjectFileWithHandle>;  // Flat map of loaded files
}

/** Check if File System Access API is available */
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

// =============================================================================
// UI State
// =============================================================================

export interface PanelSizes {
  sidebar: number;
  console: number;
}

export interface EditorTab {
  fileId: string;
  isActive: boolean;
}

// =============================================================================
// File Helpers
// =============================================================================

export function getLanguageFromFilename(filename: string): PLCLanguage {
  if (filename.endsWith('.st')) return 'ST';
  if (filename.endsWith('.il')) return 'IL';
  if (filename.endsWith('.ld.json') || filename.endsWith('.ld')) return 'LD';
  if (filename.endsWith('.fbd.json') || filename.endsWith('.fbd')) return 'FBD';
  if (filename.endsWith('.sfc.json') || filename.endsWith('.sfc')) return 'SFC';
  return 'ST'; // default
}

export function getExtensionForLanguage(language: PLCLanguage): string {
  return PLC_LANGUAGES[language].extension;
}

export function createEmptyFileContent(language: PLCLanguage): string {
  switch (language) {
    case 'ST':
      return `(* New Program *)
PROGRAM NewProgram
VAR
    (* Declare variables here *)
END_VAR

(* Program logic here *)

END_PROGRAM`;
    case 'IL':
      return `(* New Program - Instruction List *)
PROGRAM NewProgram

        LD      TRUE
        ST      Output
        RET

END_PROGRAM`;
    case 'LD':
      return JSON.stringify({
        "$schema": "./schemas/ld.schema.json",
        "name": "NewProgram",
        "description": "New Ladder Diagram",
        "version": "1.0.0",
        "variables": {
          "local": [],
          "outputs": []
        },
        "rungs": [],
        "metadata": {
          "created": new Date().toISOString().split('T')[0],
          "iecStandard": "IEC 61131-3"
        }
      }, null, 2);
    case 'FBD':
      return JSON.stringify({
        "$schema": "./schemas/fbd.schema.json",
        "name": "NewProgram",
        "description": "New Function Block Diagram",
        "version": "1.0.0",
        "variables": {
          "local": [],
          "outputs": []
        },
        "blocks": [],
        "connections": [],
        "metadata": {
          "created": new Date().toISOString().split('T')[0],
          "iecStandard": "IEC 61131-3"
        }
      }, null, 2);
    case 'SFC':
      return JSON.stringify({
        "$schema": "./schemas/sfc.schema.json",
        "name": "NewProgram",
        "description": "New Sequential Function Chart",
        "version": "1.0.0",
        "variables": {
          "local": [],
          "outputs": []
        },
        "steps": [],
        "transitions": [],
        "actions": [],
        "metadata": {
          "created": new Date().toISOString().split('T')[0],
          "iecStandard": "IEC 61131-3"
        }
      }, null, 2);
    default:
      return '';
  }
}
