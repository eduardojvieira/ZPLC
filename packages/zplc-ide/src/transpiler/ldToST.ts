/**
 * LD to Structured Text Transpiler
 * 
 * Converts LD (Ladder Diagram) models to IEC 61131-3 Structured Text.
 * 
 * Strategy:
 * - Each rung becomes a boolean expression
 * - Contacts in series (same row) are AND logic
 * - Contacts in parallel (different rows with vertical links) are OR logic
 * - Coils are assignments to outputs
 * - Function blocks are called inline
 * 
 * Supports both grid-based and legacy linear models.
 */

import type { 
  LDModel, 
  LDRung, 
  LDElement, 
} from '../models/ld';
import { isGridBasedRung, convertToGridRung, isContact, isCoil, isFunctionBlock } from '../models/ld';
import { DataType, getFB, parseIOAddress, parseTimeLiteral, TokenType } from '@zplc/compiler';
import { getFunctionBlockNamesForVisualEditors } from '../catalog/blockCatalog';
import { getDefaultPorts } from '../models/fbd';

// =============================================================================
// Types
// =============================================================================

interface TranspileResult {
  success: boolean;
  source: string;
  errors: string[];
}

type UnknownRecord = Record<string, unknown>;
interface SymbolInfo { variable: UnknownRecord; section: 'local' | 'inputs' | 'outputs'; area?: 'I' | 'Q' | 'M'; }
interface Writer { type: string; rung: number; }

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MEMBER_REFERENCE = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;
const CUSTOM_MODBUS_BLOCKS = new Set(['MB_COIL', 'MB_DISCRETE_INPUT', 'MB_INPUT_REGISTER', 'MB_HOLDING_REGISTER']);
const SUPPORTED_CONTACTS = new Set(['contact_no', 'contact_nc']);
const SUPPORTED_COILS = new Set(['coil', 'coil_negated', 'coil_set', 'coil_reset']);
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
  return isTypeName(value) && (SUPPORTED_DATA_TYPES.has(key(value)) || Boolean(getFB(value)));
}

function validateComment(value: unknown, subject: string, errors: string[]): void {
  if (value !== undefined && (typeof value !== 'string' || value.includes('(*') || value.includes('*)'))) {
    errors.push(`${subject} comment must not contain ST comment delimiters`);
  }
}

function validateVariable(value: unknown, section: SymbolInfo['section'], symbols: Map<string, SymbolInfo>, errors: string[]): void {
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
  if (section === 'local' && typeof value.type === 'string' && getFB(value.type)) {
    if (value.initialValue !== undefined) errors.push(`Local FB '${String(value.name)}' initialValue is not supported`);
    if (value.address !== undefined) errors.push(`Local FB '${String(value.name)}' address is not supported`);
  }
}

