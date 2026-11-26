/**
 * AIX-014 (unit AIX-U8): every language maps the elements an author can stop at to program counters, so a debugger
 * that only knows a file and an element (a line, a rung or cell, a block, a step, a transition) arms the right PC.
 * Everything goes through the public compile interface of the IDE.
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compileSingleFileWithTask, elementPcMap, resolveElementPc, type DebugMap, type PLCLanguage } from './index';
import { elementBreakpointLine } from './debugElements';

const projects = join(import.meta.dir, '../../projects');
const read = (path: string): string => readFileSync(join(projects, path), 'utf8');

const build = (language: PLCLanguage, content: string, sourceRef: string): DebugMap =>
  compileSingleFileWithTask(content, language, { sourceRef, programName: 'Main' }).debugMap;

const within = (outer: string, inner: string): boolean => inner === outer || inner.startsWith(`${outer}/`);
const hasRole = (element: string): boolean => /\/(enter|fire)$/.test(element);

/** The first instruction of an element, read from the ranges of the map: the step entry or transition firing when it has one. */
function firstInstruction(map: DebugMap, sourceRef: string, element: string): number {
  const pou = Object.values(map.pou).find((candidate) => candidate.sourceRef === sourceRef)!;
  const nameOf = (range: { line: number; element?: string }) => range.element ?? `line:${range.line}`;
  let own = pou.sourceMap.filter((range) => within(element, nameOf(range)));
  if (own.some((range) => hasRole(nameOf(range)))) own = own.filter((range) => hasRole(nameOf(range)));
  return Math.min(...own.map((range) => range.pc));
}

/** The contract every language holds: each element resolves to its first instruction, the map is ordered, no PC twice. */
function expectMapped(map: DebugMap, sourceRef: string, elements: string[]): void {
  for (const element of elements) {
    const found = resolveElementPc(map, sourceRef, element);
    expect(found).toMatchObject({ mapped: true, element });
    if (!found.mapped) continue;
    expect(found.pc).toBe(firstInstruction(map, sourceRef, element));
  }
  const entries = elementPcMap(map, sourceRef);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.map((entry) => entry.pc)).toEqual([...entries.map((entry) => entry.pc)].sort((a, b) => a - b));
  const kindOf = (element: string) => element.split('/').at(-1)!.split(':')[0];
  for (const kind of new Set(entries.map((entry) => kindOf(entry.element)))) {
    const pcs = entries.filter((entry) => kindOf(entry.element) === kind).map((entry) => entry.pc);
    expect(new Set(pcs).size).toBe(pcs.length);
  }
}

function expectNotMapped(map: DebugMap, sourceRef: string, element: string): void {
  const found = resolveElementPc(map, sourceRef, element);
  expect(found.mapped).toBe(false);
  if (found.mapped) return;
  expect(found.element).toBe(element);
  expect(found.message).toContain(`'${element}'`);
  expect(found.message).toContain(sourceRef);
}

describe('AIX-014 ST lines map to program counters', () => {
  const ref = 'src/main.st';
  const source = 'PROGRAM Main\nVAR x : INT; y : INT; z : INT; END_VAR\nx := x + 1;\ny := x * 2;\nz := z + 1;\nEND_PROGRAM\n';

  it('maps each statement line to its first instruction, in order, and names a line with no code as not mapped', () => {
    const map = build('ST', source, ref);
    expectMapped(map, ref, ['line:3', 'line:4', 'line:5']);
    expect(elementPcMap(map, ref).map((entry) => entry.line)).toEqual([3, 4, 5]);
    expectNotMapped(map, ref, 'line:2');
  });
});

describe('AIX-014 IL lines map to program counters', () => {
  const ref = 'src/main.il';
  const source =
    'PROGRAM Main\nVAR\n  Sw AT %IX0.0 : BOOL;\n  Lamp AT %QX0.0 : BOOL;\nEND_VAR\n  LD Sw\n  JMPC skip\n  ST Lamp\nskip: LD Sw\n  ST ' +
    'Lamp\nEND_PROGRAM\n';

  it('maps each IL line to its first instruction and names a declaration line as not mapped', () => {
    const map = build('IL', source, ref);
    expectMapped(map, ref, ['line:6', 'line:7', 'line:8', 'line:9', 'line:10']);
    expectNotMapped(map, ref, 'line:3');
  });
});

