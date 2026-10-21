import { describe, expect, test } from 'bun:test';

import { CompilerError, compileMultiTaskProject, compileToBinary } from './index.ts';

// CMP-005: every value that goes into a typed place converts to its type as IEC 61131-3 allows. CMP-018: a constant fits
// the type it goes into. The conformance cases under conformance/cmp run the accepted forms on the VM; this file covers
// the whole table of conversions and the position and words of each error.

interface Found {
    line: number;
    column: number;
    detail: string;
}

function errors(source: string): Found[] {
    try {
        compileToBinary(source);
    } catch (caught) {
        const list = ((caught as CompilerError).errors ?? [caught]) as Array<{
            line: number;
            column: number;
            detail?: string;
            message: string;
        }>;
        return list.map((each) => ({ line: each.line, column: each.column, detail: each.detail ?? each.message }));
    }
    return [];
}

/** `target := source;` with a variable of each type; the statement is on line 5. */
function assign(source: string, target: string): Found[] {
    return errors(`PROGRAM P\nVAR\n  src : ${source};\n  dst : ${target};\nEND_VAR\n  dst := src;\nEND_PROGRAM\n`);
}

const INTEGERS = ['SINT', 'INT', 'DINT', 'USINT', 'UINT', 'UDINT', 'BYTE', 'WORD', 'DWORD'];

describe('the conversions of a value to a place (CMP-005)', () => {
    test.each(INTEGERS.flatMap((from) => INTEGERS.map((to) => [from, to] as const)))('%s goes to %s', (from, to) => {
        // integers and bit strings convert among themselves: a value that does not fit keeps its low bits (CMP-016)
        expect(assign(from, to)).toEqual([]);
    });

    test.each(INTEGERS)('%s goes to REAL and REAL goes to nothing narrower', (type) => {
        expect(assign(type, 'REAL')).toEqual([]);
        const found = assign('REAL', type);
        expect(found).toHaveLength(1);
        expect(found[0]!.line).toBe(6);
        expect(found[0]!.detail).toContain('REAL');
        expect(found[0]!.detail).toContain(type);
    });

    test.each([...INTEGERS, 'REAL', 'TIME'])('BOOL and %s do not convert to each other', (type) => {
        for (const [from, to] of [
            ['BOOL', type],
            [type, 'BOOL'],
        ] as const) {
            const found = assign(from, to);
            expect(found).toHaveLength(1);
            expect(found[0]!.detail).toContain(from);
            expect(found[0]!.detail).toContain(to);
        }
    });

    test.each([...INTEGERS, 'REAL'])('TIME and %s do not convert to each other', (type) => {
        expect(assign('TIME', type)).toHaveLength(1);
        expect(assign(type, 'TIME')).toHaveLength(1);
    });

    test('a REAL widens to LREAL, a value to its own type, and a point in time to nothing else', () => {
        expect(assign('REAL', 'REAL')).toEqual([]);
        expect(assign('TIME', 'TIME')).toEqual([]);
        expect(assign('BOOL', 'BOOL')).toEqual([]);
        expect(assign('DATE', 'TIME')).toHaveLength(1);
        // LREAL to REAL narrows: the build goes on and the narrowing is a warning (see below)
        expect(assign('LREAL', 'REAL')).toEqual([]);
        expect(assign('REAL', 'LREAL')).toEqual([]);
        expect(assign('LREAL', 'LREAL')).toEqual([]);
    });

    test.each([...INTEGERS, 'LINT', 'ULINT', 'LWORD'])('%s goes to LREAL and LREAL goes to no integer', (type) => {
        expect(assign(type, 'LREAL')).toEqual([]);
        const found = assign('LREAL', type);
        expect(found).toHaveLength(1);
        expect(found[0]!.detail).toContain('LREAL');
        expect(found[0]!.detail).toContain(type);
    });

    test('the difference of two points in time is a TIME', () => {
        const source = 'PROGRAM P\nVAR\n  a : DT;\n  b : DT;\n  gap : TIME;\n  other : DINT;\nEND_VAR\n  gap := a - b;\nEND_PROGRAM\n';
        expect(errors(source)).toEqual([]);
        expect(errors(source.replace('gap := a - b;', 'other := a - b;'))).toHaveLength(1);
    });

    test('the value of an expression is the type of its operands', () => {
        // INT * INT is an INT, and an INT does not go to a BOOL; REAL + INT is a REAL, and does not go to an INT
        const wrong = errors('PROGRAM P\nVAR\n  i : INT;\n  j : INT;\n  b : BOOL;\nEND_VAR\n  b := i * j;\nEND_PROGRAM\n');
        expect(wrong).toHaveLength(1);
        expect(wrong[0]!.detail).toContain('INT');
        expect(wrong[0]!.detail).toContain('BOOL');
        expect(errors('PROGRAM P\nVAR\n  r : REAL;\n  i : INT;\nEND_VAR\n  i := r + 1;\nEND_PROGRAM\n')).toHaveLength(1);
        expect(errors('PROGRAM P\nVAR\n  r : REAL;\n  i : INT;\nEND_VAR\n  r := i + 1;\nEND_PROGRAM\n')).toEqual([]);
    });

    test('a comparison is a BOOL', () => {
        expect(errors('PROGRAM P\nVAR\n  i : INT;\n  b : BOOL;\nEND_VAR\n  b := i > 3;\nEND_PROGRAM\n')).toEqual([]);
        expect(errors('PROGRAM P\nVAR\n  i : INT;\n  j : INT;\nEND_VAR\n  j := i > 3;\nEND_PROGRAM\n')).toHaveLength(1);
    });
});

