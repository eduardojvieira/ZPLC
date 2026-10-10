/**
 * LD to Structured Text Transpiler
 * 
 * Converts LD (Ladder Diagram) models to IEC 61131-3 Structured Text.
 * 
 * Strategy: the power flow of a rung is followed column by column, left to right.
 * - Contacts in series AND the power that reaches them; a branch splits the power into its rows and
 *   joins them again with OR (branches nest).
 * - A coil or a function block takes the power that reaches its own position, so logic placed after a
 *   block uses that block's output (its Q), and a coil on a parallel row follows its own row.
 * - Edge contacts and edge coils keep their previous state in R_TRIG / F_TRIG instances.
 * - An element or connection that cannot be translated is an error that names it (LNG-002).
 * 
 * Supports both grid-based and legacy linear models.
 */

import type { 
  LDModel, 
  LDRung, 
  LDElement, 
  LDBranch,
  LDCell,
} from '../models/ld';
import { isGridBasedRung, convertToGridRung } from '../models/ld';
import { DataType, getFB, parseIOAddress, parseTimeLiteral, TokenType } from '@zplc/compiler';
import { getFunctionBlockNamesForVisualEditors } from '../catalog/blockCatalog';
import { getDefaultPorts } from '../models/fbd';
import { findProjectBlock, type ProjectBlock } from '../models/projectBlocks';
import { LD_COIL_TYPES, LD_CONTACT_TYPES, LD_MODBUS_HELPERS } from '../models/ldSupport';
import {
  ElementError, Listing, Problems, cellElement, rungElement, rungItemElement,
  type ElementDiagnostic, type SourceElementId, type SourceMapRange,
} from '../models/sourceElements';

// =============================================================================
// Types
// =============================================================================

interface TranspileResult {
  success: boolean;
  source: string;
  errors: string[];
  /** The errors with the element each is about (LNG-003). */
  diagnostics?: ElementDiagnostic[];
  /** For each element, the lines of `source` written for it (LNG-004). */
  sourceMap?: SourceMapRange[];
}

type UnknownRecord = Record<string, unknown>;
interface SymbolInfo { variable: UnknownRecord; section: 'local' | 'inputs' | 'outputs'; area?: 'I' | 'Q' | 'M'; }
interface Writer { type: string; rung: number; element?: SourceElementId; }

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MEMBER_REFERENCE = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;
const CUSTOM_MODBUS_BLOCKS = LD_MODBUS_HELPERS;
const SUPPORTED_CONTACTS: ReadonlySet<string> = new Set(LD_CONTACT_TYPES);
const SUPPORTED_COILS: ReadonlySet<string> = new Set(LD_COIL_TYPES);
/** The output of a standard block that carries the power on to the elements after it. */
const POWER_OUTPUT: Record<string, string> = {
  TON: 'Q', TOF: 'Q', TP: 'Q', CTU: 'Q', CTD: 'Q', CTUD: 'QU', R_TRIG: 'Q', F_TRIG: 'Q', SR: 'Q1', RS: 'Q1',
};
const GENERATED_STATE = /^(_rung\d+_result(_\d+)?|_edge_r\d+_.*)$/i;
/**
 * The function blocks the project declares, for the transpilation in progress (LNG-008). The transpiler is
 * synchronous, so the blocks of one call are set at its start and cleared at its end.
 */
let projectBlocks: readonly ProjectBlock[] = [];
/** A function block of the project of this name; a function is not placeable in a ladder rung. */
function projectBlock(name: unknown): ProjectBlock | undefined {
  const found = typeof name === 'string' ? findProjectBlock(projectBlocks, name) : undefined;
  return found?.kind === 'FUNCTION_BLOCK' ? found : undefined;
}
const ST_KEYWORDS = new Set<string>(Object.values(TokenType));
const SUPPORTED_DATA_TYPES = new Set(Object.values(DataType).map((type) => key(type)));

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value) && !ST_KEYWORDS.has(value.toUpperCase());
}

