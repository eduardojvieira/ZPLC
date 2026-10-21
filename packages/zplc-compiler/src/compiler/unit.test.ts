/**
 * A project is one compilation unit (CMP-042) and its memory is the target profile's (CMP-043)
 *
 * SPDX-License-Identifier: MIT
 *
 * The conformance cases under conformance/cmp run whole projects on the native VM. This file covers what is
 * decided at build time: what every file of a project sees of the others, where each variable lives, which
 * diagnostics a project gets and in which file, and the shape of the debug map of a unit.
 */

import { describe, it, expect } from 'bun:test';

import { compileMultiTaskProject, CompilerError } from './index.ts';
import type { CompilerMemoryProfile, MultiTaskCompilationResult, ProgramSource } from './index.ts';

const task = (program: string, index = 0) => ({
    name: `Task${index}`,
    trigger: 'cyclic' as const,
    interval: 10,
    priority: index,
    programs: [program],
});

/** `files` are the sources of the project; `programs` the ones a task runs, in task order. */
function build(files: Record<string, string>, programs: string[], memoryProfile?: CompilerMemoryProfile): MultiTaskCompilationResult {
    const sources: ProgramSource[] = Object.entries(files).map(([name, content]) => ({ name, content, sourceRef: `src/${name}` }));
    return compileMultiTaskProject(
        { name: 'Unit', version: '1.0.0', tasks: programs.map((program, index) => task(program, index)) },
        sources,
        memoryProfile ? { memoryProfile } : undefined,
    );
}

/** The diagnostics a failed build reports: message, file, line. */
function rejected(
    files: Record<string, string>,
    programs: string[],
    memoryProfile?: CompilerMemoryProfile,
): Array<{ message: string; file?: string; line: number }> {
    try {
        build(files, programs, memoryProfile);
    } catch (error) {
        if (error instanceof CompilerError)
            return error.errors.map((each) => ({ message: each.detail, file: each.sourceRef, line: each.line }));
        throw error;
    }
    throw new Error('the project was accepted');
}

/** The variables of a unit by name, with the POU that lists each one. */
function listed(result: MultiTaskCompilationResult, name: string): Array<{ pou: string; addr: number }> {
    return Object.entries(result.debugMap.pou).flatMap(([pou, info]) => (info.vars[name] ? [{ pou, addr: info.vars[name]!.addr }] : []));
}

