/**
 * Editing a function block diagram from the keyboard (LNG-012), as commands on the canvas.
 *
 * The cursor of the editor is the selected block. A key of the table (`../keymap.ts`) is a command: it takes the
 * document's declarations and the nodes and wires of the canvas, and gives back the nodes and wires, what to say, and
 * what to ask the user when the command needs a choice (the block to insert, the symbol to bind, the wire to draw).
 * Nothing here draws or reads the screen, so keyboard authoring is exercised by tests that press keys on a diagram.
 * A command that changes the document is one gesture of the history (LNG-010): the editor commits its result once.
 */

import type { Edge, Node } from '@xyflow/react';
import { getDefaultPorts, type FBDModel } from '../../models/fbd';
import { judgeConnection } from '../../models/pinTypes';
import { findProjectBlock, projectPalette, type ProjectBlock } from '../../models/projectBlocks';
import { FBD_VALUE_BLOCKS, fbdPaletteCategories } from './palette';
import { connectBlocks, edgesToConnections, nodesToBlocks } from './graphModel';
import { getNodeType } from './nodes/nodeType';
import { cursorNode, firstNode, freeId, freePosition, nearestNode, numberedId, selectOnly, type Direction } from '../graphNav';
import type { PickerItem } from '../picker';
import type { CanvasCommands } from '../useCanvasKeyboard';
import { declaredSymbols, sameType, symbolItems } from '../symbols';

export interface FBDState {
  nodes: Node[];
  edges: Edge[];
}

export type FBDPrompt =
  | { kind: 'palette' }
  | { kind: 'bind'; blockId: string }
  | { kind: 'connect'; blockId: string }
  | { kind: 'disconnect'; blockId: string }
  | { kind: 'comment'; blockId: string };

export interface FBDOutcome extends FBDState {
  /** The document changed: the editor commits it as one gesture. */
  changed: boolean;
  /** What the editor announces: where the cursor is, what was done, or why it was not. */
  say: string;
  refused?: boolean;
  prompt?: FBDPrompt;
  /** What the prompt lists. */
  choices?: PickerItem[];
  /** The title of the prompt. */
  title?: string;
  /** Whether the prompt takes text that is not in the list. */
  allowFreeText?: boolean;
}

export interface FBDArgument {
  blockType?: string;
  /** Where the block goes; beside the cursor when absent. */
  position?: { x: number; y: number };
  /** The symbol, instance name or constant that answers a bind prompt. */
  name?: string;
  /** The id of the wire chosen from a connect prompt. */
  wire?: string;
  /** The id of the wire chosen from a disconnect prompt. */
  edgeId?: string;
  /** The comment that answers a comment prompt. */
  text?: string;
}

/** The commands of the table that act on the canvas; the editor itself runs the others. */
export const FBD_MODEL_COMMANDS: readonly string[] = [
  'focusLeft', 'focusRight', 'focusUp', 'focusDown', 'focusFirst', 'insertVariable', 'insertConstant', 'openPalette', 'insertElement',
  'bindVariable', 'connect', 'disconnect', 'editComment', 'deleteSelection',
];

/** The commands of the table that the editor runs because they need the screen: the clipboard, the breakpoint, the list. */
export const FBD_EDITOR_COMMANDS: readonly string[] = ['copySelection', 'pasteSelection', 'toggleBreakpoint', 'showCommands'];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A variable reference: a name, or a member or element of one (`Pump.Run`, `Table[3]`). */
const REFERENCE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]+\])*$/;
const INSTANCE_BLOCKS = /^(TON|TOF|TP|CTU|CTD|CTUD|R_TRIG|F_TRIG|SR|RS)$/;

const data = (node: Node): Record<string, unknown> => node.data as Record<string, unknown>;
const blockType = (node: Node): string => String(data(node).type ?? '');

/** What a block is called when it is announced or listed. */
export function blockTitle(node: Node): string {
  const own = data(node);
  const name = typeof own.variableName === 'string' && own.variableName !== '' ? own.variableName : typeof own.instanceName === 'string' && own.instanceName !== '' ? own.instanceName : undefined;
  if (name) return name;
  const type = blockType(node);
  return type === 'constant' && own.value !== undefined ? `constant ${typeof own.value === 'string' && own.dataType === 'STRING' ? `'${own.value}'` : String(own.value)}` : type;
}

function currentModel(model: FBDModel, state: FBDState): FBDModel {
  return { ...model, blocks: nodesToBlocks(state.nodes), connections: edgesToConnections(state.edges) };
}

const refuse = (state: FBDState, say: string): FBDOutcome => ({ ...state, changed: false, refused: true, say });

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------

