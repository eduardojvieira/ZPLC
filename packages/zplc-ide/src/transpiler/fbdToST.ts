/**
 * FBD to Structured Text Transpiler
 *
 * Converts FBD (Function Block Diagram) models to IEC 61131-3 Structured Text.
 * This enables the visual editor to leverage the existing ST compiler pipeline.
 *
 * Strategy:
 * 1. Topological sort blocks by data dependencies (a feedback loop is an error naming a block)
 * 2. Give every consumed output a temporary of the type its block computes: numeric blocks keep
 *    the type of their inputs (LNG-023)
 * 3. Generate function block instances and execution statements in dependency order
 * 4. A block or connection that cannot be translated is an error that names the block (LNG-002):
 *    nothing is replaced by a comment or by a constant
 */

import { getFB, parseIOAddress } from '@zplc/compiler';
import type { FBDModel, FBDBlock, FBDConnection } from '../models/fbd';
import { isFunctionBlock, isLogicGate, isComparison, isMathOperator, validateFBDModel } from '../models/fbd';
import { findProjectBlock, type ProjectBlock } from '../models/projectBlocks';
import {
  ElementError, Listing, Problems, blockElement,
  type ElementDiagnostic, type MonitorEntry, type SourceMapRange,
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
  /** Where the value of each pin of a block is read online (LNG-006). */
  monitor?: MonitorEntry[];
}

interface BlockInput {
  port: string;
  sourceBlock: string;
  sourcePort: string;
}

interface BlockOutput {
  port: string;
  tempVar: string;
}

/** What feeds an input: an expression and what is known of its type. */
interface Source {
  /** Text of the expression; a constant is rendered when its target type is known. */
  expr: string;
  type?: string;
  /** An integer constant, which can be used where a wider integer or a REAL is expected. */
  adaptable?: boolean;
  constant?: { value: unknown; dataType: string };
  /** For messages: where the value comes from. */
  origin: string;
}

type Kind = 'constant' | 'read' | 'variable' | 'output' | 'gate' | 'compare' | 'math' | 'function' | 'standard' | 'comm' | 'modbus' | 'registry'
  | 'userblock' | 'userfunction';

function endpointKey(block: string, port: string): string {
  return JSON.stringify([block, port]);
}

const VM_COMM_BLOCKS = new Set([
  'MB_READ_HREG', 'MB_WRITE_HREG', 'MB_READ_COIL', 'MB_WRITE_COIL',
  'MQTT_CONNECT', 'MQTT_PUBLISH', 'MQTT_SUBSCRIBE',
  'AZURE_C2D_RECV', 'AZURE_DPS_PROV', 'AZURE_EG_PUB',
  'AWS_FLEET_PROV', 'SPB_REBIRTH',
]);

/** Compile-time Modbus server tag-binding helpers (legacy, additive per FR-016): not function block instances. */
const MODBUS_HELPERS: Record<string, string> = {
  MB_COIL: 'MODBUS_COIL',
  MB_DISCRETE_INPUT: 'MODBUS_DISCRETE_INPUT',
  MB_INPUT_REGISTER: 'MODBUS_INPUT_REGISTER',
  MB_HOLDING_REGISTER: 'MODBUS_HOLDING_REGISTER',
};

/** The call order of the standard blocks' inputs. */
const FB_INPUT_ORDER: Record<string, string[]> = {
  TON: ['IN', 'PT'],
  TOF: ['IN', 'PT'],
  TP: ['IN', 'PT'],
  R_TRIG: ['CLK'],
  F_TRIG: ['CLK'],
  SR: ['S1', 'R'],
  RS: ['S', 'R1'],
  CTU: ['CU', 'R', 'PV'],
  CTD: ['CD', 'LD', 'PV'],
  CTUD: ['CU', 'CD', 'R', 'LD', 'PV'],
};

/** Functions of several inputs of one numeric type (ABS is a math operator of one input). */
const FUNCTION_BLOCKS = new Set(['MAX', 'MIN', 'LIMIT', 'SEL']);
const SIGNED = ['SINT', 'INT', 'DINT', 'LINT'];
const UNSIGNED = ['USINT', 'UINT', 'UDINT', 'ULINT'];
const BIT_STRING = ['BYTE', 'WORD', 'DWORD', 'LWORD'];
const REALS = ['REAL', 'LREAL'];
/** A logic gate does not take these. */
const NOT_BOOLEAN = [...REALS, 'TIME', 'LTIME', 'STRING'];