describe('what every file of a project sees of the others (CMP-042)', () => {
    it('a function block declared in a file that no task runs is available to a program', () => {
        const result = build(
            {
                'main.st':
                    'PROGRAM Project\nVAR d : Echo; seen AT %QX0.0 : BOOL; END_VAR\n  d(sig := TRUE);\n  seen := d.out;\nEND_PROGRAM\n',
                'echo.st':
                    'FUNCTION_BLOCK Echo\nVAR_INPUT sig : BOOL; END_VAR\nVAR_OUTPUT out : BOOL; END_VAR\n  out := ' +
                    'sig;\nEND_FUNCTION_BLOCK\n',
            },
            ['main.st'],
        );
        expect(result.bytecode.length).toBeGreaterThan(0);
    });

    it('a type declared in another file is the type of a member and of a variable', () => {
        const result = build(
            {
                'main.st':
                    'PROGRAM Plant\nVAR g : Gauge; seen AT %QW0 : INT; END_VAR\n  g.v.value := 7;\n  seen := g.v.value;\nEND_PROGRAM\n',
                'types.st':
                    'TYPE Reading : STRUCT value : INT; scale : INT; END_STRUCT END_TYPE\nFUNCTION_BLOCK Gauge\nVAR v : Reading; ' +
                    'END_VAR\nEND_FUNCTION_BLOCK\n',
            },
            ['main.st'],
        );
        expect(listed(result, 'g')).toHaveLength(1);
    });

    it('a type alias of another file replaces its uses', () => {
        const result = build(
            {
                'main.st': 'PROGRAM P\nVAR s : Speed; END_VAR\n  s := 9;\nEND_PROGRAM\n',
                'types.st': 'TYPE Speed : DINT; END_TYPE\n',
            },
            ['main.st'],
        );
        expect(result.debugMap.pou.P!.vars.s).toMatchObject({ type: 'DINT', size: 4 });
    });

    it('a function of another file is called from two programs of two tasks, and is built once', () => {
        const files = {
            'a.st': 'PROGRAM A\nVAR r AT %QW0 : INT; END_VAR\n  r := Twice(x := 4);\nEND_PROGRAM\n',
            'b.st': 'PROGRAM B\nVAR r AT %QW1 : INT; END_VAR\n  r := Twice(x := 5);\nEND_PROGRAM\n',
            'lib.st': 'FUNCTION Twice : INT\nVAR_INPUT x : INT; END_VAR\n  Twice := x * 2;\nEND_FUNCTION\n',
        };
        const both = build(files, ['a.st', 'b.st']);
        expect(both.tasks).toHaveLength(2);
        // the second caller costs its own statement, not another copy of the function: the project is smaller
        // than two projects of one program each, which would build the function twice
        const onlyA = build({ 'a.st': files['a.st'], 'lib.st': files['lib.st'] }, ['a.st']);
        const onlyB = build({ 'b.st': files['b.st'], 'lib.st': files['lib.st'] }, ['b.st']);
        expect(both.codeSize).toBeLessThan(onlyA.codeSize + onlyB.codeSize);
    });

    it('a global has one address for every program and appears once in the debug map', () => {
        const result = build(
            {
                'a.st': 'PROGRAM A\nVAR here : INT; END_VAR\n  Shared := Shared + 1;\n  here := Shared;\nEND_PROGRAM\n',
                'b.st': 'PROGRAM B\nVAR there : INT; END_VAR\n  there := Shared;\nEND_PROGRAM\n',
                'globals.st': 'VAR_GLOBAL\n  Shared : INT;\nEND_VAR\n',
            },
            ['a.st', 'b.st'],
        );
        const where = listed(result, 'Shared');
        expect(where).toHaveLength(1);
        // and no program keeps a copy of its own: the variables of the programs sit after it
        const others = [listed(result, 'here')[0]!.addr, listed(result, 'there')[0]!.addr];
        expect(others.every((address) => address !== where[0]!.addr)).toBe(true);
    });

    it('two programs may use the same variable name: each keeps its own storage', () => {
        const result = build(
            {
                'a.st': 'PROGRAM A\nVAR count : INT; END_VAR\n  count := count + 1;\nEND_PROGRAM\n',
                'b.st': 'PROGRAM B\nVAR count : INT; END_VAR\n  count := count + 2;\nEND_PROGRAM\n',
            },
            ['a.st', 'b.st'],
        );
        const where = listed(result, 'count');
        expect(where.map((each) => each.pou).sort()).toEqual(['A', 'B']);
        expect(new Set(where.map((each) => each.addr)).size).toBe(2);
    });

    it('a program variable is not seen by the function blocks and functions of the unit', () => {
        const found = rejected(
            {
                'main.st': 'PROGRAM P\nVAR secret : INT; f : Peek; END_VAR\n  f();\nEND_PROGRAM\n',
                'peek.st': 'FUNCTION_BLOCK Peek\nVAR_OUTPUT o : INT; END_VAR\n  o := secret;\nEND_FUNCTION_BLOCK\n',
            },
            ['main.st'],
        );
        expect(found).toEqual([{ message: "Unknown identifier 'secret'", file: 'src/peek.st', line: 3 }]);
    });

    it('an error in a file that no task runs is reported in that file', () => {
        const found = rejected(
            {
                'main.st': 'PROGRAM P\nVAR x : INT; END_VAR\n  x := 1;\nEND_PROGRAM\n',
                'lib.st': 'FUNCTION Broken : INT\n  Broken := missing;\nEND_FUNCTION\n',
            },
            ['main.st'],
        );
        expect(found).toEqual([{ message: "Unknown identifier 'missing'", file: 'src/lib.st', line: 2 }]);
    });

    it('a syntax error of a library file is reported with its file', () => {
        const found = rejected(
            {
                'main.st': 'PROGRAM P\nEND_PROGRAM\n',
                'lib.st': 'FUNCTION_BLOCK Fb\nVAR_INPUT : INT; END_VAR\nEND_FUNCTION_BLOCK\n',
            },
            ['main.st'],
        );
        expect(found.length).toBeGreaterThan(0);
        expect(found.every((each) => each.file === 'src/lib.st')).toBe(true);
    });
});

