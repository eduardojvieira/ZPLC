/**
 * Editing a ladder diagram from the keyboard (LNG-012), as commands on the document.
 *
 * The editor keeps a cursor, a cell of a rung. A key of the table (`../keymap.ts`) is a command: it takes the document
 * and the cursor and gives back the document, the cursor, what to say, and what to ask the user when the command needs
 * a choice (the element to insert, the variable to bind). Nothing here draws or reads the screen, so the whole of
 * keyboard authoring is exercised by tests that press keys on a model. A command that changes the document is one
 * gesture of the history (LNG-010): the editor commits its result once.
 */

import {
  addRow,
  convertToGridRung,
  createBranch,
  createEmptyRung,
  createNestedBranch,
  DEFAULT_GRID_CONFIG,
  getBranchesAtCell,
  isCoil,
  isContact,
  isFunctionBlock,
  isGridBasedRung,
  normalizeGridRung,
  placeElement,
  removeBranch,
  removeElementAt,
  type LDElement,
  type LDModel,
  type LDRung,
} from '../../models/ld';
import { ldElementKind, LD_MODBUS_HELPERS } from '../../models/ldSupport';
import type { ProjectBlock } from '../../models/projectBlocks';
import type { PickerItem } from '../picker';
import { boolOutputsOf, declaredSymbols, sameType, symbolItems } from '../symbols';
import { NO_LD_SELECTION, type LDSelection } from './graphModel';
import { t } from '../../i18n';

/** A cell of a rung: the place the keys act on. */
export interface LDCursor {
  rungId: string;
  row: number;
  col: number;
}

/** What the palette inserts: the face of a toolbox item. */
export interface LDInsert {
  type: string;
  fbType?: string;
  category: 'contact' | 'coil' | 'function_block' | 'structure';
}

/** What the editor has to ask the user after a command, and then run another command with the answer. */
export type LDPrompt =
  | { kind: 'palette' }
  | { kind: 'bind'; elementId: string }
  | { kind: 'comment'; rungId: string }
  | { kind: 'select'; rungId: string; elementId: string };

export interface LDOutcome {
  model: LDModel;
  cursor: LDCursor | null;
  /** The document changed: the editor commits it as one gesture, with `selection` as what is selected after it. */
  changed: boolean;
  selection?: LDSelection;
  prompt?: LDPrompt;
  /** What the editor announces: where the cursor is, what was done, or why it was not. */
  say: string;
  refused?: boolean;
}

export interface LDArgument {
  insert?: LDInsert;
  /** The name chosen from the list of declared symbols (or typed, where the list allows it). */
  variable?: string;
}

/** The commands of the table that act on the document or the cursor; the editor itself runs the others. */
export const LD_MODEL_COMMANDS: readonly string[] = [
  'cursorLeft', 'cursorRight', 'cursorUp', 'cursorDown', 'rowStart', 'rowEnd', 'previousRung', 'nextRung', 'firstRung', 'lastRung',
  'insertContact', 'insertContactNC', 'insertContactP', 'insertCoil', 'insertCoilSet', 'insertCoilReset', 'insertBranch',
  'openPalette', 'activate', 'bindVariable', 'editComment', 'insertElement',
  'moveElementLeft', 'moveElementRight', 'moveElementUp', 'moveElementDown',
  'addRung', 'addRow', 'moveRungUp', 'moveRungDown', 'widenBranch', 'narrowBranch', 'removeBranch', 'deleteElement', 'deleteRung',
];

/** The commands of the table that the editor runs because they need the screen: the clipboard, the breakpoint, the list. */
export const LD_EDITOR_COMMANDS: readonly string[] = ['copyRung', 'pasteRung', 'toggleBreakpoint', 'showCommands', 'clearSelection', 'fitView'];

