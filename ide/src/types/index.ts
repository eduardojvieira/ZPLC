/**
 * ZPLC IDE Type Definitions
 * 
 * Core types for the IEC 61131-3 Web IDE
 */

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

export type ConsoleTab = 'output' | 'problems' | 'terminal';

export interface ConsoleEntry {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'command';
  message: string;
  timestamp: Date;
  source?: string;
}

// =============================================================================
// Project Configuration
// =============================================================================

export type TaskMode = 'cyclic' | 'freewheeling';

export interface ProjectConfig {
  name: string;
  taskMode: TaskMode;
  cycleTimeMs: number;
  priority: number;
  watchdogMs: number;
  startPOU: string;      // Entry point program name
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  name: 'ZPLC Demo',
  taskMode: 'cyclic',
  cycleTimeMs: 10,
  priority: 1,
  watchdogMs: 100,
  startPOU: 'Blinky',
};

// =============================================================================
// Serializable Project (for Import/Export)
// =============================================================================

export interface SerializableProject {
  version: string;
  config: ProjectConfig;
  files: Omit<ProjectFile, 'isModified'>[];
  exportedAt: string;
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