function validateInitialValue(value: unknown, type: string, subject: string, errors: string[]): void {
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

function resolveBoolReference(value: unknown, subject: string, symbols: Map<string, SymbolInfo>, errors: string[]): void {
  if (typeof value !== 'string') { errors.push(`${subject} must reference a declared BOOL variable`); return; }
  const member = value.match(MEMBER_REFERENCE);
  if (member) {
    const variable = symbols.get(key(member[1]));
    const fb = variable && typeof variable.variable.type === 'string' ? getFB(variable.variable.type) : undefined;
    const output = fb?.members.find((entry) => entry.name.toUpperCase() === member[2].toUpperCase() && entry.isOutput);
    const isBoolOutput = output?.dataType === 'BOOL' || (output?.name.toUpperCase() === 'Q' && output.size === 1);
    if (!variable || !fb || !output || !isBoolOutput) errors.push(`${subject} '${value}' must reference a BOOL FB output`);
    return;
  }
  const variable = symbols.get(key(value));
  if (!variable || String(variable.variable.type).toUpperCase() !== 'BOOL') errors.push(`${subject} '${value}' must reference a declared BOOL variable`);
}

function resolveDestination(value: unknown, subject: string, symbols: Map<string, SymbolInfo>, errors: string[], requireBool = false): void {
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

function validatePortValue(value: unknown, expectedType: string, subject: string, symbols: Map<string, SymbolInfo>, errors: string[]): void {
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

function validateModbusHelper(element: UnknownRecord, rung: UnknownRecord, symbols: Map<string, SymbolInfo>, writers: Map<string, Writer[]>, errors: string[]): void {
  const parameters = element.parameters;
  const outputs = element.outputs;
  if (!isRecord(parameters)) { errors.push(`Function block '${String(element.id)}' requires parameters.IN`); return; }
  for (const port of Object.keys(parameters)) {
    if (port !== 'IN' && port !== 'ADDR') errors.push(`Function block '${String(element.id)}' does not support input '${port}'`);
  }
  resolveDestination(parameters.IN, `Function block '${String(element.id)}' input 'IN'`, symbols, errors);
  if (parameters.ADDR !== undefined && (typeof parameters.ADDR !== 'string' || !/^\d+$/.test(parameters.ADDR) || Number(parameters.ADDR) > 65535)) {
    errors.push(`Function block '${String(element.id)}' input 'ADDR' must be a decimal address from 0 to 65535`);
  }
  if (outputs !== undefined && !isRecord(outputs)) { errors.push(`Function block '${String(element.id)}' outputs must be an object`); return; }
  for (const [port, destination] of Object.entries(isRecord(outputs) ? outputs : {})) {
    if (port !== 'OUT' && port !== 'STATUS') errors.push(`Function block '${String(element.id)}' does not support output '${port}'`);
    resolveDestination(destination, `Function block '${String(element.id)}' output '${port}'`, symbols, errors, port === 'STATUS');
    if (typeof destination === 'string' && isIdentifier(destination)) {
      const types = writers.get(key(destination)) ?? [];
      types.push({ type: 'function_block', rung: Number(rung.number) });
      writers.set(key(destination), types);
    }
  }
}

function validateElement(value: unknown, rung: UnknownRecord, symbols: Map<string, SymbolInfo>, writers: Map<string, Writer[]>, elementIds: Set<string>, errors: string[]): void {
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
      writerTypes.push({ type: value.type, rung: Number(rung.number) });
      writers.set(output, writerTypes);
    }
    return;
  }
  if (value.type === 'left_rail' || value.type === 'right_rail') return;
  if (value.type !== 'function_block') { errors.push(`Unsupported LD element type '${value.type}'`); return; }
  if (!isTypeName(value.fbType) || !isIdentifier(value.instance)) { errors.push(`Function block '${String(value.id)}' requires a known type and instance`); return; }
  const known = new Set(getFunctionBlockNamesForVisualEditors().map(key));
  if (!known.has(key(value.fbType))) { errors.push(`Function block '${value.fbType}' is not in the visual catalog`); return; }
  const fb = getFB(value.fbType);
  const instance = symbols.get(key(value.instance));
  if (!CUSTOM_MODBUS_BLOCKS.has(value.fbType) && (!fb || !instance || instance.section !== 'local' || String(instance.variable.type).toUpperCase() !== key(value.fbType))) {
    errors.push(`Function block '${value.id}' instance '${value.instance}' must be declared as ${value.fbType}`);
  }
  if (CUSTOM_MODBUS_BLOCKS.has(value.fbType)) {
    validateModbusHelper(value, rung, symbols, writers, errors);
    return;
  }
  if (value.parameters !== undefined && !isRecord(value.parameters)) errors.push(`Function block '${value.id}' parameters must be an object`);
  if (value.outputs !== undefined && !isRecord(value.outputs)) errors.push(`Function block '${value.id}' outputs must be an object`);
  const ports = getDefaultPorts(value.fbType);
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
      writerTypes.push({ type: 'function_block', rung: Number(rung.number) });
      writers.set(output, writerTypes);
    }
  }
}