const QUICK_INSERT: Record<string, LDInsert> = {
  insertContact: { type: 'contact_no', category: 'contact' },
  insertContactNC: { type: 'contact_nc', category: 'contact' },
  insertContactP: { type: 'contact_p', category: 'contact' },
  insertCoil: { type: 'coil', category: 'coil' },
  insertCoilSet: { type: 'coil_set', category: 'coil' },
  insertCoilReset: { type: 'coil_reset', category: 'coil' },
  insertBranch: { type: 'branch', category: 'structure' },
};

// ---------------------------------------------------------------------------
// The grid as the commands see it
// ---------------------------------------------------------------------------

/** The rung as a grid of the size its configuration says, whatever form the file had it in. */
function asGrid(rung: LDRung): LDRung {
  return normalizeGridRung(isGridBasedRung(rung) ? rung : convertToGridRung(rung));
}

interface Place {
  rung: LDRung;
  index: number;
  row: number;
  col: number;
  rows: number;
  cols: number;
}

/** Where a cursor is in a document: its rung as a grid, and the row and column kept inside it. */
function placeOf(model: LDModel, cursor: LDCursor | null): Place | null {
  if (model.rungs.length === 0) return null;
  const found = cursor ? model.rungs.findIndex((rung) => rung.id === cursor.rungId) : -1;
  const index = found < 0 ? 0 : found;
  const rung = asGrid(model.rungs[index]!);
  const rows = Math.max(1, rung.grid?.length ?? 1);
  const cols = Math.max(1, rung.gridConfig?.cols ?? DEFAULT_GRID_CONFIG.cols);
  const row = found < 0 || !cursor ? 0 : Math.min(Math.max(0, cursor.row), rows - 1);
  const col = found < 0 || !cursor ? 0 : Math.min(Math.max(0, cursor.col), cols - 1);
  return { rung, index, row, col, rows, cols };
}

const cursorAt = (place: Place): LDCursor => ({ rungId: place.rung.id, row: place.row, col: place.col });
const elementAt = (place: Place): LDElement | null => place.rung.grid?.[place.row]?.[place.col]?.element ?? null;

function withRung(model: LDModel, rung: LDRung): LDModel {
  return { ...model, rungs: model.rungs.map((candidate) => (candidate.id === rung.id ? rung : candidate)) };
}

const renumber = (rungs: readonly LDRung[]): LDRung[] => rungs.map((rung, index) => ({ ...rung, number: index + 1 }));

function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((id) => id.toLowerCase()));
  let suffix = 1;
  while (used.has(`${base}_${suffix}`.toLowerCase())) suffix += 1;
  return `${base}_${suffix}`;
}

function elementName(element: LDElement): string {
  const kind = ldElementKind(element.type);
  const name = isFunctionBlock(element.type) ? [element.fbType, element.instance].filter(Boolean).join(' ') : element.variable;
  return name ? `${kind} ${name}` : kind;
}

/** What is said of a cursor: where it is, and what is in the cell. */
export function describeCursor(model: LDModel, cursor: LDCursor | null): string {
  const place = placeOf(model, cursor);
  if (!place) return t('ld.noRungs');
  const element = elementAt(place);
  return t('ld.cell', { rung: place.rung.number, row: place.row + 1, col: place.col + 1, what: element ? elementName(element) : t('ld.emptyCell') });
}

const refuse = (model: LDModel, cursor: LDCursor | null, say: string): LDOutcome => ({ model, cursor, changed: false, say, refused: true });
const moved = (model: LDModel, cursor: LDCursor | null): LDOutcome => ({ model, cursor, changed: false, say: describeCursor(model, cursor) });

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

type Motion = 'cursorLeft' | 'cursorRight' | 'cursorUp' | 'cursorDown' | 'rowStart' | 'rowEnd' | 'previousRung' | 'nextRung' | 'firstRung' | 'lastRung';

