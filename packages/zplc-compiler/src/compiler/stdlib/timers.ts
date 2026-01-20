/**
 * ZPLC Standard Library - Timer Function Blocks
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 Timer Function Blocks:
 * - TON: On-Delay Timer
 * - TOF: Off-Delay Timer
 * - TP: Pulse Timer
 */

import type { FunctionBlockDef, CodeGenContext, MemberDef } from './types.ts';
import type { FBParameter } from '../ast.ts';
import { inputMember, outputMember, internalMember, formatAddr } from './types.ts';

// ============================================================================
// Timer Memory Layout (shared by TON, TOF, TP)
// ============================================================================

/**
 * Timer memory layout:
 *   +0:  IN       (BOOL, 1 byte)  - Input
 *   +1:  Q        (BOOL, 1 byte)  - Output
 *   +2:  PT       (TIME, 4 bytes) - Preset Time
 *   +6:  ET       (TIME, 4 bytes) - Elapsed Time
 *   +10: _start   (TIME, 4 bytes) - Internal: start timestamp
 *   +14: _running (BOOL, 1 byte)  - Internal: timer running flag
 *   +15: _padding (1 byte)
 * Total: 16 bytes (aligned)
 */
const TIMER_MEMBERS: MemberDef[] = [
    inputMember('IN', 1, 0),
    outputMember('Q', 1, 1),
    inputMember('PT', 4, 2),
    outputMember('ET', 4, 6),
    internalMember('_start', 4, 10),
    internalMember('_running', 1, 14),
];

const TIMER_SIZE = 16;

// Offsets for quick access
const OFF_IN = 0;
const OFF_Q = 1;
const OFF_PT = 2;
const OFF_ET = 6;
const OFF_START = 10;
const OFF_RUNNING = 14;

// ============================================================================
// TON - On-Delay Timer
// ============================================================================

/**
 * TON (On-Delay Timer):
 *
 * When IN rises (FALSE -> TRUE), start timing.
 * When ET >= PT, set Q to TRUE.
 * When IN is FALSE, reset ET and Q.
 *
 * Timing diagram:
 *   IN:  __/¯¯¯¯¯¯¯¯¯¯¯¯¯¯\____
 *   Q:   _____/¯¯¯¯¯¯¯¯¯¯¯\____
 *   ET:  ___/¯¯¯¯¯¯¯¯¯¯¯¯¯\____
 *           |<--- PT --->|
 */
