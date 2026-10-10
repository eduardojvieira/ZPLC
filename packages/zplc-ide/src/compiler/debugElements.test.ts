import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compileMultiTaskProject, compileSingleFileWithTask, type DebugMap, type PLCLanguage } from './index';
import { breakpointElements, breakpointLineElement, elementAtPc, elementBreakpointLine } from './debugElements';

const projects = join(import.meta.dir, '../../projects');
const read = (path: string): string => readFileSync(join(projects, path), 'utf8');

function build(language: PLCLanguage, content: string, sourceRef: string): DebugMap {
  return compileSingleFileWithTask(content, language, { sourceRef, programName: 'Main' }).debugMap;
}

const pou = (map: DebugMap, sourceRef: string) => Object.values(map.pou).find((candidate) => candidate.sourceRef === sourceRef)!;

describe('LNG-004 the debug map of a Ladder diagram names rungs and cells', () => {
  const ref = 'src/main.ld.json';
  const content = read('blinky/src/main.ld.json');
  const model = JSON.parse(content) as { rungs: Array<{ id: string }> };

  it('gives every range of the rung code the cell or the rung it was generated for', () => {
    const map = build('LD', content, ref);
    const ranges = pou(map, ref).sourceMap;
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((range) => range.element !== undefined && /^rung:/.test(range.element))).toBe(true);
    for (const rung of model.rungs) expect(ranges.some((range) => range.element!.startsWith(`rung:${rung.id}`))).toBe(true);
  });

  it('resolves each rung to the line and the first instruction of its code, in the order the rungs run', () => {
    const map = build('LD', content, ref);
    const pcs = model.rungs.map((rung) => {
      const line = elementBreakpointLine(map, ref, `rung:${rung.id}`);
      expect(line).toBeDefined();
      const location = pou(map, ref).breakpoints.find((candidate) => candidate.line === line)!;
      expect(location.valid).toBe(true);
      expect(breakpointLineElement(map, ref, line!)).toMatch(new RegExp(`^rung:${rung.id}`));
      // the first instruction of the rung: no range of the rung starts before it
      const own = pou(map, ref).sourceMap.filter((range) => range.element!.startsWith(`rung:${rung.id}`));
      expect(location.pc).toBe(Math.min(...own.map((range) => range.pc)));
      return location.pc;
    });
    expect([...pcs].sort((a, b) => a - b)).toEqual(pcs);
  });

  it('knows the element that executes at a program counter', () => {
    const map = build('LD', content, ref);
    const range = pou(map, ref).sourceMap[1]!;
    expect(elementAtPc(map, ref, range.pc)).toBe(range.element);
    expect(elementAtPc(map, ref, range.pc + range.length - 1)).toBe(range.element);
    expect(elementAtPc(map, ref, 0xffff)).toBeUndefined();
    expect(elementAtPc(map, 'src/other.ld.json', range.pc)).toBeUndefined();
  });

  it('lists the elements execution can stop at and says nothing about a rung that is not there', () => {
    const map = build('LD', content, ref);
    expect(breakpointElements(map, ref).some((element) => element === `rung:${model.rungs[0]!.id}` || element.startsWith(`rung:${model.rungs[0]!.id}/`))).toBe(true);
    expect(elementBreakpointLine(map, ref, 'rung:nowhere')).toBeUndefined();
    expect(elementBreakpointLine(null, ref, 'rung:rung_1')).toBeUndefined();
  });
});

describe('LNG-004 the debug map of an FBD diagram names blocks', () => {
  const ref = 'src/main.fbd.json';
  const content = read('blinky_fbd/src/main.fbd.json');
  const model = JSON.parse(content) as { blocks: Array<{ id: string; type: string }> };

  it('resolves a block that has a statement and none for a block that only reads or holds a value', () => {
    const map = build('FBD', content, ref);
    const computing = model.blocks.filter((block) => !['constant', 'variable', 'input', 'output'].includes(block.type));
    expect(computing.length).toBeGreaterThan(0);
    for (const block of computing) {
      const line = elementBreakpointLine(map, ref, `block:${block.id}`);
      expect(line).toBeDefined();
      expect(breakpointLineElement(map, ref, line!)).toBe(`block:${block.id}`);
    }
    for (const block of model.blocks.filter((candidate) => candidate.type === 'constant' || candidate.type === 'input')) {
      expect(elementBreakpointLine(map, ref, `block:${block.id}`)).toBeUndefined();
    }
  });
});

describe('LNG-004 the debug map of an SFC chart names steps and transitions', () => {
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

  it('stops a step where a transition enters it, and a transition where it fires', () => {
    const map = build('SFC', JSON.stringify(chart), ref);
    const locations = pou(map, ref).breakpoints;
    const enterB = locations.find((location) => location.element === 'step:s_b/enter');
    const fireAB = locations.find((location) => location.element === 'transition:t_ab/fire');
    expect(enterB).toBeDefined();
    expect(fireAB).toBeDefined();
    expect(elementBreakpointLine(map, ref, 'step:s_b')).toBe(enterB!.line);
    expect(elementBreakpointLine(map, ref, 'transition:t_ab')).toBe(fireAB!.line);
    // the location is the statement inside the test, not the test: the instruction of the nested assignment follows the test's own
    const own = pou(map, ref).sourceMap.filter((range) => range.line === enterB!.line);
    expect(own.length).toBeGreaterThanOrEqual(2);
    expect(enterB!.pc).toBe(Math.max(...own.map((range) => range.pc).filter((pc) => pc <= enterB!.pc)));
    expect(enterB!.pc).toBeGreaterThan(Math.min(...own.map((range) => range.pc)));
  });

  it('puts the lines of an action body on the action', () => {
    const map = build('SFC', JSON.stringify(chart), ref);
    expect(pou(map, ref).sourceMap.some((range) => range.element === 'action:mark')).toBe(true);
    expect(elementBreakpointLine(map, ref, 'action:mark')).toBeDefined();
  });
});

