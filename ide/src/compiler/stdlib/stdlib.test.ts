/**
 * ZPLC Standard Library Tests
 *
 * SPDX-License-Identifier: MIT
 *
 * Tests for the stdlib registry and code generation.
 */

import { describe, expect, test } from 'bun:test';
import {
    getFB,
    getFn,
    isFB,
    isFn,
    getAllFBNames,
    getAllFnNames,
} from './index.ts';
import type { FunctionBlockDef, FunctionDef, CodeGenContext } from './types.ts';
import type { Expression } from '../ast.ts';

// ============================================================================
// Helper to capture emitted assembly
// ============================================================================

function createMockContext(baseAddress: number, instanceName: string): {
    ctx: CodeGenContext;
    output: string[];
    labelCounter: { value: number };
} {
    const output: string[] = [];
    const labelCounter = { value: 0 };

    const ctx: CodeGenContext = {
        baseAddress,
        instanceName,
        newLabel: (prefix: string) => `${prefix}_${labelCounter.value++}`,
        emit: (line: string) => output.push(line),
        emitExpression: (expr: Expression) => {
            if (expr.kind === 'BoolLiteral') {
                output.push(`    PUSH8 ${expr.value ? 1 : 0}`);
            } else if (expr.kind === 'IntLiteral') {
                output.push(`    PUSH16 ${expr.value}`);
            } else if (expr.kind === 'TimeLiteral') {
                output.push(`    PUSH32 ${expr.valueMs}`);
            } else {
                output.push(`    ; TODO: ${expr.kind}`);
            }
        },
    };

    return { ctx, output, labelCounter };
}

// ============================================================================
// Registry Tests
// ============================================================================

