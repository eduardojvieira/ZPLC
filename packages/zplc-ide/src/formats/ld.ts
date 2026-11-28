/** Ladder Diagram, `src/*.ld.json`: the shape `loadLDFile` checks and the rules `parseLDModel` and the LD transpiler hold. */
import { LD_COIL_TYPES, LD_CONTACT_TYPES, LD_FUNCTIONS, ldPaletteFunctionBlocks } from '../models/ldSupport';
import { LD_ELEMENT_TYPES as ELEMENT_TYPES } from '../models/visualFileLoad';
import type { FormatModule, JsonSchema } from './index';

const variable: JsonSchema = {
  type: 'object',
  required: ['name', 'type'],
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1, description: 'An IEC type (BOOL, INT, REAL, TIME) or a function block (TON, CTU).' },
    address: { type: 'string', description: 'A located input or output: %I0.0, %Q0.1, %IW0, %QD1.' },
    comment: { type: 'string' },
  },
};
const variables: JsonSchema = {
  type: 'object',
  required: ['local', 'outputs'],
  properties: {
    local: { type: 'array', items: variable },
    inputs: { type: 'array', items: variable },
    outputs: { type: 'array', items: variable },
  },
};

const element: JsonSchema = {
  type: 'object',
  required: ['id', 'type'],
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { enum: ELEMENT_TYPES },
    variable: { type: 'string', description: 'The variable a contact reads or a coil writes; `Timer.Q` reads a function block output.' },
    row: { type: 'integer', minimum: 0 },
    col: { type: 'integer', minimum: 0 },
    fbType: { type: 'string', description: 'For function_block: the block type, one of acceptedValues.functionBlocks.' },
    instance: { type: 'string', description: 'For function_block: the declared instance (a local variable of that type).' },
    parameters: { type: 'object', description: 'For function_block: input pin -> "CONNECTED" (the rung) or a literal such as "T#5s".' },
    functionName: { enum: Object.keys(LD_FUNCTIONS), description: 'For function: required.' },
    operands: { type: 'array', items: { type: 'string' }, description: 'For function: required, one per pin.' },
    output: { type: 'string', description: 'For function: the variable the result is written to.' },
    comment: { type: 'string' },
  },
};

const rung: JsonSchema = {
  type: 'object',
  required: ['id', 'number'],
  anyOf: [{ required: ['grid'] }, { required: ['elements'] }],
  properties: {
    id: { type: 'string', minLength: 1 },
    number: { type: 'number' },
    comment: { type: 'string' },
    gridConfig: {
      type: 'object',
      required: ['cols', 'rows'],
      properties: {
        cols: { type: 'integer', minimum: 1 },
        rows: { type: 'integer', minimum: 1 },
        cellWidth: { type: 'number' },
        cellHeight: { type: 'number' },
      },
    },
    grid: {
      type: 'array',
      description: 'Rows of cells, left to right; the last column holds the coil or the function block.',
      items: {
        type: 'array',
        items: { type: 'object', properties: { element: { anyOf: [element, { type: 'null' }] }, hasWire: { type: 'boolean' } } },
      },
    },
    elements: { type: 'array', items: element },
    branches: { type: 'array' },
  },
};

const schema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'zplc://formats/ld',
  title: 'ZPLC Ladder Diagram (.ld.json)',
  type: 'object',
  required: ['name', 'variables', 'rungs'],
  properties: {
    name: { type: 'string', description: 'The program name; tasks in zplc.json name it as `<name>.ld`.' },
    description: { type: 'string' },
    version: { type: 'string' },
    variables,
    rungs: { type: 'array', items: rung },
    metadata: { type: 'object' },
  },
};