/** The cursor after a motion. The edges stop it; the rungs above and below are the next cells up and down. */
export function moveCursor(model: LDModel, cursor: LDCursor | null, motion: Motion): LDCursor | null {
  const place = placeOf(model, cursor);
  if (!place) return null;
  const dims = (index: number) => {
    const rung = asGrid(model.rungs[index]!);
    return { id: rung.id, rows: Math.max(1, rung.grid?.length ?? 1), cols: Math.max(1, rung.gridConfig?.cols ?? DEFAULT_GRID_CONFIG.cols) };
  };
  const clampCol = (col: number, cols: number) => Math.min(col, cols - 1);
  switch (motion) {
    case 'cursorLeft': return { ...cursorAt(place), col: Math.max(0, place.col - 1) };
    case 'cursorRight': return { ...cursorAt(place), col: Math.min(place.cols - 1, place.col + 1) };
    case 'cursorUp': {
      if (place.row > 0) return { ...cursorAt(place), row: place.row - 1 };
      if (place.index === 0) return cursorAt(place);
      const above = dims(place.index - 1);
      return { rungId: above.id, row: above.rows - 1, col: clampCol(place.col, above.cols) };
    }
    case 'cursorDown': {
      if (place.row < place.rows - 1) return { ...cursorAt(place), row: place.row + 1 };
      if (place.index >= model.rungs.length - 1) return cursorAt(place);
      const below = dims(place.index + 1);
      return { rungId: below.id, row: 0, col: clampCol(place.col, below.cols) };
    }
    case 'rowStart': return { ...cursorAt(place), col: 0 };
    case 'rowEnd': return { ...cursorAt(place), col: place.cols - 1 };
    case 'previousRung': {
      if (place.index === 0) return cursorAt(place);
      const above = dims(place.index - 1);
      return { rungId: above.id, row: 0, col: clampCol(place.col, above.cols) };
    }
    case 'nextRung': {
      if (place.index >= model.rungs.length - 1) return cursorAt(place);
      const below = dims(place.index + 1);
      return { rungId: below.id, row: 0, col: clampCol(place.col, below.cols) };
    }
    case 'firstRung': return { rungId: dims(0).id, row: 0, col: 0 };
    case 'lastRung': {
      const last = dims(model.rungs.length - 1);
      return { rungId: last.id, row: last.rows - 1, col: last.cols - 1 };
    }
  }
}

// ---------------------------------------------------------------------------
// Structure shared with the mouse
// ---------------------------------------------------------------------------

/**
 * The rung with a parallel branch that starts at a cell. It ends before the next element of the row (or two columns
 * on), and a branch started inside another is nested in it. The drop of the Branch item of the toolbox does the same.
 */
export function addBranchAt(rung: LDRung, row: number, col: number): LDRung {
  const grid = rung.grid ?? [];
  const cols = rung.gridConfig?.cols ?? DEFAULT_GRID_CONFIG.cols;
  let endCol = cols - 2;
  for (let c = cols - 1; c > col; c--) {
    if (grid[row]?.[c]?.element) {
      endCol = c - 1;
      break;
    }
  }
  if (endCol <= col) endCol = Math.min(col + 2, cols - 1);
  const around = getBranchesAtCell(rung, row, col);
  const parent = around[around.length - 1];
  if (parent) {
    const start = Math.max(col, parent.startCol);
    const end = Math.min(endCol, parent.endCol);
    if (end > start) return createNestedBranch(rung, parent.id, start, end, row);
  }
  return createBranch(rung, col, endCol, row);
}

/**
 * The element a toolbox item makes, with an id the rung does not use and, for a function block, a name for its
 * instance that the document does not use; the instance is declared as a local variable of its type. The drop of an
 * item of the toolbox makes its element the same way.
 */
export function newElement(model: LDModel, item: LDInsert, row: number, col: number): { element: LDElement; declare?: { name: string; type: string } } {
  const taken = model.rungs.flatMap((rung) => asGrid(rung).grid?.flat().flatMap((cell) => (cell.element ? [cell.element.id] : [])) ?? []);
  const id = uniqueId(item.type === 'function_block' ? `fb_${(item.fbType ?? 'block').toLowerCase()}` : item.type, taken);
  if (item.type !== 'function_block' || !item.fbType) return { element: { id, type: item.type as LDElement['type'], row, col } };
  if (LD_MODBUS_HELPERS.has(item.fbType)) return { element: { id, type: 'function_block', fbType: item.fbType, row, col } };
  const names = [...model.variables.local, ...(model.variables.inputs ?? []), ...model.variables.outputs].map((variable) => variable.name);
  const instance = uniqueId(item.fbType, names);
  return { element: { id, type: 'function_block', fbType: item.fbType, instance, row, col }, declare: { name: instance, type: item.fbType } };
}

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

