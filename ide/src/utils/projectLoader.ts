/**
 * ZPLC Project Loader
 * 
 * Handles loading project files from the projects/ directory.
 * Uses Vite's import.meta.glob for build-time file discovery.
 */

import yaml from 'js-yaml';
import type {
  ProjectFile,
  ProjectYAML,
  ProjectConfig,
  LoadedProject,
  PLCLanguage,
} from '../types';
import { getLanguageFromFilename } from '../types';

// =============================================================================
// Vite Glob Imports - Build-time file discovery
// =============================================================================

// Import all project.yaml files
const projectYamlModules = import.meta.glob<string>(
  '/projects/*/project.yaml',
  { query: '?raw', import: 'default', eager: true }
);

// Import all source files from projects
const projectSourceModules = import.meta.glob<string>(
  '/projects/*/*.{st,il,ld.json,fbd.json,sfc.json}',
  { query: '?raw', import: 'default', eager: true }
);

// =============================================================================
// Project Discovery
// =============================================================================

export interface ProjectInfo {
  id: string;           // Folder name (e.g., "blinky")
  name: string;         // Display name from project.yaml
  description?: string;
  version: string;
  path: string;         // Full path to project folder
}

/**
 * Get list of all available projects
 */
export function getAvailableProjects(): ProjectInfo[] {
  const projects: ProjectInfo[] = [];

  for (const [path, content] of Object.entries(projectYamlModules)) {
    try {
      const yamlData = yaml.load(content) as ProjectYAML;
      
      // Extract project folder name from path: /projects/blinky/project.yaml -> blinky
      const match = path.match(/\/projects\/([^/]+)\/project\.yaml$/);
      if (!match) continue;
      
      const folderId = match[1];
      
      projects.push({
        id: folderId,
        name: yamlData.name,
        description: yamlData.description,
        version: yamlData.version,
        path: `/projects/${folderId}`,
      });
    } catch (err) {
      console.error(`Failed to parse project.yaml at ${path}:`, err);
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
  const yamlPath = `/projects/${projectId}/project.yaml`;
  const yamlContent = projectYamlModules[yamlPath];

  if (!yamlContent) {
    console.error(`Project not found: ${projectId}`);
    return null;
  }

  try {
    const projectYaml = yaml.load(yamlContent) as ProjectYAML;
    const files = loadProjectFiles(projectId);
    const config = yamlToProjectConfig(projectYaml);

    return {
      path: `/projects/${projectId}`,
      yaml: projectYaml,
      files,
      config,
    };
  } catch (err) {
    console.error(`Failed to load project ${projectId}:`, err);
    return null;
  }
}

/**
 * Load all source files for a project
 */
function loadProjectFiles(projectId: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const prefix = `/projects/${projectId}/`;

  for (const [path, content] of Object.entries(projectSourceModules)) {
    if (!path.startsWith(prefix)) continue;

    const filename = path.substring(prefix.length);
    const language = getLanguageFromFilename(filename);
    const fileId = `${projectId}-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;

    files.push({
      id: fileId,
      name: filename,
      language,
      content,
      isModified: false,
      path,
    });
  }

  // Sort files: entry point first, then by name
  files.sort((a, b) => {
    // Try to get entry point from project.yaml
    const yamlPath = `/projects/${projectId}/project.yaml`;
    const yamlContent = projectYamlModules[yamlPath];
    if (yamlContent) {
      try {
        const yaml_data = yaml.load(yamlContent) as ProjectYAML;
        const entryPoint = yaml_data.entry_point;
        if (a.name === entryPoint) return -1;
        if (b.name === entryPoint) return 1;
      } catch {
        // Ignore parse errors
      }
    }
    return a.name.localeCompare(b.name);
  });

  return files;
}

/**
 * Convert ProjectYAML to runtime ProjectConfig
 */
function yamlToProjectConfig(yaml: ProjectYAML): ProjectConfig {
  // Extract program name from entry_point filename
  const entryName = yaml.entry_point.replace(/\.(st|il|ld\.json|fbd\.json|sfc\.json)$/, '');
  const pouName = entryName.charAt(0).toUpperCase() + entryName.slice(1);

  return {
    name: yaml.name,
    taskMode: 'cyclic',
    cycleTimeMs: 10,
    priority: 1,
    watchdogMs: 100,
    startPOU: pouName,
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
 * Get file content by project and filename
 */
export function getFileContent(projectId: string, filename: string): string | null {
  const path = `/projects/${projectId}/${filename}`;
  return projectSourceModules[path] || null;
}

/**
 * Check if a project exists
 */
export function projectExists(projectId: string): boolean {
  const yamlPath = `/projects/${projectId}/project.yaml`;
  return yamlPath in projectYamlModules;
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