// =============================================================================
// Transpiler
// =============================================================================

/**
 * `blocks` are the function blocks and functions that the project declares (LNG-008): a diagram places them
 * like the standard ones, and the call names the ports of the declaration.
 */
export function transpileFBDToST(model: FBDModel, blocks?: readonly ProjectBlock[]): TranspileResult {
  const errors = new Problems();
  const lines = new Listing();

  try {
    const validatedModel = validateFBDModel(model, blocks);
    const blockMap = new Map(validatedModel.blocks.map((b) => [b.id, b]));
    const fail = (block: FBDBlock, message: string): void => {
      errors.push(`FBD block '${block.id}' (${block.type}): ${message}`, blockElement(block.id));
    };
    const failed = (): TranspileResult => {
      // a message that was found twice is reported once
      const seen = new Set<string>();
      const diagnostics = errors.diagnostics.filter((diagnostic) => {
        const key = `${diagnostic.element ?? ''}\0${diagnostic.message}`;
        return seen.has(key) ? false : (seen.add(key), true);
      });
      return { success: false, source: '', errors: [...new Set(errors.messages)], diagnostics };
    };

    // Names, comments and values reach the Structured Text as text: they have to be what they say
    validateText(validatedModel, errors);
    if (errors.length > 0) return failed();

    // Every block has to be one the transpiler translates
    const kinds = new Map<string, Kind>();
    for (const block of validatedModel.blocks) {
      const kind = classify(block, blocks);
      if (kind) kinds.set(block.id, kind);
      else fail(block, 'this block type is not supported by the FBD transpiler');
    }
    if (errors.length > 0) return failed();

    // Build connection map
    const inputMap = buildInputMap(validatedModel.connections);

    // An input block is only read
    for (const block of validatedModel.blocks) {
      const wired = inputMap.get(block.id) ?? [];
      if (kinds.get(block.id) === 'read' && wired.length > 0) {
        fail(block, `its input '${wired[0].port}' is wired, but an input block is only read; use a variable block to write`);
      }
    }
    if (errors.length > 0) return failed();

    // Topological sort blocks
    const sortedBlocks = topologicalSort(validatedModel.blocks, inputMap);

    // Types of the variables the diagram declares
    const varTypes = new Map<string, string>();
    for (const v of [...validatedModel.variables.local, ...(validatedModel.variables.inputs ?? []), ...validatedModel.variables.outputs]) {
      varTypes.set(v.name.toUpperCase(), v.type.toUpperCase());
    }

    const outputMap = buildOutputMap(validatedModel.blocks, inputMap, kinds);
    const outTypes = new Map<string, string | undefined>();

    // What feeds input `port` of `block`: undefined when it is not wired
    const sourceOf = (block: FBDBlock, port: string): Source | undefined => {
      const input = (inputMap.get(block.id) ?? []).find((i) => i.port === port);
      if (!input) return undefined;
      const source = blockMap.get(input.sourceBlock)!;
      const origin = `'${source.id}.${input.sourcePort}'`;
      switch (kinds.get(source.id)) {
        case 'constant': {
          const dataType = String(source.dataType ?? inferConstantType(source.value)).toUpperCase();
          return {
            expr: '', origin, constant: { value: source.value, dataType }, type: dataType,
            adaptable: [...SIGNED, ...UNSIGNED].includes(dataType) && Number.isInteger(source.value),
          };
        }
        case 'read':
        case 'variable': {
          const name = source.variableName;
          if (!name) { fail(source, 'it has no variable name'); return { expr: '0', origin }; }
          return { expr: name, origin, type: varTypes.get(name.toUpperCase()) };
        }
        default: {
          const temp = (outputMap.get(source.id) ?? []).find((o) => o.port === input.sourcePort);
          return { expr: temp?.tempVar ?? `${source.instanceName}.${input.sourcePort}`, origin, type: outTypes.get(endpointKey(source.id, input.sourcePort)) };
        }
      }
    };
    const render = (source: Source, target?: string): string =>
      source.constant ? formatValue(source.constant.value, target && source.adaptable ? target : source.constant.dataType) : source.expr;

    /** A required input: not being wired is an error naming the block and the port. */
    const required = (block: FBDBlock, port: string): Source | undefined => {
      const source = sourceOf(block, port);
      if (!source) fail(block, `input '${port}' is not wired`);
      return source;
    };

    /** The one type of a numeric block: its inputs must agree, integer constants adapt. */
    const unify = (block: FBDBlock, sources: Source[]): string | undefined => {
      const concrete = [...new Set(sources.filter((s) => s.type && !s.adaptable).map((s) => s.type!))];
      if (concrete.length === 0) {
        const adaptable = sources.filter((s) => s.adaptable).map((s) => s.type!);
        if (adaptable.length === 0) {
          fail(block, `the type of its inputs cannot be determined (${sources.map((s) => s.origin).join(', ')} not declared)`);
          return undefined;
        }
        return widest(adaptable) ?? 'INT';
      }
      for (const classOf of [SIGNED, UNSIGNED, BIT_STRING, REALS]) {
        if (concrete.every((t) => classOf.includes(t))) return widest(concrete);
      }
      if (concrete.length === 1) return concrete[0];
      fail(block, `its inputs have different types (${concrete.join(', ')}); the block keeps the type of its inputs, so convert one of them`);
      return undefined;
    };

    /** The type a consumer that stores the output in a declared variable asks for. */
    const consumerType = (block: FBDBlock, port: string): string | undefined => {
      const types = new Set<string>();
      for (const connection of validatedModel.connections) {
        if (connection.from.block !== block.id || connection.from.port !== port) continue;
        const target = blockMap.get(connection.to.block)!;
        const kind = kinds.get(target.id);
        const declared = (kind === 'output' || kind === 'variable') && target.variableName ? varTypes.get(target.variableName.toUpperCase()) : undefined;
        if (!declared) return undefined;
        types.add(declared);
      }
      return types.size === 1 ? [...types][0] : undefined;
    };

    // The generated statements of one block; the type of each of its outputs is recorded on the way
    const generate = (block: FBDBlock): string => {
      const kind = kinds.get(block.id)!;
      const outputs = outputMap.get(block.id) ?? [];
      const out = outputs.find((o) => o.port === 'OUT')?.tempVar ?? null;
      const typed = (port: string, type: string | undefined): void => {
        if (type !== undefined) outTypes.set(endpointKey(block.id, port), type);
      };
      const ports = (block.inputs ?? []).map((p) => p.name);

      switch (kind) {
        case 'constant':
        case 'read':
          return '';

        case 'variable': {
          // Variable write: the block is also a read of the variable for what is wired to its OUT
          if (!block.variableName) { fail(block, 'it has no variable name'); return ''; }
          const source = sourceOf(block, 'IN');
          return source ? `${block.variableName} := ${render(source, varTypes.get(block.variableName.toUpperCase()))};` : '';
        }

        case 'output': {
          if (!block.variableName) { fail(block, 'it has no variable name'); return ''; }
          const source = required(block, 'IN');
          return source ? `${block.variableName} := ${render(source, varTypes.get(block.variableName.toUpperCase()))};` : '';
        }

        case 'gate': {
          if (ports.length === 0) { fail(block, 'it has no inputs'); return ''; }
          const sources = ports.map((port) => required(block, port));
          if (sources.some((s) => !s)) return '';
          const operands = sources as Source[];
          const known = operands.filter((s) => s.type).map((s) => s.type!);
          const odd = known.find((t) => NOT_BOOLEAN.includes(t));
          if (odd) fail(block, `a logic gate does not take ${odd} inputs`);
          if (known.includes('BOOL') && known.some((t) => t !== 'BOOL')) fail(block, `its inputs mix BOOL with ${known.find((t) => t !== 'BOOL')}`);
          typed('OUT', known.length > 0 && known.every((t) => t === known[0]) ? known[0] : 'BOOL');
          if (!out) return '';
          const texts = operands.map((s) => render(s));
          switch (block.type) {
            case 'NOT': return `${out} := NOT ${texts[0]};`;
            case 'AND': return `${out} := ${texts.join(' AND ')};`;
            case 'OR': return `${out} := ${texts.join(' OR ')};`;
            case 'XOR': return `${out} := ${texts.join(' XOR ')};`;
            case 'NAND': return `${out} := NOT (${texts.join(' AND ')});`;
            default: return `${out} := NOT (${texts.join(' OR ')});`;
          }
        }

        case 'compare': {
          if (ports.length !== 2) { fail(block, `it has ${ports.length} inputs, a comparison takes two`); return ''; }
          typed('OUT', 'BOOL');
          const sources = ports.map((port) => required(block, port));
          if (sources.some((s) => !s)) return '';
          const operands = sources as Source[];
          const type = operands.some((s) => s.type) ? unify(block, operands) : undefined;
          if (!out) return '';
          const symbol: Record<string, string> = { EQ: '=', NE: '<>', LT: '<', LE: '<=', GT: '>', GE: '>=' };
          return `${out} := ${render(operands[0], type)} ${symbol[block.type]} ${render(operands[1], type)};`;
        }

        case 'math': {
          const nary = block.type === 'ADD' || block.type === 'MUL';
          const unary = block.type === 'ABS';
          if ((unary && ports.length !== 1) || (!unary && !nary && ports.length !== 2) || (nary && ports.length < 2)) {
            fail(block, `it has ${ports.length} inputs, which ${block.type} does not take`);
            return '';
          }
          const sources = ports.map((port) => required(block, port));
          if (sources.some((s) => !s)) return '';
          const operands = sources as Source[];
          const type = unify(block, operands);
          if (type === undefined) return '';
          if (type === 'BOOL' || type === 'STRING' || (type === 'TIME' && !['ADD', 'SUB', 'ABS'].includes(block.type))) {
            fail(block, `${block.type} does not take ${type} inputs`);
            return '';
          }
          typed('OUT', type);
          if (!out) return '';
          const texts = operands.map((s) => render(s, type));
          if (unary) return `${out} := ABS(${texts[0]});`;
          const symbol: Record<string, string> = { ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: 'MOD' };
          return `${out} := ${texts.join(` ${symbol[block.type]} `)};`;
        }

        case 'function': {
          // MAX, MIN, LIMIT, SEL: one type for the data inputs; SEL's selector is a BOOL
          const names = block.type === 'LIMIT' ? ['MN', 'IN', 'MX'] : block.type === 'SEL' ? ['G', 'IN0', 'IN1'] : ['IN1', 'IN2'];
          const sources = names.map((port) => required(block, port));
          if (sources.some((s) => !s)) return '';
          const operands = sources as Source[];
          const data = block.type === 'SEL' ? operands.slice(1) : operands;
          const type = unify(block, data);
          if (block.type === 'SEL' && operands[0].type && operands[0].type !== 'BOOL') {
            fail(block, `its selector 'G' is ${operands[0].type}, not BOOL`);
          }
          typed('OUT', type);
          if (!out) return '';
          const texts = operands.map((s, index) => render(s, block.type === 'SEL' && index === 0 ? undefined : type));
          return `${out} := ${block.type}(${texts.join(', ')});`;
        }

        case 'modbus': {
          if (!block.variableName) { fail(block, 'it has no variable name to bind to the Modbus address'); return ''; }
          const target = block.variableName;
          const en = required(block, 'EN');
          const inputSource = required(block, 'IN');
          const addr = required(block, 'ADDR');
          typed('STATUS', 'BOOL');
          typed('OUT', varTypes.get(target.toUpperCase()) ?? inputSource?.type);
          if (!en || !inputSource || !addr) return '';
          const outputVar = outputs.find((o) => o.port === 'OUT')?.tempVar;
          const statusVar = outputs.find((o) => o.port === 'STATUS')?.tempVar;
          const tagLines: string[] = [];
          tagLines.push(`IF ${render(en)} THEN ${target} := ${render(inputSource)}; END_IF;`);
          tagLines.push(`${MODBUS_HELPERS[block.type]}(${target}, ${render(addr)});`);
          if (outputVar) tagLines.push(`${outputVar} := ${target};`);
          if (statusVar) tagLines.push(`${statusVar} := ${render(en)};`);
          return tagLines.join('\n');
        }

        case 'userfunction': {
          // A function of the project: its result is the one output, OUT. The inputs that are wired are the
          // arguments, by name; one left open is for the compiler to say (a function has no state to keep).
          const wired = [...new Set((inputMap.get(block.id) ?? []).map((i) => i.port))];
          const args = wired.map((port) => `${port} := ${render(sourceOf(block, port)!, portType(block, port))}`);
          typed('OUT', outputType(block, 'OUT') ?? consumerType(block, 'OUT'));
          // a result nobody uses is still a call: the function may do something
          return out ? `${out} := ${block.type}(${args.join(', ')});` : `${block.type}(${args.join(', ')});`;
        }

        case 'comm':
        case 'standard':
        case 'userblock':
        case 'registry': {
          if (!block.instanceName) { fail(block, 'it has no instance name'); return ''; }
          // Only the inputs that are wired are passed: an input left open keeps the block's default
          const order = FB_INPUT_ORDER[block.type];
          const wired = (inputMap.get(block.id) ?? []).map((i) => i.port);
          const callPorts = order ? order.filter((port) => wired.includes(port)) : Array.from(new Set(wired));
          const args = callPorts.map((port) => `${port} := ${render(sourceOf(block, port)!, portType(block, port))}`);
          for (const output of outputs) {
            typed(output.port, outputType(block, output.port) ?? consumerType(block, output.port));
          }
          const callLines: string[] = [];
          callLines.push(`${block.instanceName}(${args.join(', ')});`);
          // Consumers reference temp vars, not the instance's members, so the value is the one this call produced
          for (const output of outputs) callLines.push(`${output.tempVar} := ${block.instanceName}.${output.port};`);
          return callLines.join('\n');
        }

        default:
          return '';
      }
    };

    // Generate the statements first: they decide the type of every temporary
    const statements = new Map<string, string>();
    for (const block of sortedBlocks) statements.set(block.id, generate(block));
    if (errors.length > 0) return failed();
    // Whatever is still untyped here is an output nothing could type: say so rather than declare a guess
    for (const block of sortedBlocks) {
      for (const output of outputMap.get(block.id) ?? []) {
        if (!outTypes.get(endpointKey(block.id, output.port))) {
          fail(block, `the type of its output '${output.port}' cannot be determined; give the port a type`);
        }
      }
    }
    if (errors.length > 0) return failed();

    // Generate program header
    lines.push(`PROGRAM ${validatedModel.name}`);
    lines.push('');

    // Input variables (I/O mapped): declared, so the blocks that read them compile
    const inputVariables = validatedModel.variables.inputs ?? [];
    if (inputVariables.length > 0) {
      lines.push('VAR_INPUT');
      for (const v of inputVariables) {
        const address = v.address ? ` AT ${v.address}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name}${address} : ${v.type};${comment}`);
      }
      lines.push('END_VAR');
      lines.push('');
    }

    // Generate variable declarations
    lines.push('VAR');

    // Local variables from model
    for (const v of validatedModel.variables.local) {
      const init = v.initialValue !== undefined ? ` := ${formatValue(v.initialValue, v.type)}` : '';
      const comment = v.comment ? ` (* ${v.comment} *)` : '';
      lines.push(`    ${v.name} : ${v.type}${init};${comment}`);
    }

    // Function block instances
    const declared = new Set(validatedModel.variables.local.map((v) => v.name.toUpperCase()));
    for (const block of validatedModel.blocks) {
      const kind = kinds.get(block.id);
      if (block.instanceName && (kind === 'standard' || ((kind === 'registry' || kind === 'userblock') && !declared.has(block.instanceName.toUpperCase())))) {
        const comment = block.comment ? ` (* ${block.comment} *)` : '';
        lines.push(`    ${block.instanceName} : ${block.type};${comment}`, blockElement(block.id));
      }
    }

    // Temporary variables for intermediate results
    for (const block of sortedBlocks) {
      for (const output of outputMap.get(block.id) ?? []) {
        const dataType = outTypes.get(endpointKey(block.id, output.port));
        if (dataType) lines.push(`    ${output.tempVar} : ${dataType};`, blockElement(block.id));
      }
    }

    lines.push('END_VAR');
    lines.push('');

    // Output variables (I/O mapped)
    if (validatedModel.variables.outputs.length > 0) {
      lines.push('VAR_OUTPUT');
      for (const v of validatedModel.variables.outputs) {
        const address = v.address ? ` AT ${v.address}` : '';
        const comment = v.comment ? ` (* ${v.comment} *)` : '';
        lines.push(`    ${v.name}${address} : ${v.type};${comment}`);
      }
      lines.push('END_VAR');
      lines.push('');
    }

    // Generate execution code
    lines.push('(* FBD Execution - Auto-generated *)');
    lines.push('');

    for (const block of sortedBlocks) {
      const code = statements.get(block.id);
      if (code) {
        // Add block comment if present
        if (block.comment) {
          lines.push(`(* ${block.comment} *)`, blockElement(block.id));
        }
        lines.push(code, blockElement(block.id));
      }
    }

    lines.push('');
    lines.push('END_PROGRAM');

    // Where each value that a pin carries is read online (LNG-006): the variable of a block that reads or writes one, the
    // temporary of an output that something consumes, else the member of the instance. A pin that has none is not shown.
    const monitor: MonitorEntry[] = [];
    for (const block of validatedModel.blocks) {
      const element = blockElement(block.id);
      const kind = kinds.get(block.id);
      if ((kind === 'read' || kind === 'variable' || kind === 'output') && block.variableName) {
        monitor.push({ element, role: 'value', variable: block.variableName });
        if (kind !== 'output') monitor.push({ element, role: 'output', port: 'OUT', variable: block.variableName });
        continue;
      }
      const instance = block.instanceName && (kind === 'standard' || kind === 'comm' || kind === 'registry' || kind === 'userblock') ? block.instanceName : undefined;
      for (const port of block.outputs ?? []) {
        const temporary = (outputMap.get(block.id) ?? []).find((output) => output.port === port.name)?.tempVar;
        const variable = temporary ?? (instance ? `${instance}.${port.name}` : undefined);
        if (variable) monitor.push({ element, role: 'output', port: port.name, variable });
      }
    }

    return {
      success: true,
      source: lines.toString(),
      errors: [],
      sourceMap: lines.sourceMap(),
      monitor,
    };
  } catch (e) {
    const message = `Transpiler error: ${e instanceof Error ? e.message : String(e)}`;
    return {
      success: false,
      source: '',
      errors: [...errors.messages, message],
      diagnostics: [...errors.diagnostics, e instanceof ElementError && e.element !== undefined ? { message, element: e.element } : { message }],
    };
  }
}