function isTypeName(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function key(value: string): string {
  return value.toUpperCase();
}

function isSupportedLDType(value: unknown): value is string {
  return isTypeName(value) && (SUPPORTED_DATA_TYPES.has(key(value)) || Boolean(getFB(value)) || Boolean(projectBlock(value)));
}

function validateComment(value: unknown, subject: string, errors: Problems): void {
  if (value !== undefined && (typeof value !== 'string' || value.includes('(*') || value.includes('*)'))) {
    errors.push(`${subject} comment must not contain ST comment delimiters`);
  }
}

function validateVariable(value: unknown, section: SymbolInfo['section'], symbols: Map<string, SymbolInfo>, errors: Problems): void {
  if (!isRecord(value)) {
    errors.push(`${section} variable must be an object`);
    return;
  }
  if (!isIdentifier(value.name)) errors.push(`${section} variable name '${String(value.name)}' is not a safe identifier`);
  if (!isTypeName(value.type)) errors.push(`${section} variable type '${String(value.type)}' is not a safe identifier`);
  else if (!isSupportedLDType(value.type)) errors.push(`${section} variable type '${value.type}' is not supported by LD`);
  let area: SymbolInfo['area'];
  if (typeof value.name === 'string' && isIdentifier(value.name)) {
    const existing = symbols.get(key(value.name));
    if (existing) errors.push(`Duplicate variable '${value.name}' differs only by case`);
    else symbols.set(key(value.name), { variable: value, section });
  }
  if (value.address !== undefined) {
    if (typeof value.address !== 'string') errors.push(`${section} variable '${String(value.name)}' address must be a string`);
    else {
      try {
        area = parseIOAddress(value.address).type;
        const expected = section === 'inputs' ? 'I' : section === 'outputs' ? 'Q' : 'M';
        if (area !== expected) errors.push(`${section} variable '${String(value.name)}' address must use %${expected}`);
      } catch (error) { errors.push(`${section} variable '${String(value.name)}' has invalid address: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  if (typeof value.name === 'string' && isIdentifier(value.name) && symbols.has(key(value.name))) {
    const symbol = symbols.get(key(value.name))!;
    if (symbol.variable === value) symbol.area = area;
  }
  validateComment(value.comment, `${section} variable '${String(value.name)}'`, errors);
  if (value.initialValue !== undefined) {
    if (section !== 'local') errors.push(`${section} variable '${String(value.name)}' initialValue is not supported`);
    validateInitialValue(value.initialValue, String(value.type), `${section} variable '${String(value.name)}'`, errors);
  }
  if (section === 'local' && typeof value.type === 'string' && (getFB(value.type) || projectBlock(value.type))) {
    if (value.initialValue !== undefined) errors.push(`Local FB '${String(value.name)}' initialValue is not supported`);
    if (value.address !== undefined) errors.push(`Local FB '${String(value.name)}' address is not supported`);
  }
}

function validateInitialValue(value: unknown, type: string, subject: string, errors: Problems): void {
  const normalized = type.toUpperCase();
  if (normalized === 'BOOL' && typeof value !== 'boolean') errors.push(`${subject} initialValue must be BOOL`);
  else if (['SINT', 'USINT', 'INT', 'UINT', 'DINT', 'UDINT', 'LINT', 'ULINT'].includes(normalized) && (!isInteger(value) || !integerFits(value, normalized))) errors.push(`${subject} initialValue is not representable as ${normalized}`);
  else if (['REAL', 'LREAL'].includes(normalized) && (typeof value !== 'number' || !Number.isFinite(value))) errors.push(`${subject} initialValue must be finite ${normalized}`);
  else if (normalized === 'TIME') {
    if (typeof value !== 'string') errors.push(`${subject} initialValue must be TIME`);
    else try { parseTimeLiteral(value); } catch (error) { errors.push(`${subject} has invalid TIME initialValue: ${error instanceof Error ? error.message : String(error)}`); }
  } else if (['STRING', 'WSTRING'].includes(normalized) && typeof value !== 'string') errors.push(`${subject} initialValue must be ${normalized}`);
  else if (!['BOOL', 'SINT', 'USINT', 'INT', 'UINT', 'DINT', 'UDINT', 'LINT', 'ULINT', 'REAL', 'LREAL', 'TIME', 'STRING', 'WSTRING'].includes(normalized)) errors.push(`${subject} initialValue is unsupported for ${type}`);
}

function integerFits(value: number, type: string): boolean {
  const bounds: Record<string, [number, number]> = {
    SINT: [-128, 127], USINT: [0, 255], INT: [-32768, 32767], UINT: [0, 65535],
    DINT: [-2147483648, 2147483647], UDINT: [0, 4294967295],
    LINT: [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], ULINT: [0, Number.MAX_SAFE_INTEGER],
  };
  const bound = bounds[type];
  return !bound || (value >= bound[0] && value <= bound[1]);
}

function resolveBoolReference(value: unknown, subject: string, symbols: Map<string, SymbolInfo>, errors: Problems): void {
  if (typeof value !== 'string') { errors.push(`${subject} must reference a declared BOOL variable`); return; }
  const member = value.match(MEMBER_REFERENCE);
  if (member) {
    const variable = symbols.get(key(member[1]));
    const fb = variable && typeof variable.variable.type === 'string' ? getFB(variable.variable.type) : undefined;
    const output = fb?.members.find((entry) => entry.name.toUpperCase() === member[2].toUpperCase() && entry.isOutput);
    const isBoolOutput = output?.dataType === 'BOOL' || (output?.name.toUpperCase() === 'Q' && output.size === 1);
    // an output of a function block the project declares
    const declared = variable ? projectBlock(variable.variable.type) : undefined;
    const declaredOutput = declared?.outputs.find((entry) => entry.name.toUpperCase() === member[2].toUpperCase());
    if (declaredOutput) {
      if (declaredOutput.type.toUpperCase() !== 'BOOL') errors.push(`${subject} '${value}' must reference a BOOL FB output`);
      return;
    }
    if (!variable || !fb || !output || !isBoolOutput) errors.push(`${subject} '${value}' must reference a BOOL FB output`);
    return;
  }
  const variable = symbols.get(key(value));
  if (!variable || String(variable.variable.type).toUpperCase() !== 'BOOL') errors.push(`${subject} '${value}' must reference a declared BOOL variable`);
}

function resolveDestination(value: unknown, subject: string, symbols: Map<string, SymbolInfo>, errors: Problems, requireBool = false): void {
  const variable = isIdentifier(value) ? symbols.get(key(value)) : undefined;
  if (!variable) errors.push(`${subject} '${String(value)}' must reference a declared variable`);
  else if (variable.section === 'inputs') errors.push(`${subject} '${String(value)}' must not write a VAR_INPUT`);
  else if (requireBool && String(variable.variable.type).toUpperCase() !== 'BOOL') errors.push(`${subject} '${String(value)}' must reference a declared BOOL variable`);
}

function typesCompatible(actual: string, expected: string): boolean {
  const normalizedActual = actual.toUpperCase();
  const normalizedExpected = expected.toUpperCase();
  return normalizedExpected === 'ANY' || (normalizedExpected === 'ANY_NUM' && ['SINT', 'USINT', 'INT', 'UINT', 'DINT', 'UDINT', 'LINT', 'ULINT', 'REAL', 'LREAL'].includes(normalizedActual)) || normalizedActual === normalizedExpected;
}

function validatePortValue(value: unknown, expectedType: string, subject: string, symbols: Map<string, SymbolInfo>, errors: Problems): void {
  if (value === 'CONNECTED') {
    if (expectedType.toUpperCase() !== 'BOOL') errors.push(`${subject} CONNECTED is only supported for BOOL ports`);
    return;
  }
  if (typeof value !== 'string') { errors.push(`${subject} must be a typed literal or symbol`); return; }
  const symbol = symbols.get(key(value));
  if (symbol) {
    if (!typesCompatible(String(symbol.variable.type), expectedType)) errors.push(`${subject} type ${String(symbol.variable.type)} does not match ${expectedType}`);
    return;
  }
  const normalized = expectedType.toUpperCase();
  if (normalized === 'BOOL' && (value === 'TRUE' || value === 'FALSE')) return;
  if (normalized === 'TIME') {
    try { parseTimeLiteral(value); return; } catch { errors.push(`${subject} must be TIME`); return; }
  }
  if (['STRING', 'WSTRING'].includes(normalized) && /^'(?:''|[^'])*'$/.test(value)) return;
  if ((normalized === 'ANY' || normalized === 'ANY_NUM' || ['SINT', 'USINT', 'INT', 'UINT', 'DINT', 'UDINT', 'LINT', 'ULINT', 'REAL', 'LREAL'].includes(normalized)) && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const number = Number(value);
    if (Number.isFinite(number) && (normalized === 'ANY' || normalized === 'ANY_NUM' || !normalized.includes('INT') || (isInteger(number) && integerFits(number, normalized)))) return;
  }
  errors.push(`${subject} must be a ${expectedType} literal or matching symbol`);
}

function validateModbusHelper(element: UnknownRecord, rung: UnknownRecord, symbols: Map<string, SymbolInfo>, writers: Map<string, Writer[]>, errors: Problems): void {
  const parameters = element.parameters;
  const outputs = element.outputs;
  if (!isRecord(parameters)) { errors.push(`Function block '${String(element.id)}' requires parameters.IN`); return; }
  for (const port of Object.keys(parameters)) {
    if (port !== 'IN' && port !== 'ADDR') errors.push(`Function block '${String(element.id)}' does not support input '${port}'`);
  }
  resolveDestination(parameters.IN, `Function block '${String(element.id)}' input 'IN'`, symbols, errors);
  if (parameters.ADDR === undefined) errors.push(`Function block '${String(element.id)}' requires parameters.ADDR`);
  if (parameters.ADDR !== undefined && (typeof parameters.ADDR !== 'string' || !/^\d+$/.test(parameters.ADDR) || Number(parameters.ADDR) > 65535)) {
    errors.push(`Function block '${String(element.id)}' input 'ADDR' must be a decimal address from 0 to 65535`);
  }
  if (outputs !== undefined && !isRecord(outputs)) { errors.push(`Function block '${String(element.id)}' outputs must be an object`); return; }
  for (const [port, destination] of Object.entries(isRecord(outputs) ? outputs : {})) {
    if (port !== 'OUT' && port !== 'STATUS') errors.push(`Function block '${String(element.id)}' does not support output '${port}'`);
    resolveDestination(destination, `Function block '${String(element.id)}' output '${port}'`, symbols, errors, port === 'STATUS');
    if (typeof destination === 'string' && isIdentifier(destination)) {
      const types = writers.get(key(destination)) ?? [];
      types.push({ type: 'function_block', rung: Number(rung.number), element: errors.element });
      writers.set(key(destination), types);
    }
  }
}

function validateElement(value: unknown, rung: UnknownRecord, symbols: Map<string, SymbolInfo>, writers: Map<string, Writer[]>, elementIds: Set<string>, errors: Problems): void {
  if (!isRecord(value)) { errors.push(`Rung ${String(rung.number)} element must be an object`); return; }
  if (!isIdentifier(value.id)) errors.push(`Rung ${String(rung.number)} element id '${String(value.id)}' is not safe`);
  else if (elementIds.has(key(value.id))) errors.push(`Rung ${String(rung.number)} has duplicate element id '${value.id}'`);
  else elementIds.add(key(value.id));
  validateComment(value.comment, `Rung ${String(rung.number)} element '${String(value.id)}'`, errors);
  if (typeof value.type !== 'string') { errors.push(`Rung ${String(rung.number)} element '${String(value.id)}' type is required`); return; }
  if (SUPPORTED_CONTACTS.has(value.type)) {
    resolveBoolReference(value.variable, `Contact '${String(value.id)}'`, symbols, errors);
    return;
  }
  if (SUPPORTED_COILS.has(value.type)) {
    resolveDestination(value.variable, `Coil '${String(value.id)}'`, symbols, errors, true);
    if (typeof value.variable === 'string' && isIdentifier(value.variable)) {
      const output = key(value.variable);
      const writerTypes = writers.get(output) ?? [];
      writerTypes.push({ type: value.type, rung: Number(rung.number), element: errors.element });
      writers.set(output, writerTypes);
    }
    return;
  }
  if (value.type === 'left_rail' || value.type === 'right_rail') return;
  if (value.type !== 'function_block') { errors.push(`Unsupported LD element type '${value.type}' (element '${String(value.id)}' in rung ${String(rung.number)})`); return; }
  if (!isTypeName(value.fbType) || !isIdentifier(value.instance)) { errors.push(`Function block '${String(value.id)}' requires a known type and instance`); return; }
  const declaredBlock = projectBlock(value.fbType);
  const known = new Set([...getFunctionBlockNamesForVisualEditors(), ...(declaredBlock ? [declaredBlock.name] : [])].map(key));
  if (!known.has(key(value.fbType))) { errors.push(`Function block '${value.fbType}' is not in the visual catalog`); return; }
  const fb = getFB(value.fbType);
  const instance = symbols.get(key(value.instance));
  if (!CUSTOM_MODBUS_BLOCKS.has(value.fbType) && ((!fb && !declaredBlock) || !instance || instance.section !== 'local' || String(instance.variable.type).toUpperCase() !== key(value.fbType))) {
    errors.push(`Function block '${value.id}' instance '${value.instance}' must be declared as ${value.fbType}`);
  }
  if (CUSTOM_MODBUS_BLOCKS.has(value.fbType)) {
    validateModbusHelper(value, rung, symbols, writers, errors);
    return;
  }
  if (value.parameters !== undefined && !isRecord(value.parameters)) errors.push(`Function block '${value.id}' parameters must be an object`);
  if (value.outputs !== undefined && !isRecord(value.outputs)) errors.push(`Function block '${value.id}' outputs must be an object`);
  const ports = getDefaultPorts(value.fbType, declaredBlock ? [declaredBlock] : undefined);
  for (const [port, expression] of Object.entries(isRecord(value.parameters) ? value.parameters : {})) {
    if (!isIdentifier(port)) errors.push(`Function block '${value.id}' has unsafe input port '${port}'`);
    const portDef = ports.inputs.find((entry) => entry.name.toUpperCase() === port.toUpperCase());
    if (!portDef) errors.push(`Function block '${value.id}' input '${port}' is not supported by ${value.fbType}`);
    else validatePortValue(expression, portDef.type, `Function block '${value.id}' input '${port}'`, symbols, errors);
  }
  for (const [port, destination] of Object.entries(isRecord(value.outputs) ? value.outputs : {})) {
    if (!isIdentifier(port)) errors.push(`Function block '${value.id}' has unsafe output port '${port}'`);
    const portDef = ports.outputs.find((entry) => entry.name.toUpperCase() === port.toUpperCase());
    if (!portDef) errors.push(`Function block '${value.id}' output '${port}' is not supported by ${value.fbType}`);
    resolveDestination(destination, `Function block '${value.id}' output '${port}'`, symbols, errors);
    const symbol = typeof destination === 'string' ? symbols.get(key(destination)) : undefined;
    if (portDef && symbol && !typesCompatible(String(symbol.variable.type), portDef.type)) errors.push(`Function block '${value.id}' output '${port}' type ${portDef.type} does not match ${String(symbol.variable.type)}`);
    if (typeof destination === 'string' && isIdentifier(destination)) {
      const output = key(destination);
      const writerTypes = writers.get(output) ?? [];
      writerTypes.push({ type: 'function_block', rung: Number(rung.number), element: errors.element });
      writers.set(output, writerTypes);
    }
  }
}

/** The id a rung is known by in a diagnostic: its id, or its place in the file when it has none. */
function rungKeyOf(rung: UnknownRecord, index: number): string {
  return typeof rung.id === 'string' && rung.id !== '' ? rung.id : `#${index + 1}`;
}

function validateLDForTranspilation(input: unknown): Problems {
  const errors = new Problems();
  if (!isRecord(input)) { errors.push('LD model must be an object'); return errors; }
  if (!isIdentifier(input.name)) errors.push(`LD name '${String(input.name)}' is not a safe identifier`);
  if (!isRecord(input.variables)) errors.push('LD variables must be an object');
  if (!Array.isArray(input.rungs)) errors.push('LD rungs must be an array');
  if (errors.length > 0) return errors;
  const variables = input.variables as UnknownRecord;
  const symbols = new Map<string, SymbolInfo>();
  for (const section of ['local', 'inputs', 'outputs'] as const) {
    const values = variables[section];
    if (section !== 'inputs' && !Array.isArray(values)) errors.push(`LD variables.${section} must be an array`);
    if (values !== undefined && !Array.isArray(values)) errors.push(`LD variables.${section} must be an array`);
    if (Array.isArray(values)) values.forEach((value) => validateVariable(value, section, symbols, errors));
  }
  for (const symbol of symbols.values()) {
    if (GENERATED_STATE.test(String(symbol.variable.name))) errors.push(`Variable '${String(symbol.variable.name)}' collides with generated rung state`);
  }
  const rungIds = new Set<string>();
  const writers = new Map<string, Writer[]>();
  const rungs = input.rungs as unknown[];
  rungs.forEach((value, index) => {
    if (!isRecord(value)) { errors.push(`Rung ${index + 1} must be an object`, rungElement(`#${index + 1}`)); return; }
    const rungKey = rungKeyOf(value, index);
    errors.within(rungElement(rungKey), () => {
      if (!isIdentifier(value.id)) errors.push(`Rung ${index + 1} id '${String(value.id)}' is not safe`);
      else if (rungIds.has(key(value.id))) errors.push(`Duplicate rung id '${value.id}'`); else rungIds.add(key(value.id));
      if (!Number.isInteger(value.number) || value.number !== index + 1) errors.push(`Rung '${String(value.id)}' number must be ${index + 1}`);
      validateComment(value.comment, `Rung '${String(value.id)}'`, errors);
      const hasGrid = value.grid !== undefined;
      const hasLegacy = value.elements !== undefined;
      if (hasGrid === hasLegacy) errors.push(`Rung '${String(value.id)}' must use exactly one of grid or legacy elements`);
      if (value.connections !== undefined && !Array.isArray(value.connections)) errors.push(`Rung '${String(value.id)}' connections must be an array`);
      if (Array.isArray(value.connections) && value.connections.length > 0) errors.push(`Rung '${String(value.id)}' legacy connections are unsupported`);
      if (hasGrid) {
        const gridConfig = isRecord(value.gridConfig) ? value.gridConfig : undefined;
        const rows = gridConfig?.rows;
        const cols = gridConfig?.cols;
        const cellWidth = gridConfig?.cellWidth;
        const cellHeight = gridConfig?.cellHeight;
        if (!gridConfig || !isPositiveInteger(rows) || !isPositiveInteger(cols) || !isPositiveInteger(cellWidth) || !isPositiveInteger(cellHeight)) errors.push(`Rung '${String(value.id)}' gridConfig must contain positive integer dimensions`);
        if (!Array.isArray(value.grid)) errors.push(`Rung '${String(value.id)}' grid must be an array`);
        else {
          if (value.grid.length !== rows) errors.push(`Rung '${String(value.id)}' grid row count must match gridConfig`);
          const elementIds = new Set<string>();
          value.grid.forEach((row, rowIndex) => {
            if (!Array.isArray(row) || row.length !== cols) { errors.push(`Rung '${String(value.id)}' grid must be rectangular`); return; }
            row.forEach((cell, colIndex) => {
              errors.within(cellElement(rungKey, rowIndex, colIndex), () => {
                if (!isRecord(cell) || !('element' in cell)) { errors.push(`Rung '${String(value.id)}' cell ${rowIndex},${colIndex} must contain element`); return; }
                if (cell.element !== null) {
                  if (isRecord(cell.element) && (cell.element.row !== rowIndex || cell.element.col !== colIndex)) errors.push(`Rung '${String(value.id)}' element '${String(cell.element.id)}' coordinates must match its grid cell`);
                  validateElement(cell.element, value, symbols, writers, elementIds, errors);
                }
              });
            });
          });
          validateGridPowerPath(value, errors, rungKey);
        }
        validateBranches(value, errors);
      } else if (hasLegacy) {
        if (!Array.isArray(value.elements)) errors.push(`Rung '${String(value.id)}' elements must be an array`);
        else {
          const elementIds = new Set<string>();
          value.elements.forEach((element) => {
            const at = isRecord(element) && typeof element.id === 'string' ? rungItemElement(rungKey, element.id) : rungElement(rungKey);
            errors.within(at, () => validateElement(element, value, symbols, writers, elementIds, errors));
          });
        }
        if (value.verticalLinks !== undefined && (!Array.isArray(value.verticalLinks) || value.verticalLinks.length > 0)) errors.push(`Rung '${String(value.id)}' verticalLinks require a grid and branches`);
      }
    });
  });
  for (const [destination, writerTypes] of writers) {
    const types = writerTypes.map((writer) => writer.type);
    const allowedSetReset = writerTypes.length === 2 && new Set(types).size === 2 && types.includes('coil_set') && types.includes('coil_reset') && new Set(writerTypes.map((writer) => writer.rung)).size === 2;
    // the second writer is the one that is wrong: the first was there before it
    if (writerTypes.length > 1 && !allowedSetReset) errors.push(`Multiple writers target '${destination}'`, writerTypes[1]!.element);
  }
  return errors;
}

function branchRecords(rung: UnknownRecord): LDBranch[] {
  return (Array.isArray(rung.branches) ? rung.branches : []).filter((branch): branch is LDBranch =>
    isRecord(branch) && Array.isArray(branch.rows) && branch.rows.length >= 2 && branch.rows.every(isInteger)
    && isInteger(branch.startCol) && isInteger(branch.endCol));
}

function validateGridPowerPath(rung: UnknownRecord, errors: Problems, rungKey: string): void {
  if (!Array.isArray(rung.grid) || !isRecord(rung.gridConfig) || !isInteger(rung.gridConfig.rows) || !isInteger(rung.gridConfig.cols)) return;
  const grid = rung.grid as unknown[];
  const cols = rung.gridConfig.cols as number;
  const branches = branchRecords(rung);
  const branchAt = (row: number, col: number) => branches.some((branch) =>
    branch.rows.includes(row) && col >= branch.startCol && col <= branch.endCol,
  );
  let structural = true;
  let requiredEnd = -1;
  grid.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) { structural = false; return; }
    row.forEach((cell, colIndex) => {
      if (!isRecord(cell) || typeof cell.hasWire !== 'boolean') {
        errors.push(`Rung '${String(rung.id)}' cell ${rowIndex},${colIndex} hasWire must be boolean`, cellElement(rungKey, rowIndex, colIndex));
        structural = false;
        return;
      }
      if (!isRecord(cell.element)) return;
      const here = cellElement(rungKey, rowIndex, colIndex);
      if (cell.element.type === 'left_rail' || cell.element.type === 'right_rail') errors.push(`Rung '${String(rung.id)}' rails are not allowed in a grid`, here);
      if (!cell.hasWire) errors.push(`Rung '${String(rung.id)}' element '${String(cell.element.id)}' must be on a wire`, here);
      if (rowIndex === 0) requiredEnd = Math.max(requiredEnd, colIndex);
      if (rowIndex > 0 && !branchAt(rowIndex, colIndex)) {
        errors.push(`Rung '${String(rung.id)}' row ${rowIndex} element '${String(cell.element.id)}' must be inside a branch`, here);
      }
    });
  });
  for (const branch of branches) {
    // The main line carries the power over every branch that starts on it
    if (branch.rows[0] === 0) requiredEnd = Math.max(requiredEnd, branch.endCol);
    // A row that a nested branch added is wired only where that branch is: it checks that row itself
    const nestedRows = new Set(branches.filter((other) => other.parentBranchId !== undefined && key(other.parentBranchId) === key(branch.id))
      .flatMap((other) => other.rows.slice(1)));
    for (const rowIndex of branch.rows.filter((row) => !nestedRows.has(row))) {
      const row = grid[rowIndex];
      if (!Array.isArray(row)) continue;
      const inside = row.slice(branch.startCol, branch.endCol + 1);
      if (rowIndex !== branch.rows[0] && !inside.some((cell) => isRecord(cell) && isRecord(cell.element))) {
        errors.push(`Rung '${String(rung.id)}' branch '${String(branch.id)}' row ${rowIndex} must contain an element`);
      }
      // The power of a parallel row reaches the join only over a wire the whole way across the branch
      const lastCol = rowIndex === branch.rows[0]
        ? row.reduce((last: number, cell, col) => isRecord(cell) && isRecord(cell.element) && col <= branch.endCol ? col : last, branch.startCol)
        : branch.endCol;
      for (let col = branch.startCol; col <= lastCol; col++) {
        if (!isRecord(row[col]) || row[col].hasWire !== true) {
          errors.push(`Rung '${String(rung.id)}' branch '${String(branch.id)}' must be wired across row ${rowIndex}`);
          break;
        }
      }
    }
  }
  const primaryRow = grid[0];
  if (Array.isArray(primaryRow)) {
    for (let col = 0; col <= requiredEnd; col++) {
      if (!isRecord(primaryRow[col]) || primaryRow[col].hasWire !== true) errors.push(`Rung '${String(rung.id)}' row 0 must be wired continuously through column ${col}`);
    }
  }
  for (let rowIndex = 1; rowIndex < grid.length; rowIndex++) {
    const row = grid[rowIndex];
    if (!Array.isArray(row)) continue;
    row.forEach((cell, colIndex) => {
      if (isRecord(cell) && (cell.hasWire === true || cell.element !== null) && !branchAt(rowIndex, colIndex)) errors.push(`Rung '${String(rung.id)}' row ${rowIndex} has orphaned wiring at column ${colIndex}`, cellElement(rungKey, rowIndex, colIndex));
    });
  }
  // The power must reach every element: a branch has to start on a row that has power, and an element on
  // a row after its branch has ended is on no path at all
  if (structural && errors.length === 0) {
    walkRung(grid as LDCell[][], branches, cols, {
      rail: true,
      join: (values: boolean[]) => values.some(Boolean),
      element: (_element, _row, _col, power) => power,
      unpowered: (what, row, col) => errors.push(`Rung '${String(rung.id)}' ${what}`, row === undefined || col === undefined ? undefined : cellElement(rungKey, row, col)),
    });
  }
}

function validateBranches(rung: UnknownRecord, errors: Problems): void {
  const branches = rung.branches;
  if (rung.verticalLinks !== undefined && !Array.isArray(rung.verticalLinks)) errors.push(`Rung '${String(rung.id)}' verticalLinks must be an array`);
  if (Array.isArray(rung.verticalLinks) && rung.verticalLinks.length > 0 && (!Array.isArray(branches) || branches.length === 0)) errors.push(`Rung '${String(rung.id)}' verticalLinks require branches`);
  if (branches === undefined) return;
  if (!Array.isArray(branches)) { errors.push(`Rung '${String(rung.id)}' branches must be an array`); return; }
  const config = isRecord(rung.gridConfig) ? rung.gridConfig : {};
  const configCols = config.cols;
  const configRows = config.rows;
  const accepted: LDBranch[] = [];
  const seen = new Set<string>();
  for (const branch of branches) {
    const startCol = isRecord(branch) ? branch.startCol : undefined;
    const endCol = isRecord(branch) ? branch.endCol : undefined;
    const rows = isRecord(branch) ? branch.rows : undefined;
    if (!isRecord(branch) || !isIdentifier(branch.id) || !isInteger(startCol) || !isInteger(endCol) || !Array.isArray(rows) || new Set(rows).size !== rows.length
      || (branch.parentBranchId !== undefined && typeof branch.parentBranchId !== 'string')
      || startCol < 0 || endCol < startCol || !isInteger(configCols) || !isInteger(configRows) || endCol >= configCols || rows.length < 2
      || rows.some((row) => !isInteger(row) || row < 0 || row >= configRows)) {
      errors.push(`Rung '${String(rung.id)}' has an invalid branch${isRecord(branch) && typeof branch.id === 'string' ? ` '${branch.id}'` : ''}`);
      continue;
    }
    if (seen.has(key(branch.id))) errors.push(`Rung '${String(rung.id)}' has duplicate branch id '${branch.id}'`);
    seen.add(key(branch.id));
    accepted.push(branch as unknown as LDBranch);
  }
  const contains = (outer: LDBranch, inner: LDBranch) => outer.startCol <= inner.startCol && inner.endCol <= outer.endCol;
  for (const branch of accepted) {
    if (branch.parentBranchId === undefined) continue;
    const parent = accepted.find((candidate) => key(candidate.id) === key(branch.parentBranchId!));
    if (!parent) errors.push(`Rung '${String(rung.id)}' branch '${branch.id}' names an unknown parent '${branch.parentBranchId}'`);
    else if (!contains(parent, branch) || !parent.rows.includes(branch.rows[0])) {
      errors.push(`Rung '${String(rung.id)}' branch '${branch.id}' does not fit inside its parent '${parent.id}'`);
    }
  }
  // Branches nest (the inner one names the outer as its parent) or stand apart: any other overlap has no meaning
  const ancestors = (branch: LDBranch): Set<string> => {
    const found = new Set<string>();
    for (let next = branch.parentBranchId; next !== undefined && !found.has(key(next));) {
      found.add(key(next));
      next = accepted.find((candidate) => key(candidate.id) === key(next!))?.parentBranchId;
    }
    return found;
  };
  for (let i = 0; i < accepted.length; i++) {
    for (let j = i + 1; j < accepted.length; j++) {
      const a = accepted[i];
      const b = accepted[j];
      const overlap = a.startCol <= b.endCol && b.startCol <= a.endCol;
      if (overlap && !ancestors(a).has(key(b.id)) && !ancestors(b).has(key(a.id))) {
        errors.push(`Rung '${String(rung.id)}' has overlapping branches '${a.id}' and '${b.id}'`);
      }
    }
  }
}

// =============================================================================
// Power flow
// =============================================================================

interface WalkHooks<T> {
  /** The power at the left rail. */
  rail: T;
  /** The power that leaves a branch, from the power of each of its rows. */
  join(values: T[]): T;
  /** An element on a row that has power: returns the power that leaves it. */
  element(element: LDElement, row: number, col: number, power: T): T;
  /** Something that no power reaches (an element after its branch ended, a branch off a dead row), and its cell when it is one. */
  unpowered(what: string, row?: number, col?: number): void;
}

/**
 * Follows the power through a rung column by column, left to right, top to bottom in a column.
 * A branch splits the power of its source row (its first row) into all its rows at its first column
 * and joins them back into the source row after its last column; the innermost branch joins first.
 * Returns the power at the right end of the main line.
 */
function walkRung<T>(grid: LDCell[][], branches: LDBranch[], cols: number, hooks: WalkHooks<T>): T | undefined {
  const power: Array<T | undefined> = grid.map(() => undefined);
  power[0] = hooks.rail;
  // The innermost branch joins first: depth is the number of parents above a branch
  const depth = (branch: LDBranch): number => {
    let found = 0;
    for (let next = branch.parentBranchId; next !== undefined && found <= branches.length;) {
      found++;
      next = branches.find((candidate) => candidate.id === next)?.parentBranchId;
    }
    return found;
  };
  const byDepth = (a: LDBranch, b: LDBranch) => depth(a) - depth(b);
  for (let col = 0; col < cols; col++) {
    const starting = branches.filter((branch) => branch.startCol === col).sort(byDepth);
    for (const branch of starting) {
      const source = power[branch.rows[0]];
      if (source === undefined) hooks.unpowered(`branch '${branch.id}' starts on row ${branch.rows[0]}, which no power reaches at column ${col}`);
      for (const row of branch.rows.slice(1)) power[row] = source;
    }
    for (let row = 0; row < grid.length; row++) {
      const element = grid[row]?.[col]?.element;
      if (!element) continue;
      const incoming = power[row];
      if (incoming === undefined) {
        hooks.unpowered(`element '${element.id}' (row ${row}, column ${col}) is on a path that no power reaches`, row, col);
        continue;
      }
      power[row] = hooks.element(element, row, col, incoming);
    }
    const ending = branches.filter((branch) => branch.endCol === col).sort((a, b) => byDepth(b, a));
    for (const branch of ending) {
      const values = branch.rows.map((row) => power[row]).filter((value): value is T => value !== undefined);
      for (const row of branch.rows.slice(1)) power[row] = undefined;
      power[branch.rows[0]] = values.length > 0 ? hooks.join(values) : undefined;
    }
  }
  return power[0];
}

// =============================================================================
// Power expressions
// =============================================================================

/** A boolean power expression: AND of series elements, OR of parallel paths. */
type Power =
  | { kind: 'true' }
  | { kind: 'atom'; text: string }
  | { kind: 'and'; terms: Power[] }
  | { kind: 'or'; terms: Power[] };

const TRUE_POWER: Power = { kind: 'true' };
const atom = (text: string): Power => ({ kind: 'atom', text });

function and(...parts: Power[]): Power {
  const terms: Power[] = [];
  for (const part of parts) {
    if (part.kind === 'true') continue;
    if (part.kind === 'and') terms.push(...part.terms);
    else terms.push(part);
  }
  if (terms.length === 0) return TRUE_POWER;
  return terms.length === 1 ? terms[0] : { kind: 'and', terms };
}

function printPower(power: Power): string {
  switch (power.kind) {
    case 'true': return 'TRUE';
    case 'atom': return power.text;
    case 'and': return power.terms.map((term) => term.kind === 'or' ? `(${printPower(term)})` : printPower(term)).join(' AND ');
    case 'or': return power.terms.map((term) => term.kind === 'and' ? `(${printPower(term)})` : printPower(term)).join(' OR ');
  }
}

/** OR of parallel paths; the series elements that all of them share are taken out in front. */
function or(values: Power[]): Power {
  const terms: Power[] = [];
  const printed = new Set<string>();
  for (const value of values.flatMap((entry) => entry.kind === 'or' ? entry.terms : [entry])) {
    const text = printPower(value);
    if (!printed.has(text)) { printed.add(text); terms.push(value); }
  }
  if (terms.some((term) => term.kind === 'true')) return TRUE_POWER;
  if (terms.length === 1) return terms[0];
  const chains = terms.map((term) => term.kind === 'and' ? term.terms : [term]);
  let shared = 0;
  while (chains.every((chain) => shared < chain.length && printPower(chain[shared]) === printPower(chains[0][shared]))) shared++;
  if (shared === 0) return { kind: 'or', terms };
  const rests = chains.map((chain) => and(...chain.slice(shared)));
  return and(...chains[0].slice(0, shared), or(rests));
}

// =============================================================================
// Transpiler
// =============================================================================

export function transpileLDToST(input: unknown, blocks: readonly ProjectBlock[] = []): TranspileResult {
  const lines = new Listing();
  projectBlocks = blocks;

  try {
    const problems = validateLDForTranspilation(input);
    if (problems.length > 0) return { success: false, source: '', errors: problems.messages, diagnostics: problems.diagnostics };
    const model = input as LDModel;
    // The rungs are generated first: the state they need is declared with the program's variables
    const rungCodes = model.rungs.map((rung, index) => generateRungCode(rung, rungKeyOf(rung as unknown as UnknownRecord, index)));
    // Generate program header
    lines.push(`PROGRAM ${model.name}`);
    lines.push('');

    // Generate input variable declarations
    if (model.variables.inputs && model.variables.inputs.length > 0) {
      lines.push('VAR_INPUT');
      for (const v of model.variables.inputs) {
        const address = v.address ? ` AT ${v.address}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name}${address} : ${v.type};${comment}`);
      }
      lines.push('END_VAR');
      lines.push('');
    }

    // Generate local variable declarations
    lines.push('VAR');

    // Local variables from model
    for (const v of model.variables.local) {
      const init = v.initialValue !== undefined ? ` := ${formatValue(v.initialValue, v.type)}` : '';
      const address = v.address ? ` AT ${v.address}` : '';
      const comment = v.comment ? ` (* ${v.comment} *)` : '';

      // Special handling for FB types
      if (['TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG', 'SR', 'RS'].includes(v.type)) {
        lines.push(`    ${v.name} : ${v.type};${comment}`);
      } else {
        lines.push(`    ${v.name}${address} : ${v.type}${init};${comment}`);
      }
    }

    // Generated state: the power of each rung, and the edge detectors of its edge elements
    rungCodes.forEach((code, index) => {
      const result = `_rung${model.rungs[index].number}_result`;
      const at = rungElement(rungKeyOf(model.rungs[index] as unknown as UnknownRecord, index));
      for (const name of new Set([result, ...code.stages])) lines.push(`    ${name} : BOOL;`, at);
      for (const { name, type } of code.edges) lines.push(`    ${name} : ${type};`, at);
    });

    lines.push('END_VAR');
    lines.push('');

    // Output variables
    if (model.variables.outputs.length > 0) {
      lines.push('VAR_OUTPUT');
      for (const v of model.variables.outputs) {
        const address = v.address ? ` AT ${v.address}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name}${address} : ${v.type};${comment}`);
      }
      lines.push('END_VAR');
      lines.push('');
    }

    // Generate execution code
    lines.push('(* LD Execution - Auto-generated *)');
    lines.push('');

    model.rungs.forEach((rung, index) => {
      const at = rungElement(rungKeyOf(rung as unknown as UnknownRecord, index));
      lines.push(rung.comment ? `(* Rung ${rung.number}: ${rung.comment} *)` : `(* Rung ${rung.number} *)`, at);
      lines.append(rungCodes[index].lines, at);
      lines.push('');
    });

    lines.push('END_PROGRAM');

    return { success: true, source: lines.toString(), errors: [], sourceMap: lines.sourceMap() };
  } catch (e) {
    const message = `Transpiler error: ${e instanceof Error ? e.message : String(e)}`;
    return {
      success: false,
      source: '',
      errors: [message],
      diagnostics: [e instanceof ElementError && e.element !== undefined ? { message, element: e.element } : { message }],
    };
  } finally {
    projectBlocks = [];
  }
}

