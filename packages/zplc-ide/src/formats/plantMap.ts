/** Plant map, `plant-map.json` schema 2: the rules `validatePlantMap` holds and the typing `resolvePlantMap` checks against the program. */
import { PLANT_KINDS } from '../plants/plantEngine';
import type { FormatModule, JsonSchema } from './index';

const DIRECTIONS = ['command', 'sensor'];
const TYPES = ['BOOL', 'INT', 'REAL'];

const range: JsonSchema = {
  type: 'object',
  required: ['raw_min', 'raw_max', 'eng_min', 'eng_max', 'unit'],
  additionalProperties: false,
  description:
    'Linear scaling: raw_min..raw_max of the program variable is eng_min..eng_max of the plant. ' +
    'raw_max > raw_min; INT raw fits -32768..32767.',
  properties: {
    raw_min: { type: 'number' },
    raw_max: { type: 'number' },
    eng_min: { type: 'number' },
    eng_max: { type: 'number' },
    unit: { type: 'string', minLength: 1 },
  },
};

const schema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'zplc://formats/plant-map',
  title: 'ZPLC plant map (plant-map.json), schema 2',
  description: 'Schema 1 (`plant`, `reads`, `drives`, BOOL only) is still read for the 2.0 plants; write schema 2.',
  type: 'object',
  required: ['schemaVersion', 'target', 'signals'],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 2 },
    target: {
      type: 'object',
      description: 'Exactly one of `scene` (the scene id) or `plant` (a 2.0 plant).',
      anyOf: [
        { type: 'object', required: ['scene'], additionalProperties: false, properties: { scene: { type: 'string', minLength: 1 } } },
        { type: 'object', required: ['plant'], additionalProperties: false, properties: { plant: { enum: PLANT_KINDS } } },
      ],
    },
    signals: {
      type: 'object',
      description: 'Plant signal name (`<part name>.<signal>`) -> its binding; at least one.',
      additionalProperties: {
        type: 'object',
        required: ['direction', 'type', 'point'],
        additionalProperties: false,
        properties: {
          direction: { enum: DIRECTIONS, description: 'command: program to plant (an output); sensor: plant to program (an input).' },
          type: { enum: TYPES, description: 'INT is the 16-bit integer.' },
          point: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*\\.[A-Za-z_][A-Za-z0-9_]*$', description: '`Program.Name`.' },
          range: { ...range, description: `${range.description} Required for INT and REAL, absent for BOOL.` },
        },
      },
    },
  },
};

const beltMap = {
  schemaVersion: 2,
  target: { scene: 'belt-to-sensor' },
  signals: {
    'StartButton.pressed': { direction: 'sensor', type: 'BOOL', point: 'Belt.Start' },
    'EyeFar.detect': { direction: 'sensor', type: 'BOOL', point: 'Belt.EyeFar' },
    'Belt1.run': { direction: 'command', type: 'BOOL', point: 'Belt.Run' },
    'Emitter1.emit': { direction: 'command', type: 'BOOL', point: 'Belt.Emit' },
    'SpeedShown.value': {
      direction: 'command',
      type: 'REAL',
      point: 'Belt.Speed',
      range: { raw_min: 0, raw_max: 100, eng_min: 0, eng_max: 100, unit: '%' },
    },
  },
};

export const plantMapFormat: FormatModule = {
  id: 'plant-map',
  title: 'Plant map',
  summary:
    'The explicit binding of each plant signal to a program variable, `Program.Name`, with its direction and type. A command ' +
    'is a program output, a sensor a program input; an INT or REAL signal carries its scaling. No signal is bound by its name.',
  filePattern: 'plant-map.json',
  schema,
  acceptedValues: {
    directions: DIRECTIONS,
    types: TYPES,
    plants: PLANT_KINDS,
    rangeKeys: ['raw_min', 'raw_max', 'eng_min', 'eng_max', 'unit'],
  },
  examples: [{ title: 'Four BOOL signals and one REAL signal with its range, bound to the Ladder example', content: beltMap }],
};
