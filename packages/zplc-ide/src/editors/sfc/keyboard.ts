/**
 * Editing a sequential function chart from the keyboard (LNG-012), as commands on the canvas.
 *
 * The cursor of the editor is the selected step or transition. A key of the table (`../keymap.ts`) is a command: it
 * takes the declarations of the document and the nodes and wires of the canvas, and gives back the nodes and wires, what
 * to say, and what to ask the user when the command needs a choice (the element to insert, the name or condition, the
 * wire to draw). Nothing here draws or reads the screen. A command that changes the document is one gesture of the
 * history (LNG-010): the editor commits its result once.
 */

import type { Edge, Node } from '@xyflow/react';
import type { SFCModel } from '../../models/sfc';
import { SFC_PALETTE } from '../../models/sfcSupport';
import { cursorNode, firstNode, freeId, freePosition, nearestNode, numberedId, selectOnly, type Direction } from '../graphNav';
import type { PickerItem } from '../picker';
import type { CanvasCommands } from '../useCanvasKeyboard';
import { declaredSymbols, sameType, symbolItems } from '../symbols';
import { connectSFC, nodesToSteps, sfcEdge } from './graphModel';

export interface SFCState {
  nodes: Node[];
  edges: Edge[];
}

export type SFCPrompt =
  | { kind: 'palette' }
  | { kind: 'bind'; nodeId: string }
  | { kind: 'connect'; nodeId: string }
  | { kind: 'disconnect'; nodeId: string }
  | { kind: 'comment'; nodeId: string };

export interface SFCOutcome extends SFCState {
  /** The document changed: the editor commits it as one gesture. */
  changed: boolean;
  say: string;
  refused?: boolean;
  prompt?: SFCPrompt;
  choices?: PickerItem[];
  title?: string;
  allowFreeText?: boolean;
}

export interface SFCArgument {
  /** What `insertElement` inserts: a type of the palette. */
  elementType?: string;
  /** Where the element goes, unwired: the place of a drop. Beside or below the cursor, wired, when absent. */
  position?: { x: number; y: number };
  /** The name of a step, or the condition of a transition. */
  name?: string;
  /** The id of the wire chosen from a connect prompt. */
  wire?: string;
  /** The id of the wire chosen from a disconnect prompt. */
  edgeId?: string;
  text?: string;
}

/** The commands of the table that act on the canvas; the editor itself runs the others. */
export const SFC_MODEL_COMMANDS: readonly string[] = [
  'focusLeft', 'focusRight', 'focusUp', 'focusDown', 'focusFirst', 'insertStep', 'insertInitialStep', 'insertTransition',
  'openPalette', 'insertElement', 'bindVariable', 'connect', 'disconnect', 'editComment', 'deleteSelection',
];

/** The commands of the table that the editor runs because they need the screen: the clipboard, the breakpoint, the list. */
export const SFC_EDITOR_COMMANDS: readonly string[] = ['copySelection', 'pasteSelection', 'toggleBreakpoint', 'showCommands'];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const data = (node: Node): Record<string, unknown> => node.data as Record<string, unknown>;
const isStep = (node: Node): boolean => node.type === 'step';

/** What a step or transition is called when it is announced or listed. */
export function nodeTitle(node: Node): string {
  if (isStep(node)) return String(data(node).name ?? node.id);
  const condition = String(data(node).condition ?? 'TRUE');
  return `T(${condition.length > 24 ? `${condition.slice(0, 23)}…` : condition})`;
}

const refuse = (state: SFCState, say: string): SFCOutcome => ({ ...state, changed: false, refused: true, say });

/** The elements of the palette as list items. */
export function paletteChoices(): PickerItem[] {
  return SFC_PALETTE.map((element) => ({ id: element.type, label: element.label, detail: element.description, group: element.category, keywords: [element.type] }));
}

// ---------------------------------------------------------------------------
// Inserting
// ---------------------------------------------------------------------------

