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
 *   +15: _prev    (BOOL, 1 byte)  - Internal: IN at the end of the previous call (TP edge detection);
 *                                   not listed in TIMER_MEMBERS, it is not addressable from ST
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
const OFF_PREV = 15;

interface TimerAddrs {
    inAddr: string;
    qAddr: string;
    ptAddr: string;
    etAddr: string;
    startAddr: string;
    runningAddr: string;
    prevAddr: string;
}

function timerAddrs(ctx: CodeGenContext): TimerAddrs {
    const base = ctx.baseAddress;
    return {
        inAddr: formatAddr(base + OFF_IN),
        qAddr: formatAddr(base + OFF_Q),
        ptAddr: formatAddr(base + OFF_PT),
        etAddr: formatAddr(base + OFF_ET),
        startAddr: formatAddr(base + OFF_START),
        runningAddr: formatAddr(base + OFF_RUNNING),
        prevAddr: formatAddr(base + OFF_PREV),
    };
}

/** Store the IN and PT arguments of the call into the instance. */
function storeTimerInputs(ctx: CodeGenContext, params: FBParameter[], a: TimerAddrs): void {
    for (const param of params) {
        if (param.name === 'IN') {
            ctx.emit(`    ; Set ${ctx.instanceName}.IN`);
            ctx.emitExpression(param.value);
            ctx.emit(`    STORE8 ${a.inAddr}`);
        } else if (param.name === 'PT') {
            ctx.emit(`    ; Set ${ctx.instanceName}.PT`);
            ctx.emitExpression(param.value);
            ctx.emit(`    STORE32 ${a.ptAddr}`);
        }
    }
}

/**
 * The part the three timers share: ET := now - _start, held at PT (the elapsed time never passes the
 * preset, IEC 61131-3 timing diagrams). `emitExpired` emits what happens when ET has reached PT; it
 * must leave the stack as it found it and falls through to `end`. The code that follows `end`
 * is the caller's.
 */
function emitElapsedUpdate(ctx: CodeGenContext, a: TimerAddrs, end: string, emitExpired: () => void): void {
    const below = ctx.newLabel('timer_below');
    ctx.emit(`    GET_TICKS`);
    ctx.emit(`    LOAD32 ${a.startAddr}`);
    ctx.emit(`    SUB                 ; [elapsed]`);
    ctx.emit(`    DUP`);
    ctx.emit(`    LOAD32 ${a.ptAddr}`);
    // elapsed < PT as unsigned milliseconds: TIME runs to 49 days, past the sign bit
    ctx.emit(`    LTU                 ; [elapsed elapsed<PT]`);
    ctx.emit(`    JNZ ${below}`);
    ctx.emit(`    DROP`);
    ctx.emit(`    LOAD32 ${a.ptAddr}`);
    ctx.emit(`    STORE32 ${a.etAddr} ; ET stops at PT`);
    emitExpired();
    ctx.emit(`    JMP ${end}`);
    ctx.emit(`${below}:             ; [elapsed]`);
    ctx.emit(`    STORE32 ${a.etAddr}`);
    ctx.emit(`    JMP ${end}`);
}

// ============================================================================
// TON - On-Delay Timer
// ============================================================================

/**
 * TON (On-Delay Timer):
 *
 * When IN rises (FALSE -> TRUE), start timing.
 * ET counts up to PT and stops there; when ET reaches PT, Q is TRUE.
 * When IN is FALSE, ET and Q are reset.
 *
 * Timing diagram:
 *   IN:  __/¯¯¯¯¯¯¯¯¯¯¯¯¯¯\____
 *   Q:   _____/¯¯¯¯¯¯¯¯¯¯¯\____
 *   ET:  ___/¯¯¯¯¯¯¯¯¯¯¯¯¯\____    (a ramp, then held at PT)
 *           |<--- PT --->|
 */