// =============================================================================
// Block classification
// =============================================================================

/**
 * Whether a block of this type can be placed in a diagram: the transpiler translates it (LNG-007). The palette of the
 * editor offers the blocks for which this holds, and no other.
 */
export function fbdPlacesBlock(type: string, blocks?: readonly ProjectBlock[]): boolean {
  const kind = classify({ id: 'palette', type, position: { x: 0, y: 0 } }, blocks);
  if (kind === undefined) return false;
  // a block that is an instance is declared as a variable of its type: a name the compiler does not have as a type is no block
  return kind === 'standard' || kind === 'comm' || kind === 'registry' ? getFB(type) !== undefined : true;
}

function classify(block: FBDBlock, blocks?: readonly ProjectBlock[]): Kind | undefined {
  const type = block.type;
  switch (type) {
    case 'constant': return 'constant';
    case 'input': return 'read';
    case 'variable': return 'variable';
    case 'output': return 'output';
  }
  // what the project declares is what the name means, as it is in the compiler (LNG-008)
  const declared = findProjectBlock(blocks, type);
  if (declared) return declared.kind === 'FUNCTION' ? 'userfunction' : 'userblock';
  if (isLogicGate(type)) return 'gate';
  if (isComparison(type)) return 'compare';
  if (isMathOperator(type)) return 'math';
  if (FUNCTION_BLOCKS.has(type)) return 'function';
  if (type in MODBUS_HELPERS) return 'modbus';
  if (VM_COMM_BLOCKS.has(type)) return 'comm';
  if (isFunctionBlock(type)) return 'standard';
  if (getFB(type)) return 'registry';
  return undefined;
}

