import type { FileTreeNode, PLCLanguage, ProjectFileWithHandle, ZPLCProjectConfig } from '../types';
import { loadFileFromTree } from './fileSystem';

export const SENSITIVE_PROJECT_CONFIG_PATHS = [
  'network.wifi.password',
  'communication.mqtt.password',
  'communication.mqtt.azureSasKey',
  'communication.mqtt.clientKeyPath',
  'communication.mqtt.awsClaimKeyPath',
] as const;

type SensitiveProjectConfigPath = (typeof SENSITIVE_PROJECT_CONFIG_PATHS)[number];

export interface RedactedProjectConfigExport {
  config: ZPLCProjectConfig;
  redactedPaths: SensitiveProjectConfigPath[];
}

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

function getPathValue(config: unknown, path: SensitiveProjectConfigPath): unknown {
  let value: unknown = config;
  for (const segment of path.split('.')) {
    if (value === null || typeof value !== 'object' || !(segment in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function deletePath(config: Record<string, unknown>, path: SensitiveProjectConfigPath): boolean {
  const segments = path.split('.');
  const leaf = segments.pop();
  let parent: Record<string, unknown> = config;

  for (const segment of segments) {
    const next = parent[segment];
    if (next === null || typeof next !== 'object') {
      return false;
    }
    parent = next as Record<string, unknown>;
  }

  if (!leaf || !Object.prototype.hasOwnProperty.call(parent, leaf)) {
    return false;
  }
  delete parent[leaf];
  return true;
}

export function findNonEmptySensitiveProjectConfigPaths(config: unknown): SensitiveProjectConfigPath[] {
  return SENSITIVE_PROJECT_CONFIG_PATHS.filter((path) => {
    const value = getPathValue(config, path);
    return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
  });
}

export function redactProjectConfigForExport(config: ZPLCProjectConfig): RedactedProjectConfigExport {
  const exportedConfig = structuredClone(config);
  const mutableConfig = exportedConfig as unknown as Record<string, unknown>;
  const redactedPaths = SENSITIVE_PROJECT_CONFIG_PATHS.filter((path) => deletePath(mutableConfig, path));

  return { config: exportedConfig, redactedPaths };
}
