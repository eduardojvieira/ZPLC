import { describe, expect, test } from 'bun:test';

import manifest from '../../package.json';
import { COMPILER_VERSION, findVariable } from './debug-map.ts';
import { compileToBinary } from './index.ts';

// CMP-053: a build is a function of its sources. CMP-055: a statement owns every instruction it generates.

const PROGRAM = `PROGRAM Ranges
VAR
  a : INT;
  b : INT;
END_VAR
  a := 1;
  IF a > 0 THEN
    b := 2;
    b := b + 1;
  ELSE
    b := 3;
  END_IF;
  b := 4;
END_PROGRAM
`;

function build(source: string) {
  const result = compileToBinary(source, { generateDebugMap: true });
  const map = result.debugMap!;
  const ranges = Object.values(map.pou).flatMap((pou) => pou.sourceMap).sort((first, second) => first.pc - second.pc);
  return { result, map, ranges };
}

describe('the compiler version in the debug map (CMP-053)', () => {
  test('is the version of the package, so a release bump cannot leave a map naming the old compiler', () => {
    // Fails when package.json is bumped and COMPILER_VERSION in debug-map.ts is not
    expect(COMPILER_VERSION).toBe(manifest.version);
    expect(build(PROGRAM).map.compilerVersion).toBe(manifest.version);
  });
});

describe('two builds of the same source (CMP-053)', () => {
  test('produce the same bytecode and the same debug map, byte for byte', async () => {
    const first = build(PROGRAM);
    await Bun.sleep(5);
    const second = build(PROGRAM);
    expect(Buffer.from(second.result.zplcFile).equals(Buffer.from(first.result.zplcFile))).toBe(true);
    expect(JSON.stringify(second.map)).toBe(JSON.stringify(first.map));
    expect(first.map.generatedAt).toBeUndefined();
  });
});

describe('statement ranges (CMP-055)', () => {
  test('each statement owns its instructions up to the next one, with its line and column', () => {
    const { ranges } = build(PROGRAM);
    // the IF has instructions of its own after its first branch: the jump over the ELSE
    expect(ranges.map((range) => `${range.line}:${range.column}`)).toEqual(['6:3', '7:3', '8:5', '9:5', '7:3', '11:5', '13:3']);
    for (let index = 0; index < ranges.length - 1; index += 1) {
      expect(ranges[index]!.pc + ranges[index]!.length).toBe(ranges[index + 1]!.pc);
    }
  });

  test('every program counter of the cycle resolves to the statement that generated it', () => {
    const { result, ranges } = build(PROGRAM);
    const first = ranges[0]!;
    const last = ranges[ranges.length - 1]!;
    // the cycle ends with one HALT, which is no statement's
    expect(last.pc + last.length).toBe(result.bytecode.length - 1);
    for (let pc = first.pc; pc < last.pc + last.length; pc += 1) {
      expect(ranges.filter((range) => pc >= range.pc && pc < range.pc + range.length)).toHaveLength(1);
    }
  });

  test('the end of a function and the helpers after the cycle belong to no statement', () => {
    const source = `FUNCTION Twice : INT
VAR_INPUT n : INT; END_VAR
  Twice := n * 2;
END_FUNCTION

PROGRAM Calls
VAR
  r : REAL;
  k : INT;
END_VAR
  k := Twice(4);
  IF r > 1.5 THEN
    k := 0;
  END_IF;
END_PROGRAM
`;
    const { result, ranges } = build(source);
    const lines = ranges.map((range) => range.line);
    expect(lines).toContain(3);
    expect(lines).toContain(11);
    for (let index = 0; index < ranges.length - 1; index += 1) {
      const gap = ranges[index + 1]!.pc - (ranges[index]!.pc + ranges[index]!.length);
      // a gap is the return of the function, or the start-up code of the program: never inside a statement
      expect(gap).toBeGreaterThanOrEqual(0);
    }
    const last = ranges[ranges.length - 1]!;
    expect(last.pc + last.length).toBeLessThan(result.bytecode.length);
    expect(last.line).toBe(13);
  });

  test('a line is one breakpoint location, at its first instruction', () => {
    const { map, ranges } = build(PROGRAM);
    const breakpoints = Object.values(map.pou)[0]!.breakpoints;
    expect(breakpoints.map((breakpoint) => breakpoint.line)).toEqual([6, 7, 8, 9, 11, 13]);
    const seven = ranges.filter((range) => range.line === 7);
    expect(breakpoints.find((breakpoint) => breakpoint.line === 7)!.pc).toBe(seven[0]!.pc);
  });
});

describe('the variables of a function (CMP-034, CMP-054)', () => {
  test('are listed under the name of their function, and found by that path', () => {
    const source = 'FUNCTION Succ : INT\nVAR_INPUT a : INT; END_VAR\n  Succ := a + 1;\nEND_FUNCTION\nPROGRAM P\nVAR\n  a : INT;\n  r : INT;\nEND_VAR\n  r := Succ(a);\nEND_PROGRAM\n';
    const { map } = build(source);
    const own = findVariable(map, 'Succ.a');
    const program = findVariable(map, 'a');
    expect(own).not.toBeNull();
    expect(program).not.toBeNull();
    expect(own!.absoluteAddr).not.toBe(program!.absoluteAddr);
    expect(findVariable(map, 'Succ.Succ')).not.toBeNull();
  });
});
