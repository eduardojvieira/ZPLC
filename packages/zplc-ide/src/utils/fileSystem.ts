/**
 * File System Access API Utilities
 * 
 * Provides functions for opening directories, reading files, and writing
 * changes back to disk using the browser's File System Access API.
 * 
 */

import type {
  FileTreeNode,
  PLCLanguage,
  ZPLCProjectConfig,
  ZPLCProjectV2,
  ProjectFileWithHandle,
  POUType,
} from '../types';
import { parseAndMigrateProject, type ProjectMigrationChange, type ProjectModelDiagnostic } from '../project/projectModel';
import { 
  getExtensionForLanguage,
  getLanguageFromFilename,
  isFileSystemAccessSupported,
} from '../types';
import { newProjectConfig, newProjectProgram, SIMULATION_TARGET, type NewProjectChoices } from '../project/newProject';
import { chooseProjectFolder } from '../ipc/projectFilesHandles';

const PROJECT_CONFIG_MAX_BYTES = 128 * 1024;

// =============================================================================
// Feature Detection
// =============================================================================

export { isFileSystemAccessSupported };

// =============================================================================
// Directory Picker
// =============================================================================

/**
 * Open a directory picker dialog. In the desktop app the main process shows the native dialog and owns the
 * chosen root; the renderer gets handles over typed requests and never a filesystem permission (IDE-001).
 * @returns Directory handle or null if cancelled
 */
export async function openDirectoryPicker(): Promise<FileSystemDirectoryHandle | null> {
  const bridge = window.electronAPI?.projectFiles;
  if (bridge) return chooseProjectFolder(bridge);
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

/**
 * The programs of a ZPLC project: .st, .il and the visual languages as .ld.json, .fbd.json and .sfc.json. The short
 * .ld, .fbd and .sfc are programs too, because earlier versions created New File files with them, and the match
 * ignores case the way getLanguageFromFilename does. This is the rule of SUPPORTED_SOURCE in cli/workspace.ts, which
 * the build uses (a test keeps the two in step), so a task can pick exactly the files the build reads.
 */
const PROGRAM_SOURCE_FILE = /\.(st|il|(ld|fbd|sfc)(\.json)?)$/i;
const GVL_FILE = /\.gvl$/i;

/** True for a file the build reads as a program (and a task can run). */
export function isProgramSourceFile(name: string): boolean {
  return PROGRAM_SOURCE_FILE.test(name);
}

/** Files we list for a ZPLC project: the programs and the .gvl files. */
function isZplcSourceFile(name: string): boolean {
  return PROGRAM_SOURCE_FILE.test(name) || GVL_FILE.test(name);
}

const IGNORED_DIRS = ['node_modules', '.git', 'build', 'dist', '.vscode'];

/**
 * The programs a task can pick from the file tree, searched recursively, under the name a task uses for each:
 * main.ld.json is "main.ld", the same name as the legacy main.ld, and main.st stays "main.st".
 */
export function listTaskPrograms(fileTree: FileTreeNode | null): string[] {
  const programs = new Set<string>();
  const collect = (node: FileTreeNode) => {
    if (node.type === 'file' && isProgramSourceFile(node.name)) programs.add(node.name.replace(/(\.(?:ld|fbd|sfc))\.json$/i, '$1'));
    node.children?.forEach(collect);
  };
  if (fileTree) collect(fileTree);
  return [...programs].sort();
}

/**
 * The name the build compares to tell whether two source files are the same: case-insensitive, and main.ld is
 * main.ld.json. It is the rule behind WORKSPACE_DUPLICATE_SOURCE in cli/workspace.ts (a test keeps the two in step).
 */
export function sourceNameKey(name: string): string {
  return name.toLowerCase().replace(/\.(ld|fbd|sfc)$/, '$&.json');
}

/** The file in this folder that the build would read as the same file as `fileName`, or undefined. */
export function findSameSourceName(folder: FileTreeNode, fileName: string): FileTreeNode | undefined {
  const key = sourceNameKey(fileName);
  return folder.children?.find((child) => child.type === 'file' && sourceNameKey(child.name) === key);
}

/** New File refused the name because the folder already has that file, or one the build reads as the same file. */
export class FileNameTakenError extends Error {
  constructor(existing: string, wanted: string) {
    super(existing === wanted
      ? `${existing} already exists.`
      : `${existing} already exists, and the build reads it as the same name as ${wanted}. Choose another name.`);
    this.name = 'FileNameTakenError';
  }
}

/**
 * The file name New File saves a typed name under: the language's extension, once. A typed suffix of the same
 * language (pump.ld, PUMP.LD.JSON) is not doubled, and keeps the case of the name before it; the suffix of another
 * language is part of the name. The text languages keep their exact-match rule.
 */
export function fileNameForNewFile(typed: string, language: PLCLanguage): string {
  const extension = getExtensionForLanguage(language);
  if (!extension.endsWith('.json')) return typed.endsWith(extension) ? typed : `${typed}${extension}`;
  const lowerCased = typed.toLowerCase();
  const typedSuffix = [extension, extension.replace(/\.json$/, '')].find((suffix) => lowerCased.endsWith(suffix));
  return `${typedSuffix ? typed.slice(0, -typedSuffix.length) : typed}${extension}`;
}

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
  return (await readTree(dirHandle, path)).node;
}