// =============================================================================
// Rung Code Generation
// =============================================================================

const MODBUS_HELPERS: Record<string, string> = {
  MB_COIL: 'MODBUS_COIL',
  MB_DISCRETE_INPUT: 'MODBUS_DISCRETE_INPUT',
  MB_INPUT_REGISTER: 'MODBUS_INPUT_REGISTER',
  MB_HOLDING_REGISTER: 'MODBUS_HOLDING_REGISTER',
};

interface RungCode {
  /** The statements of the rung, each with the element it is for. */
  lines: Listing;
  /** State variables this rung needs: BOOL stages of the power flow, and the edge detectors. */
  stages: string[];
  edges: Array<{ name: string; type: 'R_TRIG' | 'F_TRIG' }>;
}

function generateRungCode(rung: LDRung, rungKey: string): RungCode {
  // Convert to grid-based if necessary
  const gridRung = isGridBasedRung(rung) ? rung : convertToGridRung(rung);
  const grid = gridRung.grid ?? [];
  const cols = gridRung.gridConfig?.cols ?? Math.max(0, ...grid.map((row) => row.length));

  const lines = new Listing();
  const stages: string[] = [];
  const edges: RungCode['edges'] = [];
  /** The element whose statements are being written. */
  let current: SourceElementId = rungElement(rungKey);

  /** The power as a BOOL variable of its own, so what follows it sees the value that flowed. */
  const stage = (power: Power): string => {
    if (power.kind === 'atom' && stages.includes(power.text)) return power.text;
    const name = stages.length === 0 ? `_rung${rung.number}_result` : `_rung${rung.number}_result_${stages.length + 1}`;
    stages.push(name);
    lines.push(`${name} := ${printPower(power)};`, current);
    return name;
  };
  const edge = (element: LDElement, type: 'R_TRIG' | 'F_TRIG', clock: string): string => {
    const name = `_edge_r${rung.number}_${element.id}`;
    edges.push({ name, type });
    lines.push(`${name}(CLK := ${clock});`, current);
    return `${name}.Q`;
  };

  const functionBlock = (fb: LDElement, power: Power): Power => {
    if (!fb.fbType || !fb.instance) throw new Error(`Rung '${rung.id}' function block '${fb.id}' needs a type and an instance`);
    const helper = MODBUS_HELPERS[fb.fbType];
    if (helper) {
      const flow = stage(power);
      const inputVar = fb.parameters!.IN;
      const addrVar = fb.parameters!.ADDR;
      lines.push(`IF ${flow} THEN ${inputVar} := ${inputVar}; END_IF;`, current);
      lines.push(`${helper}(${inputVar}, ${addrVar});`, current);
      for (const [port, variable] of Object.entries(fb.outputs ?? {})) {
        lines.push(port === 'STATUS' ? `${variable} := ${flow};` : `${variable} := ${inputVar};`, current);
      }
      return atom(flow);
    }

    // Power reaches the block through the input the model marks CONNECTED, or by default through the
    // input that starts it (IN of timers and triggers, CU of counters, EN of the communication blocks)
    const powerInput = fb.parameters !== undefined ? undefined : defaultPowerInput(fb.fbType);
    const connected = fb.parameters !== undefined && Object.values(fb.parameters).includes('CONNECTED');
    const flow = connected || powerInput ? stage(power) : undefined;
    const params: string[] = [];
    for (const [name, value] of Object.entries(fb.parameters ?? {})) {
      params.push(`${name} := ${value === 'CONNECTED' ? flow : value}`);
    }
    if (powerInput) params.push(`${powerInput} := ${flow}`);
    lines.push(`${fb.instance}(${params.join(', ')});`, current);
    for (const [port, variable] of Object.entries(fb.outputs ?? {})) {
      lines.push(`${variable} := ${fb.instance}.${port};`, current);
    }
    // What follows the block gets its output; a block with no such output passes the power through
    const out = POWER_OUTPUT[fb.fbType.toUpperCase()];
    return out ? atom(`${fb.instance}.${out}`) : flow ? atom(flow) : power;
  };

  const output = walkRung(grid, gridRung.branches ?? [], cols, {
    rail: TRUE_POWER,
    join: or,
    unpowered: (what, row, col) => { throw new ElementError(`Rung '${rung.id}' ${what}`, row === undefined || col === undefined ? rungElement(rungKey) : cellElement(rungKey, row, col)); },
    element: (element, row, col, power) => {
      current = cellElement(rungKey, row, col);
      switch (element.type) {
        case 'contact_no':
          return and(power, atom(element.variable!));
        case 'contact_nc':
          return and(power, atom(`NOT ${element.variable}`));
        case 'contact_p':
          return and(power, atom(edge(element, 'R_TRIG', element.variable!)));
        case 'contact_n':
          return and(power, atom(edge(element, 'F_TRIG', element.variable!)));
        case 'coil':
        case 'coil_negated':
        case 'coil_set':
        case 'coil_reset':
        case 'coil_p':
        case 'coil_n': {
          const flow = stage(power);
          switch (element.type) {
            case 'coil': lines.push(`${element.variable} := ${flow};`, current); break;
            case 'coil_negated': lines.push(`${element.variable} := NOT ${flow};`, current); break;
            case 'coil_set': lines.push(`IF ${flow} THEN ${element.variable} := TRUE; END_IF;`, current); break;
            case 'coil_reset': lines.push(`IF ${flow} THEN ${element.variable} := FALSE; END_IF;`, current); break;
            case 'coil_p': lines.push(`${element.variable} := ${edge(element, 'R_TRIG', flow)};`, current); break;
            case 'coil_n': lines.push(`${element.variable} := ${edge(element, 'F_TRIG', flow)};`, current); break;
          }
          return atom(flow);
        }
        case 'function_block':
          return functionBlock(element, power);
        default:
          throw new ElementError(`Rung '${rung.id}' element '${element.id}' has the unsupported type '${element.type}'`, current);
      }
    },
  });

  // A rung whose power no element consumed still has its result, for the rung's state variable
  if (stages.length === 0) {
    stages.push(`_rung${rung.number}_result`);
    lines.push(`_rung${rung.number}_result := ${printPower(output ?? TRUE_POWER)};`, rungElement(rungKey));
  }
  return { lines, stages, edges };
}

