/**
 * ZPLC IL-to-ST Transpiler
 *
 * SPDX-License-Identifier: MIT
 *
 * Converts IEC 61131-3 Instruction List (IL) programs to Structured Text (ST).
 * This enables IL programs to be compiled using the existing ST compiler pipeline.
 *
 * Transpilation strategy:
 * - The IL Current Result (CR) is a typed accumulator: one ST variable per elementary type and
 *   parenthesis depth (`IL_CR_REAL`, `IL_CR1_BOOL`...). The type of the accumulator at each
 *   instruction is known at transpile time (a forward analysis over the program, merged at labels),
 *   so a REAL stays a REAL and a BOOL stays a BOOL (LNG-019).
 * - Load operators (LD, LDN) assign values to the accumulator of the operand's type.
 * - Store operators (ST, STN, S, R) read the accumulator and assign to variables.
 * - Arithmetic, logical and comparison operators work on the accumulator in place.
 * - Parenthesised operations (`AND( ... )`) use the accumulator of the next depth.
 * - Jumps and labels use a state machine in a bounded WHILE/CASE that restarts at state 0 on every
 *   scan (LNG-018).
 * - Anything that cannot be translated is an error that names the IL line (LNG-002): the output is
 *   never a comment, a default value or nothing.
 */

import { getFB, parseIOAddress } from '@zplc/compiler';
import { getDefaultPorts } from '../../models/fbd';
import type { ILProgram, ILInstruction, ILVarBlock, ILOperand, ILFBParam } from './parser';
import { Listing, ilLineElement, type ElementDiagnostic, type SourceMapRange } from '../../models/sourceElements';

// =============================================================================
// Types
// =============================================================================

export interface TranspileResult {
  success: boolean;
  source: string;
  errors: string[];
  /** Line of the first error in the IL source, when the error has one. */
  line?: number;
  /** Each error with the IL line it is about (LNG-003). */
  diagnostics?: ElementDiagnostic[];
  /** For each line of the IL source, the lines of `source` written for it (LNG-004). */
  sourceMap?: SourceMapRange[];
}

/**
 * Symbols declared outside the IL program (VAR_GLOBAL, user function blocks) that an operand may
 * refer to. Keys are upper case.
 */
