/** Plant scene, `scene.json`: the structure `parseScene` checks and the catalogue rules `validateScene` holds. */
import { catalogue } from '../plant/core/catalogue';
import '../plant/core/plantCore'; // registers the shipped parts in the catalogue
import { MAX_SCENE_PARTS, SCENE_SCHEMA_VERSION } from '../plant/core/sceneSchema';
import type { FormatModule, JsonSchema } from './index';

const vec3: JsonSchema = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

const schema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'zplc://formats/scene',
  title: 'ZPLC plant scene (scene.json)',
  type: 'object',
  required: ['schemaVersion', 'name', 'parts', 'cameras'],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: SCENE_SCHEMA_VERSION },
    name: { type: 'string', minLength: 1 },
    shortestPulseMs: { type: 'number', description: 'Greater than 0: the shortest pulse a person can give in the operate panel.' },
    parts: {
      type: 'array',
      maxItems: MAX_SCENE_PARTS,
      items: {
        type: 'object',
        required: ['id', 'part', 'name', 'position', 'rotationYDeg', 'config'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,31}$', description: 'Unique in the scene.' },
          part: { enum: catalogue.list().map((part) => part.id) },
          name: {
            type: 'string',
            pattern: '^[A-Za-z][A-Za-z0-9_]{0,23}$',
            description: 'Unique in the scene; it prefixes the signals (`Belt1.run`) and the facts (`count:EyeFar`).',
          },
          position: { ...vec3, description: '[x, y, z] in metres.' },
          rotationYDeg: { type: 'number' },
          config: {
            type: 'object',
            description: 'Settings of the part, numbers, strings or booleans; acceptedValues `config.<part>` lists them.',
            additionalProperties: { type: ['number', 'string', 'boolean'] },
          },
        },
      },
    },
    cameras: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'position', 'target'],
        additionalProperties: false,
        properties: { name: { type: 'string' }, position: vec3, target: vec3 },
      },
    },
  },
};

const beltToSensor = {
  schemaVersion: 1,
  name: 'Belt to sensor',
  shortestPulseMs: 800,
  parts: [
    { id: 'belt', part: 'belt', name: 'Belt1', position: [0, 0.5, 0], rotationYDeg: 0, config: { length: 2.4, speedMps: 0.5 } },
    { id: 'emitter', part: 'emitter', name: 'Emitter1', position: [-0.9, 0.5, 0], rotationYDeg: 0, config: { maxItems: 1 } },
    { id: 'eye-far', part: 'sensor-diffuse', name: 'EyeFar', position: [0.7, 0.5, -0.5], rotationYDeg: 270, config: { rangeM: 1 } },
    { id: 'start', part: 'push-button', name: 'StartButton', position: [-0.9, 0.5, -0.7], rotationYDeg: 0, config: {} },
    {
      id: 'speed',
      part: 'numeric-display',
      name: 'SpeedShown',
      position: [0.9, 0.8, -0.7],
      rotationYDeg: 0,
      config: { type: 'REAL', min: 0, max: 100, unit: '%', decimals: 0 },
    },
  ],
  cameras: [{ name: 'Overview', position: [0, 2.2, 2.6], target: [0, 0.5, 0] }],
};

const configKeys = catalogue
  .list()
  .filter((part) => Object.keys(part.config).length > 0)
  .map((part) => [`config.${part.id}`, Object.keys(part.config)] as const);

export const sceneFormat: FormatModule = {
  id: 'scene',
  title: 'Plant scene',
  summary:
    'The parts of a 3D plant, each a catalogue part with a unique id and name, a position, a rotation and its settings, and ' +
    'the cameras. The parts give the plant signals (`<name>.<signal>`) a plant map binds to the program.',
  filePattern: 'scene.json',
  schema,
  acceptedValues: { parts: catalogue.list().map((part) => part.id), ...Object.fromEntries(configKeys) },
  examples: [
    { title: 'A belt, an emitter, a diffuse sensor, a push button and a numeric display, with one camera', content: beltToSensor },
  ],
};