function validateLDForTranspilation(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return ['LD model must be an object'];
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
  for (let index = 1; index <= (input.rungs as unknown[]).length; index++) {
    if (symbols.has(`_RUNG${index}_RESULT`)) errors.push(`Variable '_rung${index}_result' collides with generated rung state`);
  }
  const rungIds = new Set<string>();
  const writers = new Map<string, Writer[]>();
  const rungs = input.rungs as unknown[];
  rungs.forEach((value, index) => {
    if (!isRecord(value)) { errors.push(`Rung ${index + 1} must be an object`); return; }
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
            if (!isRecord(cell) || !('element' in cell)) { errors.push(`Rung '${String(value.id)}' cell ${rowIndex},${colIndex} must contain element`); return; }
            if (cell.element !== null) {
              if (isRecord(cell.element) && (cell.element.row !== rowIndex || cell.element.col !== colIndex)) errors.push(`Rung '${String(value.id)}' element '${String(cell.element.id)}' coordinates must match its grid cell`);
              validateElement(cell.element, value, symbols, writers, elementIds, errors);
            }
          });
        });
        validateGridPowerPath(value, errors);
      }
      validateBranches(value, errors);
    } else if (hasLegacy) {
      if (!Array.isArray(value.elements)) errors.push(`Rung '${String(value.id)}' elements must be an array`);
      else {
        const elementIds = new Set<string>();
        value.elements.forEach((element) => validateElement(element, value, symbols, writers, elementIds, errors));
      }
      if (value.verticalLinks !== undefined && (!Array.isArray(value.verticalLinks) || value.verticalLinks.length > 0)) errors.push(`Rung '${String(value.id)}' verticalLinks require a grid and branches`);
    }
  });
  for (const [destination, writerTypes] of writers) {
    const types = writerTypes.map((writer) => writer.type);
    const allowedSetReset = writerTypes.length === 2 && new Set(types).size === 2 && types.includes('coil_set') && types.includes('coil_reset') && new Set(writerTypes.map((writer) => writer.rung)).size === 2;
    if (writerTypes.length > 1 && !allowedSetReset) errors.push(`Multiple writers target '${destination}'`);
  }
  return errors;
}

function validateGridPowerPath(rung: UnknownRecord, errors: string[]): void {
  if (!Array.isArray(rung.grid) || !isRecord(rung.gridConfig) || !isInteger(rung.gridConfig.rows) || !isInteger(rung.gridConfig.cols)) return;
  const branches = Array.isArray(rung.branches) ? rung.branches.filter(isRecord) : [];
  const branchAt = (row: number, col: number) => branches.some((branch) =>
    Array.isArray(branch.rows) && branch.rows.includes(row) && isInteger(branch.startCol) && isInteger(branch.endCol) && col >= branch.startCol && col <= branch.endCol,
  );
  let requiredEnd = -1;
  for (let rowIndex = 0; rowIndex < rung.grid.length; rowIndex++) {
    const row = rung.grid[rowIndex];
    if (!Array.isArray(row)) continue;
    row.forEach((cell, colIndex) => {
      if (!isRecord(cell) || typeof cell.hasWire !== 'boolean') {
        errors.push(`Rung '${String(rung.id)}' cell ${rowIndex},${colIndex} hasWire must be boolean`);
        return;
      }
      if (!isRecord(cell.element)) return;
      if (cell.element.type === 'left_rail' || cell.element.type === 'right_rail') errors.push(`Rung '${String(rung.id)}' rails are not allowed in a grid`);
      if (!cell.hasWire) errors.push(`Rung '${String(rung.id)}' element '${String(cell.element.id)}' must be on a wire`);
      if (rowIndex === 0) requiredEnd = Math.max(requiredEnd, colIndex);
      if (rowIndex > 0) {
        if (!branchAt(rowIndex, colIndex)) errors.push(`Rung '${String(rung.id)}' row ${rowIndex} element '${String(cell.element.id)}' must be inside a flat branch`);
        if (cell.element.type !== 'contact_no' && cell.element.type !== 'contact_nc') errors.push(`Rung '${String(rung.id)}' only contacts are supported outside row 0`);
      }
    });
  }
  for (const branch of branches) {
    if (!isInteger(branch.startCol) || !isInteger(branch.endCol) || !Array.isArray(branch.rows) || !branch.rows.includes(0)) continue;
    requiredEnd = Math.max(requiredEnd, branch.endCol);
    for (const rowIndex of branch.rows) {
      const row = rung.grid[rowIndex];
      if (!Array.isArray(row)) continue;
      const contacts = row.slice(branch.startCol, branch.endCol + 1).filter((cell) => isRecord(cell) && isRecord(cell.element) && (cell.element.type === 'contact_no' || cell.element.type === 'contact_nc'));
      if (contacts.length === 0) errors.push(`Rung '${String(rung.id)}' branch '${String(branch.id)}' row ${rowIndex} must contain a contact`);
      const lastSemanticCell = row.reduce((last, cell, col) => isRecord(cell) && isRecord(cell.element) ? col : last, branch.startCol);
      for (let col = branch.startCol; col <= lastSemanticCell; col++) {
        if (!isRecord(row[col]) || row[col].hasWire !== true) errors.push(`Rung '${String(rung.id)}' branch '${String(branch.id)}' must be wired across row ${rowIndex}`);
      }
    }
  }
  const primaryRow = rung.grid[0];
  if (Array.isArray(primaryRow)) {
    for (let col = 0; col <= requiredEnd; col++) {
      if (!isRecord(primaryRow[col]) || primaryRow[col].hasWire !== true) errors.push(`Rung '${String(rung.id)}' row 0 must be wired continuously through column ${col}`);
    }
  }
  for (let rowIndex = 1; rowIndex < rung.grid.length; rowIndex++) {
    const row = rung.grid[rowIndex];
    if (!Array.isArray(row)) continue;
    row.forEach((cell, colIndex) => {
      if (isRecord(cell) && (cell.hasWire === true || cell.element !== null) && !branchAt(rowIndex, colIndex)) errors.push(`Rung '${String(rung.id)}' row ${rowIndex} has orphaned wiring at column ${colIndex}`);
    });
  }
}

