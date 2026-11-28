/** Test scenario, `tests/*.scenario.json`: the rules `compileScenario` holds, with the `plant` and `scene` blocks and the `fact:` reads. */
import { PLANT_KINDS } from '../plants/plantEngine';
import { BOOLEAN_FACTS, INTEGER_FACTS, REAL_FACTS, SCENARIO_KINDS as KINDS } from '../test-engine';
import type { FormatModule, JsonSchema } from './index';

// The heads of the `fact:` names come typed from the test engine; what follows a head is the grammar of `plant/ci/sceneCheck.ts`.
const ARGUMENTS: Record<string, string> = {
  position: ':<box|pallet>:<index>',
  axis: ':<Name>:<x|y|z>',
  cell: ':<Name>:<column>:<level>',
  stacked: ':pallet:<index>',
  layers: ':pallet:<index>',
  loaded: ':crate:<index>',
};
const facts = (heads: ReadonlySet<string>): string[] =>
  [...heads].map((head) => (head.startsWith('items') ? head : `${head}${ARGUMENTS[head] ?? ':<Name>'}`));

const ms: JsonSchema = { type: 'integer', minimum: 0, description: 'Milliseconds, a multiple of tickMs, at most durationMs.' };
const condition: JsonSchema = {
  type: 'object',
  description:
    '`Program.Output` -> true/false (an output, OPI). In a scene scenario also `fact:<name>` -> true/false, an exact whole number ' +
    'for an integer fact, or { "min", "max" } (either or both) for a real fact. 1-64 entries.',
  additionalProperties: { type: ['boolean', 'number', 'object'] },
};
const expectation = (kinds: string[], keys: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  required: ['kind', ...Object.keys(keys), 'condition'],
  additionalProperties: false,
  properties: { kind: { enum: kinds }, ...keys, condition },
});
const inputs: JsonSchema = {
  type: 'object',
  description: '`Program.Input` -> true/false: inputs (IPI) the plant does not own.',
  additionalProperties: { type: 'boolean' },
};

const schema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'zplc://formats/scenario',
  title: 'ZPLC test scenario (tests/*.scenario.json)',
  type: 'object',
  required: ['schemaVersion', 'id', 'tickMs', 'durationMs', 'events', 'expectations'],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    id: { type: 'string', minLength: 1, description: 'At most 128 characters.' },
    tickMs: { type: 'integer', minimum: 1, description: 'The task interval; a multiple of the plant step (5 ms) with a scene.' },
    durationMs: { type: 'integer', minimum: 1, description: 'A multiple of tickMs; at most 10000 samples.' },
    plant: { enum: PLANT_KINDS, description: 'A 2.0 plant; excludes `scene`.' },
    scene: {
      type: 'object',
      required: ['file', 'map', 'script'],
      additionalProperties: false,
      description: 'Runs on the project scene; excludes `plant`.',
      properties: {
        file: { type: 'string', description: 'scene.json' },
        map: { type: 'string', description: 'plant-map.json' },
        script: {
          type: 'array',
          description: 'Each event has atMs and exactly one of operate, emit, fault.',
          items: {
            type: 'object',
            required: ['atMs'],
            properties: {
              atMs: ms,
              operate: {
                type: 'object',
                required: ['signal', 'value'],
                properties: { signal: { type: 'string' }, value: { type: ['boolean', 'number'] } },
              },
              emit: {
                type: 'object',
                required: ['kind', 'at'],
                properties: { kind: { type: 'string' }, at: { type: 'array', items: { type: 'number' } } },
              },
              fault: { type: 'object', required: ['part', 'action'], properties: { part: { type: 'string' }, action: { type: 'string' } } },
            },
          },
        },
      },
    },
    events: {
      type: 'array',
      items: { type: 'object', required: ['atMs', 'set'], additionalProperties: false, properties: { atMs: ms, set: inputs } },
    },
    expectations: {
      type: 'array',
      minItems: 1,
      items: {
        anyOf: [
          expectation(['AT'], { atMs: ms }),
          expectation(['WITHIN', 'EVENTUALLY', 'RISING', 'FALLING'], { fromMs: ms, withinMs: ms }),
          expectation(['FOR'], { fromMs: ms, forMs: ms }),
          {
            ...expectation(['UNTIL'], { fromMs: ms }),
            required: ['kind', 'fromMs', 'condition', 'until'],
            properties: { kind: { enum: ['UNTIL'] }, fromMs: ms, condition, until: inputs },
          },
          expectation(['ALWAYS', 'NEVER'], {}),
        ],
      },
    },
  },
};

/** Drives the inputs of the Ladder example by hand. */
const plain = {
  schemaVersion: 1,
  id: 'belt-latch',
  tickMs: 10,
  durationMs: 2000,
  events: [
    { atMs: 100, set: { 'Belt.Start': true } },
    { atMs: 200, set: { 'Belt.Start': false } },
    { atMs: 1000, set: { 'Belt.EyeFar': true } },
  ],
  expectations: [
    { kind: 'AT', atMs: 50, condition: { 'Belt.Run': false } },
    { kind: 'WITHIN', fromMs: 100, withinMs: 50, condition: { 'Belt.Run': true } },
    { kind: 'FOR', fromMs: 300, forMs: 600, condition: { 'Belt.Run': true } },
    { kind: 'EVENTUALLY', fromMs: 1000, withinMs: 100, condition: { 'Belt.Run': false } },
    { kind: 'NEVER', condition: { 'Belt.Late': true } },
  ],
};

/** Runs the Ladder example on the scene example through the plant map example. */
const onScene = {
  schemaVersion: 1,
  id: 'belt-to-sensor',
  tickMs: 10,
  durationMs: 8000,
  scene: {
    file: 'scene.json',
    map: 'plant-map.json',
    script: [
      { atMs: 200, operate: { signal: 'StartButton.pressed', value: true } },
      { atMs: 400, operate: { signal: 'StartButton.pressed', value: false } },
    ],
  },
  events: [],
  expectations: [
    { kind: 'AT', atMs: 100, condition: { 'Belt.Run': false } },
    { kind: 'EVENTUALLY', fromMs: 0, withinMs: 8000, condition: { 'fact:count:EyeFar': true } },
    { kind: 'AT', atMs: 8000, condition: { 'Belt.Run': false, 'fact:position:box:0': { min: 0.2, max: 1.2 } } },
    { kind: 'ALWAYS', condition: { 'fact:itemsDropped': false } },
  ],
};

export const scenarioFormat: FormatModule = {
  id: 'scenario',
  title: 'Test scenario',
  summary:
    'A timed test of the program: events write inputs at given times, expectations check outputs over time. A scenario with ' +
    'a `scene` block runs on the project scene: its script presses the panel, and its expectations can read plant facts.',
  filePattern: 'tests/*.scenario.json',
  schema,
  acceptedValues: {
    kinds: KINDS,
    plants: PLANT_KINDS,
    scriptEvents: ['operate', 'emit', 'fault'],
    integerFacts: facts(INTEGER_FACTS),
    realFacts: facts(REAL_FACTS),
    booleanFacts: facts(BOOLEAN_FACTS),
  },
  examples: [
    { title: 'Plain I/O: events drive the inputs, five kinds of expectation', content: plain },
    { title: 'On the scene, with a fact count and a real fact range', content: onScene },
  ],
};
