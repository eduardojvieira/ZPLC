/**
 * File System Access API Utilities
 * 
 * Provides functions for opening directories, reading files, and writing
 * changes back to disk using the browser's File System Access API.
 * 
 */

import type {
  FileTreeNode,
  ZPLCProjectConfig,
  ZPLCProjectV2,
  ProjectFileWithHandle,
  POUType,
} from '../types';
import { parseAndMigrateProject, type ProjectMigrationChange, type ProjectModelDiagnostic } from '../project/projectModel';
import { 
  getLanguageFromFilename,
  DEFAULT_ZPLC_CONFIG,
} from '../types';

const PROJECT_CONFIG_MAX_BYTES = 128 * 1024;

// =============================================================================
// Feature Detection
// =============================================================================

/** Check if File System Access API is supported */
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

// =============================================================================
// Directory Picker
// =============================================================================

/**
 * Open a directory picker dialog
 * @returns Directory handle or null if cancelled
 */
export async function openDirectoryPicker(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser. Use Chrome or Edge.');
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });
    return handle;
  } catch (err) {
    // User cancelled the picker
    if (err instanceof Error && err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

// =============================================================================
// Directory Reading
// =============================================================================

/** File extensions we care about for ZPLC projects */
const ZPLC_EXTENSIONS = ['.st', '.il', '.ld.json', '.fbd.json', '.sfc.json', '.gvl'];
const IGNORED_DIRS = ['node_modules', '.git', 'build', 'dist', '.vscode'];

export function fileTreeFileId(path: string): string {
  return `file:${path}`;
}

function fileTreeDirectoryId(path: string): string {
  return `dir:${path || '/'}`;
}

/**
 * Recursively read a directory and build a file tree
 */
export async function readDirectoryRecursive(
  dirHandle: FileSystemDirectoryHandle,
  path: string = ''
): Promise<FileTreeNode> {
  const children: FileTreeNode[] = [];

  for await (const entry of dirHandle.values()) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      // Skip ignored directories
      if (IGNORED_DIRS.includes(entry.name)) {
        continue;
      }

      const subDirHandle = await dirHandle.getDirectoryHandle(entry.name);
      const subtree = await readDirectoryRecursive(subDirHandle, entryPath);
      
      // Only include directories that have relevant files
      if (subtree.children && subtree.children.length > 0) {
        children.push(subtree);
      }
    } else if (entry.kind === 'file') {
      // Skip config files - they're managed through ProjectSettings, not the tree
      if (entry.name === 'zplc.json' || entry.name === 'project.yaml') {
        continue;
      }

      // Check if it's a ZPLC-relevant source file
      const isRelevant = ZPLC_EXTENSIONS.some(ext => entry.name.endsWith(ext));

      if (isRelevant) {
        const fileHandle = await dirHandle.getFileHandle(entry.name);
        const language = getLanguageFromFilename(entry.name);
        const pouType = detectPOUType(entry.name);

        children.push({
          id: fileTreeFileId(entryPath),
          name: entry.name,
          type: 'file',
          path: entryPath,
          language,
          pouType,
          handle: fileHandle,
        });
      }
    }
  }

  // Sort: directories first, then files alphabetically
  children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    id: fileTreeDirectoryId(path),
    name: dirHandle.name,
    type: 'directory',
    path: path || '/',
    children,
    dirHandle,
    isExpanded: path === '', // Root is expanded by default
  };
}

/**
 * Detect POU type from filename
 */
