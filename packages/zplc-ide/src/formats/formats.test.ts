/**
 * AIX-013: every file format an agent writes has a schema and worked examples, and every worked example is accepted
 * by the same loader, parser or validator Studio and the compiler use. A deliberately broken copy is refused by it.
 */
import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject, type DebugMap } from '../compiler';
import { LD_COIL_TYPES, LD_CONTACT_TYPES } from '../models/ldSupport';
import { FBD_SPECIAL_BLOCKS } from '../models/fbd';
import { SFC_QUALIFIERS } from '../models/sfc';
import { LD_ELEMENT_TYPES, loadFBDFile, loadLDFile, loadSFCFile } from '../models/visualFileLoad';
import { catalogue } from '../plant/core/catalogue';
import { createPlantCore } from '../plant/core/plantCore';
import { parseScene, validateScene } from '../plant/core/scene';
import type { PlantSceneFile } from '../plant/contracts';
import { resolvePlantMap, validatePlantMap, type PlantMapV2 } from '../plants/plantMap';
import { listIoMap } from '../runtime/ioMap';
import { BOOLEAN_FACTS, INTEGER_FACTS, REAL_FACTS, SCENARIO_KINDS, compileScenario } from '../test-engine';
import type { PLCLanguage } from '../types';
import { FORMATS, formatById, type FormatId, type FormatModule, type JsonSchema } from './index';

const clone = <T>(value: T): T => structuredClone(value);
const exampleOf = (id: FormatId, index = 0): Record<string, unknown> => clone(formatById(id).examples[index]!.content);

function build(language: PLCLanguage, name: string, extension: string, content: unknown) {
  return compileMultiTaskProject(
    { name: 'Formats', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: [name] }] },
    [{ name, content: JSON.stringify(content), language, sourceRef: `src/${name}${extension}` }],
  );
}

/** The debug map of the LD worked example: the program the scene, the plant map and the scenarios bind to. */
const ldDebugMap = (): DebugMap => build('LD', 'Belt', '.ld.json', exampleOf('ld')).debugMap;

/**
 * The subset of JSON Schema 2020-12 the format schemas use: type, const, enum, required, properties,
 * additionalProperties, items, minItems, anyOf. It checks a worked example against its own schema.
 */
function schemaProblems(schema: JsonSchema, value: unknown, path = '$'): string[] {
  const out: string[] = [];
  const typeOf = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);
  if (schema.anyOf) {
    const passing = schema.anyOf.some((option) => schemaProblems(option, value, path).length === 0);
    if (!passing) out.push(`${path}: matches none of anyOf`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === 'integer' && types.includes('number'))) {
      out.push(`${path}: expected ${types.join('|')}, found ${actual}`);
      return out;
    }
  }
  if ('const' in schema && value !== schema.const) out.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value as never)) out.push(`${path}: ${JSON.stringify(value)} is not in enum`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.items) value.forEach((item, index) => out.push(...schemaProblems(schema.items!, item, `${path}[${index}]`)));
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) out.push(`${path}: missing ${key}`);
    for (const [key, item] of Object.entries(record)) {
      const property = schema.properties?.[key];
      if (property) out.push(...schemaProblems(property, item, `${path}.${key}`));
      else if (schema.additionalProperties === false) out.push(`${path}: unknown key ${key}`);
      else if (typeof schema.additionalProperties === 'object')
        out.push(...schemaProblems(schema.additionalProperties, item, `${path}.${key}`));
    }
  }
  return out;
}