/**
 * What an element can be bound to, from the declared symbols: a contact reads a BOOL variable or a BOOL output of a
 * declared function block (`Delay.Q`); a coil writes a BOOL variable that is not an input; a function block is one of
 * the declared variables of its type. `free` says whether a name that is not in the list may be typed.
 */
export function bindingChoices(model: LDModel, element: LDElement, projectBlocks?: readonly ProjectBlock[]): { items: PickerItem[]; free: boolean; title: string } {
  const symbols = declaredSymbols(model.variables);
  if (isFunctionBlock(element.type)) {
    const own = symbols.filter((symbol) => sameType(symbol.type, element.fbType));
    return { items: symbolItems(own), free: false, title: t('ld.instanceOf', { type: element.fbType ?? t('ld.fallbackBlock') }) };
  }
  const bools = symbols.filter((symbol) => sameType(symbol.type, 'BOOL'));
  if (isContact(element.type)) {
    const members: PickerItem[] = symbols.flatMap((symbol) => boolOutputsOf(symbol.type, projectBlocks).map((member) => ({
      id: `${symbol.name}.${member}`,
      label: `${symbol.name}.${member}`,
      detail: t('ld.outputOf', { type: symbol.type }),
      group: t('ld.groupDeclared'),
    })));
    return { items: [...symbolItems(bools), ...members], free: true, title: t('ld.contactReads') };
  }
  return { items: symbolItems(bools.filter((symbol) => symbol.section !== 'input')), free: true, title: t('ld.coilWrites') };
}

// ---------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------

/**
 * The commands that delete, move or change what is in a cell. They act only on a cell the cursor is on, which the user
 * can see: with no cursor placed they do not fall back on the first cell, which would be one the user did not choose.
 */
const NEEDS_CURSOR: ReadonlySet<string> = new Set([
  'deleteElement', 'deleteRung', 'moveElementLeft', 'moveElementRight', 'moveElementUp', 'moveElementDown', 'moveRungUp', 'moveRungDown',
  'bindVariable', 'widenBranch', 'narrowBranch', 'removeBranch', 'addRow',
]);