/** The blocks the palette of the editor offers as list items: the project's first, then the catalogue's, then the I/O blocks. */
export function paletteChoices(projectBlocks: readonly ProjectBlock[]): PickerItem[] {
  const items: PickerItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, group: string, detail?: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ id, label: id, group, ...(detail ? { detail } : {}) });
  };
  const project = projectPalette(projectBlocks);
  if (project) for (const name of project.blocks) add(name, 'Project', findProjectBlock(projectBlocks, name)?.kind === 'FUNCTION' ? 'function of the project' : 'function block of the project');
  for (const category of fbdPaletteCategories()) for (const name of category.blocks) add(name, category.name, category.name);
  for (const name of FBD_VALUE_BLOCKS) add(name, 'I/O', name === 'constant' ? 'a value' : 'a variable');
  return items;
}

/** The node of a new block: its ports are those of its type, and it has an instance name when its type is a function block. */
export function newBlockNode(type: string, id: string, position: { x: number; y: number }, projectBlocks: readonly ProjectBlock[] | undefined, instanceName?: string): Node {
  const ports = getDefaultPorts(type, projectBlocks);
  return {
    id,
    type: getNodeType(type),
    position,
    selected: true,
    data: {
      type,
      inputs: ports.inputs,
      outputs: ports.outputs,
      variableName: type.startsWith('COMM_') ? `${type}_TAG` : undefined,
      instanceName,
    },
  };
}

function instanceNames(nodes: readonly Node[]): string[] {
  return nodes.flatMap((node) => (typeof data(node).instanceName === 'string' ? [data(node).instanceName as string] : []));
}

/** The nodes and wires after a block of `type` is put on the canvas, selected, beside the cursor or at `position`. */
export function placeBlock(
  state: FBDState,
  type: string,
  projectBlocks?: readonly ProjectBlock[],
  position?: { x: number; y: number },
): { nodes: Node[]; edges: Edge[]; node: Node } {
  const anchor = cursorNode(state.nodes);
  const id = freeId(type.toLowerCase().replace(/[^a-z0-9_]/g, '_'), state.nodes.map((node) => node.id));
  const needsInstance = INSTANCE_BLOCKS.test(type) || findProjectBlock(projectBlocks, type)?.kind === 'FUNCTION_BLOCK';
  const node = newBlockNode(
    type,
    id,
    position ?? freePosition(state.nodes, anchor),
    projectBlocks,
    needsInstance ? numberedId(type, instanceNames(state.nodes)) : undefined,
  );
  return {
    nodes: [...state.nodes.map((existing) => (existing.selected ? { ...existing, selected: false } : existing)), node],
    edges: state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
    node,
  };
}

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

const CONSTANT_BOOL = /^(TRUE|FALSE)$/i;
const CONSTANT_TIME = /^(?:T|TIME)#(.+)$/i;
const CONSTANT_INTEGER = /^[+-]?\d+$/;
const CONSTANT_REAL = /^[+-]?\d+\.\d+(?:[eE][+-]?\d+)?$/;
const CONSTANT_STRING = /^'((?:[^']|'')*)'$/;

/**
 * The type and value of a constant from what was typed: TRUE or FALSE, a whole number (which names no type, so that it
 * goes where any number does), a real number, a time `T#500ms`, or a string in single quotes. Nothing else is a value.
 */
export function parseConstant(text: string): { dataType?: string; value: boolean | number | string } | undefined {
  const typed = text.trim();
  if (CONSTANT_BOOL.test(typed)) return { dataType: 'BOOL', value: typed.toUpperCase() === 'TRUE' };
  const time = CONSTANT_TIME.exec(typed);
  if (time) return { dataType: 'TIME', value: `T#${time[1]}` };
  if (CONSTANT_INTEGER.test(typed)) return { value: Number(typed) };
  if (CONSTANT_REAL.test(typed)) return { dataType: 'REAL', value: Number(typed) };
  const string = CONSTANT_STRING.exec(typed);
  if (string) return { dataType: 'STRING', value: string[1]!.replaceAll("''", "'") };
  return undefined;
}

type Binding = 'variable' | 'instance' | 'constant' | 'none';

function bindingOf(node: Node): Binding {
  const type = blockType(node);
  if (type === 'constant') return 'constant';
  if (type === 'variable' || type === 'input' || type === 'output') return 'variable';
  if (typeof data(node).instanceName === 'string') return 'instance';
  return 'none';
}