function validateBranches(rung: UnknownRecord, errors: string[]): void {
  const branches = rung.branches;
  if (rung.verticalLinks !== undefined && !Array.isArray(rung.verticalLinks)) errors.push(`Rung '${String(rung.id)}' verticalLinks must be an array`);
  if (Array.isArray(rung.verticalLinks) && rung.verticalLinks.length > 0 && (!Array.isArray(branches) || branches.length === 0)) errors.push(`Rung '${String(rung.id)}' verticalLinks require branches`);
  if (branches === undefined) return;
  if (!Array.isArray(branches)) { errors.push(`Rung '${String(rung.id)}' branches must be an array`); return; }
  const seen = new Set<string>();
  const intervals: Array<[number, number]> = [];
  const config = isRecord(rung.gridConfig) ? rung.gridConfig : {};
  for (const branch of branches) {
    const startCol = isRecord(branch) ? branch.startCol : undefined;
    const endCol = isRecord(branch) ? branch.endCol : undefined;
    const rows = isRecord(branch) ? branch.rows : undefined;
    const configCols = config.cols;
    const configRows = config.rows;
    if (!isRecord(branch) || !isIdentifier(branch.id) || !isInteger(startCol) || !isInteger(endCol) || !Array.isArray(rows) || !rows.includes(0) || new Set(rows).size !== rows.length || branch.parentBranchId !== undefined || startCol < 0 || endCol < startCol || !isInteger(configCols) || !isInteger(configRows) || endCol >= configCols || rows.length < 2 || rows.some((row) => !isInteger(row) || row < 0 || row >= configRows)) {
      errors.push(`Rung '${String(rung.id)}' has an invalid or nested branch`);
      continue;
    }
    if (seen.has(key(branch.id))) errors.push(`Rung '${String(rung.id)}' has duplicate branch id '${branch.id}'`);
    seen.add(key(branch.id));
    if (intervals.some(([start, end]) => startCol <= end && start <= endCol)) errors.push(`Rung '${String(rung.id)}' has overlapping branches`);
    intervals.push([startCol, endCol]);
  }
}