/** Runs one command of the table. Unknown ids and refusals leave the document and the cursor as they were. */
export function runLDCommand(model: LDModel, given: LDCursor | null, command: string, argument: LDArgument = {}): LDOutcome {
  // a cursor on a rung that is gone (deleted, or the file changed) is no cursor: it would act on a cell nobody sees
  const cursor = given !== null && model.rungs.some((rung) => rung.id === given.rungId) ? given : null;
  if (cursor === null && NEEDS_CURSOR.has(command)) {
    return refuse(model, cursor, 'The cursor is not on a cell yet: press an arrow key, or click a cell, and then repeat the key.');
  }
  switch (command) {
    case 'cursorLeft': case 'cursorRight': case 'cursorUp': case 'cursorDown': case 'rowStart': case 'rowEnd':
    case 'previousRung': case 'nextRung': case 'firstRung': case 'lastRung':
      return moved(model, moveCursor(model, cursor, command));
    case 'insertContact': case 'insertContactNC': case 'insertContactP': case 'insertCoil': case 'insertCoilSet': case 'insertCoilReset': case 'insertBranch':
      return insertAt(model, cursor, QUICK_INSERT[command]!);
    case 'insertElement':
      return argument.insert ? insertAt(model, cursor, argument.insert) : refuse(model, cursor, 'Choose the element to insert.');
    case 'openPalette':
      return placeOf(model, cursor) ? { model, cursor: cursor ?? cursorAt(placeOf(model, cursor)!), changed: false, prompt: { kind: 'palette' }, say: t('keyboard.palette.element') } : refuse(model, cursor, describeCursor(model, cursor));
    case 'activate': {
      const place = placeOf(model, cursor);
      if (!place) return refuse(model, cursor, describeCursor(model, cursor));
      const element = elementAt(place);
      if (!element) return { model, cursor: cursorAt(place), changed: false, prompt: { kind: 'palette' }, say: t('keyboard.palette.element') };
      return { model, cursor: cursorAt(place), changed: false, prompt: { kind: 'select', rungId: place.rung.id, elementId: element.id }, selection: { rungId: place.rung.id, elementId: element.id }, say: t('ld.selected', { name: elementName(element) }) };
    }
    case 'bindVariable': return argument.variable === undefined ? askBinding(model, cursor) : bindAt(model, cursor, argument.variable);
    case 'editComment': {
      const place = placeOf(model, cursor);
      return place ? { model, cursor: cursorAt(place), changed: false, prompt: { kind: 'comment', rungId: place.rung.id }, say: t('ld.commentOfRung', { rung: place.rung.number }) } : refuse(model, cursor, describeCursor(model, cursor));
    }
    case 'moveElementLeft': return moveElement(model, cursor, 0, -1);
    case 'moveElementRight': return moveElement(model, cursor, 0, 1);
    case 'moveElementUp': return moveElement(model, cursor, -1, 0);
    case 'moveElementDown': return moveElement(model, cursor, 1, 0);
    case 'addRung': return addRung(model, cursor);
    case 'addRow': return addEmptyRow(model, cursor);
    case 'moveRungUp': return moveRung(model, cursor, -1);
    case 'moveRungDown': return moveRung(model, cursor, 1);
    case 'widenBranch': return resizeBranch(model, cursor, 1);
    case 'narrowBranch': return resizeBranch(model, cursor, -1);
    case 'removeBranch': return dropBranch(model, cursor);
    case 'deleteElement': return deleteElement(model, cursor);
    case 'deleteRung': return deleteRung(model, cursor);
    default: return refuse(model, cursor, `${command} is not a command of the ladder editor.`);
  }
}

function insertAt(model: LDModel, cursor: LDCursor | null, item: LDInsert): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const here = elementAt(place);
  if (here) return refuse(model, cursor, `The cell is taken by ${elementName(here)}: move the cursor to an empty cell.`);
  const at = t('ld.at', { rung: place.rung.number, row: place.row + 1, col: place.col + 1 });
  if (item.category === 'structure') {
    const rung = addBranchAt(place.rung, place.row, place.col);
    return { model: withRung(model, rung), cursor: cursorAt(place), changed: true, selection: { rungId: rung.id, elementId: null }, say: t('ld.branchStarted', { at }) };
  }
  const { element, declare } = newElement(model, item, place.row, place.col);
  const rung = placeElement(place.rung, element, place.row, place.col);
  const next: LDModel = declare
    ? { ...withRung(model, rung), variables: { ...model.variables, local: [...model.variables.local, { name: declare.name, type: declare.type }] } }
    : withRung(model, rung);
  const bindable = !isFunctionBlock(element.type);
  return {
    model: next,
    cursor: cursorAt(place),
    changed: true,
    selection: { rungId: rung.id, elementId: element.id },
    // a contact or a coil is of no use until it is bound: the list of symbols is asked at once
    ...(bindable ? { prompt: { kind: 'bind', elementId: element.id } as LDPrompt } : {}),
    say: t('ld.inserted', { name: elementName(element), at, extra: bindable ? t('ld.chooseVariable') : declare ? t('ld.declared', { name: declare.name, type: declare.type }) : '' }),
  };
}

function askBinding(model: LDModel, cursor: LDCursor | null): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const element = elementAt(place);
  if (!element) return refuse(model, cursor, 'There is no element in this cell: insert a contact, a coil or a function block first.');
  if (isFunctionBlock(element.type) && element.fbType && LD_MODBUS_HELPERS.has(element.fbType)) {
    return refuse(model, cursor, `${element.fbType} has no instance to bind.`);
  }
  return { model, cursor: cursorAt(place), changed: false, prompt: { kind: 'bind', elementId: element.id }, say: t('ld.bind', { name: elementName(element) }) };
}