describe('stdlib registry', () => {
    test('all function blocks are registered', () => {
        const fbNames = getAllFBNames();
        expect(fbNames).toContain('TON');
        expect(fbNames).toContain('TOF');
        expect(fbNames).toContain('TP');
        expect(fbNames).toContain('R_TRIG');
        expect(fbNames).toContain('F_TRIG');
        expect(fbNames).toContain('RS');
        expect(fbNames).toContain('SR');
        expect(fbNames).toContain('CTU');
        expect(fbNames).toContain('CTD');
        expect(fbNames).toContain('CTUD');
        // New in v1.1
        expect(fbNames).toContain('BLINK');
        expect(fbNames).toContain('PWM');
        expect(fbNames).toContain('PULSE');
        // New in v1.2 - Process Control
        expect(fbNames).toContain('HYSTERESIS');
        expect(fbNames).toContain('DEADBAND');
        expect(fbNames).toContain('LAG_FILTER');
        expect(fbNames).toContain('RAMP_REAL');
        expect(fbNames).toContain('INTEGRAL');
        expect(fbNames).toContain('DERIVATIVE');
        expect(fbNames).toContain('PID_Compact');
        // New in v1.2 - System Buffers
        expect(fbNames).toContain('FIFO');
        expect(fbNames).toContain('LIFO');
        expect(fbNames.length).toBe(22);
    });

    test('all functions are registered', () => {
        const fnNames = getAllFnNames();
        // Selection functions
        expect(fnNames).toContain('MAX');
        expect(fnNames).toContain('MIN');
        expect(fnNames).toContain('LIMIT');
        expect(fnNames).toContain('SEL');
        expect(fnNames).toContain('MUX');
        // Bitwise functions (new in v1.1)
        expect(fnNames).toContain('ROL');
        expect(fnNames).toContain('ROR');
        expect(fnNames).toContain('SHL');
        expect(fnNames).toContain('SHR');
        expect(fnNames).toContain('AND_WORD');
        expect(fnNames).toContain('OR_WORD');
        expect(fnNames).toContain('XOR_WORD');
        expect(fnNames).toContain('NOT_WORD');
        expect(fnNames).toContain('AND_DWORD');
        expect(fnNames).toContain('OR_DWORD');
        expect(fnNames).toContain('XOR_DWORD');
        expect(fnNames).toContain('NOT_DWORD');
        // Math functions (new in v1.1)
        expect(fnNames).toContain('ABS');
        expect(fnNames).toContain('ABSF');
        expect(fnNames).toContain('NEG');
        expect(fnNames).toContain('NEGF');
        expect(fnNames).toContain('MOD');
        expect(fnNames).toContain('SQRT');
        expect(fnNames).toContain('EXPT');
        // Type conversion functions (new in v1.1)
        expect(fnNames).toContain('INT_TO_REAL');
        expect(fnNames).toContain('REAL_TO_INT');
        expect(fnNames).toContain('BOOL_TO_INT');
        expect(fnNames).toContain('INT_TO_BOOL');
        // Process control functions (new in v1.2)
        expect(fnNames).toContain('NORM_X');
        expect(fnNames).toContain('SCALE_X');
        // Rounding functions (new in v1.2)
        expect(fnNames).toContain('TRUNC');
        expect(fnNames).toContain('ROUND');
        // Trigonometry functions (new in v1.2)
        expect(fnNames).toContain('SIN');
        expect(fnNames).toContain('COS');
        expect(fnNames).toContain('TAN');
        // Inverse trigonometry (new in v1.2)
        expect(fnNames).toContain('ASIN');
        expect(fnNames).toContain('ACOS');
        expect(fnNames).toContain('ATAN');
        expect(fnNames).toContain('ATAN2');
        // Logarithmic/Exponential (new in v1.2)
        expect(fnNames).toContain('LN');
        expect(fnNames).toContain('LOG');
        expect(fnNames).toContain('EXP');
        // System functions (new in v1.2)
        expect(fnNames).toContain('UPTIME');
        expect(fnNames).toContain('CYCLE_TIME');
        expect(fnNames).toContain('WATCHDOG_RESET');
        // String functions (new in v1.2)
        expect(fnNames).toContain('LEN');
        expect(fnNames).toContain('CONCAT');
        expect(fnNames).toContain('LEFT');
        expect(fnNames).toContain('RIGHT');
        expect(fnNames).toContain('MID');
        expect(fnNames).toContain('FIND');
        expect(fnNames).toContain('INSERT');
        expect(fnNames).toContain('DELETE');
        expect(fnNames).toContain('REPLACE');
        expect(fnNames).toContain('STRCMP');
        expect(fnNames).toContain('COPY');
        expect(fnNames).toContain('CLEAR');
        expect(fnNames).toContain('EQ_STRING');
        expect(fnNames).toContain('NE_STRING');
        expect(fnNames).toContain('NAND');
        expect(fnNames).toContain('NOR');
        expect(fnNames.length).toBe(61);  // 45 + 14 string functions + 2 logic (NAND, NOR)
    });

    test('isFB returns correct values', () => {
        expect(isFB('TON')).toBe(true);
        expect(isFB('CTU')).toBe(true);
        expect(isFB('MAX')).toBe(false);
        expect(isFB('UNKNOWN')).toBe(false);
    });

    test('isFn returns correct values', () => {
        expect(isFn('MAX')).toBe(true);
        expect(isFn('MIN')).toBe(true);
        expect(isFn('TON')).toBe(false);
        expect(isFn('UNKNOWN')).toBe(false);
    });

    test('getFB returns correct FB definitions', () => {
        const ton = getFB('TON');
        expect(ton).toBeDefined();
        expect(ton!.name).toBe('TON');
        expect(ton!.size).toBe(16);
        expect(ton!.members.length).toBe(6);
    });

    test('getFn returns correct function definitions', () => {
        const max = getFn('MAX');
        expect(max).toBeDefined();
        expect(max!.name).toBe('MAX');
        expect(max!.argCount).toBe(2);
        expect(max!.variadic).toBe(false);
    });
});

// ============================================================================
// Timer FB Tests
// ============================================================================

