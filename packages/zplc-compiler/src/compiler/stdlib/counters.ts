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
 * When R is TRUE: CV := 0
 * Else on rising edge of CU: CV := CV + 1 (CV stops at 32767)
 * Q := (CV >= PV)
 *
 * The edge detector on CU runs on every call, also while R is TRUE: a pulse that
 * rises during Reset is not counted when Reset is released.
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
        const skipCount = ctx.newLabel('ctu_skip_count');
        const ctuEnd = ctx.newLabel('ctu_end');

        ctx.emit(`    ; --- CTU Count Up Logic (${ctx.instanceName}) ---`);

        // Check reset
        ctx.emit(`    LOAD8 ${rAddr}`);
        ctx.emit(`    JZ ${skipReset}`);

        // Reset: CV := 0, then still update _prev_cu below
        ctx.emit(`    PUSH16 0`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${skipCount}`);

        ctx.emit(`${skipReset}:`);

        // Check for rising edge on CU: CU AND (NOT _prev_cu)
        ctx.emit(`    LOAD8 ${cuAddr}`);
        ctx.emit(`    LOAD8 ${prevCuAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${skipCount}`);

        // Rising edge - increment CV unless it is at the INT maximum (IEC PVmax).
        // NE rather than LT: LOAD16 zero-extends, so a negative CV would look larger than 32767.
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 32767`);
        ctx.emit(`    NE`);
        ctx.emit(`    JZ ${skipCount}`);

        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    STORE16 ${cvAddr}`);

        ctx.emit(`${skipCount}:`);

        // Update _prev_cu on every call, whether or not R was TRUE
        ctx.emit(`    LOAD8 ${cuAddr}`);
        ctx.emit(`    STORE8 ${prevCuAddr}`);

        // Q := (CV >= PV), as signed 16-bit values: LOAD16 zero-extends
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    EXT16`);
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    EXT16`);
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
 * Else on rising edge of CD: CV := CV - 1 (CV stops at -32768, IEC PVmin)
 * Q := (CV <= 0)
 *
 * The edge detector on CD runs on every call, also while LD is TRUE: a pulse that
 * rises during Load is not counted when Load is released.
 *
 * CV and PV are signed 16-bit values: LOAD16 zero-extends, so every comparison
 * sign-extends them first (EXT16).
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
        const skipCount = ctx.newLabel('ctd_skip_count');

        ctx.emit(`    ; --- CTD Count Down Logic (${ctx.instanceName}) ---`);

        // Check load
        ctx.emit(`    LOAD8 ${ldAddr}`);
        ctx.emit(`    JZ ${skipLoad}`);

        // Load: CV := PV, then still update _prev_cd below
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${skipCount}`);

        ctx.emit(`${skipLoad}:`);

        // Check for rising edge on CD
        ctx.emit(`    LOAD8 ${cdAddr}`);
        ctx.emit(`    LOAD8 ${prevCdAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${skipCount}`);

        // Rising edge - decrement CV unless it is at the INT minimum (IEC PVmin).
        // NE against the zero-extended pattern 0x8000 of -32768.
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH32 32768`);
        ctx.emit(`    NE`);
        ctx.emit(`    JZ ${skipCount}`);

        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    SUB`);
        ctx.emit(`    STORE16 ${cvAddr}`);

        ctx.emit(`${skipCount}:`);

        // Update _prev_cd on every call, whether or not LD was TRUE
        ctx.emit(`    LOAD8 ${cdAddr}`);
        ctx.emit(`    STORE8 ${prevCdAddr}`);

        // Q := (CV <= 0), signed
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    EXT16`);
        ctx.emit(`    PUSH8 0`);
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
 * When R is TRUE: CV := 0
 * Else when LD is TRUE: CV := PV
 * Else on rising edge of CU alone: CV := CV + 1 (CV stops at 32767)
 * Else on rising edge of CD alone: CV := CV - 1 (CV stops at -32768, IEC PVmin)
 * QU := (CV >= PV)
 * QD := (CV <= 0)
 *
 * R beats LD, and both beat the count edges. The edge detectors on CU and CD run on
 * every call, also while R or LD is TRUE: a pulse that rises during Reset or Load is
 * not counted when it is released. Rising edges on CU and CD in the same scan cancel.
 *
 * CV and PV are signed 16-bit values: LOAD16 zero-extends, so every comparison
 * sign-extends them first (EXT16).
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
        const checkDown = ctx.newLabel('ctud_check_down');
        const updatePrev = ctx.newLabel('ctud_update_prev');

        // Push 1 if the input has a rising edge: input AND (NOT previous input)
        const emitRisingEdge = (inAddr: string, prevAddr: string): void => {
            ctx.emit(`    LOAD8 ${inAddr}`);
            ctx.emit(`    LOAD8 ${prevAddr}`);
            ctx.emit(`    NOT`);
            ctx.emit(`    PUSH8 1`);
            ctx.emit(`    AND`);
            ctx.emit(`    AND`);
        };

        ctx.emit(`    ; --- CTUD Count Up/Down Logic (${ctx.instanceName}) ---`);

        // Check reset: CV := 0, no counting, but still update _prev_cu and _prev_cd
        ctx.emit(`    LOAD8 ${rAddr}`);
        ctx.emit(`    JZ ${skipReset}`);
        ctx.emit(`    PUSH16 0`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${updatePrev}`);

        ctx.emit(`${skipReset}:`);

        // Check load: CV := PV, no counting, but still update _prev_cu and _prev_cd
        ctx.emit(`    LOAD8 ${ldAddr}`);
        ctx.emit(`    JZ ${skipLoad}`);
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${updatePrev}`);

        ctx.emit(`${skipLoad}:`);

        // Rising edge on CU
        emitRisingEdge(cuAddr, prevCuAddr);
        ctx.emit(`    JZ ${checkDown}`);

        // A rising edge on CD in the same scan cancels it
        emitRisingEdge(cdAddr, prevCdAddr);
        ctx.emit(`    JNZ ${updatePrev}`);

        // Increment unless CV is at the INT maximum (IEC PVmax).
        // NE rather than LT: LOAD16 zero-extends, so a negative CV would look larger than 32767.
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 32767`);
        ctx.emit(`    NE`);
        ctx.emit(`    JZ ${updatePrev}`);

        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    STORE16 ${cvAddr}`);
        ctx.emit(`    JMP ${updatePrev}`);

        ctx.emit(`${checkDown}:`);

        // Rising edge on CD (CU has none here): decrement unless CV is at the INT minimum (IEC PVmin)
        emitRisingEdge(cdAddr, prevCdAddr);
        ctx.emit(`    JZ ${updatePrev}`);

        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH32 32768`);
        ctx.emit(`    NE`);
        ctx.emit(`    JZ ${updatePrev}`);

        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    PUSH16 1`);
        ctx.emit(`    SUB`);
        ctx.emit(`    STORE16 ${cvAddr}`);

        ctx.emit(`${updatePrev}:`);

        // Update _prev_cu and _prev_cd on every call, whatever R and LD were
        ctx.emit(`    LOAD8 ${cuAddr}`);
        ctx.emit(`    STORE8 ${prevCuAddr}`);
        ctx.emit(`    LOAD8 ${cdAddr}`);
        ctx.emit(`    STORE8 ${prevCdAddr}`);

        // QU := (CV >= PV), signed
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    EXT16`);
        ctx.emit(`    LOAD16 ${pvAddr}`);
        ctx.emit(`    EXT16`);
        ctx.emit(`    GE`);
        ctx.emit(`    STORE8 ${quAddr}`);

        // QD := (CV <= 0), signed
        ctx.emit(`    LOAD16 ${cvAddr}`);
        ctx.emit(`    EXT16`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    LE`);
        ctx.emit(`    STORE8 ${qdAddr}`);

        ctx.emit(`    ; --- End CTUD ---`);
    },
};
