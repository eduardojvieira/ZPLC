/**
 * File System Access API Utilities
 * 
 * Provides functions for opening directories, reading files, and writing
 * changes back to disk using the browser's File System Access API.
 * 
 * Fallback: If the API is not available (Firefox), we provide virtual
 * project functionality using in-memory storage.
 */

import type {
  FileTreeNode,
  ZPLCProjectConfig,
  ProjectFileWithHandle,
  POUType,
} from '../types';
import { 
  getLanguageFromFilename,
  DEFAULT_ZPLC_CONFIG,
} from '../types';

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
          id: `file-${entryPath.replace(/[^a-zA-Z0-9]/g, '-')}`,
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
    id: `dir-${path || 'root'}`.replace(/[^a-zA-Z0-9]/g, '-'),
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
export async function readProjectConfig(
  dirHandle: FileSystemDirectoryHandle
): Promise<ZPLCProjectConfig | null> {
  try {
    const configHandle = await dirHandle.getFileHandle('zplc.json');
    const content = await readFileContent(configHandle);
    return JSON.parse(content) as ZPLCProjectConfig;
  } catch {
    // zplc.json doesn't exist, try project.yaml for backward compatibility
    try {
      const yamlHandle = await dirHandle.getFileHandle('project.yaml');
      const content = await readFileContent(yamlHandle);
      // Would need js-yaml here, but for now return null
      console.warn('Found project.yaml but yaml parsing not implemented in fileSystem.ts');
      console.log('project.yaml content:', content.substring(0, 200));
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Write zplc.json to a directory
 */
export async function writeProjectConfig(
  dirHandle: FileSystemDirectoryHandle,
  config: ZPLCProjectConfig
): Promise<void> {
  const configHandle = await dirHandle.getFileHandle('zplc.json', { create: true });
  const content = JSON.stringify(config, null, 2);
  await writeFileContent(configHandle, content);
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
): Promise<ZPLCProjectConfig> {
  // Create zplc.json
  const config: ZPLCProjectConfig = {
    ...DEFAULT_ZPLC_CONFIG,
    name: projectName,
  };
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
}

// =============================================================================
// Virtual Project (Fallback for unsupported browsers)
// =============================================================================

/**
 * Create a virtual (in-memory) project for browsers without File System Access API
 */
export function createVirtualProject(name: string): {
  config: ZPLCProjectConfig;
  files: ProjectFileWithHandle[];
  fileTree: FileTreeNode;
} {
  const config: ZPLCProjectConfig = {
    ...DEFAULT_ZPLC_CONFIG,
    name,
  };

  const mainFile: ProjectFileWithHandle = {
    id: 'virtual-main-st',
    name: 'main.st',
    language: 'ST',
    content: `(* ${name} - Main Program *)

PROGRAM Main
VAR
    Counter : INT := 0;
END_VAR

Counter := Counter + 1;

END_PROGRAM
`,
    isModified: false,
    path: 'src/main.st',
    parentPath: 'src',
  };

  const globalsFile: ProjectFileWithHandle = {
    id: 'virtual-globals-gvl',
    name: 'globals.gvl',
    language: 'ST', // GVL uses ST syntax
    content: `(* Global Variables *)

VAR_GLOBAL
    SystemReady : BOOL := FALSE;
END_VAR
`,
    isModified: false,
    path: 'src/globals.gvl',
    parentPath: 'src',
  };

  // Note: zplc.json is intentionally NOT shown in the file tree
  // Users edit config through ProjectSettings, not by editing the JSON directly
  const fileTree: FileTreeNode = {
    id: 'dir-root',
    name: name,
    type: 'directory',
    path: '/',
    isExpanded: true,
    children: [
      {
        id: 'dir-src',
        name: 'src',
        type: 'directory',
        path: 'src',
        isExpanded: true,
        children: [
          {
            id: mainFile.id,
            name: mainFile.name,
            type: 'file',
            path: mainFile.path,
            language: 'ST',
            pouType: 'PRG',
          },
          {
            id: globalsFile.id,
            name: globalsFile.name,
            type: 'file',
            path: globalsFile.path,
            language: 'ST',
            pouType: 'GVL',
          },
        ],
      },
    ],
  };

  return {
    config,
    files: [mainFile, globalsFile],
    fileTree,
  };
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
