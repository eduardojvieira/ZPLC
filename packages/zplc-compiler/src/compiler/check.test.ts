// LNG-015: the language service shows every syntax and semantic error of the project with the compiler's own front end.
import { describe, expect, it } from 'bun:test';
import { checkProject, compileMultiTaskProject } from './index.ts';

const MAIN = `PROGRAM Main
VAR
  Count : INT;
  Ready : BOOL;
END_VAR
  Count := Count + 1;
  Ready := Count > 3;
END_PROGRAM
`;

const LIB = `FUNCTION_BLOCK Motor
VAR_INPUT
  Start : BOOL;
END_VAR
VAR_OUTPUT
  Running : BOOL;
END_VAR
  Running := Start;
END_FUNCTION_BLOCK
`;

describe('the code of a checked error is the one the build reports (CMP-006)', () => {
    const task = [{ name: 'Main', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['Main'] }];
    const sources: Array<[string, string]> = [
        ['syntax', 'PROGRAM Main\nVAR\n  A : INT;\nEND_VAR\n  A := ;\nEND_PROGRAM\n'],
        ['lexical', 'PROGRAM Main\nVAR\n  A : INT;\nEND_VAR\n  A := 1 @ 2;\nEND_PROGRAM\n'],
        ['semantic', 'PROGRAM Main\nVAR\n  A : INT;\nEND_VAR\n  A := Missing;\nEND_PROGRAM\n'],
        ['type', 'PROGRAM Main\nVAR\n  A : INT;\n  B : BOOL;\nEND_VAR\n  B := A;\nEND_PROGRAM\n'],
    ];
    for (const [name, source] of sources) {
        it(`${name}: the same code, line and column as the build`, () => {
            const [checked] = checkProject([{ ref: 'src/Main.st', content: source }]);
            let built: { code: string; line: number; column: number } | undefined;
            try {
                compileMultiTaskProject({ name: 'P', version: '1.0.0', tasks: task }, [
                    { name: 'Main', content: source, sourceRef: 'src/Main.st' },
                ]);
            } catch (error) {
                const first = (error as { errors: Array<{ code: string; line: number; column: number }> }).errors[0]!;
                built = { code: first.code, line: first.line, column: first.column };
            }
            expect(built).toBeDefined();
            expect({ code: String(checked!.code), line: checked!.line, column: checked!.column }).toEqual(built!);
        });
    }
});

