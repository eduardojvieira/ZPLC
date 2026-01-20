/**
 * ZPLC Standard Library - Counter Function Blocks
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 Counter Function Blocks:
 * - CTU: Count Up
 * - CTD: Count Down
 * - CTUD: Count Up/Down
 */

import type { FunctionBlockDef, CodeGenContext, MemberDef } from './types.ts';
import type { FBParameter } from '../ast.ts';
import { inputMember, outputMember, internalMember, formatAddr } from './types.ts';

// ============================================================================
// CTU - Count Up
// ============================================================================

/**
 * CTU Memory Layout:
 *   +0:  CU       (BOOL, 1 byte) - Count Up input
 *   +1:  R        (BOOL, 1 byte) - Reset input
 *   +2:  _prev_cu (BOOL, 1 byte) - Previous CU for edge detection
 *   +3:  Q        (BOOL, 1 byte) - Output (CV >= PV)
 *   +4:  PV       (INT, 2 bytes) - Preset Value
 *   +6:  CV       (INT, 2 bytes) - Current Value
 * Total: 8 bytes
 */
const CTU_MEMBERS: MemberDef[] = [
    inputMember('CU', 1, 0),
    inputMember('R', 1, 1),
    internalMember('_prev_cu', 1, 2),
    outputMember('Q', 1, 3),
    inputMember('PV', 2, 4),
    outputMember('CV', 2, 6),
];

/**
 * CTU (Count Up):
 *
 * On rising edge of CU: CV := CV + 1
 * When R is TRUE: CV := 0
 * Q := (CV >= PV)
 */
