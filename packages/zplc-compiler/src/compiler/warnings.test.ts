/**
 * Warnings and the option that selects them (CMP-008)
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, test } from 'bun:test';
import { compileToBinary, compileMultiTaskProject, CompilerError } from './index.ts';
import type { CompilerWarning, ProgramSource } from './index.ts';
import { parseWarningSelection, selectWarnings, WARNING_CODES } from './diagnostics.ts';
import type { WarningSelection } from './diagnostics.ts';

function warningsOf(source: string, reportWarnings?: WarningSelection): CompilerWarning[] {
    return compileToBinary(source, reportWarnings === undefined ? undefined : { reportWarnings }).warnings;
}

const codes = (list: CompilerWarning[]): string[] => list.map((warning) => warning.code);
const at = (list: CompilerWarning[], code: string): string[] => list.filter((warning) => warning.code === code).map((warning) => `${warning.line}:${warning.column}`);

describe('unused variables (CMP-008)', () => {
    const program = [
        'PROGRAM P',
        'VAR',
        '    unused : INT;',
        '    writeOnly : INT;',
        '    used : INT;',
        'END_VAR',
        '    writeOnly := 1;',
        '    used := used + 1;',
        'END_PROGRAM',
    ].join('\n');

    test('a variable that is never read nor written is reported at its declaration, by name', () => {
        const found = warningsOf(program);
        expect(at(found, 'UNUSED_VARIABLE')).toEqual(['3:5']);
        const warning = found.find((each) => each.code === 'UNUSED_VARIABLE')!;
        expect(warning.message).toContain("'unused'");
        expect(warning.message).toContain('P');
    });

    test('a variable that is written and never read is a separate, opt-in warning', () => {
        expect(codes(warningsOf(program))).not.toContain('WRITE_ONLY_VARIABLE');
        expect(at(warningsOf(program, 'all'), 'WRITE_ONLY_VARIABLE')).toEqual(['4:5']);
    });

    test('every way of using a variable counts as a use', () => {
        const source = [
            'FUNCTION_BLOCK Count',
            'VAR_INPUT step : INT; END_VAR',
            'VAR_OUTPUT total : INT; END_VAR',
            '    total := total + step;',
            'END_FUNCTION_BLOCK',
            'PROGRAM P',
            'VAR',
            '    timer : TON; counter : Count; arr : ARRAY[0..3] OF INT; i : INT; p : REF_TO INT;',
            '    flag : BOOL; word : WORD; sel : INT; target : INT; out : BOOL;',
            'END_VAR',
            '    timer(IN := TRUE, PT := T#1s);',
            '    counter(step := 2);',
            '    FOR i := 0 TO 3 DO arr[i] := i; END_FOR;',
            '    p := REF(target);',
            '    CASE sel OF 1: flag := TRUE; END_CASE;',
            '    word.1 := flag;',
            '    out := timer.Q;',
            'END_PROGRAM',
        ].join('\n');
        const found = warningsOf(source, 'all');
        expect(found.filter((each) => each.code === 'UNUSED_VARIABLE')).toEqual([]);
    });

    test('a function block member read from outside the block is used', () => {
        const source = [
            'FUNCTION_BLOCK Count',
            'VAR hidden : INT; END_VAR',
            '    hidden := hidden + 1;',
            'END_FUNCTION_BLOCK',
            'PROGRAM P',
            'VAR counter : Count; seen : INT; END_VAR',
            '    counter();',
            '    seen := counter.hidden;',
            'END_PROGRAM',
        ].join('\n');
        expect(codes(warningsOf(source, 'all'))).not.toContain('UNUSED_VARIABLE');
    });

    test('an interface variable, a located variable and a published one are not reported', () => {
        const source = [
            'PROGRAM P',
            'VAR_INPUT in1 : BOOL; END_VAR',
            'VAR_OUTPUT out1 : BOOL; END_VAR',
            'VAR',
            '    q AT %QX0.0 : BOOL;',
            '    shown : INT {publish};',
            'END_VAR',
            'END_PROGRAM',
        ].join('\n');
        expect(warningsOf(source, 'all')).toEqual([]);
    });

    test('the locals of a function are reported, its inputs and result are not', () => {
        const source = [
            'FUNCTION Twice : INT',
            'VAR_INPUT x : INT; y : INT; END_VAR',
            'VAR spare : INT; END_VAR',
            '    Twice := x * 2;',
            'END_FUNCTION',
            'PROGRAM P',
            'VAR r : INT; END_VAR',
            '    r := Twice(x := 2, y := 3);',
            'END_PROGRAM',
        ].join('\n');
        const found = warningsOf(source, 'all');
        expect(at(found, 'UNUSED_VARIABLE')).toEqual(['3:5']);
        expect(at(found, 'WRITE_ONLY_VARIABLE')).toEqual(['7:5']);
    });
});

describe('unreachable statements (CMP-008)', () => {
    test('what follows RETURN, EXIT and CONTINUE in the same list is reported once, at its first statement', () => {
        const source = [
            'PROGRAM P',
            'VAR a : INT; i : INT; END_VAR',
            '    FOR i := 0 TO 3 DO',
            '        EXIT;',
            '        a := 1;',
            '        a := 2;',
            '    END_FOR;',
            '    RETURN;',
            '    a := 3;',
            'END_PROGRAM',
        ].join('\n');
        expect(at(warningsOf(source), 'UNREACHABLE_STATEMENT')).toEqual(['5:9', '9:5']);
    });

    test('an IF that returns in every branch makes the next statement unreachable', () => {
        const source = [
            'PROGRAM P',
            'VAR a : INT; END_VAR',
            '    IF a > 0 THEN RETURN; ELSE RETURN; END_IF;',
            '    a := 1;',
            'END_PROGRAM',
        ].join('\n');
        expect(at(warningsOf(source), 'UNREACHABLE_STATEMENT')).toEqual(['4:5']);
    });

    test('an IF with a branch that falls through, and a constant condition, do not make anything unreachable', () => {
        const source = [
            'PROGRAM P',
            'VAR a : INT; END_VAR',
            '    IF a > 0 THEN RETURN; END_IF;',
            '    a := 1;',
            '    IF FALSE THEN a := 2; END_IF;',
            '    a := 3;',
            'END_PROGRAM',
        ].join('\n');
        expect(codes(warningsOf(source))).not.toContain('UNREACHABLE_STATEMENT');
    });
});

describe('non-IEC spellings (CMP-008, CMP-031)', () => {
    test('the 0x form and a real literal with an exponent and no fraction warn, each with its code', () => {
        const source = 'PROGRAM P\nVAR a : INT; r : REAL; END_VAR\n    a := 0x1F;\n    r := 1e3;\n    a := a + 1;\n    r := r + 1.5E3;\nEND_PROGRAM';
        const found = warningsOf(source);
        expect(at(found, 'NON_IEC_HEX_LITERAL')).toEqual(['3:10']);
        expect(at(found, 'NON_IEC_REAL_LITERAL')).toEqual(['4:10']);
        expect(found.find((each) => each.code === 'NON_IEC_REAL_LITERAL')!.message).toContain('1.0e3');
    });
});

describe('the selection of warnings by the compiler.warnings option (CMP-008)', () => {
    const source = [
        'PROGRAM P',
        'VAR a : INT; unused : INT; d : DINT; END_VAR',
        '    a := 0x1F;',
        '    a := d;',
        '    RETURN;',
        '    a := 1;',
        'END_PROGRAM',
    ].join('\n');

    test('by default the warnings that point at a defect or a portability problem are reported', () => {
        expect(new Set(codes(warningsOf(source)))).toEqual(new Set(['NON_IEC_HEX_LITERAL', 'IMPLICIT_NARROWING', 'UNREACHABLE_STATEMENT', 'UNUSED_VARIABLE']));
        expect(codes(warningsOf(source, 'default'))).toEqual(codes(warningsOf(source)));
    });

    test('none reports no warning and the build still passes', () => {
        expect(warningsOf(source, 'none')).toEqual([]);
    });

    test('all adds the write-only variables', () => {
        expect(codes(warningsOf(source, 'all'))).toContain('WRITE_ONLY_VARIABLE');
        expect(codes(warningsOf(source, 'all')).length).toBeGreaterThan(codes(warningsOf(source)).length);
    });

    test('a list of codes reports those and no other', () => {
        expect(new Set(codes(warningsOf(source, ['UNUSED_VARIABLE', 'IMPLICIT_NARROWING'])))).toEqual(new Set(['UNUSED_VARIABLE', 'IMPLICIT_NARROWING']));
        expect(warningsOf(source, [])).toEqual([]);
    });

    test('warnings stay in source order', () => {
        const found = warningsOf(source, 'all');
        const positions = found.map((each) => each.line * 1000 + each.column);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    test('a project build selects the same way, and a file of a project names its warnings', () => {
        const config = { name: 'W', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['P'] }] };
        const sources: ProgramSource[] = [{ name: 'P', content: source, sourceRef: 'src/p.st' }];
        const all = compileMultiTaskProject(config, sources).warnings;
        expect(all.every((each) => each.sourceRef === 'src/p.st')).toBe(true);
        expect(new Set(codes(all))).toEqual(new Set(['NON_IEC_HEX_LITERAL', 'IMPLICIT_NARROWING', 'UNREACHABLE_STATEMENT', 'UNUSED_VARIABLE']));
        expect(compileMultiTaskProject(config, sources, { reportWarnings: 'none' }).warnings).toEqual([]);
        expect(codes(compileMultiTaskProject(config, sources, { reportWarnings: ['UNUSED_VARIABLE'] }).warnings)).toEqual(['UNUSED_VARIABLE']);
    });

    test('a value that is neither a level nor a list of known codes is refused, naming what is accepted', () => {
        expect(parseWarningSelection('all')).toEqual({ ok: true, selection: 'all' });
        expect(parseWarningSelection(['UNUSED_VARIABLE'])).toEqual({ ok: true, selection: ['UNUSED_VARIABLE'] });
        const level = parseWarningSelection('verbose');
        expect(level.ok).toBe(false);
        expect(!level.ok && level.message).toContain("'none', 'default' or 'all'");
        const code = parseWarningSelection(['UNUSED_VARIABLE', 'NOPE']);
        expect(!code.ok && code.message).toContain('NOPE');
        expect(!code.ok && code.message).toContain('UNUSED_VARIABLE');
        expect(parseWarningSelection(3).ok).toBe(false);
    });

    test('selectWarnings keeps the order and the objects of the warnings it keeps', () => {
        const all = WARNING_CODES.map((code, index) => ({ code, message: code, line: index + 1, column: 1 }));
        expect(selectWarnings(all, 'all')).toEqual(all);
        expect(selectWarnings(all, 'none')).toEqual([]);
        expect(selectWarnings(all, ['UNUSED_VARIABLE']).map((each) => each.code)).toEqual(['UNUSED_VARIABLE']);
    });
});

describe('compiler.strictTypes (CMP-059)', () => {
    const narrowing = 'PROGRAM P\nVAR i : INT; d : DINT; END_VAR\n    i := d;\n    d := i;\nEND_PROGRAM';

    test('off, an implicit narrowing builds with its warning', () => {
        expect(codes(warningsOf(narrowing))).toContain('IMPLICIT_NARROWING');
    });

    test('on, the same implicit narrowing is an error at the value, and a widening is not', () => {
        let error: CompilerError | undefined;
        try {
            compileToBinary(narrowing, { strictTypes: true });
        } catch (caught) {
            error = caught as CompilerError;
        }
        expect(error).toBeInstanceOf(CompilerError);
        expect(`${error!.line}:${error!.column}`).toBe('3:10');
        expect(error!.detail).toContain('strictTypes');
        expect(error!.detail).toContain('DINT to INT');
        expect(() => compileToBinary('PROGRAM P\nVAR i : INT; d : DINT; END_VAR\n    d := i;\nEND_PROGRAM', { strictTypes: true })).not.toThrow();
    });

    test('on, an explicit conversion is accepted', () => {
        expect(() => compileToBinary('PROGRAM P\nVAR i : INT; d : DINT; END_VAR\n    i := DINT_TO_INT(d);\n    d := i;\nEND_PROGRAM', { strictTypes: true })).not.toThrow();
    });
});

describe('a call to WATCHDOG_RESET does nothing, and the build says so (RT-034)', () => {
  const call = 'PROGRAM P\nVAR n : INT; END_VAR\n  n := 1;\n  WATCHDOG_RESET();\n  n := 2;\nEND_PROGRAM\n';

  test('is reported at the call, with what the runtime does instead', () => {
    const found = warningsOf(call).filter((warning) => warning.code === 'WATCHDOG_RESET_NO_EFFECT');
    expect(found.map((warning) => `${warning.line}:${warning.column}`)).toEqual(['4:3']);
    expect(found[0]!.message).toContain('WATCHDOG_RESET');
    expect(found[0]!.message).toContain('does nothing');
    expect(found[0]!.message).toContain('feeds the hardware watchdog');
    expect(found[0]!.message).toContain('after each completed scan');
  });

  test('is reported for each call and whatever the case of the name', () => {
    const source = 'PROGRAM P\nVAR n : INT; END_VAR\n  watchdog_reset();\n  n := 1;\n  Watchdog_Reset();\nEND_PROGRAM\n';
    expect(at(warningsOf(source), 'WATCHDOG_RESET_NO_EFFECT')).toEqual(['3:3', '5:3']);
  });

  test('is selected by the level like every warning: default and all report it, none and a list without it do not', () => {
    expect(codes(warningsOf(call, 'default'))).toContain('WATCHDOG_RESET_NO_EFFECT');
    expect(codes(warningsOf(call, 'all'))).toContain('WATCHDOG_RESET_NO_EFFECT');
    expect(warningsOf(call, 'none')).toEqual([]);
    expect(codes(warningsOf(call, ['UNUSED_VARIABLE']))).not.toContain('WATCHDOG_RESET_NO_EFFECT');
    expect(codes(warningsOf(call, ['WATCHDOG_RESET_NO_EFFECT']))).toEqual(['WATCHDOG_RESET_NO_EFFECT']);
  });

  test('a function block body that calls it is reported once, however many instances inline it', () => {
    const source = [
      'FUNCTION_BLOCK Guard',
      'VAR_INPUT go : BOOL; END_VAR',
      '  WATCHDOG_RESET();',
      'END_FUNCTION_BLOCK',
      'PROGRAM P',
      'VAR a : Guard; b : Guard; END_VAR',
      '  a(go := TRUE);',
      '  b(go := TRUE);',
      'END_PROGRAM',
    ].join('\n');
    expect(at(warningsOf(source), 'WATCHDOG_RESET_NO_EFFECT')).toEqual(['3:3']);
  });

  test('a function of the project that has the name is called, not reported', () => {
    const source = [
      'FUNCTION WATCHDOG_RESET : INT',
      'VAR_INPUT value : INT; END_VAR',
      '  WATCHDOG_RESET := value;',
      'END_FUNCTION',
      'PROGRAM P',
      'VAR result : INT; END_VAR',
      '  result := WATCHDOG_RESET(1);',
      'END_PROGRAM',
    ].join('\n');
    expect(codes(warningsOf(source))).not.toContain('WATCHDOG_RESET_NO_EFFECT');
  });

  test('a project build names the file of the call', () => {
    const config = { name: 'W', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['P'] }] };
    const found = compileMultiTaskProject(config, [{ name: 'P', content: call, sourceRef: 'src/p.st' }]).warnings
      .filter((warning) => warning.code === 'WATCHDOG_RESET_NO_EFFECT');
    expect(found.map((warning) => `${warning.sourceRef}:${warning.line}`)).toEqual(['src/p.st:4']);
  });
});