function askBinding(model: FBDModel, state: FBDState, node: Node): FBDOutcome {
  const binding = bindingOf(node);
  const at = `${blockTitle(node)}`;
  if (binding === 'none') return refuse(state, `${blockType(node)} has nothing to bind: it holds neither a variable, an instance nor a value.`);
  const symbols = declaredSymbols(model.variables);
  if (binding === 'constant') {
    return { ...state, changed: false, say: `Value of ${at}: type TRUE, FALSE, a number, T#500ms or 'text'.`, prompt: { kind: 'bind', blockId: node.id }, choices: [], allowFreeText: true, title: 'Value of the constant' };
  }
  if (binding === 'instance') {
    const own = symbols.filter((symbol) => sameType(symbol.type, blockType(node)));
    return { ...state, changed: false, say: `Name the instance of ${blockType(node)}.`, prompt: { kind: 'bind', blockId: node.id }, choices: symbolItems(own), allowFreeText: true, title: `Instance of ${blockType(node)}` };
  }
  return { ...state, changed: false, say: `Bind ${at}: choose a declared symbol.`, prompt: { kind: 'bind', blockId: node.id }, choices: symbolItems(symbols), allowFreeText: true, title: 'Variable of the block' };
}

function bindTo(model: FBDModel, state: FBDState, node: Node, answer: string): FBDOutcome {
  const text = answer.trim();
  const binding = bindingOf(node);
  const patch = (fields: Record<string, unknown>, say: string): FBDOutcome => ({
    nodes: state.nodes.map((candidate) => (candidate.id === node.id ? { ...candidate, data: { ...candidate.data, ...fields } } : candidate)),
    edges: state.edges,
    changed: true,
    say,
  });
  if (binding === 'none') return refuse(state, `${blockType(node)} has nothing to bind.`);
  if (binding === 'constant') {
    const parsed = parseConstant(text);
    if (!parsed) return refuse(state, `'${text}' is not a value: write TRUE, FALSE, a number, a time such as T#500ms, or a string in single quotes.`);
    return patch({ value: parsed.value, dataType: parsed.dataType }, `Set the constant to ${text}.`);
  }
  if (binding === 'instance') {
    if (!IDENTIFIER.test(text)) return refuse(state, `'${text}' is not a name: use letters, digits and underscores, not starting with a digit.`);
    if (state.nodes.some((candidate) => candidate.id !== node.id && typeof data(candidate).instanceName === 'string' && (data(candidate).instanceName as string).toLowerCase() === text.toLowerCase())) {
      return refuse(state, `${text} is already the instance name of another block.`);
    }
    return patch({ instanceName: text }, `Named the instance ${text}.`);
  }
  if (!REFERENCE.test(text)) return refuse(state, `'${text}' is not a variable: use a declared name, or a member such as Pump.Run.`);
  const declared = declaredSymbols(model.variables).find((symbol) => symbol.name === text);
  return patch({ variableName: text, dataType: declared?.type, address: declared?.address ?? data(node).address }, declared ? `Bound ${blockType(node)} to ${text}, type ${declared.type}.` : `Bound ${blockType(node)} to ${text}, which is not declared in this file.`);
}

// ---------------------------------------------------------------------------
// Wires
// ---------------------------------------------------------------------------

export interface WireChoice extends PickerItem {
  from: { block: string; port: string };
  to: { block: string; port: string };
}

const wireId = (from: { block: string; port: string }, to: { block: string; port: string }): string => JSON.stringify([from.block, from.port, to.block, to.port]);

/**
 * The wires the block can have: each of its outputs to an input of another block that takes it, and each output of
 * another block to an input of it. A wire the pin types refuse, or into an input that has a wire, is not listed (it is
 * what drawing it by hand refuses, with the same reason).
 */
export function wireChoices(model: FBDModel, blockId: string, projectBlocks?: readonly ProjectBlock[]): WireChoice[] {
  const byId = new Map(model.blocks.map((block) => [block.id, block]));
  const self = byId.get(blockId);
  if (!self) return [];
  const portsOf = (id: string) => {
    const block = byId.get(id)!;
    const defaults = getDefaultPorts(block.type, projectBlocks);
    return { inputs: block.inputs ?? defaults.inputs, outputs: block.outputs ?? defaults.outputs };
  };
  const title = (id: string): string => {
    const block = byId.get(id)!;
    return block.variableName || block.instanceName || block.type;
  };
  const choices: WireChoice[] = [];
  const consider = (from: { block: string; port: string }, to: { block: string; port: string }) => {
    const verdict = judgeConnection(model, from, to, projectBlocks);
    if (verdict.reason !== undefined || !verdict.from || !verdict.to) return;
    const a = verdict.from;
    const b = verdict.to;
    choices.push({
      id: wireId(a, b),
      label: `${title(a.block)}.${a.port} → ${title(b.block)}.${b.port}`,
      detail: `${a.block} → ${b.block}`,
      group: 'Wires',
      keywords: [a.block, b.block],
      from: a,
      to: b,
    });
  };
  for (const other of model.blocks) {
    if (other.id === blockId) continue;
    for (const output of portsOf(blockId).outputs) for (const input of portsOf(other.id).inputs) consider({ block: blockId, port: output.name }, { block: other.id, port: input.name });
    for (const output of portsOf(other.id).outputs) for (const input of portsOf(blockId).inputs) consider({ block: other.id, port: output.name }, { block: blockId, port: input.name });
  }
  return choices;
}