export interface ILProjectSymbols {
  /** Global variable name -> type name. */
  globals: ReadonlyMap<string, string>;
  /** Function block name -> (member name -> type name). */
  functionBlocks: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

export interface ILTranspileOptions {
  symbols?: ILProjectSymbols;
}

// =============================================================================
// Internal Variables
// =============================================================================

// State machine variables for jump support
const STATE_VAR = 'IL_STATE';
const DONE_VAR = 'IL_DONE';
const LOOP_VAR = 'IL_LOOP_COUNT';
const MAX_CYCLES = 100000; // Safety limit for state machine loops

/** Types the accumulator can hold. */
const ELEMENTARY_TYPES = new Set([
  'BOOL',
  'SINT',
  'INT',
  'DINT',
  'LINT',
  'USINT',
  'UINT',
  'UDINT',
  'ULINT',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'REAL',
  'LREAL',
  'TIME',
  'STRING',
]);
const NUMERIC_TYPES = new Set([
  'SINT',
  'INT',
  'DINT',
  'LINT',
  'USINT',
  'UINT',
  'UDINT',
  'ULINT',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'REAL',
  'LREAL',
]);
const REAL_TYPES = new Set(['REAL', 'LREAL']);

const LOGIC_OPS = new Set(['AND', 'ANDN', 'OR', 'ORN', 'XOR', 'XORN']);
const ARITHMETIC_OPS = new Set(['ADD', 'SUB', 'MUL', 'DIV', 'MOD']);
const COMPARISON_OPS = new Set(['GT', 'GE', 'EQ', 'NE', 'LT', 'LE']);
const JUMP_OPS = new Set(['JMP', 'JMPC', 'JMPCN']);
const RETURN_OPS = new Set(['RET', 'RETC', 'RETCN']);
const CALL_OPS = new Set(['CAL', 'CALC', 'CALCN']);

/** Compile-time Modbus tag helpers: `CAL MB_COIL(IN := Var, ADDR := 100)` has no instance. */
const MODBUS_HELPERS: Record<string, string> = {
  MB_COIL: 'MODBUS_COIL',
  MB_DISCRETE_INPUT: 'MODBUS_DISCRETE_INPUT',
  MB_INPUT_REGISTER: 'MODBUS_INPUT_REGISTER',
  MB_HOLDING_REGISTER: 'MODBUS_HOLDING_REGISTER',
};

const ST_OPERATOR: Record<string, string> = {
  AND: 'AND',
  ANDN: 'AND',
  OR: 'OR',
  ORN: 'OR',
  XOR: 'XOR',
  XORN: 'XOR',
  ADD: '+',
  SUB: '-',
  MUL: '*',
  DIV: '/',
  MOD: 'MOD',
  GT: '>',
  GE: '>=',
  EQ: '=',
  NE: '<>',
  LT: '<',
  LE: '<=',
};

/**
 * The accumulator type: null while nothing has loaded it, CONFLICT when it depends on the path,
 * UNKNOWN after an operand whose type could not be determined (already reported, so it does not cascade).
 */
type CrType = string | null;
const CONFLICT = '<conflict>';
const UNKNOWN = '<unknown>';

/** What the analysis records for an instruction. */
interface InstructionInfo {
  /** Accumulator type before the instruction, at the instruction's own parenthesis depth. */
  cr: CrType;
  /** No path reaches the instruction (it follows an unconditional jump or RET with no label). */
  dead?: boolean;
  /** Parenthesis depth of the instruction (0 outside parentheses). */
  depth: number;
  /** For `)`: the type of the outer accumulator and of the inner result. */
  outerType?: CrType;
  innerType?: CrType;
  /** For `)`: the operator that opened the parenthesis. */
  opened?: ILInstruction;
  /** For an opening operation: the type of the first inner operand, when it has one. */
  operandType?: string;
}

interface StateBlock {
  label: string | null;
  indexes: number[];
}

type DirectVars = Map<string, { name: string; type: string }>;

// =============================================================================
// IL-to-ST Transpiler
// =============================================================================

export function transpileILToST(program: ILProgram, options: ILTranspileOptions = {}): TranspileResult {
  const errors: string[] = [];
  const diagnostics: ElementDiagnostic[] = [];
  let firstErrorLine: number | undefined;
  let reporting = true;
  const fail = (line: number, message: string): void => {
    if (!reporting) return;
    errors.push(`IL line ${line}: ${message}`);
    diagnostics.push({ message: `IL line ${line}: ${message}`, element: ilLineElement(line), line });
    if (firstErrorLine === undefined) firstErrorLine = line;
  };

  // Symbol table for type inference
  const varTypes = new Map<string, string>();
  for (const block of program.varBlocks) {
    for (const v of block.variables) {
      varTypes.set(v.name.toUpperCase(), v.dataType.toUpperCase());
    }
  }
  const symbols = options.symbols;
  const instructions = program.instructions;

  // Labels: each is defined once, and every jump has a target
  const labelLine = new Map<string, number>();
  for (const instr of instructions) {
    if (!instr.label) continue;
    const key = instr.label.toUpperCase();
    const first = labelLine.get(key);
    const line = instr.labelLine ?? instr.line;
    if (first !== undefined) fail(line, `label '${instr.label}' is already defined at line ${first}`);
    else labelLine.set(key, line);
  }
  for (const instr of instructions) {
    if (JUMP_OPS.has(instr.operator) && instr.operand && !labelLine.has(instr.operand.value.toUpperCase())) {
      fail(instr.line, `${instr.operator} jumps to unknown label '${instr.operand.value}'`);
    }
  }

  // Direct addresses used as operands become declared variables (ST has no direct-address expressions)
  const directVars: DirectVars = new Map();

  /** The type of an operand, or undefined (after reporting why) when it cannot be determined. */
  const operandType = (operand: ILOperand, line: number, forCall = false): string | undefined => {
    switch (operand.type) {
      case 'literal':
        return literalType(operand);
      case 'io_address': {
        try {
          const address = parseIOAddress(operand.value);
          const type =
            address.size === 'X'
              ? 'BOOL'
              : address.size === 'B'
                ? 'BYTE'
                : address.size === 'W'
                  ? 'WORD'
                  : address.size === 'D'
                    ? 'DWORD'
                    : undefined;
          if (!type) {
            fail(line, `direct address ${operand.value} needs a size (X, B, W or D)`);
            return undefined;
          }
          if (!directVars.has(operand.value)) {
            directVars.set(operand.value, { name: `IL_IO_${operand.value.slice(1).replace(/\./g, '_')}`, type });
          }
          return type;
        } catch {
          fail(line, `invalid direct address ${operand.value}`);
          return undefined;
        }
      }
      case 'member_access': {
        const baseKey = (operand.base ?? '').toUpperCase();
        const baseType = varTypes.get(baseKey) ?? symbols?.globals.get(baseKey);
        if (!baseType) {
          fail(line, `'${operand.base}' is not declared; declare it in a VAR block of this program`);
          return undefined;
        }
        const type = memberType(baseType, (operand.member ?? '').toUpperCase(), symbols);
        if (!type) {
          fail(
            line,
            `the type of '${operand.value}' cannot be determined (${baseType} has no member '${
              operand.member
            }' that the accumulator can hold)`,
          );
          return undefined;
        }
        return type;
      }
      case 'identifier': {
        const key = operand.value.toUpperCase();
        const type = varTypes.get(key) ?? symbols?.globals.get(key);
        if (!type) {
          fail(line, `'${operand.value}' is not declared; declare it in a VAR block of this program`);
          return undefined;
        }
        if (forCall) return type;
        if (!ELEMENTARY_TYPES.has(type)) {
          fail(line, `'${operand.value}' has type ${type}, which the accumulator cannot hold`);
          return undefined;
        }
        return type;
      }
      default:
        fail(line, `operand '${operand.value}' cannot be used here`);
        return undefined;
    }
  };

  // =========================================================================
  // Analysis: the type of the accumulator at every instruction
  // =========================================================================

  const info: InstructionInfo[] = instructions.map(() => ({ cr: null, depth: 0 }));
  const labelIn = new Map<string, CrType | undefined>();

  // undefined is "no path reaches here yet": the identity of the merge
  const mergeTypes = (a: CrType | undefined, b: CrType | undefined): CrType | undefined => {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
    return a === b ? a : CONFLICT;
  };

  /** One forward pass; returns whether the types reaching a label changed. */
  const analyze = (): boolean => {
    let changed = false;
    let cur: CrType | undefined = null;
    const frames: Array<{ op: ILInstruction; outer: CrType }> = [];

    const need = (instr: ILInstruction, what: string = instr.operator): string | undefined => {
      if (cur === undefined || cur === UNKNOWN) return undefined; // dead code, or already reported
      if (cur === null) {
        fail(instr.line, `${what} reads the accumulator before any LD has loaded it`);
        return undefined;
      }
      if (cur === CONFLICT) {
        fail(instr.line, `${what} reads an accumulator whose type depends on the path that reached it; load it again after the label`);
        return undefined;
      }
      return cur;
    };
    const needBool = (instr: ILInstruction): void => {
      const t = need(instr);
      if (t !== undefined && t !== 'BOOL') fail(instr.line, `${instr.operator} needs a BOOL accumulator, it holds ${t}`);
    };
    const isBitOperable = (t: string): boolean => t === 'BOOL' || (NUMERIC_TYPES.has(t) && !REAL_TYPES.has(t));

    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      const op = instr.operator;
      if (instr.label !== undefined) {
        if (frames.length > 0) fail(instr.line, `label '${instr.label}' is inside a parenthesised operation`);
        cur = mergeTypes(cur, labelIn.get(instr.label.toUpperCase()));
      }
      info[i].dead = cur === undefined;
      info[i].cr = cur ?? null;
      info[i].depth = frames.length;

      if (frames.length > 0 && (JUMP_OPS.has(op) || RETURN_OPS.has(op) || CALL_OPS.has(op))) {
        fail(instr.line, `${op} is not allowed inside a parenthesised operation`);
      }

      // Parenthesised operation: `AND( B` opens a new accumulator
      if (instr.hasOpenParen) {
        const outer = need(instr);
        frames.push({ op: instr, outer: outer ?? (cur === undefined ? null : cur) });
        if (instr.operand) {
          const t = operandType(instr.operand, instr.line);
          info[i].operandType = t;
          cur = t ?? UNKNOWN;
        } else {
          cur = null;
        }
        continue;
      }

      switch (op) {
        case 'NOP':
          break;
        case ')': {
          const frame = frames.pop();
          if (!frame) {
            fail(instr.line, "')' has no matching opening parenthesis");
            break;
          }
          const opened = frame.op.operator;
          const inner = need(instr, `')' closing ${opened}(`);
          info[i].outerType = frame.outer;
          info[i].innerType = inner ?? null;
          info[i].opened = frame.op;
          info[i].depth = frames.length;
          const outerKnown = frame.outer !== null && frame.outer !== UNKNOWN && frame.outer !== CONFLICT;
          if (inner !== undefined && outerKnown && (frame.outer === 'BOOL') !== (inner === 'BOOL') && !COMPARISON_OPS.has(opened)) {
            fail(frame.op.line, `${opened}( combines a ${frame.outer} accumulator with a ${inner} result`);
          }
          cur = COMPARISON_OPS.has(opened) ? 'BOOL' : (frame.outer ?? UNKNOWN);
          break;
        }
        case 'LD':
        case 'LDN': {
          if (!instr.operand) {
            fail(instr.line, `${op} needs an operand`);
            cur = UNKNOWN;
            break;
          }
          const t = operandType(instr.operand, instr.line);
          if (op === 'LDN' && t !== undefined && !isBitOperable(t)) {
            fail(instr.line, `LDN needs a BOOL or bit-string operand, '${instr.operand.value}' is ${t}`);
          }
          cur = t ?? UNKNOWN;
          break;
        }
        case 'ST':
        case 'STN': {
          const t = need(instr);
          if (!instr.operand) break;
          if (instr.operand.type === 'literal') {
            fail(instr.line, `${op} needs a variable, '${instr.operand.value}' is a literal`);
            break;
          }
          const target = operandType(instr.operand, instr.line);
          if (t !== undefined && target !== undefined && (t === 'BOOL') !== (target === 'BOOL')) {
            fail(instr.line, `${op} stores a ${t} accumulator in '${instr.operand.value}' of type ${target}`);
          }
          if (op === 'STN' && t !== undefined && !isBitOperable(t)) {
            fail(instr.line, `STN needs a BOOL or bit-string accumulator, it holds ${t}`);
          }
          break;
        }
        case 'S':
        case 'R': {
          needBool(instr);
          if (!instr.operand) break;
          if (instr.operand.type === 'literal') {
            fail(instr.line, `${op} needs a variable, '${instr.operand.value}' is a literal`);
            break;
          }
          const target = operandType(instr.operand, instr.line);
          if (target !== undefined && target !== 'BOOL') {
            fail(instr.line, `${op} needs a BOOL variable, '${instr.operand.value}' is ${target}`);
          }
          break;
        }
        case 'NOT':
        case 'NEG': {
          const t = need(instr);
          if (t !== undefined && op === 'NEG' && !NUMERIC_TYPES.has(t) && t !== 'TIME') {
            fail(instr.line, `NEG needs a numeric accumulator, it holds ${t}`);
          }
          if (t !== undefined && op === 'NOT' && !isBitOperable(t)) {
            fail(instr.line, `NOT needs a BOOL or bit-string accumulator, it holds ${t}`);
          }
          break;
        }
        case 'JMP':
        case 'JMPC':
        case 'JMPCN': {
          if (op !== 'JMP') needBool(instr);
          const target = instr.operand?.value.toUpperCase();
          if (target !== undefined) {
            const before = labelIn.get(target);
            const merged = mergeTypes(before, cur);
            if (merged !== before) {
              labelIn.set(target, merged);
              changed = true;
            }
          }
          if (op === 'JMP') cur = undefined;
          break;
        }
        case 'RET':
          cur = undefined;
          break;
        case 'RETC':
        case 'RETCN':
          needBool(instr);
          break;
        case 'CAL':
        case 'CALC':
        case 'CALCN': {
          if (op !== 'CAL') needBool(instr);
          if (!instr.operand) break;
          if (instr.operand.value.toUpperCase() in MODBUS_HELPERS) {
            const names = (instr.fbParams ?? []).map((p) => p.name.toUpperCase());
            for (const required of ['IN', 'ADDR']) {
              if (!names.includes(required)) fail(instr.line, `${instr.operand.value} needs the parameter ${required}`);
            }
            for (const param of instr.fbParams ?? []) operandType(param.value, instr.line);
            break;
          }
          const callee = operandType(instr.operand, instr.line, true);
          if (callee === undefined) break;
          if (!isFunctionBlockType(callee, symbols)) {
            fail(
              instr.line,
              ELEMENTARY_TYPES.has(callee)
                ? `'${instr.operand.value}' is of type ${callee}, not a function block instance`
                : `'${instr.operand.value}' is of type ${callee}, which is not a function block the transpiler knows (a user function ` +
                    `block has to be declared in a file of the project)`,
            );
            break;
          }
          for (const param of instr.fbParams ?? []) {
            const known = getFB(callee);
            if (known && !known.members.some((m) => m.name.toUpperCase() === param.name.toUpperCase() && m.isInput)) {
              fail(instr.line, `'${param.name}' is not an input of ${callee} '${instr.operand.value}'`);
            }
            operandType(param.value, instr.line);
          }
          break;
        }
        default: {
          // AND, OR, XOR (+N), ADD...MOD, GT...LE
          const t = need(instr);
          if (!instr.operand) {
            fail(instr.line, `${op} needs an operand`);
            break;
          }
          const o = operandType(instr.operand, instr.line);
          if (t !== undefined && o !== undefined) {
            const mismatch = (): void =>
              fail(instr.line, `${op} cannot combine a ${t} accumulator with '${instr.operand!.value}' of type ${o}`);
            const tBool = t === 'BOOL';
            const oBool = o === 'BOOL';
            if (LOGIC_OPS.has(op)) {
              if (
                tBool !== oBool ||
                REAL_TYPES.has(t) ||
                REAL_TYPES.has(o) ||
                t === 'STRING' ||
                o === 'STRING' ||
                t === 'TIME' ||
                o === 'TIME'
              )
                mismatch();
            } else if (ARITHMETIC_OPS.has(op)) {
              if (tBool || oBool || t === 'STRING' || o === 'STRING') mismatch();
            } else if (tBool !== oBool) {
              mismatch();
            }
          }
          if (COMPARISON_OPS.has(op)) cur = 'BOOL';
          break;
        }
      }
    }

    for (const frame of frames) fail(frame.op.line, `${frame.op.operator}( is never closed`);
    return changed;
  };