function newNode(
  state: SFCState,
  type: 'step' | 'initial_step' | 'transition',
  anchor: Node | undefined,
  placement: 'right' | 'below',
  at?: { x: number; y: number },
): Node {
  const ids = state.nodes.map((node) => node.id);
  const position = at ?? freePosition(state.nodes, anchor, { width: 240, height: 110 }, placement);
  if (type === 'transition') {
    return { id: numberedId('transition', ids), type: 'transition', position, selected: true, data: { condition: 'TRUE', fromStep: '', toStep: '', debugActive: false } };
  }
  const names = state.nodes.filter(isStep).map((node) => String(data(node).name ?? ''));
  const initial = type === 'initial_step';
  return {
    id: numberedId('step', ids),
    type: 'step',
    position,
    selected: true,
    data: { name: initial ? freeId('Init', names) : numberedId('Step', names), isInitial: initial, actions: [], debugActive: false },
  };
}

function insert(state: SFCState, type: 'step' | 'initial_step' | 'transition', at?: { x: number; y: number }): SFCOutcome {
  const anchor = cursorNode(state.nodes);
  // a transition goes below a step, and a step goes below a transition: that is the order of a chart; an element that is
  // dropped at a place is put there and wired to nothing
  const joins = at === undefined && anchor !== undefined && ((type === 'transition' && isStep(anchor)) || (type !== 'transition' && !isStep(anchor)));
  const node = newNode(state, type, anchor, joins ? 'below' : 'right', at);
  const deselected = state.nodes.map((existing) => (existing.selected ? { ...existing, selected: false } : existing));
  const edges = state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge));
  const kind = type === 'transition' ? 'transition' : type === 'initial_step' ? 'initial step' : 'step';
  if (joins && anchor) {
    const wire = sfcEdge(anchor.id, node.id);
    // a transition that already leads to a step is not given another: the new step is put beside it, unwired
    const taken = type !== 'transition' && edges.some((edge) => edge.source === anchor.id);
    if (!taken) return { nodes: [...deselected, node], edges: [...edges, wire], changed: true, say: `Inserted ${kind} ${nodeTitle(node)} after ${nodeTitle(anchor)}, wired to it.` };
    return { nodes: [...deselected, node], edges, changed: true, say: `Inserted ${kind} ${nodeTitle(node)}. ${nodeTitle(anchor)} already leads to a step: draw a wire with C to change where it goes.` };
  }
  const hint = at === undefined && anchor && isStep(anchor) && type !== 'transition' ? ' Steps are joined through a transition: press T on a step to insert one.' : '';
  return { nodes: [...deselected, node], edges, changed: true, say: `Inserted ${kind} ${nodeTitle(node)}.${hint}` };
}

// ---------------------------------------------------------------------------
// Wires
// ---------------------------------------------------------------------------

function wireChoices(state: SFCState, node: Node): PickerItem[] {
  const choices: PickerItem[] = [];
  const has = (source: string, target: string) => state.edges.some((edge) => edge.source === source && edge.target === target);
  const add = (source: Node, target: Node) => {
    if (has(source.id, target.id)) return;
    // a transition has one source and one target: the wire it has is replaced
    const replaced = isStep(source)
      ? state.edges.find((edge) => edge.target === target.id)
      : state.edges.find((edge) => edge.source === source.id);
    const old = replaced ? state.nodes.find((candidate) => candidate.id === (isStep(source) ? replaced.source : replaced.target)) : undefined;
    choices.push({
      id: JSON.stringify([source.id, 'out', target.id, 'in']),
      label: `${nodeTitle(source)} → ${nodeTitle(target)}`,
      detail: old ? `replaces the wire to ${nodeTitle(old)}` : 'new wire',
      group: 'Wires',
      keywords: [source.id, target.id],
    });
  };
  const steps = state.nodes.filter(isStep);
  const transitions = state.nodes.filter((candidate) => !isStep(candidate));
  if (isStep(node)) {
    for (const transition of transitions) {
      add(node, transition);
      add(transition, node);
    }
  } else {
    for (const step of steps) {
      add(step, node);
      add(node, step);
    }
  }
  // wires that leave what is free before the ones that replace a wire
  return choices.sort((first, second) => Number(first.detail?.startsWith('replaces')) - Number(second.detail?.startsWith('replaces')));
}