export const TON_FB: FunctionBlockDef = {
    name: 'TON',
    size: TIMER_SIZE,
    members: TIMER_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const inAddr = formatAddr(base + OFF_IN);
        const qAddr = formatAddr(base + OFF_Q);
        const ptAddr = formatAddr(base + OFF_PT);
        const etAddr = formatAddr(base + OFF_ET);
        const startAddr = formatAddr(base + OFF_START);
        const runningAddr = formatAddr(base + OFF_RUNNING);

        // Set input parameters
        for (const param of params) {
            if (param.name === 'IN') {
                ctx.emit(`    ; Set ${ctx.instanceName}.IN`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${inAddr}`);
            } else if (param.name === 'PT') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PT`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${ptAddr}`);
            }
        }

        // Generate unique labels
        const inFalse = ctx.newLabel('ton_in_false');
        const checkExpired = ctx.newLabel('ton_check_expired');
        const notExpired = ctx.newLabel('ton_not_expired');
        const tonEnd = ctx.newLabel('ton_end');

        ctx.emit(`    ; --- TON Timer Logic (${ctx.instanceName}) ---`);

        // Check if IN is TRUE
        ctx.emit(`    LOAD8 ${inAddr}`);
        ctx.emit(`    JZ ${inFalse}`);

        // IN is TRUE - check if timer was already running
        ctx.emit(`    LOAD8 ${runningAddr}`);
        ctx.emit(`    JNZ ${checkExpired}`);

        // Not running - start the timer
        ctx.emit(`    ; Start timer`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${runningAddr}`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${etAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    JMP ${tonEnd}`);

        // Timer is running - check if expired
        ctx.emit(`${checkExpired}:`);
        ctx.emit(`    ; Calculate ET`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    LOAD32 ${startAddr}`);
        ctx.emit(`    SUB`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${etAddr}`);

        // Check if ET >= PT
        ctx.emit(`    LOAD32 ${ptAddr}`);
        ctx.emit(`    GE`);
        ctx.emit(`    JZ ${notExpired}`);

        // Timer expired - set Q
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    JMP ${tonEnd}`);

        ctx.emit(`${notExpired}:`);
        ctx.emit(`    JMP ${tonEnd}`);

        // IN is FALSE - reset timer
        ctx.emit(`${inFalse}:`);
        ctx.emit(`    ; Reset timer`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${runningAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${etAddr}`);

        ctx.emit(`${tonEnd}:`);
        ctx.emit(`    ; --- End TON ---`);
    },
};

// ============================================================================
// TOF - Off-Delay Timer
// ============================================================================

/**
 * TOF (Off-Delay Timer):
 *
 * When IN rises, Q immediately goes TRUE.
 * When IN falls (TRUE -> FALSE), start timing.
 * When ET >= PT, set Q to FALSE.
 *
 * Timing diagram:
 *   IN:  __/¯¯¯¯¯¯\__________
 *   Q:   __/¯¯¯¯¯¯¯¯¯¯¯¯¯\___
 *   ET:  _________/¯¯¯¯¯¯\___
 *                 |<- PT ->|
 */
export const TOF_FB: FunctionBlockDef = {
    name: 'TOF',
    size: TIMER_SIZE,
    members: TIMER_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const inAddr = formatAddr(base + OFF_IN);
        const qAddr = formatAddr(base + OFF_Q);
        const ptAddr = formatAddr(base + OFF_PT);
        const etAddr = formatAddr(base + OFF_ET);
        const startAddr = formatAddr(base + OFF_START);
        const runningAddr = formatAddr(base + OFF_RUNNING);

        // Set input parameters
        for (const param of params) {
            if (param.name === 'IN') {
                ctx.emit(`    ; Set ${ctx.instanceName}.IN`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${inAddr}`);
            } else if (param.name === 'PT') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PT`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${ptAddr}`);
            }
        }

        const inTrue = ctx.newLabel('tof_in_true');
        const checkExpired = ctx.newLabel('tof_check_expired');
        const notExpired = ctx.newLabel('tof_not_expired');
        const tofEnd = ctx.newLabel('tof_end');

        ctx.emit(`    ; --- TOF Timer Logic (${ctx.instanceName}) ---`);

        // Check if IN is TRUE
        ctx.emit(`    LOAD8 ${inAddr}`);
        ctx.emit(`    JNZ ${inTrue}`);

        // IN is FALSE - check if timer should start/continue
        ctx.emit(`    LOAD8 ${runningAddr}`);
        ctx.emit(`    JNZ ${checkExpired}`);

        // Check if Q is currently TRUE (falling edge detection)
        ctx.emit(`    LOAD8 ${qAddr}`);
        ctx.emit(`    JZ ${tofEnd}`);  // Q already FALSE, nothing to do

        // Start the off-delay timer
        ctx.emit(`    ; Start off-delay`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${runningAddr}`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${etAddr}`);
        ctx.emit(`    JMP ${tofEnd}`);

        // Timer running - check if expired
        ctx.emit(`${checkExpired}:`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    LOAD32 ${startAddr}`);
        ctx.emit(`    SUB`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${etAddr}`);
        ctx.emit(`    LOAD32 ${ptAddr}`);
        ctx.emit(`    GE`);
        ctx.emit(`    JZ ${notExpired}`);

        // Timer expired - set Q to FALSE
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${runningAddr}`);
        ctx.emit(`    JMP ${tofEnd}`);

        ctx.emit(`${notExpired}:`);
        ctx.emit(`    JMP ${tofEnd}`);

        // IN is TRUE - Q is TRUE, reset timer
        ctx.emit(`${inTrue}:`);
        ctx.emit(`    ; IN TRUE - Q := TRUE, reset timer`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${runningAddr}`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${etAddr}`);

        ctx.emit(`${tofEnd}:`);
        ctx.emit(`    ; --- End TOF ---`);
    },
};

// ============================================================================
// TP - Pulse Timer
// ============================================================================

/**
 * TP (Pulse Timer):
 *
 * When IN rises, Q goes TRUE for exactly PT time.
 * Once started, the pulse runs to completion regardless of IN.
 *
 * Timing diagram:
 *   IN:  __/¯\____/¯¯¯¯\______
 *   Q:   __/¯¯¯¯¯¯¯\__/¯¯¯¯¯¯¯\
 *   ET:  __/¯¯¯¯¯¯¯\__/¯¯¯¯¯¯¯\
 *          |<- PT ->| |<- PT ->|
 */
export const TP_FB: FunctionBlockDef = {
    name: 'TP',
    size: TIMER_SIZE,
    members: TIMER_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const inAddr = formatAddr(base + OFF_IN);
        const qAddr = formatAddr(base + OFF_Q);
        const ptAddr = formatAddr(base + OFF_PT);
        const etAddr = formatAddr(base + OFF_ET);
        const startAddr = formatAddr(base + OFF_START);
        const runningAddr = formatAddr(base + OFF_RUNNING);

        // Set input parameters
        for (const param of params) {
            if (param.name === 'IN') {
                ctx.emit(`    ; Set ${ctx.instanceName}.IN`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${inAddr}`);
            } else if (param.name === 'PT') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PT`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${ptAddr}`);
            }
        }

        const checkExpired = ctx.newLabel('tp_check_expired');
        const tpEnd = ctx.newLabel('tp_end');

        ctx.emit(`    ; --- TP Pulse Timer Logic (${ctx.instanceName}) ---`);

        // Check if timer is currently running
        ctx.emit(`    LOAD8 ${runningAddr}`);
        ctx.emit(`    JNZ ${checkExpired}`);

        // Not running - check for rising edge on IN
        ctx.emit(`    LOAD8 ${inAddr}`);
        ctx.emit(`    JZ ${tpEnd}`);  // IN is FALSE, nothing to do

        // Rising edge detected - start pulse
        ctx.emit(`    ; Start pulse`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${runningAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${etAddr}`);
        ctx.emit(`    JMP ${tpEnd}`);

        // Timer running - check if expired
        ctx.emit(`${checkExpired}:`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    LOAD32 ${startAddr}`);
        ctx.emit(`    SUB`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${etAddr}`);
        ctx.emit(`    LOAD32 ${ptAddr}`);
        ctx.emit(`    GE`);
        ctx.emit(`    JZ ${tpEnd}`);  // Not expired yet

        // Pulse complete
        ctx.emit(`    ; Pulse complete`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${runningAddr}`);

        ctx.emit(`${tpEnd}:`);
        ctx.emit(`    ; --- End TP ---`);
    },
};