  // Types reaching labels settle in a few passes (the merge only moves toward CONFLICT)
  reporting = false;
  for (let pass = 0; pass <= instructions.length + 1; pass++) {
    if (!analyze()) break;
  }
  reporting = true;
  analyze();

  if (errors.length > 0) {
    return { success: false, source: '', errors, line: firstErrorLine, diagnostics };
  }

  // =========================================================================
  // Code generation
  // =========================================================================

  const usedAccumulators = new Map<string, string>(); // variable name -> type
  const cr = (type: string, depth: number): string => {
    const name = depth === 0 ? `IL_CR_${type}` : `IL_CR${depth}_${type}`;
    usedAccumulators.set(name, type);
    return name;
  };

  const hasJumps = instructions.some((i) => JUMP_OPS.has(i.operator) || RETURN_OPS.has(i.operator));

  // Blocks of the state machine: a new one at every label and after every control flow instruction
  const blocks: StateBlock[] = [];
  if (hasJumps) {
    let current: StateBlock = { label: null, indexes: [] };
    instructions.forEach((instr, index) => {
      if (instr.label) {
        if (current.indexes.length > 0) blocks.push(current);
        current = { label: instr.label, indexes: [] };
      }
      current.indexes.push(index);
      if (JUMP_OPS.has(instr.operator) || RETURN_OPS.has(instr.operator)) {
        blocks.push(current);
        current = { label: null, indexes: [] };
      }
    });
    if (current.indexes.length > 0) blocks.push(current);
  }
  const labelToBlockId = new Map<string, number>();
  blocks.forEach((block, id) => {
    if (block.label) labelToBlockId.set(block.label.toUpperCase(), id);
  });

