/**
 * The guard of LNG-029 and LNG-030: the Structured Text generated for every FBD diagram and every Ladder file of the repository,
 * and for one synthetic diagram per function FBD placed before LNG-029 and one synthetic rung per Ladder box, stays identical byte
 * for byte. The golden was recorded on the code before the change; `ZPLC_RECORD_ST_GOLDEN=1` records it again, which only an
 * owner's decision may do.
 */
import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { transpileToST, type PLCLanguage } from '../compiler';
import type { ProjectSourceFile } from '../models/projectBlocks';
import { collectProjectBlocks } from '../models/projectBlocks';
import { box, coil, contact, ldFile, variable } from './ldFunctionFixture';

const ROOT = resolve(import.meta.dir, '../../../..');
const GOLDEN = join(import.meta.dir, 'golden', 'st-golden.json');
const SCANNED = ['packages/zplc-ide/lessons', 'packages/zplc-ide/projects', 'conformance/lng', 'tools/hil'];

/**
 * Files that were refused only because FBD did not place a standard function (SQRT). D-37 removed that premise: the case now places a
 * COMM_PUBLISH, which the transpiler translates and the build refuses by name, so it is no longer the file the golden recorded.
 */
const NOW_TRANSLATED = new Set(['conformance/lng/lng-002-fbd-function-not-translated.fbd.json']);

interface Entry {
  sha256: string;
  success: boolean;
  text: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? (name === 'node_modules' ? [] : walk(path)) : [path];
    });
}

/** The ST sources of the project a file belongs to (the folder of its zplc.json, else its own folder): the blocks it may place. */
function projectSources(file: string): ProjectSourceFile[] {
  let dir = dirname(file);
  for (let up = dir; up.startsWith(ROOT) && up !== ROOT; up = dirname(up)) {
    if (existsSync(join(up, 'zplc.json'))) {
      dir = up;
      break;
    }
  }
  const files = dir === dirname(file) ? readdirSync(dir).map((name) => join(dir, name)) : walk(dir);
  return files
    .filter((path) => path.endsWith('.st'))
    .map((path) => ({ name: path, path, content: readFileSync(path, 'utf8'), language: 'ST' }));
}

function entry(content: string, language: PLCLanguage, sources: ProjectSourceFile[] = []): Entry {
  const result = transpileToST(content, language, undefined, collectProjectBlocks(sources));
  const text = result.success ? result.source : result.errors.join('\n');
  return { sha256: createHash('sha256').update(text).digest('hex'), success: result.success, text };
}

// =============================================================================
// Synthetic fixtures: the functions no file of the repository places (FBD MAX, NAND, NOR, MOD) and every Ladder box
// =============================================================================

const port = (name: string, type = 'ANY') => ({ name, type });

function fbdFixture(type: string, pins: Array<[string, string]>): string {
  const local = pins.map(([pin, pinType]) => ({ name: `V_${pin}`, type: pinType }));
  const resultType = pins.some(([, t]) => t === 'BOOL') && type !== 'SEL' ? 'BOOL' : 'INT';
  const blocks: unknown[] = [
    { id: 'blk', type, position: { x: 200, y: 0 } },
    { id: 'sink', type: 'output', variableName: 'Result', position: { x: 400, y: 0 }, inputs: [port('IN')], outputs: [] },
    ...pins.map(([pin], index) => ({
      id: `src${index}`,
      type: 'input',
      variableName: `V_${pin}`,
      position: { x: 0, y: index * 60 },
      inputs: [port('IN')],
      outputs: [port('OUT')],
    })),
  ];
  const connections = [
    ...pins.map(([pin], index) => ({ id: `w${index}`, from: { block: `src${index}`, port: 'OUT' }, to: { block: 'blk', port: pin } })),
    { id: 'wout', from: { block: 'blk', port: 'OUT' }, to: { block: 'sink', port: 'IN' } },
  ];
  return JSON.stringify({
    name: `Fixture_${type}`,
    variables: { local, inputs: [], outputs: [{ name: 'Result', type: resultType }] },
    blocks,
    connections,
  });
}