function bindAt(model: LDModel, cursor: LDCursor | null, name: string): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const element = elementAt(place);
  if (!element) return refuse(model, cursor, 'There is no element in this cell to bind.');
  const text = name.trim();
  if (text === '') return refuse(model, cursor, 'A variable name is needed.');
  let bound: LDElement;
  if (isFunctionBlock(element.type)) {
    const declared = model.variables.local.find((variable) => variable.name === text);
    if (!declared || !sameType(declared.type, element.fbType)) return refuse(model, cursor, `${text} is not a declared variable of type ${element.fbType ?? 'the function block'}.`);
    bound = { ...element, instance: text };
  } else if (isContact(element.type) || isCoil(element.type)) {
    bound = { ...element, variable: text };
  } else {
    return refuse(model, cursor, 'This element has nothing to bind.');
  }
  const rung = placeElement(place.rung, bound, place.row, place.col);
  return { model: withRung(model, rung), cursor: cursorAt(place), changed: true, selection: { rungId: rung.id, elementId: bound.id }, say: t('ld.bound', { name: elementName(bound) }) };
}

function moveElement(model: LDModel, cursor: LDCursor | null, dRow: number, dCol: number): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const element = elementAt(place);
  if (!element) return refuse(model, cursor, 'There is no element under the cursor to move.');
  const row = place.row + dRow;
  const col = place.col + dCol;
  if (row < 0 || col < 0 || row >= place.rows || col >= place.cols) return refuse(model, cursor, 'The element is at the edge of the rung.');
  const there = place.rung.grid?.[row]?.[col]?.element;
  if (there) return refuse(model, cursor, `The cell is taken by ${elementName(there)}.`);
  const rung = placeElement(removeElementAt(place.rung, place.row, place.col), element, row, col);
  return { model: withRung(model, rung), cursor: { rungId: rung.id, row, col }, changed: true, selection: { rungId: rung.id, elementId: element.id }, say: t('ld.moved', { name: elementName(element), row: row + 1, col: col + 1 }) };
}

/** A rung number nobody uses, as the id of a new rung. */
function freshRungId(model: LDModel): string {
  const used = new Set(model.rungs.map((rung) => rung.id.toLowerCase()));
  let number = model.rungs.length + 1;
  while (used.has(`rung_${number}`)) number += 1;
  return `rung_${number}`;
}

/** The document with an empty rung after the one with id `after` (at the end when it is not there). */
export function insertRungAfter(model: LDModel, after: string | null): { model: LDModel; rung: LDRung } {
  const index = after === null ? -1 : model.rungs.findIndex((rung) => rung.id === after);
  const at = index < 0 ? model.rungs.length : index + 1;
  const rung: LDRung = { ...createEmptyRung(at + 1), id: freshRungId(model) };
  return { model: { ...model, rungs: renumber([...model.rungs.slice(0, at), rung, ...model.rungs.slice(at)]) }, rung };
}

function addRung(model: LDModel, cursor: LDCursor | null): LDOutcome {
  const place = placeOf(model, cursor);
  const { model: next, rung } = insertRungAfter(model, place ? place.rung.id : null);
  const added = next.rungs.find((candidate) => candidate.id === rung.id)!;
  return { model: next, cursor: { rungId: rung.id, row: 0, col: 0 }, changed: true, selection: { rungId: rung.id, elementId: null }, say: t('ld.rungAdded', { rung: added.number }) };
}

function addEmptyRow(model: LDModel, cursor: LDCursor | null): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const rung = addRow(place.rung);
  return { model: withRung(model, rung), cursor: cursorAt(place), changed: true, selection: { rungId: rung.id, elementId: null }, say: t('ld.rowAdded', { row: place.rows + 1, rung: place.rung.number }) };
}