  const generate = (index: number, nextBlockId: number): string[] => {
    const instr = instructions[index];
    const { cr: before, depth } = info[index];
    const op = instr.operator;
    const t = before as string;
    const out: string[] = [];

    // Code no path reaches is not emitted
    if (info[index].dead) return out;

    const fallthrough = (): string => (nextBlockId !== -1 ? `${STATE_VAR} := ${nextBlockId};` : `${DONE_VAR} := TRUE;`);
    const text = (operand: ILOperand, context?: string): string => formatOperand(operand, context, directVars);
    const typeOf = (operand: ILOperand): string => operandTypeOf(operand, varTypes, symbols, directVars);

    if (instr.hasOpenParen) {
      if (instr.operand) {
        const innerType = info[index].operandType!;
        out.push(`${cr(innerType, depth + 1)} := ${text(instr.operand, innerType)};`);
      }
      return out;
    }

    switch (op) {
      case 'NOP':
        break;
      case ')': {
        const opened = info[index].opened!;
        const outer = cr(info[index].outerType as string, depth);
        const inner = cr(info[index].innerType as string, depth + 1);
        if (COMPARISON_OPS.has(opened.operator)) {
          out.push(`${cr('BOOL', depth)} := ${outer} ${ST_OPERATOR[opened.operator]} ${inner};`);
        } else {
          const negate = LOGIC_OPS.has(opened.operator) && opened.operator.endsWith('N') ? 'NOT ' : '';
          out.push(`${outer} := ${outer} ${ST_OPERATOR[opened.operator]} ${negate}${inner};`);
        }
        break;
      }
      case 'LD': {
        const type = typeOf(instr.operand!);
        out.push(`${cr(type, depth)} := ${text(instr.operand!, type)};`);
        break;
      }
      case 'LDN': {
        const type = typeOf(instr.operand!);
        out.push(`${cr(type, depth)} := NOT ${text(instr.operand!, type)};`);
        break;
      }
      case 'ST':
        out.push(`${text(instr.operand!)} := ${cr(t, depth)};`);
        break;
      case 'STN':
        out.push(`${text(instr.operand!)} := NOT ${cr(t, depth)};`);
        break;
      case 'S':
        out.push(`IF ${cr(t, depth)} THEN ${text(instr.operand!)} := TRUE; END_IF;`);
        break;
      case 'R':
        out.push(`IF ${cr(t, depth)} THEN ${text(instr.operand!)} := FALSE; END_IF;`);
        break;
      case 'NOT':
        out.push(`${cr(t, depth)} := NOT ${cr(t, depth)};`);
        break;
      case 'NEG':
        out.push(`${cr(t, depth)} := -${cr(t, depth)};`);
        break;
      case 'JMP':
        out.push(`${STATE_VAR} := ${labelToBlockId.get(instr.operand!.value.toUpperCase())};`);
        break;
      case 'JMPC':
      case 'JMPCN':
        out.push(`IF ${op === 'JMPCN' ? 'NOT ' : ''}${cr(t, depth)} THEN`);
        out.push(`    ${STATE_VAR} := ${labelToBlockId.get(instr.operand!.value.toUpperCase())};`);
        out.push('ELSE');
        out.push(`    ${fallthrough()}`);
        out.push('END_IF;');
        break;
      case 'CAL':
        out.push(generateFBCall(instr.operand!.value, instr.fbParams, directVars));
        break;
      case 'CALC':
      case 'CALCN':
        out.push(`IF ${op === 'CALCN' ? 'NOT ' : ''}${cr(t, depth)} THEN`);
        out.push(`    ${generateFBCall(instr.operand!.value, instr.fbParams, directVars)}`);
        out.push('END_IF;');
        break;
      case 'RET':
        out.push(`${DONE_VAR} := TRUE;`);
        break;
      case 'RETC':
      case 'RETCN':
        out.push(`IF ${op === 'RETCN' ? 'NOT ' : ''}${cr(t, depth)} THEN`);
        out.push(`    ${DONE_VAR} := TRUE;`);
        out.push('ELSE');
        out.push(`    ${fallthrough()}`);
        out.push('END_IF;');
        break;
      default: {
        // AND, OR, XOR (+N), ADD...MOD, GT...LE
        const operand = text(instr.operand!, t);
        if (COMPARISON_OPS.has(op)) {
          out.push(`${cr('BOOL', depth)} := ${cr(t, depth)} ${ST_OPERATOR[op]} ${operand};`);
        } else {
          const negate = LOGIC_OPS.has(op) && op.endsWith('N') ? 'NOT ' : '';
          out.push(`${cr(t, depth)} := ${cr(t, depth)} ${ST_OPERATOR[op]} ${negate}${operand};`);
        }
      }
    }
    return out;
  };