export const TON_FB: FunctionBlockDef = {
    name: 'TON',
    size: TIMER_SIZE,
    members: TIMER_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const a = timerAddrs(ctx);
        storeTimerInputs(ctx, params, a);

        const inFalse = ctx.newLabel('ton_in_false');
        const update = ctx.newLabel('ton_update');
        const tonEnd = ctx.newLabel('ton_end');

        ctx.emit(`    ; --- TON Timer Logic (${ctx.instanceName}) ---`);
        ctx.emit(`    LOAD8 ${a.inAddr}`);
        ctx.emit(`    JZ ${inFalse}`);

        // IN is TRUE: start the timer on the first scan, then measure the elapsed time (a preset of 0 ends at once)
        ctx.emit(`    LOAD8 ${a.runningAddr}`);
        ctx.emit(`    JNZ ${update}`);
        ctx.emit(`    ; Start timer`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${a.startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${a.runningAddr}`);

        ctx.emit(`${update}:`);
        emitElapsedUpdate(ctx, a, tonEnd, () => {
            ctx.emit(`    PUSH8 1`);
            ctx.emit(`    STORE8 ${a.qAddr}`);
        });

        // IN is FALSE: reset
        ctx.emit(`${inFalse}:`);
        ctx.emit(`    ; Reset timer`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${a.runningAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${a.qAddr}`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${a.etAddr}`);

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
 * When IN rises, Q immediately goes TRUE and ET is 0.
 * When IN falls (TRUE -> FALSE), start timing.
 * ET counts up to PT and stops there; when ET reaches PT, Q goes FALSE.
 *
 * Timing diagram:
 *   IN:  __/¯¯¯¯¯¯\__________
 *   Q:   __/¯¯¯¯¯¯¯¯¯¯¯¯¯\___
 *   ET:  _________/¯¯¯¯¯¯\___    (a ramp, then held at PT until IN rises)
 *                 |<- PT ->|
 */
export const TOF_FB: FunctionBlockDef = {
    name: 'TOF',
    size: TIMER_SIZE,
    members: TIMER_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const a = timerAddrs(ctx);
        storeTimerInputs(ctx, params, a);

        const inTrue = ctx.newLabel('tof_in_true');
        const update = ctx.newLabel('tof_update');
        const tofEnd = ctx.newLabel('tof_end');

        ctx.emit(`    ; --- TOF Timer Logic (${ctx.instanceName}) ---`);
        ctx.emit(`    LOAD8 ${a.inAddr}`);
        ctx.emit(`    JNZ ${inTrue}`);

        // IN is FALSE: measure when the delay is running, start it on the falling edge (Q still TRUE)
        ctx.emit(`    LOAD8 ${a.runningAddr}`);
        ctx.emit(`    JNZ ${update}`);
        ctx.emit(`    LOAD8 ${a.qAddr}`);
        ctx.emit(`    JZ ${tofEnd}      ; Q already FALSE: ET holds`);
        ctx.emit(`    ; Start off-delay`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${a.startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${a.runningAddr}`);

        ctx.emit(`${update}:`);
        emitElapsedUpdate(ctx, a, tofEnd, () => {
            ctx.emit(`    PUSH8 0`);
            ctx.emit(`    STORE8 ${a.qAddr}`);
            ctx.emit(`    PUSH8 0`);
            ctx.emit(`    STORE8 ${a.runningAddr}`);
        });

        // IN is TRUE: Q is TRUE, the delay restarts from 0
        ctx.emit(`${inTrue}:`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${a.qAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${a.runningAddr}`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${a.etAddr}`);

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
 * A rising edge of IN (FALSE -> TRUE) while no pulse is running starts a pulse: Q is TRUE for
 * exactly PT. The pulse runs to completion whatever IN does, and IN cannot retrigger it: a new
 * pulse needs a new rising edge after the pulse has ended. ET counts up to PT and stops there; it
 * returns to 0 when the pulse is over and IN is FALSE.
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
        const a = timerAddrs(ctx);
        storeTimerInputs(ctx, params, a);

        const update = ctx.newLabel('tp_update');
        const idleLow = ctx.newLabel('tp_idle_low');
        const keepEt = ctx.newLabel('tp_keep_et');
        const tpEnd = ctx.newLabel('tp_end');

        ctx.emit(`    ; --- TP Pulse Timer Logic (${ctx.instanceName}) ---`);
        ctx.emit(`    LOAD8 ${a.runningAddr}`);
        ctx.emit(`    JNZ ${update}`);

        // No pulse is running: only a rising edge of IN starts one
        ctx.emit(`    LOAD8 ${a.inAddr}`);
        ctx.emit(`    JZ ${idleLow}`);
        ctx.emit(`    LOAD8 ${a.prevAddr}`);
        ctx.emit(`    JNZ ${tpEnd}      ; IN was already TRUE: not an edge`);
        ctx.emit(`    ; Start pulse`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${a.startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${a.runningAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${a.qAddr}`);

        ctx.emit(`${update}:`);
        emitElapsedUpdate(ctx, a, tpEnd, () => {
            ctx.emit(`    ; Pulse complete`);
            ctx.emit(`    PUSH8 0`);
            ctx.emit(`    STORE8 ${a.qAddr}`);
            ctx.emit(`    PUSH8 0`);
            ctx.emit(`    STORE8 ${a.runningAddr}`);
            // ET holds PT only while IN stays TRUE
            ctx.emit(`    LOAD8 ${a.inAddr}`);
            ctx.emit(`    JNZ ${keepEt}`);
            ctx.emit(`    PUSH32 0`);
            ctx.emit(`    STORE32 ${a.etAddr}`);
            ctx.emit(`${keepEt}:`);
        });

        ctx.emit(`${idleLow}:`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${a.etAddr}`);

        ctx.emit(`${tpEnd}:`);
        ctx.emit(`    LOAD8 ${a.inAddr}`);
        ctx.emit(`    STORE8 ${a.prevAddr}`);
        ctx.emit(`    ; --- End TP ---`);
    },
};