describe('AIX-013 the six formats', () => {
  it('has one module for each of the six formats, in order', () => {
    expect(FORMATS.map((format) => format.id)).toEqual(['ld', 'fbd', 'sfc', 'scene', 'plant-map', 'scenario']);
  });

  for (const format of FORMATS as readonly FormatModule[]) {
    it(`${format.id}: exports a title, a summary, a 2020-12 schema, accepted values and worked examples its schema accepts`, () => {
      expect(format.title.length).toBeGreaterThan(0);
      expect(format.summary.length).toBeGreaterThan(0);
      expect(format.filePattern.length).toBeGreaterThan(0);
      expect(format.schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(format.schema.type).toBe('object');
      expect(Object.keys(format.acceptedValues).length).toBeGreaterThan(0);
      for (const values of Object.values(format.acceptedValues)) expect(values.length).toBeGreaterThan(0);
      expect(format.examples.length).toBeGreaterThanOrEqual(1);
      for (const example of format.examples) {
        expect(example.title.length).toBeGreaterThan(0);
        expect(schemaProblems(format.schema, example.content)).toEqual([]);
      }
    });
  }
});

describe('AIX-013 the worked examples pass the real parsers', () => {
  it('ld: loadLDFile accepts the example and the project compiles; an element type "contact" is refused', () => {
    const example = exampleOf('ld');
    const loaded = loadLDFile('Belt.ld.json', JSON.stringify(example));
    expect(loaded.ok).toBe(true);
    expect(build('LD', 'Belt', '.ld.json', example).zplcFile.length).toBeGreaterThan(0);

    const broken = exampleOf('ld') as { rungs: Array<{ grid: Array<Array<{ element: { type: string } | null }>> }> };
    broken.rungs[0]!.grid[0]![0]!.element!.type = 'contact';
    const refused = loadLDFile('Belt.ld.json', JSON.stringify(broken));
    expect(refused.ok).toBe(false);
  });

  it('ld: the accepted element types are the ones the loader knows', () => {
    expect(formatById('ld').acceptedValues.elementTypes).toEqual([
      'left_rail',
      'right_rail',
      ...LD_CONTACT_TYPES,
      ...LD_COIL_TYPES,
      'function_block',
      'function',
    ]);
  });

  it('fbd: loadFBDFile accepts the example and the project compiles; a connection to an unknown port is refused', () => {
    const example = exampleOf('fbd');
    expect(loadFBDFile('Guard.fbd.json', JSON.stringify(example)).ok).toBe(true);
    expect(build('FBD', 'Guard', '.fbd.json', example).zplcFile.length).toBeGreaterThan(0);

    const broken = exampleOf('fbd') as { connections: Array<{ to: { port: string } }> };
    broken.connections[0]!.to.port = 'IN9';
    expect(loadFBDFile('Guard.fbd.json', JSON.stringify(broken)).ok).toBe(false);
  });

  it('sfc: loadSFCFile accepts the example and the project compiles; a chart with no initial step is refused', () => {
    const example = exampleOf('sfc');
    expect(loadSFCFile('Cycle.sfc.json', JSON.stringify(example)).ok).toBe(true);
    expect(build('SFC', 'Cycle', '.sfc.json', example).zplcFile.length).toBeGreaterThan(0);

    const broken = exampleOf('sfc') as { steps: Array<{ isInitial: boolean }> };
    for (const step of broken.steps) step.isInitial = false;
    expect(loadSFCFile('Cycle.sfc.json', JSON.stringify(broken)).ok).toBe(false);
  });

  it('scene: parseScene and validateScene accept the example; an unknown part is refused', async () => {
    await createPlantCore(exampleOf('scene') as unknown as PlantSceneFile).then((core) => core.dispose());
    const parsed = parseScene(JSON.stringify(exampleOf('scene')));
    expect('scene' in parsed).toBe(true);
    expect(validateScene(exampleOf('scene'), catalogue)).toEqual([]);
    expect(formatById('scene').acceptedValues.parts).toEqual(catalogue.list().map((part) => part.id));

    const broken = exampleOf('scene') as { parts: Array<{ part: string }> };
    broken.parts[0]!.part = 'belt-x';
    expect(validateScene(broken, catalogue).map((problem) => problem.path)).toEqual(['parts[0].part']);
  });

  it('plant-map: validatePlantMap and resolvePlantMap accept the example against the LD program; a direction "input" is refused', () => {
    const example = exampleOf('plant-map');
    expect(validatePlantMap(example)).toEqual([]);
    expect(resolvePlantMap(example as unknown as PlantMapV2, listIoMap(ldDebugMap())).problems).toEqual([]);
    const types = Object.values((example as unknown as PlantMapV2).signals).map((signal) => signal.type);
    expect(types).toContain('BOOL');
    expect(types.some((type) => type !== 'BOOL')).toBe(true);

    const broken = exampleOf('plant-map') as { signals: Record<string, { direction: string }> };
    Object.values(broken.signals)[0]!.direction = 'input';
    expect(validatePlantMap(broken).length).toBeGreaterThan(0);
  });

  it('scenario: compileScenario accepts the plain and the scene example; an unknown kind is refused', async () => {
    const debugMap = ldDebugMap();
    const scenario = formatById('scenario');
    expect(scenario.examples.length).toBeGreaterThanOrEqual(2);
    expect(scenario.acceptedValues.kinds).toEqual(['AT', 'WITHIN', 'FOR', 'EVENTUALLY', 'ALWAYS', 'NEVER', 'UNTIL', 'RISING', 'FALLING']);

    const plain = exampleOf('scenario', 0);
    expect('scene' in plain).toBe(false);
    expect(compileScenario(plain, debugMap).id).toBe(plain.id as string);

    const withScene = exampleOf('scenario', 1);
    expect(JSON.stringify(withScene)).toMatch(/"fact:[^"]+":\{"min"/);
    const scene = exampleOf('scene') as unknown as PlantSceneFile;
    const map = exampleOf('plant-map') as unknown as PlantMapV2;
    const core = await createPlantCore(scene);
    try {
      expect(compileScenario(withScene, debugMap, { port: { core, map }, scene }).scene).toBeDefined();
    } finally {
      core.dispose();
    }

    const broken = exampleOf('scenario', 0) as { expectations: Array<{ kind: string }> };
    broken.expectations[0]!.kind = 'SOMETIMES';
    expect(() => compileScenario(broken, debugMap)).toThrow(/expectations\[0\]\.kind/);
  });
});

describe('AIX-013 the formats read their closed sets from the code that owns them', () => {
  it('LD element types are the ones loadLDFile checks', () => {
    expect(formatById('ld').acceptedValues.elementTypes).toBe(LD_ELEMENT_TYPES);
  });

  it('FBD special blocks are the ones the FBD model exports', () => {
    expect(formatById('fbd').acceptedValues.specialBlocks).toBe(FBD_SPECIAL_BLOCKS);
  });

  it('SFC qualifiers are the ones the SFC model exports', () => {
    expect(formatById('sfc').acceptedValues.qualifiers).toBe(SFC_QUALIFIERS);
    expect(SFC_QUALIFIERS).toEqual(['N', 'S', 'R', 'L', 'D', 'P', 'P0', 'P1']);
  });

  it('scenario kinds are the ones the test engine exports', () => {
    expect(formatById('scenario').acceptedValues.kinds).toBe(SCENARIO_KINDS);
  });

  it('the fact names of the scenario format have the heads the test engine types', () => {
    const heads = (facts: readonly string[]) => facts.map((fact) => fact.split(':')[0]).sort();
    const { integerFacts, realFacts, booleanFacts } = formatById('scenario').acceptedValues;
    expect(heads(integerFacts!)).toEqual([...INTEGER_FACTS].sort());
    expect(heads(realFacts!)).toEqual([...REAL_FACTS].sort());
    expect(heads(booleanFacts!)).toEqual([...BOOLEAN_FACTS].sort());
  });
});