  // the statements of the program, each with the IL line it was written for; the scaffolding of the jumps has none
  const body = new Listing();
  if (hasJumps) {
    // Every scan starts at the first block: the state is not kept from the previous scan (LNG-018)
    body.push(`${STATE_VAR} := 0;`);
    body.push(`${DONE_VAR} := FALSE;`);
    body.push(`${LOOP_VAR} := 0;`);
    body.push(`WHILE NOT ${DONE_VAR} AND ${LOOP_VAR} < ${MAX_CYCLES} DO`);
    body.push(`    ${LOOP_VAR} := ${LOOP_VAR} + 1;`);
    body.push(`    CASE ${STATE_VAR} OF`);

    blocks.forEach((block, blockId) => {
      const nextBlockId = blockId + 1 < blocks.length ? blockId + 1 : -1;
      body.push(`        ${blockId}:`);
      for (const index of block.indexes) {
        for (const stmt of generate(index, nextBlockId)) body.push(`            ${stmt}`, ilLineElement(instructions[index].line));
      }
      // A block that does not end with control flow falls through to the next one
      const last = instructions[block.indexes[block.indexes.length - 1]];
      if (!JUMP_OPS.has(last.operator) && !RETURN_OPS.has(last.operator)) {
        body.push(nextBlockId !== -1 ? `            ${STATE_VAR} := ${nextBlockId};` : `            ${DONE_VAR} := TRUE;`);
      }
    });

    body.push('    ELSE');
    body.push(`        ${DONE_VAR} := TRUE;`);
    body.push('    END_CASE;');
    body.push('END_WHILE;');
  } else {
    // Simple sequential execution (no jumps)
    instructions.forEach((_, index) => {
      for (const stmt of generate(index, -1)) body.push(stmt, ilLineElement(instructions[index].line));
    });
  }