/** `entries` is how many entries the folder holds at all: a folder with none is a new one, and is listed. */
async function readTree(dirHandle: FileSystemDirectoryHandle, path: string): Promise<{ node: FileTreeNode; entries: number }> {
  const children: FileTreeNode[] = [];
  let entries = 0;

  for await (const entry of dirHandle.values()) {
    entries += 1;
    const entryPath = path ? `${path}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      // Skip ignored directories
      if (IGNORED_DIRS.includes(entry.name)) {
        continue;
      }

      const subDirHandle = await dirHandle.getDirectoryHandle(entry.name);
      const subtree = await readTree(subDirHandle, entryPath);

      // Include directories that have relevant files, and those that hold nothing yet (a folder just created in Studio)
      if ((subtree.node.children && subtree.node.children.length > 0) || subtree.entries === 0) {
        children.push(subtree.node);
      }
    } else if (entry.kind === 'file') {
      // Skip config files - they're managed through ProjectSettings, not the tree
      if (entry.name === 'zplc.json' || entry.name === 'project.yaml') {
        continue;
      }

      // Check if it's a ZPLC-relevant source file
      if (isZplcSourceFile(entry.name)) {
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
    node: {
      id: fileTreeDirectoryId(path),
      name: dirHandle.name,
      type: 'directory',
      path: path || '/',
      children,
      dirHandle,
      isExpanded: path === '', // Root is expanded by default
    },
    entries,
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
    diskContent: content,
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

async function preflightNewProject(dirHandle: FileSystemDirectoryHandle, language: PLCLanguage = 'ST'): Promise<void> {
  await assertProjectFileAbsent(dirHandle, 'zplc.json', 'zplc.json');
  await assertProjectFileAbsent(dirHandle, '.gitignore', '.gitignore');

  let srcHandle: FileSystemDirectoryHandle;
  try {
    srcHandle = await dirHandle.getDirectoryHandle('src');
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw new Error('Cannot create project: unable to inspect src');
  }

  const program = `main${getExtensionForLanguage(language)}`;
  await assertProjectFileAbsent(srcHandle, program, `src/${program}`);
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
  projectName: string,
  choices: NewProjectChoices = { target: SIMULATION_TARGET, language: 'ST' },
): Promise<ZPLCProjectV2> {
  await preflightNewProject(dirHandle, choices.language);

  // Create zplc.json
  const config = newProjectConfig(projectName, choices);
  try {
    await writeProjectConfig(dirHandle, config);

    // Create src directory
    const srcHandle = await dirHandle.getDirectoryHandle('src', { create: true });

    // Create the first program (main.st unless another language was chosen)
    const program = newProjectProgram(projectName, choices.language);
    const mainHandle = await srcHandle.getFileHandle(program.fileName, { create: true });
    await writeFileContent(mainHandle, program.content);

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