function wiresOf(model: FBDModel, state: FBDState, blockId: string): PickerItem[] {
  const names = new Map(model.blocks.map((block) => [block.id, block.variableName || block.instanceName || block.type]));
  return state.edges
    .filter((edge) => edge.source === blockId || edge.target === blockId)
    .map((edge) => ({
      id: edge.id,
      label: `${names.get(edge.source) ?? edge.source}.${edge.sourceHandle ?? 'OUT'} → ${names.get(edge.target) ?? edge.target}.${edge.targetHandle ?? 'IN'}`,
      detail: `${edge.source} → ${edge.target}`,
      group: 'Wires',
    }));
}

// ---------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------

/** Runs one command of the table. A refusal gives the canvas back as it was, with the reason. */
export function runFBDCommand(
  model: FBDModel,
  state: FBDState,
  command: string,
  argument: FBDArgument = {},
  projectBlocks?: readonly ProjectBlock[],
): FBDOutcome {
  const here = cursorNode(state.nodes);
  switch (command) {
    case 'focusLeft': case 'focusRight': case 'focusUp': case 'focusDown': {
      const direction = command.slice('focus'.length).toLowerCase() as Direction;
      if (state.nodes.length === 0) return refuse(state, 'There are no blocks on the diagram.');
      if (!here) return select(state, firstNode(state.nodes)!);
      const next = nearestNode(state.nodes, here, direction);
      return next ? select(state, next) : { ...state, changed: false, say: `There is no block to the ${direction} of ${blockTitle(here)}.` };
    }
    case 'focusFirst': {
      const first = firstNode(state.nodes);
      return first ? select(state, first) : refuse(state, 'There are no blocks on the diagram.');
    }
    case 'insertVariable': return insert(model, state, 'variable', argument, projectBlocks);
    case 'insertConstant': return insert(model, state, 'constant', argument, projectBlocks);
    case 'insertElement':
      return argument.blockType ? insert(model, state, argument.blockType, argument, projectBlocks) : refuse(state, 'Choose the block to insert.');
    case 'openPalette': return { ...state, changed: false, say: 'Block palette: type to search.', prompt: { kind: 'palette' } };
    case 'bindVariable': {
      if (!here) return refuse(state, 'Select a block first.');
      return argument.name === undefined ? askBinding(model, state, here) : bindTo(model, state, here, argument.name);
    }
    case 'connect': {
      if (!here) return refuse(state, 'Select a block first: a wire is drawn from or to the selected block.');
      if (argument.wire === undefined) {
        const choices = wireChoices(currentModel(model, state), here.id, projectBlocks);
        if (choices.length === 0) return refuse(state, `${blockTitle(here)} has no wire that can be drawn: every pin that fits is already wired, or no pin of another block takes its type.`);
        return { ...state, changed: false, say: `Wires of ${blockTitle(here)}: ${choices.length} can be drawn.`, prompt: { kind: 'connect', blockId: here.id }, choices, title: `Draw a wire of ${blockTitle(here)}` };
      }
      return drawWire(model, state, argument.wire, projectBlocks);
    }
    case 'disconnect': {
      if (!here) return refuse(state, 'Select a block first.');
      if (argument.edgeId === undefined) {
        const choices = wiresOf(currentModel(model, state), state, here.id);
        if (choices.length === 0) return refuse(state, `${blockTitle(here)} has no wire to remove.`);
        return { ...state, changed: false, say: `Wires of ${blockTitle(here)}: ${choices.length}.`, prompt: { kind: 'disconnect', blockId: here.id }, choices, title: `Remove a wire of ${blockTitle(here)}` };
      }
      if (!state.edges.some((edge) => edge.id === argument.edgeId)) return refuse(state, 'That wire is not on the diagram any more.');
      return { nodes: state.nodes, edges: state.edges.filter((edge) => edge.id !== argument.edgeId), changed: true, say: 'Removed the wire.' };
    }
    case 'editComment': {
      if (!here) return refuse(state, 'Select a block first.');
      if (argument.text === undefined) return { ...state, changed: false, say: `Comment of ${blockTitle(here)}.`, prompt: { kind: 'comment', blockId: here.id } };
      const text = argument.text.trim();
      return {
        nodes: state.nodes.map((node) => (node.id === here.id ? { ...node, data: { ...node.data, comment: text === '' ? undefined : text } } : node)),
        edges: state.edges,
        changed: true,
        say: text === '' ? 'Cleared the comment.' : 'Set the comment.',
      };
    }
    case 'deleteSelection': {
      const doomed = new Set(state.nodes.filter((node) => node.selected).map((node) => node.id));
      const wires = state.edges.filter((edge) => edge.selected || doomed.has(edge.source) || doomed.has(edge.target));
      if (doomed.size === 0 && wires.length === 0) return refuse(state, 'Nothing is selected to delete.');
      const gone = new Set(wires.map((edge) => edge.id));
      return {
        nodes: state.nodes.filter((node) => !doomed.has(node.id)),
        edges: state.edges.filter((edge) => !gone.has(edge.id)),
        changed: true,
        say: `Deleted ${doomed.size} block${doomed.size === 1 ? '' : 's'} and ${wires.length} wire${wires.length === 1 ? '' : 's'}.`,
      };
    }
    default: return refuse(state, `${command} is not a command of the function block editor.`);
  }
}