describe('call arguments and return values are checked (CMP-005)', () => {
    const FUNCTION = 'FUNCTION Half : INT\nVAR_INPUT n : INT; END_VAR\n  Half := n / 2;\nEND_FUNCTION\n';

    test('a REAL argument for an INT parameter is an error at the argument', () => {
        const found = errors(`${FUNCTION}PROGRAM P\nVAR\n  r : REAL;\n  i : INT;\nEND_VAR\n  i := Half(r);\nEND_PROGRAM\n`);
        expect(found).toHaveLength(1);
        expect([found[0]!.line, found[0]!.column]).toEqual([10, 13]);
        expect(found[0]!.detail).toContain('REAL');
        expect(found[0]!.detail).toContain('INT');
    });

    test('the value of a function is checked against its declared type', () => {
        const found = errors('FUNCTION Wrong : INT\n  Wrong := 1.5;\nEND_FUNCTION\nPROGRAM P\nEND_PROGRAM\n');
        expect(found).toHaveLength(1);
        expect(found[0]!.line).toBe(2);
        expect(found[0]!.detail).toContain('REAL');
    });

    test('an integer goes to a REAL parameter', () => {
        expect(
            errors(
                'FUNCTION Show : REAL\nVAR_INPUT x : REAL; END_VAR\n  Show := x;\nEND_FUNCTION\nPROGRAM P\nVAR\n  i : INT;\n  r : ' +
                    'REAL;\nEND_VAR\n  r := Show(i);\nEND_PROGRAM\n',
            ),
        ).toEqual([]);
    });

    test('the parameters of a standard block are given values of their types', () => {
        const wrong = errors('PROGRAM P\nVAR\n  c : CTU;\n  r : REAL;\nEND_VAR\n  c(CU := TRUE, PV := r);\nEND_PROGRAM\n');
        expect(wrong).toHaveLength(1);
        expect(wrong[0]!.detail).toContain('REAL');
    });

    test('an output bound with => is checked as an assignment', () => {
        const wrong = errors('PROGRAM P\nVAR\n  t : TON;\n  flag : INT;\nEND_VAR\n  t(IN := TRUE, PT := T#1s, Q => flag);\nEND_PROGRAM\n');
        expect(wrong).toHaveLength(1);
        expect(wrong[0]!.detail).toContain('BOOL');
        expect(wrong[0]!.detail).toContain('INT');
    });
});