  const lines = new Listing();
  lines.push(`PROGRAM ${program.name}`);
  for (const varBlock of program.varBlocks) {
    lines.push(generateVarBlock(varBlock));
  }

  // Internal variables: the accumulators, the direct addresses used as operands and the state machine
  lines.push('VAR');
  for (const [name, type] of [...usedAccumulators].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`    ${name} : ${type};`);
  }
  for (const [address, { name, type }] of directVars) {
    lines.push(`    ${name} AT ${address} : ${type};`);
  }
  if (hasJumps) {
    lines.push(`    ${STATE_VAR} : INT := 0;`);
    lines.push(`    ${DONE_VAR} : BOOL := FALSE;`);
    lines.push(`    ${LOOP_VAR} : DINT := 0;`);
  }
  lines.push('END_VAR');
  lines.push('');
  lines.append(body);
  lines.push('');
  lines.push('END_PROGRAM');

  return { success: true, source: lines.toString(), errors: [], sourceMap: lines.sourceMap() };
}

// =============================================================================
// Type helpers
// =============================================================================

/** An untyped integer literal is loaded as DINT, the widest type every narrower integer widens to. */
function literalType(operand: ILOperand): string {
  switch (operand.dataType) {
    case 'REAL':
      return 'REAL';
    case 'TIME':
      return 'TIME';
    case 'BOOL':
      return 'BOOL';
    case 'STRING':
      return 'STRING';
    default:
      return 'DINT';
  }
}