function wiresOf(state: SFCState, node: Node): PickerItem[] {
  const title = (id: string) => {
    const found = state.nodes.find((candidate) => candidate.id === id);
    return found ? nodeTitle(found) : id;
  };
  return state.edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => ({ id: edge.id, label: `${title(edge.source)} → ${title(edge.target)}`, detail: `${edge.source} → ${edge.target}`, group: 'Wires' }));
}

// ---------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------

/** Runs one command of the table. A refusal gives the canvas back as it was, with the reason. */
export function runSFCCommand(model: SFCModel, state: SFCState, command: string, argument: SFCArgument = {}): SFCOutcome {
  const here = cursorNode(state.nodes);
  switch (command) {
    case 'focusLeft': case 'focusRight': case 'focusUp': case 'focusDown': {
      const direction = command.slice('focus'.length).toLowerCase() as Direction;
      if (state.nodes.length === 0) return refuse(state, 'There are no steps or transitions on the chart.');
      if (!here) return select(state, firstNode(state.nodes)!);
      const next = nearestNode(state.nodes, here, direction);
      return next ? select(state, next) : { ...state, changed: false, say: `There is no element ${direction === 'left' || direction === 'right' ? `to the ${direction}` : direction === 'up' ? 'above' : 'below'} ${nodeTitle(here)}.` };
    }
    case 'focusFirst': {
      const first = firstNode(state.nodes);
      return first ? select(state, first) : refuse(state, 'There are no steps or transitions on the chart.');
    }
    case 'insertStep': return insert(state, 'step');
    case 'insertInitialStep': return insert(state, 'initial_step');
    case 'insertTransition': return insert(state, 'transition');
    case 'insertElement': {
      const type = argument.elementType;
      return type === 'step' || type === 'initial_step' || type === 'transition' ? insert(state, type, argument.position) : refuse(state, 'Choose the element to insert.');
    }
    case 'openPalette': return { ...state, changed: false, say: 'Element palette: type to search.', prompt: { kind: 'palette' } };
    case 'bindVariable': {
      if (!here) return refuse(state, 'Select a step or a transition first.');
      return argument.name === undefined ? askName(model, state, here) : setName(state, here, argument.name);
    }
    case 'connect': {
      if (!here) return refuse(state, 'Select a step or a transition first: a wire is drawn from or to it.');
      if (argument.wire === undefined) {
        const choices = wireChoices(state, here);
        if (choices.length === 0) return refuse(state, `${nodeTitle(here)} has no wire that can be drawn: a step joins a transition, and a transition a step, and there is none free.`);
        return { ...state, changed: false, say: `Wires of ${nodeTitle(here)}: ${choices.length} can be drawn.`, prompt: { kind: 'connect', nodeId: here.id }, choices, title: `Draw a wire of ${nodeTitle(here)}` };
      }
      return drawWire(state, argument.wire);
    }
    case 'disconnect': {
      if (!here) return refuse(state, 'Select a step or a transition first.');
      if (argument.edgeId === undefined) {
        const choices = wiresOf(state, here);
        if (choices.length === 0) return refuse(state, `${nodeTitle(here)} has no wire to remove.`);
        return { ...state, changed: false, say: `Wires of ${nodeTitle(here)}: ${choices.length}.`, prompt: { kind: 'disconnect', nodeId: here.id }, choices, title: `Remove a wire of ${nodeTitle(here)}` };
      }
      if (!state.edges.some((edge) => edge.id === argument.edgeId)) return refuse(state, 'That wire is not on the chart any more.');
      return { nodes: state.nodes, edges: state.edges.filter((edge) => edge.id !== argument.edgeId), changed: true, say: 'Removed the wire.' };
    }
    case 'editComment': {
      if (!here) return refuse(state, 'Select a step or a transition first.');
      if (argument.text === undefined) return { ...state, changed: false, say: `Comment of ${nodeTitle(here)}.`, prompt: { kind: 'comment', nodeId: here.id } };
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
        say: `Deleted ${doomed.size} element${doomed.size === 1 ? '' : 's'} and ${wires.length} wire${wires.length === 1 ? '' : 's'}.`,
      };
    }
    default: return refuse(state, `${command} is not a command of the sequential function chart editor.`);
  }
}