const INTS: Array<[string, string]> = [
  ['IN1', 'INT'],
  ['IN2', 'INT'],
];
const BOOLS: Array<[string, string]> = [
  ['IN1', 'BOOL'],
  ['IN2', 'BOOL'],
];
const FBD_FIXTURES: Record<string, string> = {
  MAX: fbdFixture('MAX', INTS),
  MIN: fbdFixture('MIN', INTS),
  LIMIT: fbdFixture('LIMIT', [
    ['MN', 'INT'],
    ['IN', 'INT'],
    ['MX', 'INT'],
  ]),
  SEL: fbdFixture('SEL', [
    ['G', 'BOOL'],
    ['IN0', 'INT'],
    ['IN1', 'INT'],
  ]),
  NAND: fbdFixture('NAND', BOOLS),
  NOR: fbdFixture('NOR', BOOLS),
  ABS: fbdFixture('ABS', [['IN', 'INT']]),
  MOD: fbdFixture('MOD', INTS),
};

const LD_BOXES: Record<string, string[]> = {
  GT: ['A', 'B'],
  GE: ['A', 'B'],
  EQ: ['A', 'B'],
  NE: ['A', 'B'],
  LE: ['A', 'B'],
  LT: ['A', 'B'],
  ADD: ['A', 'B'],
  SUB: ['A', '5'],
  MUL: ['A', 'B'],
  DIV: ['A', 'B'],
  MOD: ['A', 'B'],
  MOVE: ['A'],
  LIMIT: ['0', 'A', 'B'],
  MIN: ['A', 'B'],
  MAX: ['A', 'B'],
};
const COMPARES = new Set(['GT', 'GE', 'EQ', 'NE', 'LE', 'LT']);
const LD_FIXTURES: Record<string, string> = Object.fromEntries(
  Object.entries(LD_BOXES).map(([name, operands]) => [
    name,
    JSON.stringify(
      ldFile(
        {
          local: [variable('A', 'INT'), variable('B', 'INT'), variable('Sum', 'INT'), variable('Start', 'BOOL'), variable('Lamp', 'BOOL')],
        },
        contact('c1', 'Start'),
        COMPARES.has(name) ? box('f1', name, operands) : box('f1', name, operands, 'Sum'),
        coil('k1', 'Lamp'),
      ),
    ),
  ]),
);

function current(): Record<string, Entry> {
  const entries: Record<string, Entry> = {};
  for (const folder of SCANNED) {
    for (const path of walk(join(ROOT, folder))) {
      const language = path.endsWith('.fbd.json') ? 'FBD' : path.endsWith('.ld.json') ? 'LD' : undefined;
      if (language) entries[relative(ROOT, path)] = entry(readFileSync(path, 'utf8'), language, projectSources(path));
    }
  }
  for (const [name, content] of Object.entries(FBD_FIXTURES)) entries[`fixture/fbd/${name}`] = entry(content, 'FBD');
  for (const [name, content] of Object.entries(LD_FIXTURES)) entries[`fixture/ld/${name}`] = entry(content, 'LD');
  return entries;
}

describe('LNG-029 the ST of every existing diagram, and of every rung for the Ladder half, is identical byte for byte', () => {
  const now = current();
  if (process.env.ZPLC_RECORD_ST_GOLDEN === '1') writeFileSync(GOLDEN, `${JSON.stringify(now, null, 2)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Entry>;

  it('covers the 167 files and the 23 synthetic fixtures', () => {
    const keys = Object.keys(golden);
    expect(keys.filter((key) => !key.startsWith('fixture/')).length).toBe(167);
    expect(keys.filter((key) => key.startsWith('fixture/')).length).toBe(23);
    expect(Object.keys(now).sort()).toEqual(keys.sort());
  });

  it('every synthetic fixture translates', () => {
    for (const [key, value] of Object.entries(golden)) if (key.startsWith('fixture/')) expect([key, value.success]).toEqual([key, true]);
  });

  for (const [key, value] of Object.entries(golden)) {
    it(key, () => {
      if (NOW_TRANSLATED.has(key)) {
        // it was refused because FBD placed no SQRT; by D-37 it is a case the build refuses, and nothing that translated before changes
        expect([value.success, now[key]?.success]).toEqual([false, true]);
        return;
      }
      expect(now[key]?.text).toBe(value.text);
      expect(now[key]?.sha256).toBe(value.sha256);
    });
  }
});