const COLS = 8;
type Cell = Record<string, unknown>;
/** One row of eight cells: `left` from column 0, `right` in the last column, wire in between. */
function rung1(number: number, comment: string, left: Cell[], right?: Cell) {
  const row = Array.from({ length: COLS }, () => ({ element: null as Cell | null, hasWire: true }));
  left.forEach((cell, col) => (row[col]!.element = { id: `r${number}_${col}`, ...cell, row: 0, col }));
  if (right) row[COLS - 1]!.element = { id: `r${number}_out`, ...right, row: 0, col: COLS - 1 };
  return { id: `rung_${number}`, number, comment, gridConfig: { cols: COLS, rows: 1, cellWidth: 80, cellHeight: 60 }, grid: [row] };
}

/** Start/stop latch on a belt, a TON that flags a slow box, and a MOVE to a numeric display. */
const belt = {
  name: 'Belt',
  description: 'Start runs the belt until the box reaches EyeFar; Late comes on if that takes over 5 s.',
  version: '1.0.0',
  variables: {
    local: [
      { name: 'Running', type: 'BOOL', comment: 'Latch: the belt was started and the box has not arrived' },
      { name: 'RunTimer', type: 'TON', comment: 'Times how long the belt runs' },
    ],
    inputs: [
      { name: 'Start', type: 'BOOL', address: '%I0.0', comment: 'StartButton.pressed' },
      { name: 'EyeFar', type: 'BOOL', address: '%I0.1', comment: 'EyeFar.detect' },
    ],
    outputs: [
      { name: 'Run', type: 'BOOL', address: '%Q0.0', comment: 'Belt1.run' },
      { name: 'Emit', type: 'BOOL', address: '%Q0.1', comment: 'Emitter1.emit' },
      { name: 'Late', type: 'BOOL', address: '%Q0.2', comment: 'The box took over 5 s' },
      { name: 'Speed', type: 'REAL', address: '%QD1', comment: 'SpeedShown.value, in percent' },
    ],
  },
  rungs: [
    rung1(1, 'Start sets the latch.', [{ type: 'contact_no', variable: 'Start' }], { type: 'coil_set', variable: 'Running' }),
    rung1(2, 'EyeFar resets it; the later rung wins.', [{ type: 'contact_no', variable: 'EyeFar' }], {
      type: 'coil_reset',
      variable: 'Running',
    }),
    rung1(3, 'The belt follows the latch.', [{ type: 'contact_no', variable: 'Running' }], { type: 'coil', variable: 'Run' }),
    rung1(4, 'A Start press puts one box on the belt.', [{ type: 'contact_no', variable: 'Start' }], { type: 'coil', variable: 'Emit' }),
    rung1(5, 'Time the run.', [{ type: 'contact_no', variable: 'Running' }], {
      type: 'function_block',
      fbType: 'TON',
      instance: 'RunTimer',
      parameters: { IN: 'CONNECTED', PT: 'T#5s' },
    }),
    rung1(6, 'Five seconds without the box is late.', [{ type: 'contact_no', variable: 'RunTimer.Q' }], { type: 'coil', variable: 'Late' }),
    rung1(7, 'Show the belt speed.', [{ type: 'function', functionName: 'MOVE', operands: ['50.0'], output: 'Speed' }]),
  ],
};

export const ldFormat: FormatModule = {
  id: 'ld',
  title: 'Ladder Diagram',
  summary:
    'A Ladder program: its variables and its rungs. Each rung is a grid of cells; contacts read from the left, and the last ' +
    'column holds a coil or a function block. A function box (MOVE, ADD, GT...) computes into a variable.',
  filePattern: 'src/*.ld.json',
  schema,
  acceptedValues: {
    elementTypes: ELEMENT_TYPES,
    contactTypes: LD_CONTACT_TYPES,
    coilTypes: LD_COIL_TYPES,
    functions: Object.keys(LD_FUNCTIONS),
    functionBlocks: ldPaletteFunctionBlocks(),
  },
  examples: [{ title: 'Start/stop latch, a TON timer rung and a MOVE to a display', content: belt }],
};