function moveRung(model: LDModel, cursor: LDCursor | null, delta: -1 | 1): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const target = place.index + delta;
  if (target < 0 || target >= model.rungs.length) return refuse(model, cursor, delta < 0 ? 'This is the first rung.' : 'This is the last rung.');
  const rungs = [...model.rungs];
  [rungs[place.index], rungs[target]] = [rungs[target]!, rungs[place.index]!];
  const next = { ...model, rungs: renumber(rungs) };
  return { model: next, cursor: cursorAt(place), changed: true, selection: { rungId: place.rung.id, elementId: null }, say: t('ld.rungMoved', { from: place.index + 1, to: target + 1 }) };
}

function innermostBranch(place: Place) {
  const around = getBranchesAtCell(place.rung, place.row, place.col);
  return [...around].sort((first, second) => (first.endCol - first.startCol) - (second.endCol - second.startCol))[0];
}

function resizeBranch(model: LDModel, cursor: LDCursor | null, delta: -1 | 1): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const branch = innermostBranch(place);
  if (!branch) return refuse(model, cursor, 'The cursor is not inside a parallel branch.');
  const end = branch.endCol + delta;
  if (end > place.cols - 1) return refuse(model, cursor, 'The branch already reaches the last column.');
  if (end <= branch.startCol) return refuse(model, cursor, 'The branch cannot be narrower than two columns.');
  if (delta < 0) {
    const [source, ...rest] = branch.rows;
    const taken = rest.filter((row) => row !== source).some((row) => (place.rung.grid?.[row] ?? []).some((cell, col) => col > end && col <= branch.endCol && cell.element));
    if (taken) return refuse(model, cursor, 'An element of the branch is in the column that would be given up: move it first.');
    if ((place.rung.branches ?? []).some((other) => other.parentBranchId === branch.id && other.endCol > end)) return refuse(model, cursor, 'A branch inside this one reaches that column: narrow it first.');
  }
  const rung = { ...place.rung, branches: (place.rung.branches ?? []).map((other) => (other.id === branch.id ? { ...other, endCol: end } : other)) };
  const normal = normalizeGridRung(rung);
  return { model: withRung(model, normal), cursor: cursorAt(place), changed: true, selection: { rungId: normal.id, elementId: null }, say: t('ld.branchSpans', { from: branch.startCol + 1, to: end + 1 }) };
}

function dropBranch(model: LDModel, cursor: LDCursor | null): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const branch = innermostBranch(place);
  if (!branch) return refuse(model, cursor, 'The cursor is not inside a parallel branch.');
  const rung = removeBranch(place.rung, branch.id);
  return { model: withRung(model, rung), cursor: cursorAt(place), changed: true, selection: { rungId: rung.id, elementId: null }, say: t('ld.branchRemoved', { from: branch.startCol + 1, to: branch.endCol + 1 }) };
}

function deleteElement(model: LDModel, cursor: LDCursor | null): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const element = elementAt(place);
  if (!element) return refuse(model, cursor, 'There is no element under the cursor to delete.');
  const rung = removeElementAt(place.rung, place.row, place.col);
  return { model: withRung(model, rung), cursor: cursorAt(place), changed: true, selection: { rungId: rung.id, elementId: null }, say: t('ld.elementDeleted', { name: elementName(element) }) };
}

function deleteRung(model: LDModel, cursor: LDCursor | null): LDOutcome {
  const place = placeOf(model, cursor);
  if (!place) return refuse(model, cursor, describeCursor(model, cursor));
  const rungs = renumber(model.rungs.filter((rung) => rung.id !== place.rung.id));
  const next = { ...model, rungs };
  const after = rungs[Math.min(place.index, rungs.length - 1)];
  return { model: next, cursor: after ? { rungId: after.id, row: 0, col: Math.min(place.col, Math.max(0, (after.gridConfig?.cols ?? DEFAULT_GRID_CONFIG.cols) - 1)) } : null, changed: true, selection: NO_LD_SELECTION, say: t('ld.rungDeleted', { rung: place.rung.number }) };
}