describe('a declaration made twice is an error at every place it is made (CMP-042)', () => {
    it('a function block declared in two files is reported in both', () => {
        const found = rejected(
            {
                'main.st': 'PROGRAM P\nEND_PROGRAM\n',
                'one.st': '\nFUNCTION_BLOCK Echo\nEND_FUNCTION_BLOCK\n',
                'two.st': 'FUNCTION_BLOCK echo\nEND_FUNCTION_BLOCK\n',
            },
            ['main.st'],
        );
        expect(found).toEqual([
            {
                message: "FUNCTION_BLOCK 'Echo' is declared twice: in src/one.st (line 2) and in src/two.st (line 1)",
                file: 'src/one.st',
                line: 2,
            },
            {
                message: "FUNCTION_BLOCK 'echo' is declared twice: in src/one.st (line 2) and in src/two.st (line 1)",
                file: 'src/two.st',
                line: 1,
            },
        ]);
    });

    it('a global declared in two files is reported in both', () => {
        const found = rejected(
            {
                'main.st': 'PROGRAM P\nEND_PROGRAM\n',
                'g1.st': 'VAR_GLOBAL\n  Limit : INT;\nEND_VAR\n',
                'g2.st': 'VAR_GLOBAL\n  Other : INT;\n  Limit : DINT;\nEND_VAR\n',
            },
            ['main.st'],
        );
        expect(found.map((each) => [each.file, each.line])).toEqual([
            ['src/g1.st', 2],
            ['src/g2.st', 3],
        ]);
        expect(found[0]!.message).toContain("global variable 'Limit' is declared twice");
    });

    it('a type and a function of the same name are reported', () => {
        const found = rejected(
            {
                'main.st': 'PROGRAM P\nEND_PROGRAM\n',
                'a.st': 'TYPE Thing : STRUCT a : INT; END_STRUCT END_TYPE\n',
                'b.st': 'FUNCTION Thing : INT\n  Thing := 1;\nEND_FUNCTION\n',
            },
            ['main.st'],
        );
        expect(found.map((each) => each.file)).toEqual(['src/a.st', 'src/b.st']);
    });

    it('two programs of one name keep the message they always had', () => {
        const found = rejected(
            {
                'a.st': 'PROGRAM Same\nEND_PROGRAM\n',
                'b.st': 'PROGRAM same\nEND_PROGRAM\n',
            },
            ['a.st', 'b.st'],
        );
        expect(found).toEqual([
            { message: "Duplicate PROGRAM name 'same' in 'b.st' (already declared by 'a.st')", file: 'src/b.st', line: 1 },
        ]);
    });
});