// =============================================================================
// Grid Analysis Helpers
// =============================================================================

import type { LDBranch } from '../models/ld';

/**
 * Element with its position in the grid
 */
interface PositionedElement {
  element: LDElement;
  row: number;
  col: number;
}

/**
 * Collect all contacts from the grid with their positions
 */
function collectContacts(rung: LDRung): PositionedElement[] {
  const contacts: PositionedElement[] = [];
  
  if (!rung.grid) return contacts;
  
  rung.grid.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      if (cell.element && isContact(cell.element.type)) {
        contacts.push({
          element: cell.element,
          row: rowIdx,
          col: cell.element.col ?? colIdx,
        });
      }
    });
  });
  
  return contacts;
}

/**
 * Generate expression for a single element
 */
function elementToExpression(element: LDElement): string {
  switch (element.type) {
    case 'contact_no':
      return element.variable || 'FALSE';
    case 'contact_nc':
      return `NOT ${element.variable || 'FALSE'}`;
    case 'contact_p':
      // Rising edge - would need previous state tracking
      return `(${element.variable || 'FALSE'} AND NOT _prev_${element.variable})`;
    case 'contact_n':
      // Falling edge
      return `(NOT ${element.variable || 'FALSE'} AND _prev_${element.variable})`;
    default:
      return '';
  }
}

/**
 * Generate expression for a rung by analyzing column regions
 * 
 * Strategy:
 * 1. Identify branch regions (startCol to endCol)
 * 2. For contacts OUTSIDE any branch: series (AND)
 * 3. For contacts INSIDE a branch: parallel by row (OR), then AND with rest
 * 
 * Example Rung 1 of motor control:
 *   Row 0: [StopPB_NC @ col0] [Overload_NC @ col1] [StartPB_NO @ col2] ... [Coil @ col7]
 *   Row 1:                                         [MotorRunning @ col2]
 *   Branch: { startCol: 2, endCol: 4, rows: [0, 1] }
 * 
 * Result: NOT StopPB AND NOT Overload AND (StartPB OR MotorRunning)
 */
function generateRungExpression(rung: LDRung): string {
  const contacts = collectContacts(rung);
  
  if (contacts.length === 0) {
    return 'TRUE';
  }
  
  const branches = rung.branches || [];
  
  // No branches: simple series (AND all contacts on row 0)
  if (branches.length === 0) {
    const row0Contacts = contacts.filter(c => c.row === 0);
    row0Contacts.sort((a, b) => a.col - b.col);
    const exprs = row0Contacts.map(c => elementToExpression(c.element)).filter(e => e !== '');
    return exprs.length > 0 ? exprs.join(' AND ') : 'TRUE';
  }
  
  // With branches: need to build expression respecting column regions
  
  // Group columns into regions: "series" (outside branches) or "parallel" (inside a branch)
  interface Region {
    type: 'series' | 'parallel';
    startCol: number;
    endCol: number;
    branch?: LDBranch;
  }
  
  const regions: Region[] = [];
  let currentCol = 0;
  const numCols = rung.gridConfig?.cols || 8;
  
  // Sort branches by startCol
  const sortedBranches = [...branches].sort((a, b) => a.startCol - b.startCol);
  
  for (const branch of sortedBranches) {
    // Add series region before this branch (if any)
    if (branch.startCol > currentCol) {
      regions.push({
        type: 'series',
        startCol: currentCol,
        endCol: branch.startCol - 1,
      });
    }
    
    // Add parallel region for this branch
    regions.push({
      type: 'parallel',
      startCol: branch.startCol,
      endCol: branch.endCol,
      branch,
    });
    
    currentCol = branch.endCol + 1;
  }
  
  // Add trailing series region (if any)
  if (currentCol < numCols) {
    regions.push({
      type: 'series',
      startCol: currentCol,
      endCol: numCols - 1,
    });
  }
  
  // Now generate expression for each region
  const regionExprs: string[] = [];
  
  for (const region of regions) {
    const regionContacts = contacts.filter(c => c.col >= region.startCol && c.col <= region.endCol);
    
    if (regionContacts.length === 0) continue;
    
    if (region.type === 'series') {
      // All contacts in series (AND)
      // Only use row 0 contacts for series regions
      const row0Contacts = regionContacts.filter(c => c.row === 0);
      row0Contacts.sort((a, b) => a.col - b.col);
      
      for (const c of row0Contacts) {
        const expr = elementToExpression(c.element);
        if (expr) regionExprs.push(expr);
      }
    } else {
      // Parallel region: group by row, OR between rows
      const branch = region.branch!;
      const rowExprs: string[] = [];
      
      for (const rowIdx of branch.rows) {
        const rowContacts = regionContacts.filter(c => c.row === rowIdx);
        rowContacts.sort((a, b) => a.col - b.col);
        
        // AND contacts within the same row
        const exprs = rowContacts.map(c => elementToExpression(c.element)).filter(e => e !== '');
        if (exprs.length > 0) {
          rowExprs.push(exprs.length === 1 ? exprs[0] : `(${exprs.join(' AND ')})`);
        }
      }
      
      // OR between rows
      if (rowExprs.length > 1) {
        regionExprs.push(`(${rowExprs.join(' OR ')})`);
      } else if (rowExprs.length === 1) {
        regionExprs.push(rowExprs[0]);
      }
    }
  }
  
  return regionExprs.length > 0 ? regionExprs.join(' AND ') : 'TRUE';
}

