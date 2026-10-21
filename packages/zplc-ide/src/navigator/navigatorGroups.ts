/**
 * What the project navigator lists when it is organised by PLC objects (UX-012): programs, function blocks, functions,
 * data types and global variables from the project's sources, and tasks, I/O mapping, communication and device from
 * `zplc.json`. A file that declares several objects is listed under each kind it declares. Apart from drawing it.
 */
import type { MessageKey } from '../i18n';
import type { DeclarationKind, FileDeclarations } from '../project/projectDeclarations';
import type { GlobalVariable } from '../project/globalVariables';
import { displayEditorFileName } from '../components/editorFilePresentation';
import type { FileTreeNode, ZPLCProjectConfig } from '../types';
import type { ConfigEditorKind } from './configEditors';

export const NAVIGATOR_GROUP_IDS = [
  'programs',
  'functionBlocks',
  'functions',
  'dataTypes',
  'globals',
  'tasks',
  'io',
  'communication',
  'device',
] as const;
export type NavigatorGroupId = (typeof NAVIGATOR_GROUP_IDS)[number];

export type NavigatorTarget = { kind: 'source'; path: string; line: number; column: number } | { kind: 'config'; editor: ConfigEditorKind };

export interface NavigatorItem {
  key: string;
  label: string;
  /** What kind of thing it is or its main setting, as a short phrase. */
  detail?: string;
  target: NavigatorTarget;
}

export interface NavigatorGroup {
  id: NavigatorGroupId;
  titleKey: MessageKey;
  items: NavigatorItem[];
}

export const GROUP_TITLE_KEYS: Record<NavigatorGroupId, MessageKey> = {
  programs: 'navigator.group.programs',
  functionBlocks: 'navigator.group.functionBlocks',
  functions: 'navigator.group.functions',
  dataTypes: 'navigator.group.dataTypes',
  globals: 'navigator.group.globals',
  tasks: 'navigator.group.tasks',
  io: 'navigator.group.io',
  communication: 'navigator.group.communication',
  device: 'navigator.group.device',
};

/** The words of the phrases that depend on the language, supplied by the caller so that this stays free of it. */
export interface NavigatorWords {
  kind: Record<'STRUCT' | 'ENUM' | 'TYPE' | 'INTERFACE', string>;
  constant: string;
  noTasks: string;
  task: (task: { trigger: string; intervalMs?: number; priority: number }) => string;
  inputs: (count: number) => string;
  outputs: (count: number) => string;
  tags: (count: number) => string;
  target: string;
  network: string;
  on: string;
  off: string;
}

const DATA_TYPE_KINDS: ReadonlySet<DeclarationKind> = new Set(['STRUCT', 'ENUM', 'TYPE', 'INTERFACE']);
const VISUAL_OR_LIST_PROGRAM: ReadonlySet<string> = new Set(['LD', 'FBD', 'SFC', 'IL']);

function fileNodes(tree: FileTreeNode | null): FileTreeNode[] {
  const found: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') found.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  return found;
}

export interface NavigatorInput {
  declarations: readonly FileDeclarations[];
  globals: readonly GlobalVariable[];
  fileTree: FileTreeNode | null;
  config: ZPLCProjectConfig | null;
}

/** The nine groups in their fixed order; a group with nothing in it is still returned, so the navigator shows where an object would go. */
export function buildNavigatorGroups({ declarations, globals, fileTree, config }: NavigatorInput, words: NavigatorWords): NavigatorGroup[] {
  const declared = declarations.flatMap((group) => group.declarations);
  const source = (name: string, kind: string, file: string, line: number, column: number, detail?: string): NavigatorItem => ({
    key: `${kind}:${file}:${name}`,
    label: name,
    detail: detail ?? file,
    target: { kind: 'source', path: file, line, column },
  });
  const ofKind = (...kinds: DeclarationKind[]): NavigatorItem[] =>
    declared
      .filter((declaration) => kinds.includes(declaration.kind))
      .map((declaration) => source(declaration.name, declaration.kind, declaration.file, declaration.line, declaration.column));

  // A diagram or an instruction list is one program in one file; it is named after its file.
  const filePrograms: NavigatorItem[] = fileNodes(fileTree)
    .filter((node) => node.language !== undefined && VISUAL_OR_LIST_PROGRAM.has(node.language))
    .map((node) =>
      source(
        displayEditorFileName(node.name, node.language!).replace(/\.[^.]+$/, ''),
        node.language!,
        node.path,
        1,
        1,
        `${node.language} · ${node.path}`,
      ),
    );

  const tasks = config?.tasks ?? [];
  const taskItems: NavigatorItem[] =
    tasks.length === 0
      ? [{ key: 'task:none', label: words.noTasks, target: { kind: 'config', editor: 'tasks' } }]
      : tasks.map((task, index) => ({
          key: `task:${index}:${task.name}`,
          label: task.name,
          detail: words.task({ trigger: task.trigger, intervalMs: task.interval_ms, priority: task.priority }),
          target: { kind: 'config', editor: 'tasks' },
        }));
  const tagCount = (config?.communication?.bindings?.length ?? 0) || (config?.communication?.tags?.length ?? 0);
  const configItem = (key: string, label: string, editor: ConfigEditorKind, detail?: string): NavigatorItem => ({
    key,
    label,
    detail,
    target: { kind: 'config', editor },
  });

  const groups: Record<NavigatorGroupId, NavigatorItem[]> = {
    programs: [...ofKind('PROGRAM'), ...filePrograms].sort((left, right) => left.label.localeCompare(right.label)),
    functionBlocks: ofKind('FUNCTION_BLOCK'),
    functions: ofKind('FUNCTION'),
    dataTypes: declared
      .filter((declaration) => DATA_TYPE_KINDS.has(declaration.kind))
      .map((declaration) =>
        source(
          declaration.name,
          declaration.kind,
          declaration.file,
          declaration.line,
          declaration.column,
          `${words.kind[declaration.kind as keyof NavigatorWords['kind']]} · ${declaration.file}`,
        ),
      ),
    globals: globals.map((variable) =>
      source(
        variable.name,
        'VAR_GLOBAL',
        variable.file,
        variable.line,
        variable.column,
        variable.constant ? `${words.constant} · ${variable.file}` : variable.file,
      ),
    ),
    tasks: taskItems,
    io: config
      ? [
          configItem('io:inputs', words.inputs(config.io?.inputs?.length ?? 0), 'io'),
          configItem('io:outputs', words.outputs(config.io?.outputs?.length ?? 0), 'io'),
        ]
      : [],
    communication: config
      ? [
          configItem('communication:modbus', 'Modbus', 'communication', config.communication?.modbus?.enabled ? words.on : words.off),
          configItem('communication:mqtt', 'MQTT', 'communication', config.communication?.mqtt?.enabled ? words.on : words.off),
          configItem('communication:tags', words.tags(tagCount), 'communication'),
        ]
      : [],
    device: config
      ? [
          configItem('device:target', words.target, 'target', config.target?.board),
          configItem('device:network', words.network, 'network', config.network?.hostname),
        ]
      : [],
  };
  return NAVIGATOR_GROUP_IDS.map((id) => ({ id, titleKey: GROUP_TITLE_KEYS[id], items: groups[id] }));
}
