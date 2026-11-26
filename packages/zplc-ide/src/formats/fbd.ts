/** Function Block Diagram, `src/*.fbd.json`: the shape `loadFBDFile` checks and the port rules `validateFBDModel` holds. */
import { getBlockCategories } from '../catalog/blockCatalog';
import type { FormatModule, JsonSchema } from './index';

/** The blocks that are not calls: a literal, a variable read, a program input and a variable write. */
const SPECIAL_BLOCKS = ['constant', 'variable', 'input', 'output'];
const STANDARD_BLOCKS = getBlockCategories().flatMap((category) => category.blocks);

const variable: JsonSchema = {
  type: 'object',
  required: ['name', 'type'],
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1 },
    address: { type: 'string' },
    comment: { type: 'string' },
  },
};
const port: JsonSchema = {
  type: 'object',
  required: ['name', 'type'],
  properties: { name: { type: 'string', minLength: 1 }, type: { type: 'string', minLength: 1 } },
};
const endpoint: JsonSchema = {
  type: 'object',
  required: ['block', 'port'],
  properties: { block: { type: 'string', minLength: 1 }, port: { type: 'string', minLength: 1 } },
};

const schema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'zplc://formats/fbd',
  title: 'ZPLC Function Block Diagram (.fbd.json)',
  type: 'object',
  required: ['name', 'variables', 'blocks', 'connections'],
  properties: {
    name: { type: 'string', minLength: 1, description: 'The program name; tasks in zplc.json name it as `<name>.fbd`.' },
    description: { type: 'string' },
    version: { type: 'string' },
    variables: {
      type: 'object',
      required: ['local', 'outputs'],
      properties: {
        local: { type: 'array', items: variable },
        inputs: { type: 'array', items: variable },
        outputs: { type: 'array', items: variable },
      },
    },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'position'],
        properties: {
          id: { type: 'string', minLength: 1, description: 'Unique in the file.' },
          type: {
            type: 'string',
            minLength: 1,
            description: 'One of acceptedValues.specialBlocks or acceptedValues.standardBlocks, or a block the project declares.',
          },
          instanceName: { type: 'string', description: 'For a function block (TON, CTU, SR...): its instance.' },
          variableName: { type: 'string', description: 'For constant/variable/input/output blocks: the variable.' },
          dataType: { type: 'string', description: 'For a constant: its type (BOOL, INT, REAL, TIME).' },
          value: { description: 'For a constant: its value, such as "T#2s" or 10.' },
          position: { type: 'object', required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } } },
          inputs: { type: 'array', items: port, description: 'Omitted: the standard ports of the type.' },
          outputs: { type: 'array', items: port, description: 'Omitted: the standard ports of the type.' },
          comment: { type: 'string' },
        },
      },
    },
    connections: {
      type: 'array',
      description: 'Output port -> input port; each input port has at most one writer, and both ports must exist on their blocks.',
      items: {
        type: 'object',
        required: ['id', 'from', 'to'],
        properties: { id: { type: 'string', minLength: 1 }, from: endpoint, to: endpoint },
      },
    },
    metadata: { type: 'object' },
  },
};

const bool = (name: string) => ({ name, type: 'BOOL' });
const guard = {
  name: 'Guard',
  description: 'The motor runs 2 s after Start is pressed with the guard closed, and stops as soon as either goes FALSE.',
  version: '1.0.0',
  variables: {
    local: [],
    inputs: [
      { name: 'Start', type: 'BOOL', address: '%I0.0' },
      { name: 'GuardClosed', type: 'BOOL', address: '%I0.1' },
    ],
    outputs: [{ name: 'Motor', type: 'BOOL', address: '%Q0.0' }],
  },
  blocks: [
    { id: 'in_start', type: 'variable', variableName: 'Start', position: { x: 40, y: 40 }, outputs: [bool('OUT')] },
    { id: 'in_guard', type: 'variable', variableName: 'GuardClosed', position: { x: 40, y: 140 }, outputs: [bool('OUT')] },
    { id: 'and_ready', type: 'AND', position: { x: 220, y: 80 }, inputs: [bool('IN1'), bool('IN2')], outputs: [bool('OUT')] },
    {
      id: 'const_delay',
      type: 'constant',
      dataType: 'TIME',
      value: 'T#2s',
      position: { x: 220, y: 200 },
      outputs: [{ name: 'OUT', type: 'TIME' }],
    },
    {
      id: 'ton_delay',
      type: 'TON',
      instanceName: 'StartDelay',
      position: { x: 380, y: 80 },
      inputs: [bool('IN'), { name: 'PT', type: 'TIME' }],
      outputs: [bool('Q'), { name: 'ET', type: 'TIME' }],
    },
    { id: 'out_motor', type: 'output', variableName: 'Motor', position: { x: 560, y: 80 }, inputs: [bool('IN')] },
  ],
  connections: [
    { id: 'c1', from: { block: 'in_start', port: 'OUT' }, to: { block: 'and_ready', port: 'IN1' } },
    { id: 'c2', from: { block: 'in_guard', port: 'OUT' }, to: { block: 'and_ready', port: 'IN2' } },
    { id: 'c3', from: { block: 'and_ready', port: 'OUT' }, to: { block: 'ton_delay', port: 'IN' } },
    { id: 'c4', from: { block: 'const_delay', port: 'OUT' }, to: { block: 'ton_delay', port: 'PT' } },
    { id: 'c5', from: { block: 'ton_delay', port: 'Q' }, to: { block: 'out_motor', port: 'IN' } },
  ],
};

export const fbdFormat: FormatModule = {
  id: 'fbd',
  title: 'Function Block Diagram',
  summary:
    'An FBD program: its variables, its blocks and the connections between their ports. A connection goes from an output ' +
    'port to an input port; variable blocks read a variable, output blocks write one, constant blocks hold a literal.',
  filePattern: 'src/*.fbd.json',
  schema,
  acceptedValues: { specialBlocks: SPECIAL_BLOCKS, standardBlocks: STANDARD_BLOCKS },
  examples: [{ title: 'AND of two inputs into a TON, written to an output', content: guard }],
};