function detectPOUType(filename: string): POUType | undefined {
  // GVL files have .gvl extension
  if (filename.endsWith('.gvl')) return 'GVL';
  
  // For .st files, we'd need to parse content to determine PRG/FB/FUN
  // For now, assume PRG for .st files in src/ and FB for files in fb/
  // This is a heuristic - proper detection requires parsing
  return undefined;
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Read file content from a file handle
 */
export async function readFileContent(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
}

/**
 * Write content to a file handle
 */
export async function writeFileContent(
  handle: FileSystemFileHandle,
  content: string
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Load a specific file from the file tree
 */
export async function loadFileFromTree(
  node: FileTreeNode
): Promise<ProjectFileWithHandle | null> {
  if (node.type !== 'file' || !node.handle) {
    return null;
  }

  const content = await readFileContent(node.handle);

  return {
    id: node.id,
    name: node.name,
    language: node.language || 'ST',
    content,
    isModified: false,
    path: node.path,
    handle: node.handle,
    parentPath: node.path.substring(0, node.path.lastIndexOf('/')),
  };
}

// =============================================================================
// Project Configuration (zplc.json)
// =============================================================================

/**
 * Read zplc.json from a directory
 */
export type ProjectConfigReadResult =
  | { kind: 'missing' }
  | { kind: 'valid'; config: ZPLCProjectV2; changed: boolean; sourceSchemaVersion: 1 | 2; changes: ProjectMigrationChange[] }
  | { kind: 'invalid'; diagnostics: ProjectModelDiagnostic[] };

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotFoundError';
}

async function assertProjectFileAbsent(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
  path: string,
): Promise<void> {
  try {
    await dirHandle.getFileHandle(name);
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw new Error(`Cannot create project: unable to inspect ${path}`);
  }
  throw new Error(`Cannot create project: ${path} already exists`);
}

async function preflightNewProject(dirHandle: FileSystemDirectoryHandle): Promise<void> {
  await assertProjectFileAbsent(dirHandle, 'zplc.json', 'zplc.json');
  await assertProjectFileAbsent(dirHandle, '.gitignore', '.gitignore');

  let srcHandle: FileSystemDirectoryHandle;
  try {
    srcHandle = await dirHandle.getDirectoryHandle('src');
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw new Error('Cannot create project: unable to inspect src');
  }

  await assertProjectFileAbsent(srcHandle, 'main.st', 'src/main.st');
  await assertProjectFileAbsent(srcHandle, 'globals.gvl', 'src/globals.gvl');
}

export async function readProjectConfig(
  dirHandle: FileSystemDirectoryHandle
): Promise<ProjectConfigReadResult> {
  let configHandle: FileSystemFileHandle;
  try {
    configHandle = await dirHandle.getFileHandle('zplc.json');
  } catch (error) {
    if (!isNotFoundError(error)) return { kind: 'invalid', diagnostics: [{ path: '$', message: 'Unable to read project configuration' }] };
    try {
      await dirHandle.getFileHandle('project.yaml');
      console.warn('Found unsupported project.yaml; zplc.json was not created automatically');
    } catch {
      // No legacy project file is also a missing configuration.
    }
    return { kind: 'missing' };
  }

  try {
    const file = await configHandle.getFile();
    if (file.size > PROJECT_CONFIG_MAX_BYTES) {
      return { kind: 'invalid', diagnostics: [{ path: '$', message: 'Project configuration exceeds the size limit' }] };
    }
    const content = await file.text();
    const parsed = parseAndMigrateProject(JSON.parse(content) as unknown);
    return parsed.ok
      ? { kind: 'valid', config: parsed.project, changed: parsed.changed, sourceSchemaVersion: parsed.sourceSchemaVersion, changes: parsed.changes }
      : { kind: 'invalid', diagnostics: parsed.diagnostics };
  } catch {
    return { kind: 'invalid', diagnostics: [{ path: '$', message: 'Unable to parse project configuration' }] };
  }
}

/**
 * Write zplc.json to a directory
 */
export async function writeProjectConfig(
  dirHandle: FileSystemDirectoryHandle,
  config: ZPLCProjectConfig
): Promise<ZPLCProjectV2> {
  const parsed = parseAndMigrateProject(config);
  if (!parsed.ok) throw new Error('Project configuration is invalid');
  const content = JSON.stringify(parsed.project, null, 2);
  const configHandle = await dirHandle.getFileHandle('zplc.json', { create: true });
  await writeFileContent(configHandle, content);
  return parsed.project;
}

// =============================================================================
// New Project Creation
// =============================================================================

/**
 * Create a new ZPLC project structure in a directory
 */
export async function createNewProject(
  dirHandle: FileSystemDirectoryHandle,
  projectName: string
): Promise<ZPLCProjectV2> {
  await preflightNewProject(dirHandle);

  // Create zplc.json
  const config: ZPLCProjectV2 = {
    ...DEFAULT_ZPLC_CONFIG,
    name: projectName,
  };
  try {
    await writeProjectConfig(dirHandle, config);

    // Create src directory
    const srcHandle = await dirHandle.getDirectoryHandle('src', { create: true });

    // Create main.st with template
    const mainHandle = await srcHandle.getFileHandle('main.st', { create: true });
    const mainContent = `(* =============================================================================
 * ${projectName} - Main Program
 * ============================================================================= *)

PROGRAM Main
VAR
    (* Declare your variables here *)
    Counter : INT := 0;
END_VAR

(* Main program logic *)
Counter := Counter + 1;

IF Counter > 1000 THEN
    Counter := 0;
END_IF;

END_PROGRAM
`;
    await writeFileContent(mainHandle, mainContent);

    // Create globals.gvl
    const globalsHandle = await srcHandle.getFileHandle('globals.gvl', { create: true });
    const globalsContent = `(* =============================================================================
 * Global Variable List
 * ============================================================================= *)

VAR_GLOBAL
    (* Define global variables here *)
    SystemReady : BOOL := FALSE;
END_VAR
`;
    await writeFileContent(globalsHandle, globalsContent);

    // Create .gitignore
    const gitignoreHandle = await dirHandle.getFileHandle('.gitignore', { create: true });
    const gitignoreContent = `# Build output
build/
*.bin
*.hex

# IDE files
.vscode/

# OS files
.DS_Store
Thumbs.db
`;
    await writeFileContent(gitignoreHandle, gitignoreContent);

    return config;
  } catch {
    throw new Error('Project creation stopped. The folder may contain incomplete project files; review the folder before trying again.');
  }
}

// =============================================================================
// Bundled example copying
// =============================================================================

export type ProjectCopyFile = { path: string; content: string };

function splitCopyPath(path: string): string[] {
  if (!path || path.startsWith('/') || /^[a-z]:\//i.test(path) || path.includes('\\') || path.includes('\0')) throw new Error(`Cannot copy example: unsafe path ${path || '(empty)'}`);
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error(`Cannot copy example: unsafe path ${path}`);
  return segments;
}

async function directoryForCopy(root: FileSystemDirectoryHandle, segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let directory = root;
  for (const segment of segments) {
    try {
      directory = await directory.getDirectoryHandle(segment, create ? { create: true } : undefined);
    } catch (error) {
      if (isNotFoundError(error)) throw error;
      throw new Error(`Cannot copy example: unable to inspect ${segments.join('/')}`);
    }
  }
  return directory;
}

async function assertCopyTargetAbsent(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const segments = splitCopyPath(path);
  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    try {
      directory = await directory.getDirectoryHandle(segment);
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw new Error(`Cannot copy example: unable to inspect ${path}`);
    }
  }
  await assertProjectFileAbsent(directory, segments.at(-1)!, path);
}

/** Copy a validated example into a destination without overwriting user files. */
export async function copyProjectToFolder(
  dirHandle: FileSystemDirectoryHandle,
  config: ZPLCProjectConfig,
  files: readonly ProjectCopyFile[],
): Promise<ZPLCProjectV2> {
  const portableConfig = { ...config } as ZPLCProjectConfig & { $schema?: unknown };
  delete portableConfig.$schema;
  const parsed = parseAndMigrateProject(portableConfig);
  if (!parsed.ok) throw new Error('Cannot copy example: project configuration is invalid');

  const destinations = new Map<string, string>();
  for (const file of files) {
    splitCopyPath(file.path);
    const destination = file.path.toLocaleLowerCase('en-US');
    if (destination === 'zplc.json') throw new Error('Cannot copy example: zplc.json is managed separately');
    if (destinations.has(destination)) throw new Error(`Cannot copy example: duplicate destination ${file.path}`);
    destinations.set(destination, file.path);
  }
  if (destinations.has('zplc.json')) throw new Error('Cannot copy example: zplc.json is managed separately');
  destinations.set('zplc.json', 'zplc.json');
  for (const path of destinations.values()) await assertCopyTargetAbsent(dirHandle, path);

  try {
    for (const file of files) {
      const segments = splitCopyPath(file.path);
      const directory = await directoryForCopy(dirHandle, segments.slice(0, -1), true);
      await writeFileContent(await directory.getFileHandle(segments.at(-1)!, { create: true }), file.content);
    }
    await writeProjectConfig(dirHandle, parsed.project);
    return parsed.project;
  } catch {
    throw new Error('Example copy stopped. The folder may contain incomplete copied files; review the folder before trying again.');
  }
}

// =============================================================================
// File Tree Utilities
// =============================================================================

/**
 * Find a file node in the tree by path
 */
export function findFileInTree(tree: FileTreeNode, path: string): FileTreeNode | null {
  if (tree.path === path) {
    return tree;
  }

  if (tree.children) {
    for (const child of tree.children) {
      const found = findFileInTree(child, path);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Collect all file paths from a tree (flat list)
 */
export function collectFilePaths(tree: FileTreeNode): string[] {
  const paths: string[] = [];

  function traverse(node: FileTreeNode) {
    if (node.type === 'file') {
      paths.push(node.path);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  }

  traverse(tree);
  return paths;
}

/**
 * Toggle directory expansion in tree (immutable update)
 */
export function toggleDirectoryExpanded(
  tree: FileTreeNode,
  dirPath: string
): FileTreeNode {
  if (tree.path === dirPath && tree.type === 'directory') {
    return { ...tree, isExpanded: !tree.isExpanded };
  }

  if (tree.children) {
    return {
      ...tree,
      children: tree.children.map(child => toggleDirectoryExpanded(child, dirPath)),
    };
  }

  return tree;
}
