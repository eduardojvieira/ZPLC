import { describe, expect, test } from 'bun:test';

import { CompilerError, compileToBinary } from './index.ts';
import { tokenize, TokenType } from './lexer.ts';

// CMP-034: a scope for each program organisation unit. CMP-035: the arguments of a function bind by name or
// position. CMP-037: the parameters of a function block are its own, and => binds an output.

interface Found { line: number; column: number; detail: string }

function errors(source: string): Found[] {
  try {
    compileToBinary(source);
  } catch (caught) {
    const list = ((caught as CompilerError).errors ?? [caught]) as Array<{ line: number; column: number; detail?: string; message: string }>;
    return list.map((each) => ({ line: each.line, column: each.column, detail: each.detail ?? each.message }));
  }
  return [];
}

const SUB = 'FUNCTION Sub : INT\nVAR_INPUT a : INT; b : INT; END_VAR\n  Sub := a - b;\nEND_FUNCTION\n';

describe('scopes (CMP-034)', () => {
  test('the variables of two functions are two sets of storage, named after their function', () => {
    const source = `FUNCTION Succ : INT\nVAR_INPUT a : INT; END_VAR\nVAR tmp : INT; END_VAR\n  tmp := a + 1;\n  Succ := tmp;\nEND_FUNCTION
FUNCTION Twice : INT\nVAR_INPUT a : INT; END_VAR\nVAR tmp : INT; END_VAR\n  tmp := a * 2;\n  Twice := tmp;\nEND_FUNCTION
PROGRAM P\nVAR\n  a : INT;\n  tmp : INT;\nEND_VAR\n  a := Succ(1) + Twice(2);\nEND_PROGRAM\n`;
    const vars = Object.values(compileToBinary(source, { generateDebugMap: true }).debugMap!.pou)[0]!.vars;
    const addresses = ['a', 'tmp', 'Succ.a', 'Succ.tmp', 'Succ.Succ', 'Twice.a', 'Twice.tmp', 'Twice.Twice'].map((name) => vars[name]?.addr);
    expect(addresses.every((address) => address !== undefined)).toBe(true);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  test('a function sees its own variables first, then the globals, and no variable of a program', () => {
    const found = errors('FUNCTION Peek : INT\nVAR_INPUT n : INT; END_VAR\n  Peek := n + hidden;\nEND_FUNCTION\nPROGRAM P\nVAR\n  hidden : INT;\n  x : INT;\nEND_VAR\n  x := Peek(1);\nEND_PROGRAM\n');
    expect(found).toHaveLength(1);
    expect([found[0]!.line, found[0]!.column]).toEqual([3, 15]);
    expect(found[0]!.detail).toContain('hidden');
  });

  test('a function may call a function declared after it', () => {
    const source = 'FUNCTION First : INT\nVAR_INPUT n : INT; END_VAR\n  First := Second(n) + 1;\nEND_FUNCTION\nFUNCTION Second : INT\nVAR_INPUT n : INT; END_VAR\n  Second := n * 2;\nEND_FUNCTION\nPROGRAM P\nVAR\n  x : INT;\nEND_VAR\n  x := First(3);\nEND_PROGRAM\n';
    expect(errors(source)).toEqual([]);
  });

  test('the name of a function is its result inside it, and a program may use the name for a variable', () => {
    const source = 'FUNCTION Level : INT\nVAR_INPUT n : INT; END_VAR\n  Level := n;\n  Level := Level + 1;\nEND_FUNCTION\nPROGRAM P\nVAR\n  x : INT;\nEND_VAR\n  x := Level(3);\nEND_PROGRAM\n';
    expect(errors(source)).toEqual([]);
  });
});

describe('function calls (CMP-035)', () => {
  test.each([
    ['an unknown name', 'x := Sub(a := 1, c := 2);', [10, 20], "has no input parameter 'c'"],
    ['a missing parameter', 'x := Sub(1);', [10, 8], "without its parameter 'b'"],
    ['a parameter twice', 'x := Sub(1, a := 2, b := 3);', [10, 15], 'given twice'],
    ['one argument too many', 'x := Sub(1, 2, 3);', [10, 18], 'takes 2 argument'],
    ['a positional after a named', 'x := Sub(a := 1, 2);', [10, 20], 'by position cannot follow'],
  ])('%s is an error at the argument or the call', (_name, statement, [line, column], words) => {
    const found = errors(`${SUB}\nPROGRAM P\nVAR\n  x : INT;\nEND_VAR\n  ${statement}\nEND_PROGRAM\n`);
    expect(found).toHaveLength(1);
    expect([found[0]!.line, found[0]!.column]).toEqual([line, column]);
    expect(found[0]!.detail).toContain(words);
  });

  test('one build reports a call error and an error elsewhere', () => {
    const found = errors(`${SUB}\nPROGRAM P\nVAR\n  x : INT;\nEND_VAR\n  x := Sub(1);\n  x := nope;\nEND_PROGRAM\n`);
    expect(found.map((each) => each.line)).toEqual([10, 11]);
  });

  test('a statement call of an unknown name is an error that names it', () => {
    const found = errors('PROGRAM P\nVAR x : INT; END_VAR\n  Missing(1);\n  x := 1;\nEND_PROGRAM\n');
    expect(found).toHaveLength(1);
    expect(found[0]!.detail).toContain('Missing');
  });

  test('a recursive function is an error at each call that closes a cycle', () => {
    const found = errors('FUNCTION A : INT\nVAR_INPUT n : INT; END_VAR\n  A := B(n);\nEND_FUNCTION\nFUNCTION B : INT\nVAR_INPUT n : INT; END_VAR\n  B := A(n);\nEND_FUNCTION\nFUNCTION C : INT\nVAR_INPUT n : INT; END_VAR\n  C := C(n - 1);\nEND_FUNCTION\nPROGRAM P\nEND_PROGRAM\n');
    expect(found.map((each) => `${each.line}:${each.detail.includes('through') ? 'through' : 'itself'}`)).toEqual(['7:through', '11:itself']);
  });

  test('a function that is not recursive, called twice, is not reported', () => {
    expect(errors('FUNCTION Leaf : INT\nVAR_INPUT n : INT; END_VAR\n  Leaf := n;\nEND_FUNCTION\nFUNCTION Branch : INT\nVAR_INPUT n : INT; END_VAR\n  Branch := Leaf(n) + Leaf(n + 1);\nEND_FUNCTION\nPROGRAM P\nEND_PROGRAM\n')).toEqual([]);
  });
});

describe('function block calls (CMP-037)', () => {
  const BLOCK = 'FUNCTION_BLOCK Adder\nVAR_INPUT a : INT; END_VAR\nVAR_OUTPUT sum : INT; END_VAR\nVAR hidden : INT; END_VAR\n  sum := a + hidden;\nEND_FUNCTION_BLOCK\n';

  test('=> is one token, and >= is still two characters of one', () => {
    const types = tokenize('Q=>x; a>=b; c=d;').map((token) => token.type);
    expect(types.filter((type) => type === TokenType.OUTPUT_ASSIGN)).toHaveLength(1);
    expect(types.filter((type) => type === TokenType.GE)).toHaveLength(1);
    expect(types.filter((type) => type === TokenType.EQ)).toHaveLength(1);
  });

  test.each([
    ['an unknown parameter', 'add(a := 1, nothing := 2);', "'nothing' is not a parameter"],
    ['a local given a value', 'add(hidden := 1);', "'hidden' is not a parameter"],
    ['an output given a value', 'add(sum := 1);', 'bind it with =>'],
    ['an input bound with =>', 'add(a => out);', 'bind it with :='],
    ['a binding of something that is no variable', 'add(sum => 1 + 2);', 'names the variable'],
  ])('%s is an error', (_name, statement, words) => {
    const found = errors(`${BLOCK}PROGRAM P\nVAR\n  add : Adder;\n  out : INT;\nEND_VAR\n  ${statement}\nEND_PROGRAM\n`);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0]!.line).toBe(12);
    expect(found[0]!.detail).toContain(words);
  });

  test('an output is bound to a member of a structure and an element of an array', () => {
    const source = `TYPE Box : STRUCT held : INT; END_STRUCT END_TYPE\n${BLOCK}PROGRAM P\nVAR\n  add : Adder;\n  box : Box;\n  list : ARRAY[0..2] OF INT;\nEND_VAR\n  add(a := 7, sum => box.held);\n  add(a := 8, sum => list[1]);\nEND_PROGRAM\n`;
    expect(errors(source)).toEqual([]);
  });

  test('an output of a standard block goes to a variable of a type it converts to', () => {
    expect(errors('PROGRAM P\nVAR\n  t : TON;\n  done : BOOL;\n  waited : TIME;\nEND_VAR\n  t(IN := TRUE, PT := T#1s, Q => done, ET => waited);\nEND_PROGRAM\n')).toEqual([]);
    expect(errors('PROGRAM P\nVAR\n  t : TON;\n  count : INT;\nEND_VAR\n  t(IN := TRUE, PT := T#1s, ET => count);\nEND_PROGRAM\n')).toHaveLength(1);
  });

  test('the parameters of a standard block are matched without regard to case', () => {
    expect(errors('PROGRAM P\nVAR\n  t : ton;\n  c : Ctu;\n  done : BOOL;\nEND_VAR\n  t(in := TRUE, Pt := T#10ms);\n  c(cu := TRUE, r := FALSE, pv := 3, q => done);\nEND_PROGRAM\n')).toEqual([]);
  });

  test('an output cannot be bound to a constant', () => {
    const found = errors('PROGRAM P\nVAR CONSTANT\n  fixed : BOOL := FALSE;\nEND_VAR\nVAR\n  t : TON;\nEND_VAR\n  t(IN := TRUE, PT := T#1s, Q => fixed);\nEND_PROGRAM\n');
    expect(found).toHaveLength(1);
    expect(found[0]!.detail).toContain('constant');
  });
});