function select(state: FBDState, node: Node): FBDOutcome {
  const next = selectOnly(state.nodes, state.edges, node.id);
  return { ...next, changed: false, say: `Selected ${blockTitle(node)}.` };
}

function insert(model: FBDModel, state: FBDState, type: string, argument: FBDArgument, projectBlocks?: readonly ProjectBlock[]): FBDOutcome {
  const placed = placeBlock(state, type, projectBlocks, argument.position);
  const outcome: FBDOutcome = { nodes: placed.nodes, edges: placed.edges, changed: true, say: `Inserted ${type}${typeof data(placed.node).instanceName === 'string' ? ` ${data(placed.node).instanceName as string}` : ''}.` };
  // a variable or a constant is of no use until it holds something: what it holds is asked at once
  if (type === 'variable' || type === 'constant' || type === 'input' || type === 'output') {
    const asked = askBinding(model, { nodes: placed.nodes, edges: placed.edges }, placed.node);
    return { ...outcome, say: `${outcome.say} ${asked.say}`, prompt: asked.prompt, choices: asked.choices, title: asked.title, allowFreeText: asked.allowFreeText };
  }
  return outcome;
}

function drawWire(model: FBDModel, state: FBDState, wire: string, projectBlocks?: readonly ProjectBlock[]): FBDOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(wire);
  } catch {
    return refuse(state, 'That wire is not one of the choices.');
  }
  if (!Array.isArray(parsed) || parsed.length !== 4 || parsed.some((part) => typeof part !== 'string')) return refuse(state, 'That wire is not one of the choices.');
  const [source, sourceHandle, target, targetHandle] = parsed as [string, string, string, string];
  const result = connectBlocks(currentModel(model, state), state.nodes, state.edges, { source, sourceHandle, target, targetHandle }, projectBlocks);
  if (result.refusal !== undefined) return refuse(state, `Wire refused: ${result.refusal}.`);
  return { nodes: state.nodes, edges: result.edges, changed: true, say: `Drew the wire from ${source}.${sourceHandle} to ${target}.${targetHandle}.` };
}

/** What the canvas keyboard hook needs of the function block editor: the commands over its document, and its questions. */
export function fbdCanvasCommands(model: FBDModel, projectBlocks: readonly ProjectBlock[]): CanvasCommands<FBDArgument> {
  return {
    editor: 'fbd',
    run: (nodes, edges, command, argument) => runFBDCommand(model, { nodes, edges }, command, argument, projectBlocks),
    palette: () => paletteChoices(projectBlocks),
    paletteTitle: 'Insert block',
    palettePlaceholder: 'Type to search: AND, TON, variable, constant',
    readOnlyCommands: new Set(['focusLeft', 'focusRight', 'focusUp', 'focusDown', 'focusFirst', 'toggleBreakpoint', 'showCommands']),
    answer: {
      palette: (id) => ({ blockType: id }),
      bind: (name) => ({ name }),
      connect: (wire) => ({ wire }),
      disconnect: (edgeId) => ({ edgeId }),
      comment: (text) => ({ text }),
    },
    editorCommands: new Set(FBD_EDITOR_COMMANDS.filter((command) => command !== 'showCommands')),
  };
}