export const CTU_FB: FunctionBlockDef = {
    name: 'CTU',
    size: 8,
    members: CTU_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const cuAddr = formatAddr(base + 0);
        const rAddr = formatAddr(base + 1);
        const prevCuAddr = formatAddr(base + 2);
        const qAddr = formatAddr(base + 3);
        const pvAddr = formatAddr(base + 4);
        const cvAddr = formatAddr(base + 6);

        // Set parameters
        for (const param of params) {
            if (param.name === 'CU') {
                ctx.emit(`    ; Set ${ctx.instanceName}.CU`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${cuAddr}`);
            } else if (param.name === 'R') {
                ctx.emit(`    ; Set ${ctx.instanceName}.R`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${rAddr}`);
            } else if (param.name === 'PV') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PV`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE16 ${pvAddr}`);
            }
        }

        const skipReset = ctx.newLabel('ctu_skip_reset');
        const checkCount = ctx.newLabel('ctu_check_count');
        const skipCount = ctx.newLabel('ctu_skip_count');
        const ctuEnd = ctx.newLabel('ctu_end');

        ctx.emit(`    ; --- CTU Count Up Logic (${ctx.instanceName}) ---`);

        // Check reset
        ctx.emit(`    LOAD8 ${rAddr}`);
        ctx.emit(`    JZ ${skipReset}`);

        // Reset: CV := 0
        ctx.emit(`    PUSH16 0`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${checkCount}`);

        ctx.emit(`${skipReset}:`);

        // Check for rising edge on CU: CU AND (NOT _prev_cu)
        ctx.emit(`    LOAD8 ${cuAddr}`);
        ctx.emit(`    LOAD8 ${prevCuAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${skipCount}`);

        // Rising edge - increment CV
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    STORE16 ${cvAddr}`);

        ctx.emit(`${skipCount}:`);

        // Update _prev_cu
        ctx.emit(`    LOAD8 ${cuAddr}`);
        ctx.emit(`    STORE8 ${prevCuAddr}`);

        ctx.emit(`${checkCount}:`);

        // Q := (CV >= PV)
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    GE`);
        ctx.emit(`    STORE8 ${qAddr}`);

        ctx.emit(`${ctuEnd}:`);
        ctx.emit(`    ; --- End CTU ---`);
    },
};

// ============================================================================
// CTD - Count Down
// ============================================================================

/**
 * CTD Memory Layout:
 *   +0:  CD       (BOOL, 1 byte) - Count Down input
 *   +1:  LD       (BOOL, 1 byte) - Load input
 *   +2:  _prev_cd (BOOL, 1 byte) - Previous CD for edge detection
 *   +3:  Q        (BOOL, 1 byte) - Output (CV <= 0)
 *   +4:  PV       (INT, 2 bytes) - Preset Value
 *   +6:  CV       (INT, 2 bytes) - Current Value
 * Total: 8 bytes
 */
const CTD_MEMBERS: MemberDef[] = [
    inputMember('CD', 1, 0),
    inputMember('LD', 1, 1),
    internalMember('_prev_cd', 1, 2),
    outputMember('Q', 1, 3),
    inputMember('PV', 2, 4),
    outputMember('CV', 2, 6),
];

/**
 * CTD (Count Down):
 *
 * When LD is TRUE: CV := PV
 * On rising edge of CD: CV := CV - 1 (if CV > 0)
 * Q := (CV <= 0)
 */
export const CTD_FB: FunctionBlockDef = {
    name: 'CTD',
    size: 8,
    members: CTD_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const cdAddr = formatAddr(base + 0);
        const ldAddr = formatAddr(base + 1);
        const prevCdAddr = formatAddr(base + 2);
        const qAddr = formatAddr(base + 3);
        const pvAddr = formatAddr(base + 4);
        const cvAddr = formatAddr(base + 6);

        // Set parameters
        for (const param of params) {
            if (param.name === 'CD') {
                ctx.emit(`    ; Set ${ctx.instanceName}.CD`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${cdAddr}`);
            } else if (param.name === 'LD') {
                ctx.emit(`    ; Set ${ctx.instanceName}.LD`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${ldAddr}`);
            } else if (param.name === 'PV') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PV`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE16 ${pvAddr}`);
            }
        }

        const skipLoad = ctx.newLabel('ctd_skip_load');
        const checkCount = ctx.newLabel('ctd_check_count');
        const skipCount = ctx.newLabel('ctd_skip_count');

        ctx.emit(`    ; --- CTD Count Down Logic (${ctx.instanceName}) ---`);

        // Check load
        ctx.emit(`    LOAD8 ${ldAddr}`);
        ctx.emit(`    JZ ${skipLoad}`);

        // Load: CV := PV
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${checkCount}`);

        ctx.emit(`${skipLoad}:`);

        // Check for rising edge on CD
        ctx.emit(`    LOAD8 ${cdAddr}`);
        ctx.emit(`    LOAD8 ${prevCdAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${skipCount}`);

        // Rising edge - decrement CV (if CV > 0)
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 0`);
        ctx.emit(`    GT`);
        ctx.emit(`    JZ ${skipCount}`);

        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    SUB`);
        ctx.emit(`    STORE16 ${cvAddr}`);

        ctx.emit(`${skipCount}:`);

        // Update _prev_cd
        ctx.emit(`    LOAD8 ${cdAddr}`);
        ctx.emit(`    STORE8 ${prevCdAddr}`);

        ctx.emit(`${checkCount}:`);

        // Q := (CV <= 0)
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 0`);
        ctx.emit(`    LE`);
        ctx.emit(`    STORE8 ${qAddr}`);

        ctx.emit(`    ; --- End CTD ---`);
    },
};

// ============================================================================
// CTUD - Count Up/Down
// ============================================================================

/**
 * CTUD Memory Layout:
 *   +0:  CU       (BOOL, 1 byte) - Count Up input
 *   +1:  CD       (BOOL, 1 byte) - Count Down input
 *   +2:  R        (BOOL, 1 byte) - Reset input
 *   +3:  LD       (BOOL, 1 byte) - Load input
 *   +4:  _prev_cu (BOOL, 1 byte) - Previous CU for edge detection
 *   +5:  _prev_cd (BOOL, 1 byte) - Previous CD for edge detection
 *   +6:  QU       (BOOL, 1 byte) - Output (CV >= PV)
 *   +7:  QD       (BOOL, 1 byte) - Output (CV <= 0)
 *   +8:  PV       (INT, 2 bytes) - Preset Value
 *   +10: CV       (INT, 2 bytes) - Current Value
 * Total: 12 bytes (aligned to 12)
 */
const CTUD_MEMBERS: MemberDef[] = [
    inputMember('CU', 1, 0),
    inputMember('CD', 1, 1),
    inputMember('R', 1, 2),
    inputMember('LD', 1, 3),
    internalMember('_prev_cu', 1, 4),
    internalMember('_prev_cd', 1, 5),
    outputMember('QU', 1, 6),
    outputMember('QD', 1, 7),
    inputMember('PV', 2, 8),
    outputMember('CV', 2, 10),
];

/**
 * CTUD (Count Up/Down):
 *
 * Combined functionality of CTU and CTD.
 * When R is TRUE: CV := 0
 * When LD is TRUE: CV := PV
 * On rising edge of CU: CV := CV + 1
 * On rising edge of CD: CV := CV - 1
 * QU := (CV >= PV)
 * QD := (CV <= 0)
 */
export const CTUD_FB: FunctionBlockDef = {
    name: 'CTUD',
    size: 12,
    members: CTUD_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const cuAddr = formatAddr(base + 0);
        const cdAddr = formatAddr(base + 1);
        const rAddr = formatAddr(base + 2);
        const ldAddr = formatAddr(base + 3);
        const prevCuAddr = formatAddr(base + 4);
        const prevCdAddr = formatAddr(base + 5);
        const quAddr = formatAddr(base + 6);
        const qdAddr = formatAddr(base + 7);
        const pvAddr = formatAddr(base + 8);
        const cvAddr = formatAddr(base + 10);

        // Set parameters
        for (const param of params) {
            if (param.name === 'CU') {
                ctx.emit(`    ; Set ${ctx.instanceName}.CU`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${cuAddr}`);
            } else if (param.name === 'CD') {
                ctx.emit(`    ; Set ${ctx.instanceName}.CD`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${cdAddr}`);
            } else if (param.name === 'R') {
                ctx.emit(`    ; Set ${ctx.instanceName}.R`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${rAddr}`);
            } else if (param.name === 'LD') {
                ctx.emit(`    ; Set ${ctx.instanceName}.LD`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${ldAddr}`);
            } else if (param.name === 'PV') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PV`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE16 ${pvAddr}`);
            }
        }

        const skipReset = ctx.newLabel('ctud_skip_reset');
        const skipLoad = ctx.newLabel('ctud_skip_load');
        const checkUp = ctx.newLabel('ctud_check_up');
        const skipUp = ctx.newLabel('ctud_skip_up');
        const checkDown = ctx.newLabel('ctud_check_down');
        const skipDown = ctx.newLabel('ctud_skip_down');
        const updateOutputs = ctx.newLabel('ctud_outputs');

        ctx.emit(`    ; --- CTUD Count Up/Down Logic (${ctx.instanceName}) ---`);

        // Check reset
        ctx.emit(`    LOAD8 ${rAddr}`);
        ctx.emit(`    JZ ${skipReset}`);
        ctx.emit(`    PUSH16 0`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${checkUp}`);

        ctx.emit(`${skipReset}:`);

        // Check load
        ctx.emit(`    LOAD8 ${ldAddr}`);
        ctx.emit(`    JZ ${skipLoad}`);
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${checkUp}`);

        ctx.emit(`${skipLoad}:`);

        ctx.emit(`${checkUp}:`);

        // Check for rising edge on CU
        ctx.emit(`    LOAD8 ${cuAddr}`);
        ctx.emit(`    LOAD8 ${prevCuAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${skipUp}`);

        // Increment
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    STORE16 ${cvAddr}`);

        ctx.emit(`${skipUp}:`);

        // Update _prev_cu
        ctx.emit(`    LOAD8 ${cuAddr}`);
        ctx.emit(`    STORE8 ${prevCuAddr}`);

        ctx.emit(`${checkDown}:`);

        // Check for rising edge on CD
        ctx.emit(`    LOAD8 ${cdAddr}`);
        ctx.emit(`    LOAD8 ${prevCdAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${skipDown}`);

        // Decrement
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    SUB`);
        ctx.emit(`    STORE16 ${cvAddr}`);

        ctx.emit(`${skipDown}:`);

        // Update _prev_cd
        ctx.emit(`    LOAD8 ${cdAddr}`);
        ctx.emit(`    STORE8 ${prevCdAddr}`);

        ctx.emit(`${updateOutputs}:`);

        // QU := (CV >= PV)
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    GE`);
        ctx.emit(`    STORE8 ${quAddr}`);

        // QD := (CV <= 0)
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 0`);
        ctx.emit(`    LE`);
        ctx.emit(`    STORE8 ${qdAddr}`);

        ctx.emit(`    ; --- End CTUD ---`);
    },
};
