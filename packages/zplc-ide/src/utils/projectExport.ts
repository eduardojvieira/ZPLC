import type { FileTreeNode, PLCLanguage, ProjectFileWithHandle } from '../types';
import { loadFileFromTree } from './fileSystem';

export interface ExportedProjectFile {
  name: string;
  path: string;
  language: PLCLanguage;
  content: string;
}

/** Materialize every source file without changing buffers or the project tree. */
export async function collectProjectFilesForExport(
  fileTree: FileTreeNode,
  loadedFiles: ReadonlyMap<string, ProjectFileWithHandle>,
): Promise<ExportedProjectFile[]> {
  const files: ExportedProjectFile[] = [];
  const paths = new Set<string>();

  const visit = async (node: FileTreeNode): Promise<void> => {
    if (node.type === 'directory') {
      for (const child of node.children ?? []) await visit(child);
      return;
    }

    if (paths.has(node.path)) throw new Error(`Duplicate project file: ${node.path}`);
    paths.add(node.path);

    let file = loadedFiles.get(node.id);
    if (!file) {
      try {
        file = await loadFileFromTree(node) ?? undefined;
      } catch (error) {
        throw new Error(`Could not read project file ${node.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!file) throw new Error(`Could not read project file ${node.path}: missing file handle`);

    files.push({ name: file.name, path: file.path, language: file.language, content: file.content });
  };

  await visit(fileTree);
  return files;
}
