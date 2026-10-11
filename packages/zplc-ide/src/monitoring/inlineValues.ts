/**
 * Inline values in a text editor (LNG-006): the value of each variable that a line names, shown after the line, read
 * from the program the debug map built from the file.
 *
 * What is a variable is the language service's reading of the project (`langsvc/projectIndex.ts`), not a pattern of
 * letters: a keyword, a function, a type or a name in a comment is never one. A member of a block instance or of a
 * structure is the path `Instance.Member`, which the map resolves through the declared members. A variable that is the
 * program's and that the map does not have is shown as unavailable; a name is never replaced by another.
 */

import { TokenType } from '@zplc/compiler';
import { parseIL } from '../compiler/il/parser';
import type { ProjectIndex } from '../langsvc/projectIndex';

export interface InlineTarget {
  line: number;
  /** 1-based column of the name, for a line of Structured Text; 1 for a line of IL. */
  column: number;
  /** The name as it is read on the line, `Counter` or `Motor.Running`. */
  label: string;
  /** The path of the variable in the program of the file. */
  variable: string;
}

const VALUE_KINDS: ReadonlySet<string> = new Set(['variable', 'input', 'output', 'inout', 'temp', 'global', 'external']);
const MAX_PER_LINE = 4;

/**
 * The variables that a Structured Text file names in its programs: what the debug map holds a single value of. A name
 * in a function or a function block is not shown: it belongs to every instance of the block, and the map holds the
 * instances' members under their instances.
 */
export function stInlineTargets(index: ProjectIndex, file: string): InlineTarget[] {
  const info = index.files.get(file);
  if (!info) return [];
  const tokens = index.tokensOf(file);
  const byPosition = new Map(tokens.map((token, at) => [`${token.line}:${token.column}`, at] as const));
  const found: InlineTarget[] = [];
  for (const reference of info.references) {
    // a member of a standard block (`T.Q`) has no symbol of the project: the library gave it
    const member = reference.builtin?.kind === 'member';
    if (reference.declaration || reference.label || (reference.symbol < 0 && !member)) continue;
    const symbol = index.symbol(reference.symbol);
    const scope = index.symbol(reference.scope);
    if (scope?.kind !== 'program' || (!symbol && !member)) continue;
    const at = byPosition.get(`${reference.line}:${reference.column}`);
    if (at === undefined) continue;
    // a name after a dot is a member: its path is the chain of names that leads to it
    const path: string[] = [tokens[at]!.value];
    let cursor = at;
    let valid = true;
    while (tokens[cursor - 1]?.type === TokenType.DOT) {
      const before = tokens[cursor - 2];
      if (before?.type !== TokenType.IDENTIFIER) { valid = false; break; }
      path.unshift(before.value);
      cursor -= 2;
    }
    if (!valid) continue;
    const rootSymbol = path.length === 1
      ? symbol
      : index.symbol(index.referenceAt(file, tokens[cursor]!.line, tokens[cursor]!.column)?.symbol ?? -1);
    if (!rootSymbol || !VALUE_KINDS.has(rootSymbol.kind)) continue;
    // the value of `A.B` is shown at `B`: a name that is the first of a longer chain is shown at the end of the chain; an
    // element of an array is not a variable of the map
    if (tokens[at + 1]?.type === TokenType.DOT || tokens[at + 1]?.type === TokenType.LBRACKET) continue;
    found.push({ line: reference.line, column: reference.column, label: path.join('.'), variable: path.join('.') });
  }
  return found;
}

/** The variables that the instructions of an Instruction List program name, by their lines. */
export function ilInlineTargets(source: string): InlineTarget[] {
  try {
    const program = parseIL(source);
    const declared = new Set(program.varBlocks.flatMap((block) => block.variables.map((variable) => variable.name.toUpperCase())));
    const found: InlineTarget[] = [];
    for (const instruction of program.instructions) {
      // the operand of a call is the block instance, which has no value of its own: its members are the values
      const operands = [instruction.operator.startsWith('CAL') ? undefined : instruction.operand, ...(instruction.fbParams ?? []).map((parameter) => parameter.value)];
      for (const operand of operands) {
        if (!operand || (operand.type !== 'identifier' && operand.type !== 'member_access')) continue;
        const base = (operand.base ?? operand.value).toUpperCase();
        if (declared.has(base)) found.push({ line: instruction.line, column: 1, label: operand.value, variable: operand.value });
      }
    }
    return found;
  } catch {
    return [];
  }
}

export interface InlineValue {
  line: number;
  column: number;
  label: string;
  /** What was read, as text; '—' when it is not available. */
  text: string;
  type: string | null;
  isBool: boolean;
  isTrue: boolean;
  available: boolean;
}

/** The widgets of a file: each line has the values of its variables once each, at most four, the members of blocks first. */
export function inlineValues(
  targets: readonly InlineTarget[],
  read: (variable: string) => { reading: number | boolean | string | undefined; type: string; known: boolean } | undefined,
  format: (value: number | boolean | string, type: string) => string,
): InlineValue[] {
  const perLine = new Map<number, InlineValue[]>();
  for (const target of targets) {
    const list = perLine.get(target.line) ?? [];
    if (list.some((each) => each.label === target.label)) continue;
    const value = read(target.variable);
    const available = value?.known === true && value.reading !== undefined;
    const reading = available ? value.reading! : undefined;
    list.push({
      line: target.line,
      column: target.column,
      label: target.label,
      text: reading === undefined ? '—' : format(reading, value!.type),
      type: value?.type || null,
      isBool: value?.type.toUpperCase() === 'BOOL',
      isTrue: reading === true || reading === 1,
      available,
    });
    perLine.set(target.line, list);
  }
  return [...perLine.values()].flatMap((list) =>
    [...list].sort((left, right) => Number(right.label.includes('.')) - Number(left.label.includes('.')) || left.column - right.column).slice(0, MAX_PER_LINE),
  );
}
