import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CompilerError, compileToBinary, tokenizeWithErrors, TokenType } from './index.ts';

// Names and types: IEC 61131-3 matches names without regard to case (CMP-004), and a declaration that names no type
// is an error that says which (CMP-003). PERSISTENT is left to 2.x and is rejected where it is written (CMP-006).

interface Found { line: number; column: number; detail: string }

function build(source: string) {
  return compileToBinary(source, { generateDebugMap: true });
}

function errors(source: string): Found[] {
  try {
    build(source);
  } catch (caught) {
    expect(caught).toBeInstanceOf(Error);
    const list = ((caught as CompilerError).errors ?? [caught]) as Array<{ line: number; column: number; detail?: string; message: string }>;
    return list.map((each) => ({ line: each.line, column: each.column, detail: each.detail ?? each.message }));
  }
  throw new Error('the build succeeded and produced an artifact');
}

/** The address a variable has in the debug map, as the assembly writes it. */
function address(result: ReturnType<typeof build>, name: string): string {
  const entry = Object.values(result.debugMap!.pou).map((pou) => pou.vars[name]).find(Boolean);
  if (!entry) throw new Error(`no variable ${name} in the debug map`);
  return `0x${entry.addr.toString(16).padStart(4, '0')}`;
}

describe('identifiers are matched without regard to case (CMP-004)', () => {
  test('a variable, a function, a structure member, an enumeration value and a block member', () => {
    const source = `TYPE
  Colour : (Red, Green);
  Pair : STRUCT
    Low : INT;
  END_STRUCT
END_TYPE

FUNCTION Twice : INT
VAR_INPUT Amount : INT; END_VAR
  TWICE := amount * 2;
END_FUNCTION

FUNCTION_BLOCK Counter
VAR_INPUT Step : INT; END_VAR
VAR_OUTPUT Total : INT; END_VAR
  total := TOTAL + step;
END_FUNCTION_BLOCK

PROGRAM Mixed
VAR
  Out : INT;
  P : Pair;
  C : Counter;
  Shade : Colour;
END_VAR
  OUT := twice(AMOUNT := 2);
  p.LOW := out;
  c(STEP := 1);
  out := C.total + P.low;
  shade := RED;
  IF SHADE = red THEN out := 0; END_IF;
END_PROGRAM
`;
    const result = build(source);
    expect(result.assembly).toContain(`STORE16 ${address(result, 'Out')}`);
  });

  test('two declarations of one name that differ only by case are a duplicate', () => {
    const found = errors('PROGRAM P\nVAR\n  Speed : INT;\n  speed : INT;\nEND_VAR\nEND_PROGRAM\n');
    expect(found).toHaveLength(1);
    expect(found[0]!.line).toBe(4);
    expect(found[0]!.detail).toContain('speed');
  });

  test('an undeclared name is still an error, whatever its case', () => {
    const found = errors('PROGRAM P\nVAR\n  Speed : INT;\nEND_VAR\n  Spee := 1;\nEND_PROGRAM\n');
    expect(found.map((each) => each.line)).toEqual([5]);
    expect(found[0]!.detail).toContain('Spee');
  });
});

describe('type names are matched without regard to case (CMP-004)', () => {
  test('elementary types, a user structure and an array of them', () => {
    const source = `TYPE
  Motor_T : STRUCT
    Speed : dint;
  END_STRUCT
END_TYPE

PROGRAM Types
VAR
  b : byte;
  w : Word;
  m : MOTOR_T;
  list : ARRAY[0..2] OF int;
  text : string[10];
  r : ref_to INT;
  t : Ton;
END_VAR
  b := 255;
  m.speed := 1;
  list[1] := 2;
END_PROGRAM
`;
    const result = build(source);
    // a BYTE is one byte: the store of 255 is not an INT's
    expect(result.assembly).toContain(`STORE8 ${address(result, 'b')}`);
    const vars = Object.values(result.debugMap!.pou)[0]!.vars;
    expect(vars.b!.type).toBe('BYTE');
    expect(vars.b!.size).toBe(1);
    expect(vars.w!.type).toBe('WORD');
    expect(vars.m!.size).toBe(4);
    expect(vars.list!.size).toBe(6);
    expect(vars.t!.type).toBe('TON');
  });

  test('a user type is found whatever the case of the use', () => {
    const source = `FUNCTION_BLOCK Valve
VAR_OUTPUT Open : BOOL; END_VAR
END_FUNCTION_BLOCK

PROGRAM Plant
VAR
  v1 : valve;
  v2 : VALVE;
END_VAR
  v1();
  v2();
END_PROGRAM
`;
    expect(() => build(source)).not.toThrow();
  });
});

