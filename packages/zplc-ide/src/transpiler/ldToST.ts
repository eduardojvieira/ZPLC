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
} from '../models/ld';
import { isGridBasedRung, convertToGridRung } from '../models/ld';
import { getDefaultPorts } from '../models/fbd';
import type { ProjectBlock } from '../models/projectBlocks';
import { POWER_OUTPUT, rungKeyOf, setTranspilationBlocks, transpilationBlocks, validateLDForTranspilation, type UnknownRecord } from './ldToSTValidation';
import { TRUE_POWER, and, atom, or, powerExpr, printPower, walkRung, type Power } from './ldPower';
import {
  ElementError, Listing, cellElement, rungElement,
  type ElementDiagnostic, type MonitorEntry, type SourceElementId, type SourceMapRange,
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
  /** Where the state of each element is read online: the variable that holds it, or the power that reaches it (LNG-006). */
  monitor?: MonitorEntry[];
}


// =============================================================================
// Transpiler
// =============================================================================

export function transpileLDToST(input: unknown, blocks: readonly ProjectBlock[] = []): TranspileResult {
  const lines = new Listing();
  setTranspilationBlocks(blocks);

  try {
    const problems = validateLDForTranspilation(input);
    if (problems.length > 0) return { success: false, source: '', errors: problems.messages, diagnostics: problems.diagnostics };
    const model = input as LDModel;
    // The rungs are generated first: the state they need is declared with the program's variables
    const rungCodes = model.rungs.map((rung, index) => generateRungCode(rung, rungKeyOf(rung as unknown as UnknownRecord, index)));
    const monitor = rungCodes.flatMap((code) => code.monitor);
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

    return { success: true, source: lines.toString(), errors: [], sourceMap: lines.sourceMap(), monitor };
  } catch (e) {
    const message = `Transpiler error: ${e instanceof Error ? e.message : String(e)}`;
    return {
      success: false,
      source: '',
      errors: [message],
      diagnostics: [e instanceof ElementError && e.element !== undefined ? { message, element: e.element } : { message }],
    };
  } finally {
    setTranspilationBlocks([]);
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
  /** Where the state of each element of the rung is read online (LNG-006). */
  monitor: MonitorEntry[];
}

function generateRungCode(rung: LDRung, rungKey: string): RungCode {
  // Convert to grid-based if necessary
  const gridRung = isGridBasedRung(rung) ? rung : convertToGridRung(rung);
  const grid = gridRung.grid ?? [];
  const cols = gridRung.gridConfig?.cols ?? Math.max(0, ...grid.map((row) => row.length));

  const lines = new Listing();
  const stages: string[] = [];
  const edges: RungCode['edges'] = [];
  const monitor: MonitorEntry[] = [];
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

  /** The statements of one element of the rung, and the power that leaves it. */
  const emit = (element: LDElement, row: number, col: number, power: Power): Power => {
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
  };

  const output = walkRung(grid, gridRung.branches ?? [], cols, {
    rail: TRUE_POWER,
    join: or,
    unpowered: (what, row, col) => { throw new ElementError(`Rung '${rung.id}' ${what}`, row === undefined || col === undefined ? rungElement(rungKey) : cellElement(rungKey, row, col)); },
    element: (element, row, col, power) => {
      const out = emit(element, row, col, power);
      const at = cellElement(rungKey, row, col);
      // the power that reaches the element and the power that leaves it, and the variables whose state it shows (LNG-006)
      monitor.push({ element: at, role: 'power', in: powerExpr(power), out: powerExpr(out) });
      if (element.type === 'function_block') {
        if (element.instance) {
          for (const port of getDefaultPorts(String(element.fbType), transpilationBlocks().filter((block) => block.name === element.fbType)).outputs) {
            monitor.push({ element: at, role: 'output', port: port.name, variable: `${element.instance}.${port.name}` });
          }
        }
      } else if (element.variable) {
        monitor.push({ element: at, role: 'value', variable: element.variable });
      }
      return out;
    },
  });

  // A rung whose power no element consumed still has its result, for the rung's state variable
  if (stages.length === 0) {
    stages.push(`_rung${rung.number}_result`);
    lines.push(`_rung${rung.number}_result := ${printPower(output ?? TRUE_POWER)};`, rungElement(rungKey));
  }
  return { lines, stages, edges, monitor };
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