describe('AIX-014 FBD blocks map to program counters', () => {
  const ref = 'src/main.fbd.json';
  const content = read('blinky_fbd/src/main.fbd.json');
  const model = JSON.parse(content) as { blocks: Array<{ id: string; type: string }> };

  it('maps each computing block to its first instruction and names an unknown block as not mapped', () => {
    const map = build('FBD', content, ref);
    const computing = model.blocks.filter((block) => !['constant', 'variable', 'input', 'output'].includes(block.type));
    expect(computing.length).toBeGreaterThan(0);
    expectMapped(
      map,
      ref,
      computing.map((block) => `block:${block.id}`),
    );
    expectNotMapped(map, ref, 'block:nowhere');
  });
});

describe('AIX-014 LD rungs and cells map to program counters', () => {
  const ref = 'src/main.ld.json';
  const content = read('blinky/src/main.ld.json');
  const model = JSON.parse(content) as { rungs: Array<{ id: string }> };

  it('maps each rung and each cell to its first instruction and names an unknown rung as not mapped', () => {
    const map = build('LD', content, ref);
    const cells = elementPcMap(map, ref)
      .map((entry) => entry.element)
      .filter((element) => element.includes('/cell:'));
    expect(cells.length).toBeGreaterThan(0);
    expectMapped(map, ref, [...model.rungs.map((rung) => `rung:${rung.id}`), ...cells]);
    expectNotMapped(map, ref, 'rung:nowhere');
  });
});

describe('AIX-014 SFC steps and transitions map to program counters', () => {
  const ref = 'src/main.sfc.json';
  const chart = {
    name: 'Chart',
    variables: { local: [], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
    steps: [
      { id: 's_a', name: 'A', isInitial: true, position: { x: 0, y: 0 }, actions: [{ qualifier: 'N', actionName: 'Mark' }] },
      { id: 's_b', name: 'B', isInitial: false, position: { x: 0, y: 100 } },
    ],
    transitions: [
      { id: 't_ab', fromStep: 's_a', toStep: 's_b', condition: 'TRUE' },
      { id: 't_ba', fromStep: 's_b', toStep: 's_a', condition: 'TRUE' },
    ],
    actions: [{ id: 'mark', name: 'Mark', type: 'ST', body: 'Lamp := TRUE;' }],
  };

  it('maps a step to where it is entered and a transition to where it fires, and names an unknown step as not mapped', () => {
    const map = build('SFC', JSON.stringify(chart), ref);
    expectMapped(map, ref, ['step:s_a', 'step:s_b', 'transition:t_ab', 'transition:t_ba', 'step:s_b/enter', 'transition:t_ab/fire']);
    const enterB = resolveElementPc(map, ref, 'step:s_b');
    expect(enterB).toMatchObject({ mapped: true, element: 'step:s_b' });
    expect(enterB.mapped && enterB.pc).toBe(
      Object.values(map.pou)
        .find((pou) => pou.sourceRef === ref)!
        .breakpoints.find((location) => location.element === 'step:s_b/enter')!.pc,
    );
    expectNotMapped(map, ref, 'step:nowhere');
  });
});

describe('AIX-014 a file the build did not compile is not mapped', () => {
  it('names the file and the element', () => {
    const map = build('ST', 'PROGRAM Main\nVAR x : INT; END_VAR\nx := 1;\nEND_PROGRAM\n', 'src/main.st');
    expectNotMapped(map, 'src/other.st', 'line:3');
  });
});

describe('the existing element breakpoint consumer agrees with the new map', () => {
  it('elementBreakpointLine still resolves a rung to the line whose location holds the PC the map gives', () => {
    const ref = 'src/main.ld.json';
    const content = read('blinky/src/main.ld.json');
    const rung = (JSON.parse(content) as { rungs: Array<{ id: string }> }).rungs[0]!.id;
    const map = build('LD', content, ref);
    const line = elementBreakpointLine(map, ref, `rung:${rung}`);
    expect(line).toBeDefined();
    const found = resolveElementPc(map, ref, `rung:${rung}`);
    expect(found).toMatchObject({ mapped: true, line });
  });
});