describe('checking a project (LNG-015)', () => {
    it('has nothing to say about a project that builds', () => {
        expect(
            checkProject([
                { ref: 'src/main.st', content: MAIN },
                { ref: 'src/lib/motor.st', content: LIB },
            ]),
        ).toEqual([]);
    });

    it('reports every syntax error of a file, each with its range', () => {
        const broken = `PROGRAM Main
VAR
  A : INT;
END_VAR
  A := ;
  A := 1 +;
  A := 2;
END_PROGRAM
`;
        const found = checkProject([{ ref: 'src/main.st', content: broken }]);
        expect(found.filter((each) => each.phase === 'parser').map((each) => each.line)).toEqual([5, 6]);
        for (const each of found) {
            expect(each.ref).toBe('src/main.st');
            expect(each.severity).toBe('error');
            expect(each.column).toBeGreaterThan(0);
            expect(each.endColumn === undefined || each.endColumn >= each.column || each.endLine! > each.line).toBe(true);
        }
    });

    it('reports the semantic errors of every file, not only the open one', () => {
        const one = MAIN.replace('Ready := Count > 3;', 'Missing := 1;');
        const two = `PROGRAM Other
VAR
  Flag : BOOL;
END_VAR
  Flag := Unknown;
END_PROGRAM
`;
        const found = checkProject([
            { ref: 'src/main.st', content: one },
            { ref: 'src/other.st', content: two },
        ]);
        expect(found.map((each) => [each.ref, each.line, each.severity])).toEqual([
            ['src/main.st', 7, 'error'],
            ['src/other.st', 5, 'error'],
        ]);
        expect(found[0]!.message).toContain('Missing');
        expect(found[1]!.message).toContain('Unknown');
    });

    it('finds an error in a program that no task runs', () => {
        const two = `PROGRAM Second
VAR
  X : INT;
END_VAR
  X := Nope;
END_PROGRAM
`;
        expect(
            checkProject([
                { ref: 'src/main.st', content: MAIN },
                { ref: 'src/second.st', content: two },
            ]).map((each) => each.ref),
        ).toEqual(['src/second.st']);
    });

    it('sees a block that another file declares, and an error in a use of it', () => {
        const uses = `PROGRAM Main
VAR
  M : Motor;
  Go : BOOL;
END_VAR
  M(Start := Go);
  Go := M.Running;
  Go := M.Missing;
END_PROGRAM
`;
        const found = checkProject([
            { ref: 'src/main.st', content: uses },
            { ref: 'src/lib/motor.st', content: LIB },
        ]);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ ref: 'src/main.st', line: 8, severity: 'error' });
        expect(found[0]!.message).toContain('Missing');
    });

    it('reports a name declared in two files at each of them', () => {
        const found = checkProject([
            { ref: 'src/a.st', content: LIB },
            { ref: 'src/b.st', content: LIB },
        ]);
        expect(found.map((each) => each.ref)).toEqual(['src/a.st', 'src/b.st']);
    });

    it('does not tell a file about a block that is only missing because its file is half typed', () => {
        const half = `FUNCTION_BLOCK Motor
VAR_INPUT
  Start : BOOL;
END_VAR
VAR_OUTPUT
  Running : BOOL;
END_VAR
  Running := ;
END_FUNCTION_BLOCK
`;
        const uses = `PROGRAM Main
VAR
  M : Motor;
END_VAR
  M(Start := TRUE);
END_PROGRAM
`;
        const found = checkProject([
            { ref: 'src/main.st', content: uses },
            { ref: 'src/lib/motor.st', content: half },
        ]);
        expect(found.map((each) => `${each.ref}:${each.line}:${each.phase}`)).toEqual(['src/lib/motor.st:8:parser']);
    });

    it('is cleared when the error is fixed', () => {
        const bad = MAIN.replace('Count + 1', 'Count + Nope');
        expect(checkProject([{ ref: 'src/main.st', content: bad }])).toHaveLength(1);
        expect(checkProject([{ ref: 'src/main.st', content: MAIN }])).toEqual([]);
    });

    it('reports the warnings of a project that builds, as the build does', () => {
        const unused = MAIN.replace('Ready : BOOL;', 'Ready : BOOL;\n  Spare : INT;');
        const found = checkProject([{ ref: 'src/main.st', content: unused }]);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: 'warning', code: 'UNUSED_VARIABLE', ref: 'src/main.st' });
        expect(checkProject([{ ref: 'src/main.st', content: unused }], { reportWarnings: 'none' })).toEqual([]);
    });

    // The editor and the build must say the same thing about the same project.
    it('gives the errors, with their positions, that the build gives', () => {
        const cases: Array<Array<{ ref: string; content: string }>> = [
            [{ ref: 'src/main.st', content: MAIN.replace('Count := Count + 1;', 'Count := Nope + 1;\n  Ready := Count;') }],
            [{ ref: 'src/main.st', content: MAIN.replace('Count := Count + 1;', 'Count := ;') }],
            [
                { ref: 'src/main.st', content: `PROGRAM Main\nVAR\n  M : Missing;\nEND_VAR\nEND_PROGRAM\n` },
                { ref: 'src/lib.st', content: LIB },
            ],
        ];
        for (const sources of cases) {
            let built: Array<{ ref: string | undefined; line: number; column: number; message: string }> = [];
            try {
                compileMultiTaskProject(
                    { name: 'p', version: '1.0.0', tasks: [{ name: 'T', trigger: 'cyclic', interval: 10, programs: ['Main'] }] },
                    sources.map((source, index) => ({
                        name: index === 0 ? 'Main' : source.ref,
                        content: source.content,
                        sourceRef: source.ref,
                    })),
                );
            } catch (error) {
                built = (error as { errors: Array<{ sourceRef?: string; line: number; column: number; detail: string }> }).errors.map(
                    (each) => ({ ref: each.sourceRef, line: each.line, column: each.column, message: each.detail }),
                );
            }
            const checked = checkProject(sources).map((each) => ({
                ref: each.ref,
                line: each.line,
                column: each.column,
                message: each.message,
            }));
            expect(built.length).toBeGreaterThan(0);
            // the build prefixes a syntax error with the compilation it belongs to
            expect(checked.map((each) => [each.ref, each.line, each.column])).toEqual(
                built.map((each) => [each.ref ?? '', each.line, each.column]),
            );
            for (const [index, each] of checked.entries()) expect(built[index]!.message.endsWith(each.message)).toBe(true);
        }
    });
});
