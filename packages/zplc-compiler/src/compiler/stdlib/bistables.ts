/**
 * ZPLC Standard Library - Bistable Function Blocks
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 Edge Detectors and Bistables:
 * - R_TRIG: Rising Edge Detector
 * - F_TRIG: Falling Edge Detector
 * - RS: Reset-Dominant Bistable
 * - SR: Set-Dominant Bistable
 */

import type { FunctionBlockDef, CodeGenContext, MemberDef } from './types.ts';
import type { FBParameter } from '../ast.ts';
import { inputMember, outputMember, internalMember, formatAddr } from './types.ts';

// ============================================================================
// R_TRIG - Rising Edge Detector
// ============================================================================

/**
 * R_TRIG Memory Layout:
 *   +0: CLK      (BOOL, 1 byte) - Input clock
 *   +1: Q        (BOOL, 1 byte) - Output (TRUE for one scan on rising edge)
 *   +2: _prev    (BOOL, 1 byte) - Previous CLK value
 *   +3: _padding (1 byte)
 * Total: 4 bytes
 */
const R_TRIG_MEMBERS: MemberDef[] = [
    inputMember('CLK', 1, 0),
    outputMember('Q', 1, 1),
    internalMember('_prev', 1, 2),
];

/**
 * R_TRIG (Rising Edge Detector):
 *
 * Q := CLK AND NOT _prev
 * _prev := CLK
 *
 * Q is TRUE for exactly one scan cycle when CLK transitions from FALSE to TRUE.
 */
