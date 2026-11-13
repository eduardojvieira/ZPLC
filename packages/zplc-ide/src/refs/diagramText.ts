/**
 * The text of a Ladder, FBD or SFC document as fields and occurrences (plan-u2.md, FND-003, FND-004). A diagram has no
 * text position, so a place is an element id and the field of the element that holds the name; a field that holds an
 * expression also carries the column of the token (`condition:5`, as IL carries `operand:<column>`, `body:2:7` for a
 * token on line 2 of a multi-line body). Pure: no store, no build. A document that does not parse yields nothing.
 */
import { tokenizeWithErrors, TokenType } from '@zplc/compiler';
import type { DeclaredVariable } from '../editors/symbols';
import { loadFBDFile, loadLDFile, loadSFCFile } from '../models/visualFileLoad';
import type { FBDModel } from '../models/fbd';
import type { LDElement, LDModel } from '../models/ldTypes';
import type { SFCModel } from '../models/sfc';
import {
  actionElement,
  blockElement,
  cellElement,
  rungElement,
  rungItemElement,
  stepElement,
  transitionElement,
  type SourceElementId,
} from '../models/sourceElements';
import type { Language, Occurrence, Place } from './contracts';
import { ilOccurrences } from './ilText';

export interface DiagramField {
  place: Place;
  field: string;
  kind: 'name' | 'variable' | 'comment' | 'expression';
  text: string;
}
export interface DiagramFile {
  path: string;
  language: 'LD' | 'FBD' | 'SFC';
  content: string;
}
export interface DiagramOccurrences {
  occurrences: Occurrence[];
  /** The declared variables by upper-case name (the language is not case sensitive). */
  declared: ReadonlyMap<string, DeclaredVariable>;
  ok: boolean;
}

interface Doc {
  file: string;
  language: Language;
  fields: DiagramField[];
  occurrences: Occurrence[];
}
type Row = DeclaredVariable & { comment?: string };
type Variables = { local?: readonly Row[]; inputs?: readonly Row[]; outputs?: readonly Row[] };
type Role = 'use' | 'write';
type Kind = DiagramField['kind'];

const CONNECTED = 'CONNECTED';

/** The identifiers of an expression: not keywords, not typed literals, not the member after a dot (`Inst.Q` is `Inst`). */
function names(text: string): Array<{ name: string; line: number; column: number; assigned: boolean }> {
  let tokens;
  try {
    tokens = tokenizeWithErrors(text).tokens;
  } catch {
    return [];
  }
  const found: Array<{ name: string; line: number; column: number; assigned: boolean }> = [];
  tokens.forEach((token, i) => {
    if (token.type !== TokenType.IDENTIFIER || token.value.includes('#') || tokens[i - 1]?.type === TokenType.DOT) return;
    found.push({ name: token.value, line: token.line, column: token.column, assigned: tokens[i + 1]?.type === TokenType.ASSIGN });
  });
  return found;
}

/** `field` when it is the whole text, else `field:column` (or `field:line:column` past the first line). */
function located(field: string, line: number, column: number): string {
  return line > 1 ? `${field}:${line}:${column}` : `${field}:${column}`;
}

/** Add the field and, for a name-bearing kind with a role, one occurrence per identifier token. */
function add(doc: Doc, element: SourceElementId, field: string, kind: Kind, text: unknown, role?: Role, assign = false): void {
  if (typeof text !== 'string' || text === '') return;
  doc.fields.push({ place: { kind: 'element', file: doc.file, element, field }, field, kind, text });
  if (!role) return;
  const tokens = names(text);
  for (const token of tokens) {
    const whole = tokens.length === 1 && text.trim() === token.name;
    doc.occurrences.push({
      language: doc.language,
      place: { kind: 'element', file: doc.file, element, field: whole ? field : located(field, token.line, token.column) },
      role: assign && token.assigned ? 'write' : role,
      text: token.name,
    });
  }
}

/** A row of a variable table: its fields, a declaration, and its address as a binding. */
function tables(doc: Doc, variables: Variables | undefined, declared: Map<string, DeclaredVariable>): void {
  for (const section of ['inputs', 'outputs', 'local'] as const) {
    for (const row of variables?.[section] ?? []) {
      if (typeof row?.name !== 'string' || row.name === '') continue;
      const place: Place = { kind: 'table', file: doc.file, section, name: row.name };
      const language = doc.language;
      for (const [field, kind, text] of [
        ['name', 'variable', row.name],
        ['type', 'name', row.type],
        ['address', 'name', row.address],
        ['comment', 'comment', row.comment],
      ] as const) {
        if (typeof text === 'string' && text !== '') doc.fields.push({ place, field, kind, text });
      }
      doc.occurrences.push({ language, place, role: 'declaration', text: row.name });
      if (row.address) doc.occurrences.push({ language, place, role: 'binding', text: row.address });
      declared.set(row.name.toUpperCase(), { name: row.name, type: row.type, ...(row.address ? { address: row.address } : {}) });
    }
  }
}

const COILS = /^coil/;