describe('the debug map of a unit (CMP-042, CMP-054)', () => {
    const files = {
        'main.st': 'PROGRAM Main\nVAR x : INT; f : Echo; END_VAR\n  x := Shared;\n  f(sig := TRUE);\nEND_PROGRAM\n',
        'echo.st':
            'FUNCTION_BLOCK Echo\nVAR_INPUT sig : BOOL; END_VAR\nVAR_OUTPUT out : BOOL; END_VAR\n  out := sig;\nEND_FUNCTION_BLOCK\n',
        'globals.st': 'VAR_GLOBAL\n  Shared : INT := 3;\nEND_VAR\n',
    };

    it('has a POU for every file that declares something, with its file as source reference', () => {
        const map = build(files, ['main.st']).debugMap;
        expect(map.pou.Main!.sourceRef).toBe('src/main.st');
        const library = Object.entries(map.pou).filter(([name]) => name !== 'Main');
        expect(library.map(([, info]) => info.sourceRef).sort()).toEqual(['src/echo.st', 'src/globals.st']);
    });

    it('names the POU of a file that has no program by its file name, and by its path only when two share one', () => {
        const names = (files: Record<string, string>) => Object.keys(build(files, ['main.st']).debugMap.pou);
        expect(names({ ...files })).toEqual(['Main', 'echo.st', 'globals.st']);
        const second = compileMultiTaskProject({ name: 'Unit', version: '1.0.0', tasks: [task('main.st')] }, [
            { name: 'main.st', content: files['main.st'], sourceRef: 'src/main.st' },
            { name: 'echo.st', content: files['echo.st'], sourceRef: 'src/echo.st' },
            { name: 'globals.st', content: files['globals.st'], sourceRef: 'src/globals.st' },
            { name: 'more.st', content: 'VAR_GLOBAL\n  More : INT;\nEND_VAR\n', sourceRef: 'src/lib/globals.st' },
        ]);
        expect(Object.keys(second.debugMap.pou)).toEqual(['Main', 'echo.st', 'globals.st', 'src/lib/globals.st']);
    });

    it('lists a global in the POU of the file that declares it, and no other', () => {
        const result = build(files, ['main.st']);
        const where = listed(result, 'Shared');
        expect(where).toHaveLength(1);
        expect(result.debugMap.pou[where[0]!.pou]!.sourceRef).toBe('src/globals.st');
    });

    it('maps the statements of a function block to the file of the block, not to the program', () => {
        const map = build(files, ['main.st']).debugMap;
        const echo = Object.values(map.pou).find((info) => info.sourceRef === 'src/echo.st')!;
        // `out := sig;` is line 4 of echo.st; main.st has no statement on that line
        expect(echo.sourceMap.map((range) => range.line)).toContain(4);
        expect([...new Set(map.pou.Main!.sourceMap.map((range) => range.line))].sort()).toEqual([3, 4]);
    });

    it('gives the entry point of each program as the entry of its task', () => {
        const result = build(
            {
                'a.st': 'PROGRAM A\nVAR x : INT; END_VAR\n  x := 1;\nEND_PROGRAM\n',
                'b.st': 'PROGRAM B\nVAR y : INT; END_VAR\n  y := 2;\nEND_PROGRAM\n',
            },
            ['a.st', 'b.st'],
        );
        expect(result.debugMap.pou.A!.entryPoint).toBe(result.tasks[0]!.entryPoint);
        expect(result.debugMap.pou.B!.entryPoint).toBe(result.tasks[1]!.entryPoint);
        expect(result.tasks[1]!.entryPoint).toBeGreaterThan(result.tasks[0]!.entryPoint);
        // the entry of B is in the code of the unit, after the code of A
        expect(result.programDetails.map((program) => program.entryPoint)).toEqual(result.tasks.map((each) => each.entryPoint));
    });
});

