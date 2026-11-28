/**
 * Sequential Function Chart, `src/*.sfc.json`: the shape `loadSFCFile` checks and the rules `validateSFCModel` and the
 * SFC transpiler hold.
 */
import { SFC_QUALIFIERS as QUALIFIERS } from '../models/sfc';
import { SFC_ACTION_TYPES as ACTION_TYPES } from '../transpiler/sfcToST';
import type { FormatModule, JsonSchema } from './index';

// QUALIFIERS: the ones the SFC transpiler translates; SD, DS and SL are refused with an error.

const position: JsonSchema = { type: 'object', required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } } };
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

const schema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'zplc://formats/sfc',
  title: 'ZPLC Sequential Function Chart (.sfc.json)',
  type: 'object',
  required: ['name', 'steps', 'transitions'],
  properties: {
    name: { type: 'string', description: 'The program name; tasks in zplc.json name it as `<name>.sfc`.' },
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
    steps: {
      type: 'array',
      description: 'At least one step has isInitial true.',
      items: {
        type: 'object',
        required: ['id', 'name', 'position'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          isInitial: { type: 'boolean' },
          position,
          actions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['actionName', 'qualifier'],
              properties: {
                actionName: { type: 'string', minLength: 1, description: 'The name of an entry of `actions`.' },
                qualifier: { enum: QUALIFIERS },
                time: { type: 'string', description: 'For L and D: a TIME literal such as T#2s.' },
                comment: { type: 'string' },
              },
            },
          },
          comment: { type: 'string' },
        },
      },
    },
    transitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'fromStep', 'toStep', 'condition'],
        properties: {
          id: { type: 'string' },
          fromStep: { type: 'string', description: 'A step id.' },
          toStep: { type: 'string', description: 'A step id.' },
          fromSteps: { type: 'array', items: { type: 'string' }, description: 'Simultaneous convergence; the first is fromStep.' },
          toSteps: { type: 'array', items: { type: 'string' }, description: 'Simultaneous divergence; the first is toStep.' },
          priority: { type: 'integer', description: 'Selection divergence: the lowest number is evaluated first.' },
          condition: { type: 'string', description: 'A BOOL expression in ST; `<stepId>.T` is the time in that step.' },
          position,
          comment: { type: 'string' },
        },
      },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'body'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          type: { enum: ACTION_TYPES },
          body: { type: 'string' },
        },
      },
    },
    metadata: { type: 'object' },
  },
};

const cycle = {
  name: 'Cycle',
  description: 'Idle until Start; Run drives the pump until Done or 10 s in the step, then back to Idle.',
  version: '1.0.0',
  variables: {
    local: [],
    inputs: [
      { name: 'Start', type: 'BOOL', address: '%I0.0' },
      { name: 'Done', type: 'BOOL', address: '%I0.1' },
    ],
    outputs: [{ name: 'Pump', type: 'BOOL', address: '%Q0.0' }],
  },
  steps: [
    { id: 'idle', name: 'Idle', isInitial: true, position: { x: 200, y: 40 }, actions: [{ qualifier: 'N', actionName: 'StopPump' }] },
    { id: 'run', name: 'Run', isInitial: false, position: { x: 200, y: 240 }, actions: [{ qualifier: 'N', actionName: 'RunPump' }] },
  ],
  transitions: [
    { id: 't_start', fromStep: 'idle', toStep: 'run', condition: 'Start', position: { x: 200, y: 140 } },
    { id: 't_done', fromStep: 'run', toStep: 'idle', condition: 'Done OR run.T >= T#10s', position: { x: 200, y: 340 } },
  ],
  actions: [
    { id: 'StopPump', name: 'StopPump', type: 'ST', body: 'Pump := FALSE;' },
    { id: 'RunPump', name: 'RunPump', type: 'ST', body: 'Pump := TRUE;' },
  ],
};

export const sfcFormat: FormatModule = {
  id: 'sfc',
  title: 'Sequential Function Chart',
  summary:
    'An SFC program: steps, the transitions between them with an ST condition each, and the actions a step runs under a ' +
    'qualifier. One step at least is initial. An N action runs while its step is active.',
  filePattern: 'src/*.sfc.json',
  schema,
  acceptedValues: { qualifiers: QUALIFIERS, actionTypes: ACTION_TYPES },
  examples: [{ title: 'Two steps, Idle -> Run -> Idle, with an action in each and two transitions', content: cycle }],
};