// =============================================================================
// Connection Mapping
// =============================================================================

/**
 * Build a map of block inputs: blockId -> { port -> { sourceBlock, sourcePort } }
 */
function buildInputMap(connections: FBDConnection[]): Map<string, BlockInput[]> {
  const map = new Map<string, BlockInput[]>();

  for (const conn of connections) {
    const inputs = map.get(conn.to.block) || [];
    inputs.push({
      port: conn.to.port,
      sourceBlock: conn.from.block,
      sourcePort: conn.from.port,
    });
    map.set(conn.to.block, inputs);
  }

  return map;
}

/**
 * Build a map of block outputs that need temp variables
 */
function buildOutputMap(
  blocks: FBDBlock[],
  inputMap: Map<string, BlockInput[]>,
  kinds: Map<string, Kind>,
): Map<string, BlockOutput[]> {
  const map = new Map<string, BlockOutput[]>();
  const temporaryOwners = new Map<string, { key: string; label: string }>();

  // Find all blocks that have connections FROM them
  const usedOutputs = new Set<string>();
  for (const inputs of inputMap.values()) {
    for (const input of inputs) {
      usedOutputs.add(endpointKey(input.sourceBlock, input.sourcePort));
    }
  }

  for (const block of blocks) {
    // Constants and variables are read by name, an output block has no output: no temporaries
    const kind = kinds.get(block.id);
    if (kind === 'constant' || kind === 'output' || kind === 'read' || kind === 'variable') continue;

    const outputs: BlockOutput[] = [];
    const blockOutputs = block.outputs || [];

    for (const port of blockOutputs) {
      const key = endpointKey(block.id, port.name);
      if (usedOutputs.has(key)) {
        const tempVar = `_${block.id}_${port.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const owner = temporaryOwners.get(tempVar);
        if (owner && owner.key !== key) {
          throw new ElementError(`FBD temporary name collision: '${owner.label}' and '${block.id}.${port.name}' both map to '${tempVar}'`, blockElement(block.id));
        }
        temporaryOwners.set(tempVar, { key, label: `${block.id}.${port.name}` });
        outputs.push({
          port: port.name,
          tempVar,
        });
      }
    }

    if (outputs.length > 0) {
      map.set(block.id, outputs);
    }
  }

  return map;
}

// =============================================================================
// Topological Sort
// =============================================================================

function topologicalSort(
  blocks: FBDBlock[],
  inputMap: Map<string, BlockInput[]>
): FBDBlock[] {
  const result: FBDBlock[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const blockMap = new Map(blocks.map(b => [b.id, b]));

  function visit(blockId: string) {
    if (visited.has(blockId)) return;
    if (visiting.has(blockId)) {
      throw new ElementError(`Circular dependency detected involving block: ${blockId}`, blockElement(blockId));
    }

    visiting.add(blockId);

    // Visit all dependencies first
    const inputs = inputMap.get(blockId) || [];
    for (const input of inputs) {
      visit(input.sourceBlock);
    }

    visiting.delete(blockId);
    visited.add(blockId);

    const block = blockMap.get(blockId);
    if (block) {
      result.push(block);
    }
  }

  for (const block of blocks) {
    visit(block.id);
  }

  return result;
}

// =============================================================================
// Types
// =============================================================================

function inferConstantType(value: unknown): string {
  if (typeof value === 'boolean') return 'BOOL';
  if (typeof value === 'string') return value.toUpperCase().startsWith('T#') ? 'TIME' : 'STRING';
  if (typeof value === 'number' && !Number.isInteger(value)) return 'REAL';
  return 'INT';
}

/** The widest of types of one class (SINT < INT < DINT < LINT, REAL < LREAL...). */
function widest(types: string[]): string | undefined {
  for (const order of [SIGNED, UNSIGNED, BIT_STRING, REALS]) {
    const members = types.filter((t) => order.includes(t));
    if (members.length === types.length && members.length > 0) {
      return members.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a));
    }
  }
  return undefined;
}

/** The declared type of an input port of a block, when the port has a definite type. */
function portType(block: FBDBlock, portName: string): string | undefined {
  const port = block.inputs?.find((p) => p.name === portName);
  return port && port.type !== 'ANY' && port.type !== 'ANY_NUM' ? port.type.toUpperCase() : undefined;
}

/** The type of an output of a function block, or undefined when nothing but its consumers can say. */
function outputType(block: FBDBlock, portName: string): string | undefined {
  const port = block.outputs?.find((p) => p.name === portName);
  if (port && port.type !== 'ANY' && port.type !== 'ANY_NUM') return port.type.toUpperCase();

  // Communication blocks: their outputs are named by what they report
  if (VM_COMM_BLOCKS.has(block.type) || ['COMM_PUBLISH', 'COMM_SUBSCRIBE', 'COMM_MODBUS', 'COMM_CONNECT'].includes(block.type)) {
    if (['DONE', 'VALID', 'CONNECTED', 'ERROR', 'BUSY'].includes(portName)) return 'BOOL';
    if (portName === 'STATUS') return 'DINT';
    if (['PAYLOAD', 'TOPIC', 'ASSIGNED_HUB', 'DEVICE_ID', 'THING_NAME', 'TEMPLATE_NAME'].includes(portName)) return 'STRING';
    if (portName === 'VALUE') return 'INT';
  }

  // Standard block outputs
  if (portName === 'Q' || portName === 'Q1' || portName === 'QU' || portName === 'QD') return 'BOOL';
  if (portName === 'ET') return 'TIME';
  if (portName === 'CV') return 'INT';
  return undefined;
}

// =============================================================================
// Text that reaches the generated source
// =============================================================================

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REFERENCE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const TYPE_TEXT = /^[A-Za-z_][A-Za-z0-9_\s[\].,()]*$/;
const COMMENT_DELIMITER = /\(\*|\*\)/;

/** The model's names, types, comments and constants, as the problems that would make the source wrong. */
function validateText(model: FBDModel, problems: Problems): void {
  const sections: Array<[string, FBDModel['variables']['local']]> = [
    ['local', model.variables.local], ['input', model.variables.inputs ?? []], ['output', model.variables.outputs],
  ];
  for (const [section, variables] of sections) {
    for (const v of variables) {
      const label = `FBD ${section} variable '${String(v.name)}'`;
      if (typeof v.name !== 'string' || !IDENTIFIER.test(v.name)) problems.push(`${label}: the name is not an identifier`);
      if (typeof v.type !== 'string' || !TYPE_TEXT.test(v.type) || COMMENT_DELIMITER.test(v.type)) problems.push(`${label}: the type '${String(v.type)}' is not a type name`);
      if (v.comment !== undefined && (typeof v.comment !== 'string' || COMMENT_DELIMITER.test(v.comment))) problems.push(`${label}: the comment must not contain ST comment delimiters`);
      if (v.address !== undefined) {
        try { parseIOAddress(String(v.address)); } catch (error) { problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
  }
  for (const block of model.blocks) {
    const label = `FBD block '${block.id}' (${block.type})`;
    const at = blockElement(block.id);
    if (block.comment !== undefined && (typeof block.comment !== 'string' || COMMENT_DELIMITER.test(block.comment))) problems.push(`${label}: the comment must not contain ST comment delimiters`, at);
    if (block.instanceName !== undefined && (typeof block.instanceName !== 'string' || !IDENTIFIER.test(block.instanceName))) problems.push(`${label}: the instance name '${String(block.instanceName)}' is not an identifier`, at);
    if (block.variableName !== undefined && (typeof block.variableName !== 'string' || !REFERENCE.test(block.variableName))) problems.push(`${label}: the variable name '${String(block.variableName)}' is not a variable`, at);
    if (block.type === 'constant' && (block.value === undefined || block.value === null || typeof block.value === 'object')) problems.push(`${label}: it has no value`, at);
  }
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
    // TIME literals
    if (value.startsWith('T#')) return value;
    // String literals
    return `'${value.replaceAll("'", "''")}'`;
  }

  if (typeof value === 'number') {
    if (dataType === 'REAL' || dataType === 'LREAL') {
      return value.toString().includes('.') ? value.toString() : `${value}.0`;
    }
    return value.toString();
  }

  return String(value);
}