describe('LNG-004 the debug map of an IL program names IL lines', () => {
  const ref = 'src/main.il';
  const content = 'PROGRAM Main\nVAR\n  Sw AT %IX0.0 : BOOL;\n  Lamp AT %QX0.0 : BOOL;\nEND_VAR\n  LD Sw\n  JMPC skip\n  ST Lamp\nskip: LD Sw\n  ST Lamp\nEND_PROGRAM\n';

  it('states the lines of the IL source, and only the ones the author wrote', () => {
    const map = build('IL', content, ref);
    const lines = [...new Set(pou(map, ref).sourceMap.map((range) => range.line))].sort((a, b) => a - b);
    expect(lines).toEqual([6, 7, 8, 9, 10]);
    expect(pou(map, ref).breakpoints.map((location) => location.line)).toEqual(expect.arrayContaining([6, 7, 8, 9, 10]));
    expect(pou(map, ref).breakpoints.every((location) => location.element === `line:${location.line}`)).toBe(true);
    expect(elementBreakpointLine(map, ref, 'line:8')).toBe(8);
    expect(elementBreakpointLine(map, ref, 'line:3')).toBeUndefined();
  });
});

describe('the debug map of a Structured Text file is not touched', () => {
  it('has no element on any range or location', () => {
    const map = build('ST', 'PROGRAM Main\nVAR x AT %QX0.0 : BOOL; END_VAR\nx := TRUE;\nEND_PROGRAM\n', 'src/main.st');
    const only = pou(map, 'src/main.st');
    expect(only.sourceMap.length).toBeGreaterThan(0);
    expect(only.sourceMap.every((range) => range.element === undefined)).toBe(true);
    expect(only.breakpoints.every((location) => location.element === undefined)).toBe(true);
  });
});

describe('LNG-004 the elements survive the debug map of a project built as one unit', () => {
  const ref = 'src/main.ld.json';
  const hold = 'FUNCTION_BLOCK Hold\nVAR_INPUT Set : BOOL; END_VAR\nVAR_OUTPUT Q : BOOL; END_VAR\nQ := Q OR Set;\nEND_FUNCTION_BLOCK\n';
  const globals = 'VAR_GLOBAL\n  Shared : BOOL;\nEND_VAR\n';
  const cell = (element: object | null) => ({ element, hasWire: true });
  const ld = JSON.stringify({
    name: 'Main',
    variables: { local: [{ name: 'latch', type: 'Hold' }], inputs: [{ name: 'Sw', type: 'BOOL', address: '%IX0.0' }], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
    rungs: [{
      id: 'r1', number: 1, gridConfig: { rows: 1, cols: 3, cellWidth: 80, cellHeight: 60 }, branches: [],
      grid: [[
        cell({ id: 'c', type: 'contact_no', variable: 'Sw', row: 0, col: 0 }),
        cell({ id: 'f', type: 'function_block', fbType: 'Hold', instance: 'latch', parameters: { Set: 'Sw' }, row: 0, col: 1 }),
        cell({ id: 'k', type: 'coil', variable: 'Lamp', row: 0, col: 2 }),
      ]],
    }],
  });

  function unit(): DebugMap {
    return compileMultiTaskProject(
      { name: 'P', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main'] }] },
      [
        { name: 'main', content: ld, language: 'LD', sourceRef: ref },
        { name: 'hold', content: hold, language: 'ST', sourceRef: 'src/hold.st' },
        { name: 'globals', content: globals, language: 'ST', sourceRef: 'src/globals.st' },
      ],
    ).debugMap;
  }

  it('annotates the diagram and leaves the library files without an element', () => {
    const map = unit();
    const main = Object.values(map.pou).find((candidate) => candidate.sourceRef === ref)!;
    expect(main.sourceMap.length).toBeGreaterThan(0);
    expect(main.sourceMap.every((range) => range.element !== undefined)).toBe(true);
    expect(elementBreakpointLine(map, ref, 'rung:r1/cell:0,1')).toBeDefined();
    expect(elementBreakpointLine(map, ref, 'rung:r1')).toBeDefined();

    const library = Object.values(map.pou).filter((candidate) => candidate.sourceRef !== ref);
    expect(library.length).toBeGreaterThan(0);
    for (const pou of library) {
      expect(pou.sourceMap.every((range) => range.element === undefined)).toBe(true);
      expect(pou.breakpoints.every((location) => location.element === undefined)).toBe(true);
    }
  });

  it('keeps the global of another file as the one variable of every program', () => {
    const map = unit();
    const owners = Object.values(map.pou).filter((candidate) => candidate.vars.Shared !== undefined);
    expect(owners.length).toBe(1);
    expect(owners[0]!.sourceRef).toBe('src/globals.st');
    expect(owners[0]!.vars.Shared!.scope).toBe('global');
  });
});