function select(state: SFCState, node: Node): SFCOutcome {
  return { ...selectOnly(state.nodes, state.edges, node.id), changed: false, say: `Selected ${isStep(node) ? 'step' : 'transition'} ${nodeTitle(node)}.` };
}

function askName(model: SFCModel, state: SFCState, node: Node): SFCOutcome {
  if (isStep(node)) {
    return { ...state, changed: false, say: `Name of step ${nodeTitle(node)}: type the new name.`, prompt: { kind: 'bind', nodeId: node.id }, choices: [], allowFreeText: true, title: `Name of step ${nodeTitle(node)}` };
  }
  // a condition is a BOOL variable, or an expression typed
  const symbols = declaredSymbols(model.variables).filter((symbol) => sameType(symbol.type, 'BOOL'));
  return { ...state, changed: false, say: `Condition of ${nodeTitle(node)}: choose a declared symbol or type an expression.`, prompt: { kind: 'bind', nodeId: node.id }, choices: symbolItems(symbols), allowFreeText: true, title: `Condition of ${nodeTitle(node)}` };
}

function setName(state: SFCState, node: Node, answer: string): SFCOutcome {
  const text = answer.trim();
  const patch = (fields: Record<string, unknown>, say: string): SFCOutcome => ({
    nodes: state.nodes.map((candidate) => (candidate.id === node.id ? { ...candidate, data: { ...candidate.data, ...fields } } : candidate)),
    edges: state.edges,
    changed: true,
    say,
  });
  if (isStep(node)) {
    if (!IDENTIFIER.test(text)) return refuse(state, `'${text}' is not a name: use letters, digits and underscores, not starting with a digit.`);
    const clash = nodesToSteps(state.nodes).find((step) => step.id !== node.id && step.name.toLowerCase() === text.toLowerCase());
    if (clash) return refuse(state, `${text} is already the name of another step.`);
    return patch({ name: text }, `Named the step ${text}.`);
  }
  if (text === '') return refuse(state, 'A condition is needed: a BOOL variable or an expression.');
  return patch({ condition: text }, `Set the condition to ${text}.`);
}

function drawWire(state: SFCState, wire: string): SFCOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(wire);
  } catch {
    return refuse(state, 'That wire is not one of the choices.');
  }
  if (!Array.isArray(parsed) || parsed.length !== 4 || parsed.some((part) => typeof part !== 'string')) return refuse(state, 'That wire is not one of the choices.');
  const [source, sourceHandle, target, targetHandle] = parsed as [string, string, string, string];
  const edges = connectSFC(state.nodes, state.edges, { source, sourceHandle, target, targetHandle });
  if (!edges) return refuse(state, 'Wire refused: a wire joins a step to a transition, or a transition to a step.');
  return { nodes: state.nodes, edges, changed: true, say: `Drew the wire from ${source} to ${target}.` };
}

/** What the canvas keyboard hook needs of the sequential function chart editor: the commands over its document, and its questions. */
export function sfcCanvasCommands(model: SFCModel): CanvasCommands<SFCArgument> {
  return {
    editor: 'sfc',
    run: (nodes, edges, command, argument) => runSFCCommand(model, { nodes, edges }, command, argument),
    palette: paletteChoices,
    paletteTitle: 'Insert element',
    palettePlaceholder: 'Type to search: step, initial step, transition',
    readOnlyCommands: new Set(['focusLeft', 'focusRight', 'focusUp', 'focusDown', 'focusFirst', 'toggleBreakpoint', 'showCommands']),
    answer: {
      palette: (id) => ({ elementType: id }),
      bind: (name) => ({ name }),
      connect: (wire) => ({ wire }),
      disconnect: (edgeId) => ({ edgeId }),
      comment: (text) => ({ text }),
    },
    editorCommands: new Set(SFC_EDITOR_COMMANDS.filter((command) => command !== 'showCommands')),
  };
}