function isFunctionBlockType(type: string, symbols: ILProjectSymbols | undefined): boolean {
  return Boolean(getFB(type)) || Boolean(symbols?.functionBlocks.has(type));
}

/** Type of `Instance.Member` for a standard or user function block, or undefined when unknown. */
function memberType(baseType: string, member: string, symbols: ILProjectSymbols | undefined): string | undefined {
  const user = symbols?.functionBlocks.get(baseType);
  if (user) return user.get(member);
  const fb = getFB(baseType);
  if (!fb) return undefined;
  const ports = getDefaultPorts(baseType.toUpperCase());
  const port = [...ports.inputs, ...ports.outputs].find((p) => p.name.toUpperCase() === member);
  if (port && ELEMENTARY_TYPES.has(port.type.toUpperCase())) return port.type.toUpperCase();
  const def = fb.members.find((m) => m.name.toUpperCase() === member && !m.isInternal);
  if (def && typeof def.dataType === 'string' && ELEMENTARY_TYPES.has(def.dataType.toUpperCase())) {
    return def.dataType.toUpperCase();
  }
  return undefined;
}

/** The type of an operand that the analysis has already accepted. */
function operandTypeOf(
  operand: ILOperand,
  varTypes: Map<string, string>,
  symbols: ILProjectSymbols | undefined,
  directVars: DirectVars,
): string {
  switch (operand.type) {
    case 'literal':
      return literalType(operand);
    case 'io_address':
      return directVars.get(operand.value)!.type;
    case 'member_access': {
      const baseKey = (operand.base ?? '').toUpperCase();
      const baseType = (varTypes.get(baseKey) ?? symbols?.globals.get(baseKey))!;
      return memberType(baseType, (operand.member ?? '').toUpperCase(), symbols)!;
    }
    default: {
      const key = operand.value.toUpperCase();
      return (varTypes.get(key) ?? symbols?.globals.get(key))!;
    }
  }
}