export const R_TRIG_FB: FunctionBlockDef = {
    name: 'R_TRIG',
    size: 4,
    members: R_TRIG_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const clkAddr = formatAddr(base + 0);
        const qAddr = formatAddr(base + 1);
        const prevAddr = formatAddr(base + 2);

        // Set CLK parameter
        for (const param of params) {
            if (param.name === 'CLK') {
                ctx.emit(`    ; Set ${ctx.instanceName}.CLK`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${clkAddr}`);
            }
        }

        ctx.emit(`    ; --- R_TRIG Logic (${ctx.instanceName}) ---`);

        // Q := CLK AND (NOT _prev)
        ctx.emit(`    LOAD8 ${clkAddr}`);
        ctx.emit(`    LOAD8 ${prevAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);           // Mask to bool
        ctx.emit(`    AND`);           // CLK AND (NOT prev)
        ctx.emit(`    STORE8 ${qAddr}`);

        // _prev := CLK
        ctx.emit(`    LOAD8 ${clkAddr}`);
        ctx.emit(`    STORE8 ${prevAddr}`);

        ctx.emit(`    ; --- End R_TRIG ---`);
    },
};

// ============================================================================
// F_TRIG - Falling Edge Detector
// ============================================================================

/**
 * F_TRIG Memory Layout:
 *   +0: CLK      (BOOL, 1 byte) - Input clock
 *   +1: Q        (BOOL, 1 byte) - Output (TRUE for one scan on falling edge)
 *   +2: _prev    (BOOL, 1 byte) - Previous CLK value
 *   +3: _padding (1 byte)
 * Total: 4 bytes
 */
const F_TRIG_MEMBERS: MemberDef[] = [
    inputMember('CLK', 1, 0),
    outputMember('Q', 1, 1),
    internalMember('_prev', 1, 2),
];

/**
 * F_TRIG (Falling Edge Detector):
 *
 * Q := (NOT CLK) AND _prev
 * _prev := CLK
 *
 * Q is TRUE for exactly one scan cycle when CLK transitions from TRUE to FALSE.
 */
export const F_TRIG_FB: FunctionBlockDef = {
    name: 'F_TRIG',
    size: 4,
    members: F_TRIG_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const clkAddr = formatAddr(base + 0);
        const qAddr = formatAddr(base + 1);
        const prevAddr = formatAddr(base + 2);

        // Set CLK parameter
        for (const param of params) {
            if (param.name === 'CLK') {
                ctx.emit(`    ; Set ${ctx.instanceName}.CLK`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${clkAddr}`);
            }
        }

        ctx.emit(`    ; --- F_TRIG Logic (${ctx.instanceName}) ---`);

        // Q := (NOT CLK) AND _prev
        ctx.emit(`    LOAD8 ${clkAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);           // Mask to bool
        ctx.emit(`    LOAD8 ${prevAddr}`);
        ctx.emit(`    AND`);           // (NOT CLK) AND prev
        ctx.emit(`    STORE8 ${qAddr}`);

        // _prev := CLK
        ctx.emit(`    LOAD8 ${clkAddr}`);
        ctx.emit(`    STORE8 ${prevAddr}`);

        ctx.emit(`    ; --- End F_TRIG ---`);
    },
};

// ============================================================================
// RS - Reset-Dominant Bistable
// ============================================================================

/**
 * RS Memory Layout:
 *   +0: S        (BOOL, 1 byte) - Set input
 *   +1: R1       (BOOL, 1 byte) - Reset input (dominant)
 *   +2: Q1       (BOOL, 1 byte) - Output
 *   +3: _padding (1 byte)
 * Total: 4 bytes
 */
const RS_MEMBERS: MemberDef[] = [
    inputMember('S', 1, 0),
    inputMember('R1', 1, 1),
    outputMember('Q1', 1, 2),
];

/**
 * RS (Reset-Dominant Bistable):
 *
 * Q1 := NOT R1 AND (S OR Q1)
 *
 * Reset (R1) is dominant - if both S and R1 are TRUE, output is FALSE.
 */
export const RS_FB: FunctionBlockDef = {
    name: 'RS',
    size: 4,
    members: RS_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const sAddr = formatAddr(base + 0);
        const r1Addr = formatAddr(base + 1);
        const q1Addr = formatAddr(base + 2);

        // Set parameters
        for (const param of params) {
            if (param.name === 'S') {
                ctx.emit(`    ; Set ${ctx.instanceName}.S`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${sAddr}`);
            } else if (param.name === 'R1') {
                ctx.emit(`    ; Set ${ctx.instanceName}.R1`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${r1Addr}`);
            }
        }

        ctx.emit(`    ; --- RS Bistable Logic (${ctx.instanceName}) ---`);

        // Q1 := NOT R1 AND (S OR Q1)
        ctx.emit(`    LOAD8 ${r1Addr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);           // NOT R1

        ctx.emit(`    LOAD8 ${sAddr}`);
        ctx.emit(`    LOAD8 ${q1Addr}`);
        ctx.emit(`    OR`);            // S OR Q1

        ctx.emit(`    AND`);           // (NOT R1) AND (S OR Q1)
        ctx.emit(`    STORE8 ${q1Addr}`);

        ctx.emit(`    ; --- End RS ---`);
    },
};

// ============================================================================
// SR - Set-Dominant Bistable
// ============================================================================

/**
 * SR Memory Layout:
 *   +0: S1       (BOOL, 1 byte) - Set input (dominant)
 *   +1: R        (BOOL, 1 byte) - Reset input
 *   +2: Q1       (BOOL, 1 byte) - Output
 *   +3: _padding (1 byte)
 * Total: 4 bytes
 */
const SR_MEMBERS: MemberDef[] = [
    inputMember('S1', 1, 0),
    inputMember('R', 1, 1),
    outputMember('Q1', 1, 2),
];

/**
 * SR (Set-Dominant Bistable):
 *
 * Q1 := S1 OR (NOT R AND Q1)
 *
 * Set (S1) is dominant - if both S1 and R are TRUE, output is TRUE.
 */
export const SR_FB: FunctionBlockDef = {
    name: 'SR',
    size: 4,
    members: SR_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const s1Addr = formatAddr(base + 0);
        const rAddr = formatAddr(base + 1);
        const q1Addr = formatAddr(base + 2);

        // Set parameters
        for (const param of params) {
            if (param.name === 'S1') {
                ctx.emit(`    ; Set ${ctx.instanceName}.S1`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${s1Addr}`);
            } else if (param.name === 'R') {
                ctx.emit(`    ; Set ${ctx.instanceName}.R`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${rAddr}`);
            }
        }

        ctx.emit(`    ; --- SR Bistable Logic (${ctx.instanceName}) ---`);

        // Q1 := S1 OR (NOT R AND Q1)
        ctx.emit(`    LOAD8 ${s1Addr}`);

        ctx.emit(`    LOAD8 ${rAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);           // NOT R
        ctx.emit(`    LOAD8 ${q1Addr}`);
        ctx.emit(`    AND`);           // (NOT R) AND Q1

        ctx.emit(`    OR`);            // S1 OR ((NOT R) AND Q1)
        ctx.emit(`    STORE8 ${q1Addr}`);

        ctx.emit(`    ; --- End SR ---`);
    },
};