describe('a constant fits the type it goes into (CMP-018)', () => {
    const LIMITS: Array<[string, bigint, bigint]> = [
        ['SINT', -128n, 127n],
        ['INT', -32768n, 32767n],
        ['DINT', -2147483648n, 2147483647n],
        ['USINT', 0n, 255n],
        ['UINT', 0n, 65535n],
        ['UDINT', 0n, 4294967295n],
        ['BYTE', 0n, 255n],
        ['WORD', 0n, 65535n],
        ['DWORD', 0n, 4294967295n],
    ];

    test.each(LIMITS)('%s holds %s to %s, and nothing beyond', (type, low, high) => {
        const initial = (value: bigint) => errors(`PROGRAM P\nVAR\n  x : ${type} := ${value};\nEND_VAR\nEND_PROGRAM\n`);
        const assignment = (value: bigint) => errors(`PROGRAM P\nVAR\n  x : ${type};\nEND_VAR\n  x := ${value};\nEND_PROGRAM\n`);
        for (const check of [initial, assignment]) {
            expect(check(low)).toEqual([]);
            expect(check(high)).toEqual([]);
            for (const outside of [high + 1n, low - 1n]) {
                if (outside < 0n && low === 0n) {
                    // a negative literal in an unsigned place
                    expect(check(outside)).toHaveLength(1);
                    continue;
                }
                const found = check(outside);
                expect(found).toHaveLength(1);
                expect(found[0]!.detail).toContain(String(outside));
                expect(found[0]!.detail).toContain(type);
            }
        }
    });

    test('the sum of two constants, and a named constant, are constants', () => {
        expect(errors('PROGRAM P\nVAR\n  x : SINT := 100 + 27;\nEND_VAR\nEND_PROGRAM\n')).toEqual([]);
        expect(errors('PROGRAM P\nVAR\n  x : SINT := 100 + 28;\nEND_VAR\nEND_PROGRAM\n')).toHaveLength(1);
        expect(errors('PROGRAM P\nVAR CONSTANT\n  k : INT := 300;\nEND_VAR\nVAR\n  x : SINT := k;\nEND_VAR\nEND_PROGRAM\n')).toHaveLength(
            1,
        );
        expect(errors('PROGRAM P\nVAR CONSTANT\n  k : INT := 100;\nEND_VAR\nVAR\n  x : SINT := k;\nEND_VAR\nEND_PROGRAM\n')).toEqual([]);
    });

    test('a variable is not a constant: it is checked by its type, not by its value', () => {
        expect(errors('PROGRAM P\nVAR\n  big : INT := 300;\n  small : SINT;\nEND_VAR\n  small := big;\nEND_PROGRAM\n')).toEqual([]);
    });

    test('a constant given to a REAL is not range-checked as an integer', () => {
        expect(errors('PROGRAM P\nVAR\n  r : REAL := 100000;\nEND_VAR\nEND_PROGRAM\n')).toEqual([]);
    });
});

describe('conditions and operators (CMP-005)', () => {
    test.each(['IF i THEN', 'WHILE i DO', 'REPEAT i := 0; UNTIL i'])('%s takes a BOOL, not an INT', (head) => {
        const body = head.startsWith('IF')
            ? `${head} i := 0; END_IF;`
            : head.startsWith('WHILE')
              ? `${head} i := 0; END_WHILE;`
              : `${head} END_REPEAT;`;
        const found = errors(`PROGRAM P\nVAR\n  i : INT;\nEND_VAR\n  ${body}\nEND_PROGRAM\n`);
        expect(found).toHaveLength(1);
        expect(found[0]!.detail).toContain('BOOL');
    });

    test('a BOOL condition, a comparison and a bit access are accepted', () => {
        expect(
            errors(
                'PROGRAM P\nVAR\n  b : BOOL;\n  w : WORD;\n  i : INT;\nEND_VAR\n  IF b AND (i > 2) OR w.3 THEN i := 0; ' +
                    'END_IF;\nEND_PROGRAM\n',
            ),
        ).toEqual([]);
    });

    test('bit operations take bit strings and integers, and BOOL with BOOL', () => {
        expect(
            errors('PROGRAM P\nVAR\n  w : WORD;\n  i : INT;\nEND_VAR\n  w := w AND 16#FF;\n  i := i OR 1;\n  w := NOT w;\nEND_PROGRAM\n'),
        ).toEqual([]);
        expect(errors('PROGRAM P\nVAR\n  b : BOOL;\n  w : WORD;\nEND_VAR\n  w := w AND b;\nEND_PROGRAM\n')).toHaveLength(1);
    });

    test('MOD takes integers', () => {
        expect(errors('PROGRAM P\nVAR\n  r : REAL;\nEND_VAR\n  r := r MOD 2.0;\nEND_PROGRAM\n')).toHaveLength(1);
    });
});