// =============================================================================
// Variable Block Generation
// =============================================================================

function generateVarBlock(block: ILVarBlock): string {
  const lines: string[] = [];
  lines.push(block.section);

  for (const v of block.variables) {
    let decl = `    ${v.name}`;
    if (v.ioAddress) {
      decl += ` AT ${v.ioAddress}`;
    }
    decl += ` : ${v.dataType}`;
    if (v.initialValue) {
      decl += ` := ${v.initialValue}`;
    }
    decl += ';';
    lines.push(decl);
  }

  lines.push('END_VAR');
  return lines.join('\n');
}

// =============================================================================
// Operand and call generation
// =============================================================================

/** Text of a literal in ST: based literals become decimal, an integer meeting a REAL becomes a REAL. */
function formatLiteral(value: string, dataType: ILOperand['dataType'], context: string | undefined): string {
  let text = value;
  const based = /^(2|16)#([0-9A-Fa-f_]+)$/.exec(text);
  if (based) text = String(parseInt(based[2].replace(/_/g, ''), parseInt(based[1], 10)));
  if (dataType === 'INT' && context !== undefined && REAL_TYPES.has(context) && /^-?\d+$/.test(text)) text = `${text}.0`;
  return text;
}

function formatOperand(operand: ILOperand, context: string | undefined, directVars: DirectVars): string {
  switch (operand.type) {
    case 'literal':
      return formatLiteral(operand.value, operand.dataType, context);
    case 'io_address':
      return directVars.get(operand.value)?.name ?? operand.value;
    default:
      return operand.value;
  }
}

function generateFBCall(fbName: string, params: ILFBParam[] | undefined, directVars: DirectVars): string {
  const helper = MODBUS_HELPERS[fbName.toUpperCase()];
  if (helper) {
    const inParam = params!.find((p) => p.name.toUpperCase() === 'IN')!;
    const addrParam = params!.find((p) => p.name.toUpperCase() === 'ADDR')!;
    return `${helper}(${formatOperand(inParam.value, undefined, directVars)}, ${formatOperand(addrParam.value, undefined, directVars)});`;
  }

  if (!params || params.length === 0) {
    return `${fbName}();`;
  }

  const paramStrs = params.map((p) => `${p.name} := ${formatOperand(p.value, undefined, directVars)}`);
  return `${fbName}(${paramStrs.join(', ')});`;
}