describe('timer function blocks', () => {
    test('TON has correct member layout', () => {
        const ton = getFB('TON')!;
        const members = ton.members;

        const findMember = (name: string) => members.find(m => m.name === name);

        expect(findMember('IN')).toEqual({ name: 'IN', size: 1, offset: 0, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('Q')).toEqual({ name: 'Q', size: 1, offset: 1, isInput: false, isOutput: true, isInternal: false });
        expect(findMember('PT')).toEqual({ name: 'PT', size: 4, offset: 2, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('ET')).toEqual({ name: 'ET', size: 4, offset: 6, isInput: false, isOutput: true, isInternal: false });
        expect(findMember('_start')).toEqual({ name: '_start', size: 4, offset: 10, isInput: false, isOutput: false, isInternal: true });
        expect(findMember('_running')).toEqual({ name: '_running', size: 1, offset: 14, isInput: false, isOutput: false, isInternal: true });
    });

    test('TON generates code', () => {
        const ton = getFB('TON')!;
        const { ctx, output } = createMockContext(0x2000, 'Timer1');

        ton.generateCall(ctx, [
            { name: 'IN', value: { kind: 'BoolLiteral', value: true, line: 1, column: 1 } },
            { name: 'PT', value: { kind: 'TimeLiteral', valueMs: 1000, rawValue: 'T#1s', line: 1, column: 1 } },
        ]);

        expect(output.length).toBeGreaterThan(10);
        expect(output.some(l => l.includes('STORE8 0x2000'))).toBe(true);  // IN address
        expect(output.some(l => l.includes('TON Timer Logic'))).toBe(true);
        expect(output.some(l => l.includes('GET_TICKS'))).toBe(true);
    });

    test('TOF has same size as TON', () => {
        const tof = getFB('TOF')!;
        expect(tof.size).toBe(16);
        expect(tof.members.length).toBe(6);
    });

    test('TP has same size as TON', () => {
        const tp = getFB('TP')!;
        expect(tp.size).toBe(16);
        expect(tp.members.length).toBe(6);
    });
});

// ============================================================================
// Edge Detector Tests
// ============================================================================

describe('edge detector function blocks', () => {
    test('R_TRIG has correct member layout', () => {
        const rtrig = getFB('R_TRIG')!;
        expect(rtrig.size).toBe(4);

        const members = rtrig.members;
        const findMember = (name: string) => members.find(m => m.name === name);

        expect(findMember('CLK')).toEqual({ name: 'CLK', size: 1, offset: 0, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('Q')).toEqual({ name: 'Q', size: 1, offset: 1, isInput: false, isOutput: true, isInternal: false });
        expect(findMember('_prev')).toEqual({ name: '_prev', size: 1, offset: 2, isInput: false, isOutput: false, isInternal: true });
    });

    test('R_TRIG generates rising edge detection code', () => {
        const rtrig = getFB('R_TRIG')!;
        const { ctx, output } = createMockContext(0x2000, 'RisingEdge');

        rtrig.generateCall(ctx, [
            { name: 'CLK', value: { kind: 'BoolLiteral', value: true, line: 1, column: 1 } },
        ]);

        expect(output.some(l => l.includes('R_TRIG Logic'))).toBe(true);
        expect(output.some(l => l.includes('NOT'))).toBe(true);  // NOT _prev for edge detection
    });

    test('F_TRIG has correct size', () => {
        const ftrig = getFB('F_TRIG')!;
        expect(ftrig.size).toBe(4);
    });
});

// ============================================================================
// Bistable Tests
// ============================================================================

describe('bistable function blocks', () => {
    test('RS has correct member layout', () => {
        const rs = getFB('RS')!;
        expect(rs.size).toBe(4);

        const members = rs.members;
        const findMember = (name: string) => members.find(m => m.name === name);

        expect(findMember('S')).toEqual({ name: 'S', size: 1, offset: 0, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('R1')).toEqual({ name: 'R1', size: 1, offset: 1, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('Q1')).toEqual({ name: 'Q1', size: 1, offset: 2, isInput: false, isOutput: true, isInternal: false });
    });

    test('RS generates reset-dominant bistable logic', () => {
        const rs = getFB('RS')!;
        const { ctx, output } = createMockContext(0x2000, 'Latch1');

        rs.generateCall(ctx, [
            { name: 'S', value: { kind: 'BoolLiteral', value: true, line: 1, column: 1 } },
            { name: 'R1', value: { kind: 'BoolLiteral', value: false, line: 1, column: 1 } },
        ]);

        expect(output.some(l => l.includes('RS Bistable Logic'))).toBe(true);
    });

    test('SR has correct member layout', () => {
        const sr = getFB('SR')!;
        expect(sr.size).toBe(4);

        const members = sr.members;
        expect(members.find(m => m.name === 'S1')).toBeDefined();
        expect(members.find(m => m.name === 'R')).toBeDefined();
        expect(members.find(m => m.name === 'Q1')).toBeDefined();
    });
});

// ============================================================================
// Counter Tests
// ============================================================================

describe('counter function blocks', () => {
    test('CTU has correct member layout', () => {
        const ctu = getFB('CTU')!;
        expect(ctu.size).toBe(8);

        const members = ctu.members;
        const findMember = (name: string) => members.find(m => m.name === name);

        expect(findMember('CU')).toEqual({ name: 'CU', size: 1, offset: 0, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('R')).toEqual({ name: 'R', size: 1, offset: 1, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('Q')).toEqual({ name: 'Q', size: 1, offset: 3, isInput: false, isOutput: true, isInternal: false });
        expect(findMember('PV')).toEqual({ name: 'PV', size: 2, offset: 4, isInput: true, isOutput: false, isInternal: false });
        expect(findMember('CV')).toEqual({ name: 'CV', size: 2, offset: 6, isInput: false, isOutput: true, isInternal: false });
    });

    test('CTU generates count up logic', () => {
        const ctu = getFB('CTU')!;
        const { ctx, output } = createMockContext(0x2000, 'Counter1');

        ctu.generateCall(ctx, [
            { name: 'CU', value: { kind: 'BoolLiteral', value: true, line: 1, column: 1 } },
            { name: 'R', value: { kind: 'BoolLiteral', value: false, line: 1, column: 1 } },
            { name: 'PV', value: { kind: 'IntLiteral', value: 10, line: 1, column: 1 } },
        ]);

        expect(output.some(l => l.includes('CTU Count Up Logic'))).toBe(true);
        expect(output.some(l => l.includes('ADD'))).toBe(true);  // Increment
    });

    test('CTD has correct size', () => {
        const ctd = getFB('CTD')!;
        expect(ctd.size).toBe(8);
    });

    test('CTUD has correct size', () => {
        const ctud = getFB('CTUD')!;
        expect(ctud.size).toBe(12);

        const members = ctud.members;
        expect(members.find(m => m.name === 'CU')).toBeDefined();
        expect(members.find(m => m.name === 'CD')).toBeDefined();
        expect(members.find(m => m.name === 'QU')).toBeDefined();
        expect(members.find(m => m.name === 'QD')).toBeDefined();
    });
});

// ============================================================================
// Function Tests
// ============================================================================

describe('standard functions', () => {
    test('MAX generates comparison code', () => {
        const max = getFn('MAX')!;
        const { ctx, output } = createMockContext(0, '');

        max.generateInline(ctx, [
            { kind: 'IntLiteral', value: 5, line: 1, column: 1 },
            { kind: 'IntLiteral', value: 10, line: 1, column: 1 },
        ]);

        expect(output.some(l => l.includes('MAX'))).toBe(true);
        expect(output.some(l => l.includes('GT'))).toBe(true);  // Greater than comparison
        expect(output.some(l => l.includes('DROP'))).toBe(true);  // Drop the smaller value
    });

    test('MIN generates comparison code', () => {
        const min = getFn('MIN')!;
        const { ctx, output } = createMockContext(0, '');

        min.generateInline(ctx, [
            { kind: 'IntLiteral', value: 5, line: 1, column: 1 },
            { kind: 'IntLiteral', value: 10, line: 1, column: 1 },
        ]);

        expect(output.some(l => l.includes('MIN'))).toBe(true);
        expect(output.some(l => l.includes('LT'))).toBe(true);  // Less than comparison
    });

    test('LIMIT has 3 arguments', () => {
        const limit = getFn('LIMIT')!;
        expect(limit.argCount).toBe(3);
        expect(limit.variadic).toBe(false);
    });

    test('SEL generates conditional selection code', () => {
        const sel = getFn('SEL')!;
        const { ctx, output } = createMockContext(0, '');

        sel.generateInline(ctx, [
            { kind: 'BoolLiteral', value: true, line: 1, column: 1 },  // G
            { kind: 'IntLiteral', value: 0, line: 1, column: 1 },     // IN0
            { kind: 'IntLiteral', value: 1, line: 1, column: 1 },     // IN1
        ]);

        expect(output.some(l => l.includes('SEL'))).toBe(true);
        expect(output.some(l => l.includes('JNZ'))).toBe(true);  // Jump based on G
    });

    test('MUX is variadic', () => {
        const mux = getFn('MUX')!;
        expect(mux.variadic).toBe(true);
        expect(mux.argCount).toBe(2);  // Minimum: K + 1 input
    });

    test('MUX generates multiplexer code', () => {
        const mux = getFn('MUX')!;
        const { ctx, output } = createMockContext(0, '');

        mux.generateInline(ctx, [
            { kind: 'IntLiteral', value: 1, line: 1, column: 1 },  // K
            { kind: 'IntLiteral', value: 10, line: 1, column: 1 }, // IN0
            { kind: 'IntLiteral', value: 20, line: 1, column: 1 }, // IN1
            { kind: 'IntLiteral', value: 30, line: 1, column: 1 }, // IN2
        ]);

        expect(output.some(l => l.includes('MUX'))).toBe(true);
        expect(output.some(l => l.includes('EQ'))).toBe(true);  // Comparison for each case
    });
});