describe('direct addresses are matched without regard to case (CMP-004)', () => {
  test('%ix0.0, %Qw2 and %qx0.1 are the addresses %IX0.0, %QW2 and %QX0.1', () => {
    const source = `PROGRAM Wiring
VAR
  go AT %ix0.0 : BOOL;
  level AT %Qw2 : INT;
  lamp AT %qx0.1 : BOOL;
END_VAR
  lamp := go;
  level := 1;
END_PROGRAM
`;
    const vars = Object.values(build(source).debugMap!.pou)[0]!.vars;
    expect(vars.go).toMatchObject({ addr: 0x0000, region: 'IPI', bitOffset: 0 });
    expect(vars.level).toMatchObject({ addr: 0x1004, region: 'OPI' });
    expect(vars.lamp).toMatchObject({ addr: 0x1000, region: 'OPI', bitOffset: 1 });
  });
});

describe('a declaration that names no type is an error (CMP-003)', () => {
  test('an unknown type name is reported at the name, and says it', () => {
    const found = errors('PROGRAM P\nVAR\n  x : NoSuchType;\n  y : INT;\nEND_VAR\n  y := 1;\nEND_PROGRAM\n');
    expect(found).toEqual([{ line: 3, column: 7, detail: "Unknown type 'NoSuchType' in the declaration of 'x'" }]);
  });

  test.each(['LTIME', 'LDATE', 'LTOD', 'LDT', 'CHAR', 'WCHAR'])('%s is rejected by name, as decision D-04 says', (type) => {
    const found = errors(`PROGRAM P\nVAR\n  v : ${type};\nEND_VAR\nEND_PROGRAM\n`);
    expect(found).toHaveLength(1);
    expect(found[0]!.line).toBe(3);
    expect(found[0]!.column).toBe(7);
    expect(found[0]!.detail).toContain(`'${type}'`);
    expect(found[0]!.detail).toContain('not supported');
  });

  test('the type is found wherever a type is written, and every one is reported', () => {
    const source = `TYPE
  Box : STRUCT
    inside : Missing1;
  END_STRUCT
END_TYPE

FUNCTION Pick : Missing2
VAR_INPUT n : INT; END_VAR
END_FUNCTION

FUNCTION_BLOCK Block
VAR
  list : ARRAY[0..1] OF Missing3;
  link : REF_TO Missing4;
END_VAR
METHOD Get : Missing5
END_METHOD
END_FUNCTION_BLOCK

PROGRAM P
VAR
  g : LTIME;
END_VAR
END_PROGRAM
`;
    const found = errors(source);
    expect(found.map((each) => `${each.line}:${each.column}`)).toEqual(['3:14', '7:17', '13:25', '14:17', '16:14', '22:7']);
    expect(found.map((each) => each.detail.match(/'([^']+)'/)![1])).toEqual(['Missing1', 'Missing2', 'Missing3', 'Missing4', 'Missing5', 'LTIME']);
  });

  test('a library block, a declared block, a structure and an enumeration are types', () => {
    const source = `TYPE
  Mode : (Auto, Manual);
  Cell : STRUCT n : INT; END_STRUCT
END_TYPE
FUNCTION_BLOCK Mine
END_FUNCTION_BLOCK
PROGRAM P
VAR
  a : TON; b : CTU; c : Mode; d : Cell; e : Mine; f : STRING[20]; g : WSTRING; h : TIME; i : DATE; j : LWORD;
END_VAR
END_PROGRAM
`;
    expect(() => build(source)).not.toThrow();
  });
});

describe('PERSISTENT is rejected where it is written (CMP-006)', () => {
  test('VAR PERSISTENT is an error at the keyword, and the rest of the program is read', () => {
    const found = errors('PROGRAM Kept\nVAR PERSISTENT\n  x : INT;\nEND_VAR\nVAR\n  q : INT;\nEND_VAR\n  q := 1 +;\nEND_PROGRAM\n');
    expect(found.map((each) => `${each.line}:${each.column}`)).toEqual(['2:5', '8:11']);
    expect(found[0]!.detail).toContain('PERSISTENT');
    expect(found[0]!.detail).toContain('RETAIN');
  });

  test('VAR RETAIN PERSISTENT and VAR_GLOBAL PERSISTENT are errors at the word too', () => {
    const found = errors('VAR_GLOBAL PERSISTENT\n  g : INT;\nEND_VAR\nPROGRAM P\nVAR RETAIN PERSISTENT\n  x : INT;\nEND_VAR\nEND_PROGRAM\n');
    expect(found.map((each) => `${each.line}:${each.column}`)).toEqual(['1:12', '5:12']);
  });

  test('a variable that happens to be named persistent is not a qualifier', () => {
    expect(() => build('PROGRAM P\nVAR\n  persistent : INT;\nEND_VAR\n  persistent := 1;\nEND_PROGRAM\n')).not.toThrow();
  });
});

describe('the spelling of a name never changes the program (CMP-004)', () => {
  /** `source` with every identifier written by `change`; keywords, literals and comments are left as they are. */
  function recase(source: string, change: (text: string) => string): string {
    const lines = source.split('\n');
    const identifiers = tokenizeWithErrors(source).tokens
      .filter((token) => token.type === TokenType.IDENTIFIER && token.line === token.endLine)
      .sort((first, second) => second.line - first.line || second.column - first.column);
    for (const token of identifiers) {
      const line = lines[token.line - 1]!;
      lines[token.line - 1] = line.slice(0, token.column - 1) + change(line.slice(token.column - 1, token.endColumn - 1)) + line.slice(token.endColumn - 1);
    }
    return lines.join('\n');
  }

  const root = join(import.meta.dir, '..', '..', '..', '..', 'conformance', 'cmp');
  const bytes = (source: string): string | null => {
    try {
      return Buffer.from(compileToBinary(source).zplcFile).toString('hex');
    } catch {
      return null;
    }
  };

  test('every conformance program that builds builds the same bytes in upper and in lower case', () => {
    let compared = 0;
    const differing: string[] = [];
    for (const name of readdirSync(root).filter((file) => file.endsWith('.st')).sort()) {
      const source = readFileSync(join(root, name), 'utf8');
      const original = bytes(source);
      if (original === null) continue;
      compared += 1;
      if (bytes(recase(source, (text) => text.toUpperCase())) !== original) differing.push(`${name} in upper case`);
      if (bytes(recase(source, (text) => text.toLowerCase())) !== original) differing.push(`${name} in lower case`);
    }
    expect(compared).toBeGreaterThan(100);
    expect(differing).toEqual([]);
  });

  test('a standard function is called without regard to case', () => {
    const upper = compileToBinary('PROGRAM P\nVAR\n  a : STRING[8] := \'ab\';\n  b : STRING[8] := \'cd\';\n  r : STRING[16];\nEND_VAR\n  r := CONCAT(a, b);\nEND_PROGRAM\n');
    const lower = compileToBinary('PROGRAM P\nVAR\n  a : STRING[8] := \'ab\';\n  b : STRING[8] := \'cd\';\n  r : STRING[16];\nEND_VAR\n  r := concat(a, b);\nEND_PROGRAM\n');
    expect(Buffer.from(lower.zplcFile).equals(Buffer.from(upper.zplcFile))).toBe(true);
  });
});
