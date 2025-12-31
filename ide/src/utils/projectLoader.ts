/**
 * ZPLC Project Loader
 * 
 * Handles loading project files from the projects/ directory.
 * Uses Vite's import.meta.glob for build-time file discovery.
 * 
 * Project structure:
 *   projects/
 *     <project-id>/
 *       zplc.json        <- Project configuration
 *       src/             <- Source files
 *         main.st
 *         *.fbd.json
 *         *.ld.json
 *         *.sfc.json
 */

import type {
  ProjectFile,
  ProjectConfig,
  LoadedProject,
  PLCLanguage,
  ZPLCConfig,
} from '../types';
import { getLanguageFromFilename } from '../types';

// =============================================================================
// Vite Glob Imports - Build-time file discovery
// =============================================================================

// Import all zplc.json files (new format)
const projectConfigModules = import.meta.glob<string>(
  '/projects/*/zplc.json',
  { query: '?raw', import: 'default', eager: true }
);

// Import all source files from projects/*/src/
const projectSourceModules = import.meta.glob<string>(
  '/projects/*/src/*.{st,il,ld.json,fbd.json,sfc.json}',
  { query: '?raw', import: 'default', eager: true }
);

// =============================================================================
// Project Discovery
// =============================================================================

export interface ProjectInfo {
  id: string;           // Folder name (e.g., "blinky")
  name: string;         // Display name from zplc.json
  description?: string;
  version: string;
  path: string;         // Full path to project folder
}

/**
 * Get list of all available projects
 */
export function getAvailableProjects(): ProjectInfo[] {
  const projects: ProjectInfo[] = [];

  for (const [path, content] of Object.entries(projectConfigModules)) {
    try {
      const config = JSON.parse(content) as ZPLCConfig;
      
      // Extract project folder name from path: /projects/blinky/zplc.json -> blinky
      const match = path.match(/\/projects\/([^/]+)\/zplc\.json$/);
      if (!match) continue;
      
      const folderId = match[1];
      
      projects.push({
        id: folderId,
        name: config.name || folderId,
        description: config.description,
        version: config.version || '1.0.0',
        path: `/projects/${folderId}`,
      });
    } catch (err) {
      console.error(`Failed to parse zplc.json at ${path}:`, err);
    }
  }

  return projects;
}

// =============================================================================
// Project Loading
// =============================================================================

/**
 * Load a project by its folder ID
 */
export function loadProject(projectId: string): LoadedProject | null {
  const configPath = `/projects/${projectId}/zplc.json`;
  const configContent = projectConfigModules[configPath];

  if (!configContent) {
    console.error(`Project not found: ${projectId}`);
    return null;
  }

  try {
    const zplcConfig = JSON.parse(configContent) as ZPLCConfig;
    const files = loadProjectFiles(projectId);
    const config = zplcConfigToProjectConfig(zplcConfig);

    return {
      path: `/projects/${projectId}`,
      zplcConfig,
      files,
      config,
    };
  } catch (err) {
    console.error(`Failed to load project ${projectId}:`, err);
    return null;
  }
}

/**
 * Load all source files for a project from the src/ directory
 */
function loadProjectFiles(projectId: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const srcPrefix = `/projects/${projectId}/src/`;

  for (const [path, content] of Object.entries(projectSourceModules)) {
    if (!path.startsWith(srcPrefix)) continue;

    // Get just the filename without the src/ prefix
    const filename = path.substring(srcPrefix.length);
    const language = getLanguageFromFilename(filename);
    const fileId = `${projectId}-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;

    files.push({
      id: fileId,
      name: filename,
      language,
      content,
      isModified: false,
      path: `src/${filename}`,    // Store relative path from project root
    });
  }

  // Sort files: main first, then alphabetically
  files.sort((a, b) => {
    const aIsMain = a.name.toLowerCase().startsWith('main');
    const bIsMain = b.name.toLowerCase().startsWith('main');
    if (aIsMain && !bIsMain) return -1;
    if (!aIsMain && bIsMain) return 1;
    return a.name.localeCompare(b.name);
  });

  return files;
}

/**
 * Convert ZPLCConfig to runtime ProjectConfig
 */
function zplcConfigToProjectConfig(config: ZPLCConfig): ProjectConfig {
  // Get the first task's first program as the start POU
  const firstTask = config.tasks?.[0];
  const firstProgram = firstTask?.programs?.[0] || 'Main';

  return {
    name: config.name,
    taskMode: firstTask?.trigger === 'cyclic' ? 'cyclic' : 'freewheeling',
    cycleTimeMs: firstTask?.interval || 10,
    priority: firstTask?.priority || 1,
    watchdogMs: firstTask?.watchdog || 100,
    startPOU: firstProgram,
  };
}

// =============================================================================
// Default Project
// =============================================================================

const DEFAULT_PROJECT_ID = 'blinky';

/**
 * Load the default project (blinky)
 */
export function loadDefaultProject(): LoadedProject | null {
  return loadProject(DEFAULT_PROJECT_ID);
}

/**
 * Get the default project ID
 */
export function getDefaultProjectId(): string {
  return DEFAULT_PROJECT_ID;
}

// =============================================================================
// File Content Helpers
// =============================================================================

/**
 * Get file content by project and filename (looks in src/)
 */
export function getFileContent(projectId: string, filename: string): string | null {
  // Try src/ path first
  const srcPath = `/projects/${projectId}/src/${filename}`;
  if (projectSourceModules[srcPath]) {
    return projectSourceModules[srcPath];
  }
  
  // Fallback: try without src/ (for backwards compatibility)
  const directPath = `/projects/${projectId}/${filename}`;
  return projectSourceModules[directPath] || null;
}

/**
 * Check if a project exists
 */
export function projectExists(projectId: string): boolean {
  const configPath = `/projects/${projectId}/zplc.json`;
  return configPath in projectConfigModules;
}

// =============================================================================
// Language Helpers (re-export for convenience)
// =============================================================================

export { getLanguageFromFilename };

/**
 * Get file extension for visual languages (LD, FBD, SFC use .json internally)
 */
export function getFileExtension(language: PLCLanguage): string {
  switch (language) {
    case 'ST': return '.st';
    case 'IL': return '.il';
    case 'LD': return '.ld.json';
    case 'FBD': return '.fbd.json';
    case 'SFC': return '.sfc.json';
    default: return '.st';
  }
}
