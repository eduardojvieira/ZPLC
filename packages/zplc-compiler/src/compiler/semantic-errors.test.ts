import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CompilerError, compileST, compileToBinary } from './index.ts';

/** Compile `body` inside a program that declares `x : INT`; the body starts on line 5. */
function inProgram(body: string, extra = ''): string {
    return `PROGRAM Typo\nVAR\n  x : INT;${extra}\nEND_VAR\n${body}\nEND_PROGRAM\n`;
}

function failure(source: string): CompilerError {
    try {
        compileToBinary(source);
    } catch (e) {
        expect(e).toBeInstanceOf(CompilerError);
        return e as CompilerError;
    }
    throw new Error('the build succeeded and produced an artifact');
}

describe('semantic errors fail the build (CMP-001, CMP-002 stopgap)', () => {
    it('rejects an assignment to an undeclared identifier and names it', () => {
        const error = failure(inProgram('  nope := 5;'));
        expect(error.detail).toContain('nope');
        expect([error.line, error.column]).toEqual([5, 3]);
        expect(error.phase).toBe('codegen');
    });

    it('rejects a read of an undeclared identifier at its own position', () => {
        const error = failure(inProgram('  x := 1 + nope;'));
        expect(error.detail).toContain('nope');
        expect([error.line, error.column]).toEqual([5, 12]);
    });

    it('rejects a call to an unknown function', () => {
        const error = failure(inProgram('  x := NOSUCHFN(1);'));
        expect(error.detail).toContain('NOSUCHFN');
        expect(error.line).toBe(5);
    });

    it('rejects a call statement on an unknown function block instance', () => {
        const error = failure(inProgram('  nofb(IN := TRUE);'));
        expect(error.detail).toContain('nofb');
        expect(error.line).toBe(5);
    });

    it('rejects a standard function called with the wrong number of arguments', () => {
        const error = failure(inProgram('  x := ABS();'));
        expect(error.detail).toContain('ABS requires 1 argument');
        expect(error.line).toBe(5);
    });

    it('rejects EXIT and CONTINUE outside a loop', () => {
        expect(failure(inProgram('  EXIT;')).detail).toContain('EXIT');
        expect(failure(inProgram('  CONTINUE;')).detail).toContain('CONTINUE');
    });

    it('rejects an unknown member of a function block instance (position comes with CMP-006)', () => {
        const source = `FUNCTION_BLOCK Fb\nVAR_OUTPUT q : INT; END_VAR\nEND_FUNCTION_BLOCK\nPROGRAM P\nVAR\n  f : Fb;\n  x : INT;\nEND_VAR\n  x := f.missing;\nEND_PROGRAM\n`;
        expect(() => compileToBinary(source)).toThrow('missing');
    });

    it('produces no assembly either: compileST throws instead of returning code with a marker', () => {
        expect(() => compileST(inProgram('  nope := 5;'))).toThrow(CompilerError);
    });

    it('still builds a correct program', () => {
        expect(compileToBinary(inProgram('  x := ABS(-3);')).bytecode.length).toBeGreaterThan(0);
    });
});

describe('no placeholder code in place of an error', () => {
    it('leaves no assembly-comment error marker in the generator sources', () => {
        const root = join(import.meta.dir);
        const marker = ['; ', 'ERROR'].join('');
        const files = [
            join(root, 'codegen.ts'),
            ...readdirSync(join(root, 'stdlib'))
                .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
                .map((name) => join(root, 'stdlib', name)),
        ];
        const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(marker));
        expect(offenders).toEqual([]);
    });
});