function defaultPowerInput(fbType: string): string | undefined {
  if (['TON', 'TOF', 'TP'].includes(fbType)) return 'IN';
  if (fbType === 'R_TRIG' || fbType === 'F_TRIG') return 'CLK';
  if (fbType === 'CTU' || fbType === 'CTUD') return 'CU';
  if (fbType === 'CTD') return 'CD';
  if (['COMM_PUBLISH', 'COMM_SUBSCRIBE', 'COMM_MODBUS', 'COMM_CONNECT',
    'MB_READ_HREG', 'MB_WRITE_HREG', 'MB_READ_COIL', 'MB_WRITE_COIL',
    'MQTT_CONNECT', 'MQTT_PUBLISH', 'MQTT_SUBSCRIBE',
    'AZURE_C2D_RECV', 'AZURE_DPS_PROV', 'AZURE_EG_PUB',
    'AWS_FLEET_PROV', 'SPB_REBIRTH'].includes(fbType)) return 'EN';
  return undefined;
}

// =============================================================================
// Helpers
// =============================================================================

function formatValue(value: unknown, dataType: string): string {
  if (value === undefined || value === null) return '0';
  
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  if (typeof value === 'string') {
    if (dataType.toUpperCase() === 'TIME') return value;
    return `'${value.replace(/'/g, "''")}'`;
  }
  
  if (typeof value === 'number') {
    if (dataType === 'REAL' || dataType === 'LREAL') {
      return value.toString().includes('.') ? value.toString() : `${value}.0`;
    }
    return value.toString();
  }
  
  return String(value);
}