function ldElement(doc: Doc, element: SourceElementId, e: LDElement): void {
  add(doc, element, 'variable', 'variable', e.variable, COILS.test(e.type) ? 'write' : 'use');
  add(doc, element, 'instance', 'variable', e.instance, 'use');
  add(doc, element, 'fbType', 'name', e.fbType);
  for (const [pin, value] of Object.entries(e.parameters ?? {})) {
    if (value !== CONNECTED) add(doc, element, `parameters.${pin}`, 'expression', value, 'use');
  }
  for (const [pin, value] of Object.entries(e.outputs ?? {})) add(doc, element, `outputs.${pin}`, 'variable', value, 'write');
  add(doc, element, 'functionName', 'name', e.functionName);
  (e.operands ?? []).forEach((operand, i) => add(doc, element, `operands.${i}`, 'expression', operand, 'use'));
  add(doc, element, 'output', 'variable', e.output, 'write');
  add(doc, element, 'comment', 'comment', e.comment);
}

function ldDoc(doc: Doc, model: LDModel): void {
  for (const rung of model.rungs) {
    add(doc, rungElement(rung.id), 'comment', 'comment', rung.comment);
    (rung.grid ?? []).forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell?.element) ldElement(doc, cellElement(rung.id, r, c), cell.element);
      }),
    );
    // A file written as a list of elements has no grid.
    for (const e of rung.elements ?? []) ldElement(doc, rungItemElement(rung.id, e.id), e);
  }
}

function fbdDoc(doc: Doc, model: FBDModel): void {
  for (const block of model.blocks) {
    const element = blockElement(block.id);
    add(doc, element, 'type', 'name', block.type);
    add(doc, element, 'instanceName', 'variable', block.instanceName, 'use');
    add(doc, element, 'variableName', 'variable', block.variableName, block.type === 'output' ? 'write' : 'use');
    if (block.value !== null && block.value !== undefined) add(doc, element, 'value', 'expression', String(block.value));
    add(doc, element, 'address', 'name', block.address);
    add(doc, element, 'comment', 'comment', block.comment);
  }
}

function sfcDoc(doc: Doc, model: SFCModel): void {
  for (const step of model.steps) {
    const element = stepElement(step.id);
    add(doc, element, 'name', 'name', step.name);
    add(doc, element, 'comment', 'comment', step.comment);
    (step.actions ?? []).forEach((a, i) => {
      add(doc, element, `actions.${i}.actionName`, 'name', a.actionName);
      add(doc, element, `actions.${i}.comment`, 'comment', a.comment);
    });
  }
  for (const t of model.transitions) {
    const element = transitionElement(t.id);
    add(doc, element, 'condition', 'expression', t.condition, 'use');
    add(doc, element, 'comment', 'comment', t.comment);
  }
  for (const action of model.actions ?? []) {
    const element = actionElement(action.id);
    add(doc, element, 'name', 'name', action.name);
    add(doc, element, 'comment', 'comment', action.comment);
    if (action.type === 'IL') {
      // The body is an IL file without declarations: its line elements become fields of the action body.
      add(doc, element, 'body', 'expression', action.body);
      for (const o of ilOccurrences(doc.file, action.body)) {
        const at = o.place.kind === 'element' ? /^line:(\d+)$/.exec(o.place.element) : null;
        const column = o.place.kind === 'element' ? /^operand:(\d+)$/.exec(o.place.field) : null;
        if (!at || !column) continue;
        const field = located('body', Number(at[1]), Number(column[1]));
        doc.occurrences.push({ ...o, language: 'SFC', place: { kind: 'element', file: doc.file, element, field } });
      }
    } else {
      // ponytail: `Name := ...` marks a write, so a named parameter of a call in an action body reads as one too.
      add(doc, element, 'body', 'expression', action.body, 'use', true);
    }
  }
}

function read(file: DiagramFile): { doc: Doc; declared: Map<string, DeclaredVariable>; ok: boolean } {
  const doc: Doc = { file: file.path, language: file.language, fields: [], occurrences: [] };
  const declared = new Map<string, DeclaredVariable>();
  const loaded =
    file.language === 'LD'
      ? loadLDFile(file.path, file.content)
      : file.language === 'FBD'
        ? loadFBDFile(file.path, file.content)
        : loadSFCFile(file.path, file.content);
  if (!loaded.ok) return { doc, declared, ok: false };
  tables(doc, loaded.model.variables as Variables | undefined, declared);
  if (file.language === 'LD') ldDoc(doc, loaded.model as LDModel);
  else if (file.language === 'FBD') fbdDoc(doc, loaded.model as FBDModel);
  else sfcDoc(doc, loaded.model as SFCModel);
  return { doc, declared, ok: true };
}

/** The text of every field a person reads or searches; `[]` for a document that does not parse. */
export function diagramFields(file: DiagramFile): DiagramField[] {
  return read(file).doc.fields;
}

/** The identifier tokens of those fields and the variable table rows; never throws. */
export function diagramOccurrences(file: DiagramFile): DiagramOccurrences {
  const { doc, declared, ok } = read(file);
  return { occurrences: doc.occurrences, declared, ok };
}