describe('an integer stored in a narrower type is a warning (CMP-005, CMP-016)', () => {
    const warnings = (declarations: string, statements: string, extra = '') =>
        compileToBinary(`${extra}PROGRAM P\nVAR\n${declarations}\nEND_VAR\n${statements}\nEND_PROGRAM\n`).warnings;

    test('the build succeeds and the warning names both types and says the low bits are kept', () => {
        const result = compileToBinary('PROGRAM P\nVAR\n  d : DINT;\n  i : INT;\nEND_VAR\n  i := d;\nEND_PROGRAM\n');
        expect(result.zplcFile.length).toBeGreaterThan(0);
        expect(result.warnings).toHaveLength(1);
        const [warning] = result.warnings;
        expect([warning!.code, warning!.line, warning!.column]).toEqual(['IMPLICIT_NARROWING', 6, 8]);
        expect(warning!.message).toContain('DINT');
        expect(warning!.message).toContain('INT');
        expect(warning!.message).toContain('low 16 bits');
    });

    test.each([
        ['DINT', 'INT'],
        ['DINT', 'SINT'],
        ['INT', 'SINT'],
        ['UDINT', 'UINT'],
        ['DWORD', 'WORD'],
        ['WORD', 'BYTE'],
        ['LINT', 'DINT'],
        ['DINT', 'USINT'],
        ['UINT', 'BYTE'],
    ])('%s stored in a %s warns', (from, to) => {
        const found = warnings(`  src : ${from};\n  dst : ${to};`, '  dst := src;');
        expect(found.map((warning) => warning.code)).toEqual(['IMPLICIT_NARROWING']);
        expect(found[0]!.message).toContain(from);
        expect(found[0]!.message).toContain(to);
    });

    test.each([
        ['INT', 'DINT'],
        ['SINT', 'INT'],
        ['USINT', 'UINT'],
        ['BYTE', 'WORD'],
        ['INT', 'UINT'],
        ['DINT', 'DINT'],
        ['INT', 'REAL'],
    ])('%s stored in a %s does not', (from, to) => {
        expect(warnings(`  src : ${from};\n  dst : ${to};`, '  dst := src;')).toEqual([]);
    });

    test('an LREAL stored in a REAL warns that it is rounded, and an expression of LREAL does too', () => {
        const found = warnings('  d : LREAL;\n  r : REAL;', '  r := d;\n  r := d * 2.0;');
        expect(found.map((warning) => [warning.code, warning.line])).toEqual([
            ['IMPLICIT_NARROWING', 6],
            ['IMPLICIT_NARROWING', 7],
        ]);
        expect(found[0]!.message).toContain('LREAL');
        expect(found[0]!.message).toContain('REAL');
        expect(found[0]!.message).toContain('rounded');
    });

    test('a literal is not narrowed, an LREAL#literal that is written to a REAL is', () => {
        expect(warnings('  r : REAL;', '  r := 0.1;')).toEqual([]);
        expect(warnings('  r : REAL;', '  r := REAL#0.1;')).toEqual([]);
        expect(warnings('  r : REAL;', '  r := LREAL#0.1;')).toEqual([]);
    });

    test('a REAL stored in an LREAL, and an integer, do not warn', () => {
        expect(warnings('  r : REAL;\n  d : LREAL;\n  i : DINT;\n  l : LINT;', '  d := r;\n  d := i;\n  d := l;')).toEqual([]);
    });

    test('a constant, a mask and a remainder that fit are not narrowed', () => {
        const found = warnings(
            '  w : WORD;\n  d : DINT;\n  b : BYTE;\n  u : USINT;\n  s : SINT;',
            '  b := w AND 16#FF;\n  u := d MOD 256;\n  s := 100 + 27;\n  b := 255;',
        );
        expect(found).toEqual([]);
    });

    test('a mask that is wider than the destination still warns', () => {
        expect(warnings('  w : WORD;\n  b : BYTE;', '  b := w AND 16#FFF;').map((warning) => warning.code)).toEqual(['IMPLICIT_NARROWING']);
    });

    test('the value of a function, an argument and an input of a block warn where they are written', () => {
        const source = `FUNCTION Narrow : INT
VAR_INPUT n : INT; END_VAR
VAR big : DINT; END_VAR
  big := 100000;
  Narrow := big;
END_FUNCTION
PROGRAM P
VAR
  d : DINT;
  i : INT;
  c : CTU;
END_VAR
  i := Narrow(d);
  c(CU := TRUE, PV := d);
END_PROGRAM
`;
        const found = compileToBinary(source).warnings;
        expect(found.map((warning) => [warning.line, warning.column])).toEqual([
            [5, 13],
            [13, 15],
            [14, 23],
        ]);
    });

    test('every program of a project reports its warnings with its source, in source order', () => {
        const narrow = (name: string) =>
            `PROGRAM ${name}\nVAR\n  d : DINT;\n  i : INT;\n  j : INT;\nEND_VAR\n  j := d;\n  i := d;\nEND_PROGRAM\n`;
        const result = compileMultiTaskProject(
            {
                name: 'p',
                version: '1.0.0',
                tasks: [
                    { name: 'A', trigger: 'cyclic', interval: 10, priority: 1, programs: ['A'] },
                    { name: 'B', trigger: 'cyclic', interval: 10, priority: 2, programs: ['B'] },
                ],
            },
            [
                { name: 'A', content: narrow('A'), sourceRef: 'src/A.st' },
                { name: 'B', content: narrow('B'), sourceRef: 'src/B.st' },
            ],
        );
        expect(result.warnings.map((warning) => [warning.sourceRef, warning.code, warning.line])).toEqual([
            ['src/A.st', 'IMPLICIT_NARROWING', 7],
            ['src/A.st', 'IMPLICIT_NARROWING', 8],
            ['src/B.st', 'IMPLICIT_NARROWING', 7],
            ['src/B.st', 'IMPLICIT_NARROWING', 8],
        ]);
    });
});