describe('memory is limited by the target profile only (CMP-043)', () => {
    const arrayOf = (name: string, bytes: number) => `  ${name} : ARRAY[0..${bytes - 1}] OF BYTE;\n`;
    const program = (declarations: string[]) => `PROGRAM Main\nVAR\n${declarations.join('')}END_VAR\nEND_PROGRAM\n`;

    it('a program takes more than 256 bytes', () => {
        const result = build({ 'main.st': program([arrayOf('big', 1000)]) }, ['main.st']);
        expect(result.debugMap.pou.Main!.vars.big!.size).toBe(1000);
    });

    it('fills the whole region, one byte of which is the initialization flag', () => {
        // 8191 bytes of variables and the flag are exactly the 8192 bytes of the default profile
        expect(() => build({ 'main.st': program([arrayOf('all', 8191)]) }, ['main.st'])).not.toThrow();
        const found = rejected({ 'main.st': program([arrayOf('all', 8192)]) }, ['main.st']);
        expect(found).toHaveLength(1);
        expect(found[0]!.message).toContain('8193 bytes required');
        expect(found[0]!.message).toContain('8192 bytes available');
    });

    it('is shared by all the programs of the project', () => {
        const profile = { workSize: 1024, retainSize: 256, codeSizeMax: 0xb000 };
        const files = {
            'a.st': program([arrayOf('a', 600)]).replace('Main', 'A'),
            'b.st': program([arrayOf('b', 600)]).replace('Main', 'B'),
        };
        expect(() => build({ 'a.st': files['a.st'] }, ['a.st'], profile)).not.toThrow();
        const found = rejected(files, ['a.st', 'b.st'], profile);
        expect(found).toHaveLength(1);
        expect(found[0]!.message).toContain('1201 bytes required');
        expect(found[0]!.message).toContain('1024 bytes available');
        // the declaration that does not fit, in its file
        expect(found[0]).toMatchObject({ file: 'src/b.st', line: 3 });
    });

    it('states the bytes required, the bytes available and the three largest consumers', () => {
        const found = rejected(
            {
                'main.st': program([arrayOf('tiny', 20), arrayOf('huge', 5000), arrayOf('large', 4000), arrayOf('medium', 300)]),
            },
            ['main.st'],
        );
        expect(found).toHaveLength(1);
        const message = found[0]!.message;
        expect(message).toContain('WORK allocation exceeds the target memory profile');
        expect(message).toContain('9321 bytes required');
        expect(message).toContain('8192 bytes available');
        expect(message).toContain('Largest consumers: Main.huge (5000 bytes), Main.large (4000 bytes), Main.medium (300 bytes)');
        expect(message).not.toContain('Main.tiny');
    });

    it('counts the string literals and the work buffers of the string functions', () => {
        const long = 'x'.repeat(200);
        const source = `PROGRAM Main\nVAR\n  big : ARRAY[0..8000] OF BYTE;\n  s : STRING[200];\nEND_VAR\n  s := '${long}';\nEND_PROGRAM\n`;
        const found = rejected({ 'main.st': source }, ['main.st']);
        expect(found).toHaveLength(1);
        // the variables alone are 8001 + 205 bytes, and the literal takes 205 more
        expect(found[0]!.message).toMatch(/\d+ bytes required, 8192 bytes available/);
        expect(found[0]!.message).toContain('Main.big (8001 bytes)');
    });

    it('lays the variables out in the order of the declarations, programs in task order', () => {
        const files = {
            'globals.st': 'VAR_GLOBAL\n  G1 : DINT;\n  G2 : INT;\nEND_VAR\n',
            'a.st': 'PROGRAM A\nVAR a1 : INT; a2 : DINT; END_VAR\nEND_PROGRAM\n',
            'b.st': 'PROGRAM B\nVAR b1 : BYTE; END_VAR\nEND_PROGRAM\n',
        };
        const first = build(files, ['a.st', 'b.st']);
        const addresses = Object.fromEntries(['G1', 'G2', 'a1', 'a2', 'b1'].map((name) => [name, listed(first, name)[0]!.addr]));
        expect(addresses).toEqual({ G1: 0x2000, G2: 0x2004, a1: 0x2006, a2: 0x2008, b1: 0x200c });
        // the same project builds to the same layout
        expect(JSON.stringify(build(files, ['a.st', 'b.st']).debugMap.pou)).toBe(JSON.stringify(first.debugMap.pou));
    });

    it('keeps the last byte of the region of the profile for the initialization flag', () => {
        const profile = { workSize: 512, retainSize: 256, codeSizeMax: 0xb000 };
        expect(() => build({ 'main.st': program([arrayOf('fits', 511)]) }, ['main.st'], profile)).not.toThrow();
        const found = rejected({ 'main.st': program([arrayOf('over', 512)]) }, ['main.st'], profile);
        expect(found[0]!.message).toContain('513 bytes required, 512 bytes available');
    });
});