// =============================================================================
// Transpiler
// =============================================================================

export function transpileLDToST(input: unknown): TranspileResult {
  const errors: string[] = [];
  const lines: string[] = [];
  
  try {
    const preflightErrors = validateLDForTranspilation(input);
    if (preflightErrors.length > 0) return { success: false, source: '', errors: preflightErrors };
    const model = input as LDModel;
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
    
    // Internal rung results
    for (let i = 0; i < model.rungs.length; i++) {
      lines.push(`    _rung${i + 1}_result : BOOL;`);
    }
    
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
    
    for (const rung of model.rungs) {
      const rungCode = generateRungCode(rung);
      if (rung.comment) {
        lines.push(`(* Rung ${rung.number}: ${rung.comment} *)`);
      } else {
        lines.push(`(* Rung ${rung.number} *)`);
      }
      lines.push(...rungCode);
      lines.push('');
    }
    
    lines.push('END_PROGRAM');
    
    return {
      success: true,
      source: lines.join('\n'),
      errors: [],
    };
  } catch (e) {
    errors.push(`Transpiler error: ${e instanceof Error ? e.message : String(e)}`);
    return {
      success: false,
      source: '',
      errors,
    };
  }
}

// =============================================================================
// Rung Code Generation
// =============================================================================

function generateRungCode(rung: LDRung): string[] {
  // Convert to grid-based if necessary
  const gridRung = isGridBasedRung(rung) ? rung : convertToGridRung(rung);
  
  const lines: string[] = [];
  
  // Collect all elements from the grid
  const allElements: LDElement[] = [];
  if (gridRung.grid) {
    gridRung.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.element) {
          allElements.push(cell.element);
        }
      });
    });
  }
  
  const coils = allElements.filter(e => isCoil(e.type));
  const fbs = allElements.filter(e => isFunctionBlock(e.type));
  
  // Generate rung expression (contacts only) using the new column-aware algorithm
  const rungExpr = generateRungExpression(gridRung);
  
  // Store rung result
  lines.push(`_rung${rung.number}_result := ${rungExpr};`);
  
  // Generate function block calls
  for (const fb of fbs) {
    if (fb.fbType && fb.instance) {
      if (['MB_COIL', 'MB_DISCRETE_INPUT', 'MB_INPUT_REGISTER', 'MB_HOLDING_REGISTER'].includes(fb.fbType)) {
        const helperMap: Record<string, string> = {
          MB_COIL: 'MODBUS_COIL',
          MB_DISCRETE_INPUT: 'MODBUS_DISCRETE_INPUT',
          MB_INPUT_REGISTER: 'MODBUS_INPUT_REGISTER',
          MB_HOLDING_REGISTER: 'MODBUS_HOLDING_REGISTER',
        };
        const inputVar = fb.parameters!.IN;
        const addrVar = fb.parameters?.ADDR ?? '1';
        lines.push(`IF _rung${rung.number}_result THEN ${inputVar} := ${inputVar}; END_IF;`);
        lines.push(`${helperMap[fb.fbType]}(${inputVar}, ${addrVar});`);
        if (fb.outputs) {
          for (const [port, variable] of Object.entries(fb.outputs)) {
            if (port === 'STATUS') {
              lines.push(`${variable} := _rung${rung.number}_result;`);
            } else {
              lines.push(`${variable} := ${inputVar};`);
            }
          }
        }
        continue;
      }

      const params: string[] = [];
      
      // Input parameters
      if (fb.parameters) {
        for (const [key, value] of Object.entries(fb.parameters)) {
          if (value === 'CONNECTED') {
            params.push(`${key} := _rung${rung.number}_result`);
          } else {
            params.push(`${key} := ${value}`);
          }
        }
      } else {
        // Default: connect IN to rung result for timers/triggers
        if (['TON', 'TOF', 'TP', 'R_TRIG', 'F_TRIG'].includes(fb.fbType)) {
          params.push(`IN := _rung${rung.number}_result`);
        } else if (['CTU', 'CTD'].includes(fb.fbType)) {
          params.push(`CU := _rung${rung.number}_result`);
        } else if (fb.fbType === 'CTUD') {
          params.push(`CU := _rung${rung.number}_result`);
        } else if (['COMM_PUBLISH', 'COMM_SUBSCRIBE', 'COMM_MODBUS', 'COMM_CONNECT',
                    'MB_COIL', 'MB_DISCRETE_INPUT', 'MB_INPUT_REGISTER', 'MB_HOLDING_REGISTER',
                    'MB_READ_HREG', 'MB_WRITE_HREG', 'MB_READ_COIL', 'MB_WRITE_COIL',
                    'MQTT_CONNECT', 'MQTT_PUBLISH', 'MQTT_SUBSCRIBE',
                    'AZURE_C2D_RECV', 'AZURE_DPS_PROV', 'AZURE_EG_PUB',
                    'AWS_FLEET_PROV', 'SPB_REBIRTH'].includes(fb.fbType)) {
          params.push(`EN := _rung${rung.number}_result`);
        }
      }
      
      lines.push(`${fb.instance}(${params.join(', ')});`);
      
      // Output bindings
      if (fb.outputs) {
        for (const [port, variable] of Object.entries(fb.outputs)) {
          lines.push(`${variable} := ${fb.instance}.${port};`);
        }
      }
    }
  }
  
  // Generate coil assignments
  for (const coil of coils) {
    if (!coil.variable) continue;
    
    switch (coil.type) {
      case 'coil':
        lines.push(`${coil.variable} := _rung${rung.number}_result;`);
        break;
      case 'coil_negated':
        lines.push(`${coil.variable} := NOT _rung${rung.number}_result;`);
        break;
      case 'coil_set':
        lines.push(`IF _rung${rung.number}_result THEN ${coil.variable} := TRUE; END_IF;`);
        break;
      case 'coil_reset':
        lines.push(`IF _rung${rung.number}_result THEN ${coil.variable} := FALSE; END_IF;`);
        break;
      case 'coil_p':
        // One-shot on rising edge - would need previous state tracking
        lines.push(`(* P-coil: ${coil.variable} - requires edge detection *)`);
        lines.push(`${coil.variable} := _rung${rung.number}_result AND NOT _prev_rung${rung.number};`);
        break;
      case 'coil_n':
        // One-shot on falling edge
        lines.push(`(* N-coil: ${coil.variable} - requires edge detection *)`);
        lines.push(`${coil.variable} := NOT _rung${rung.number}_result AND _prev_rung${rung.number};`);
        break;
    }
  }
  
  return lines;
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