// CMP-005: a text and a number are different kinds of value: IEC 61131-3 converts neither to the other implicitly, so a
// STRING or WSTRING value that goes into a numeric, BOOL or time place is a mismatch that names both types.
describe('a STRING or WSTRING is not a number, a BOOL or a time (CMP-005)', () => {
    const NUMERIC = [
        'SINT',
        'INT',
        'DINT',
        'LINT',
        'USINT',
        'UINT',
        'UDINT',
        'ULINT',
        'BYTE',
        'WORD',
        'DWORD',
        'LWORD',
        'REAL',
        'LREAL',
        'BOOL',
        'TIME',
    ];
    const TEXT = ['STRING', 'STRING[20]', 'WSTRING', 'WSTRING[20]'];

    test.each(TEXT.flatMap((from) => NUMERIC.map((to) => [from, to] as const)))('%s does not go to %s', (from, to) => {
        const found = assign(from, to);
        expect(found).toHaveLength(1);
        expect(found[0]!.line).toBe(6);
        expect(found[0]!.detail).toContain(from.startsWith('W') ? 'WSTRING' : 'STRING');
        expect(found[0]!.detail).toContain(to);
        expect(found[0]!.detail).toContain('Type mismatch');
    });

    test('a string literal does not go to a number', () => {
        const found = errors("PROGRAM P\nVAR n : INT; END_VAR\n  n := 'abc';\nEND_PROGRAM\n");
        expect(found.map((each) => `${each.line}:${each.column}`)).toEqual(['3:8']);
        expect(found[0]!.detail).toContain('STRING');
        expect(found[0]!.detail).toContain('INT');
    });

    test('the initial value of a number is not a string', () => {
        const found = errors("PROGRAM P\nVAR n : INT := 'x'; END_VAR\nEND_PROGRAM\n");
        expect(found).toHaveLength(1);
        expect(found[0]!.line).toBe(2);
        expect(found[0]!.detail).toContain('STRING');
    });

    test('an argument of a function and an input of a function block are not strings', () => {
        const call = errors(
            'FUNCTION F : INT\nVAR_INPUT x : INT; END_VAR\n  F := x;\nEND_FUNCTION\nPROGRAM P\nVAR n : INT; s : STRING; END_VAR\n  n := ' +
                'F(x := s);\nEND_PROGRAM\n',
        );
        expect(call.map((each) => each.line)).toEqual([7]);
        const block = errors(
            'FUNCTION_BLOCK B\nVAR_INPUT x : INT; END_VAR\nEND_FUNCTION_BLOCK\nPROGRAM P\nVAR b : B; s : STRING; END_VAR\n  b(x := ' +
                's);\nEND_PROGRAM\n',
        );
        expect(block.map((each) => each.line)).toEqual([6]);
        expect(block[0]!.detail).toContain('STRING');
    });

    test('the value a function returns is not a string when the function returns a number', () => {
        const found = errors(
            'FUNCTION F : INT\nVAR_INPUT s : STRING; END_VAR\n  F := s;\nEND_FUNCTION\nPROGRAM P\nVAR n : INT; END_VAR\n  n := F(s := ' +
                "'a');\nEND_PROGRAM\n",
        );
        expect(found.map((each) => each.line)).toEqual([3]);
    });

    test('a member and an element are places like any other', () => {
        const member = errors(
            'TYPE T : STRUCT x : INT; END_STRUCT END_TYPE\nPROGRAM P\nVAR t : T; s : STRING; END_VAR\n  t.x := s;\nEND_PROGRAM\n',
        );
        expect(member.map((each) => each.line)).toEqual([4]);
        const element = errors('PROGRAM P\nVAR a : ARRAY[0..1] OF INT; s : STRING; END_VAR\n  a[0] := s;\nEND_PROGRAM\n');
        expect(element.map((each) => each.line)).toEqual([3]);
    });

    test('a function that returns text does not go to a number', () => {
        const found = errors('PROGRAM P\nVAR n : INT; s : STRING; END_VAR\n  n := CONCAT(s, s);\nEND_PROGRAM\n');
        expect(found.map((each) => each.line)).toEqual([3]);
        expect(found[0]!.detail).toContain('STRING');
    });

    test('a comparison of a string with a number, and a string as a condition, are mismatches', () => {
        const compare = errors('PROGRAM P\nVAR b : BOOL; n : INT; s : STRING; END_VAR\n  b := n = s;\nEND_PROGRAM\n');
        expect(compare.map((each) => each.line)).toEqual([3]);
        const condition = errors('PROGRAM P\nVAR n : INT; s : STRING; END_VAR\n  IF s THEN n := 1; END_IF;\nEND_PROGRAM\n');
        expect(condition.map((each) => each.line)).toEqual([3]);
    });

    test('what takes a string and gives a number still builds, and a string goes to a string', () => {
        expect(errors('PROGRAM P\nVAR n : INT; s : STRING; END_VAR\n  n := LEN(s);\n  n := FIND(s, s);\nEND_PROGRAM\n')).toEqual([]);
        expect(
            errors("PROGRAM P\nVAR a : STRING; b : STRING[10]; END_VAR\n  a := b;\n  b := 'text';\n  a := CONCAT(a, b);\nEND_PROGRAM\n"),
        ).toEqual([]);
        expect(errors('PROGRAM P\nVAR w : WSTRING; END_VAR\n  w := "wide";\nEND_PROGRAM\n')).toEqual([]);
    });
});
