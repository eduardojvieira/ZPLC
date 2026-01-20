/**
 * ZPLC Standard Library - System Functions
 *
 * SPDX-License-Identifier: MIT
 *
 * System-level functions and utilities:
 * - UPTIME: Get system uptime in milliseconds
 * - FIFO: First-In-First-Out buffer
 * - LIFO: Last-In-First-Out buffer (stack)
 * - SR_LATCH: Set-Reset Latch with edge detection
 */

import type { FunctionDef, FunctionBlockDef, CodeGenContext, MemberDef } from './types.ts';
import { inputMember, outputMember, internalMember, formatAddr } from './types.ts';
import type { FBParameter, Expression } from '../ast.ts';

// ============================================================================
// UPTIME - System Uptime Function
// ============================================================================

/**
 * UPTIME() : DINT
 *
 * Returns the system uptime in milliseconds since boot.
 * This is a wrapper around the GET_TICKS opcode.
 *
 * Usage in ST:
 *   ms := UPTIME();
 */
export const UPTIME_FN: FunctionDef = {
    name: 'UPTIME',
    argCount: 0,
    variadic: false,

    generateInline(ctx: CodeGenContext, _args: Expression[]): void {
        ctx.emit(`    ; UPTIME() - Get system uptime in ms`);
        ctx.emit(`    GET_TICKS`);
    }
};

// ============================================================================
// FIFO - First-In-First-Out Buffer
// ============================================================================

/**
 * FIFO Function Block
 *
 * A circular buffer that stores DINT values.
 * Push adds to tail, Pop removes from head.
 *
 * Memory Layout (20 bytes base + buffer):
 *   +0: PUSH (BOOL, 1) - Push trigger (edge-detected)
 *   +1: POP (BOOL, 1) - Pop trigger (edge-detected)
 *   +2: RST (BOOL, 1) - Reset trigger
 *   +3: EMPTY (BOOL, 1) - Buffer is empty
 *   +4: FULL (BOOL, 1) - Buffer is full
 *   +5: reserved (1)
 *   +6: DATA_IN (DINT, 4) - Value to push
 *  +10: DATA_OUT (DINT, 4) - Last popped value
 *  +14: COUNT (DINT, 4) - Current item count
 *  +18: _head (DINT, 4) - Internal head index
 *  +22: _tail (DINT, 4) - Internal tail index
 *  +26: _push_prev (BOOL, 1) - Previous PUSH state
 *  +27: _pop_prev (BOOL, 1) - Previous POP state
 *  +28: SIZE (DINT, 4) - Buffer capacity (set once)
 *  +32: Buffer starts here...
 *
 * Total: 32 bytes + (SIZE * 4) bytes for buffer
 * Default SIZE = 8 -> 64 bytes total
 */

const FIFO_MEMBERS: MemberDef[] = [
    inputMember('PUSH', 1, 0),
    inputMember('POP', 1, 1),
    inputMember('RST', 1, 2),
    outputMember('EMPTY', 1, 3),
    outputMember('FULL', 1, 4),
    // reserved byte at 5
    inputMember('DATA_IN', 4, 6),
    outputMember('DATA_OUT', 4, 10),
    outputMember('COUNT', 4, 14),
    internalMember('_head', 4, 18),
    internalMember('_tail', 4, 22),
    internalMember('_push_prev', 1, 26),
    internalMember('_pop_prev', 1, 27),
    inputMember('SIZE', 4, 28),
];

export const FIFO_FB: FunctionBlockDef = {
    name: 'FIFO',
    size: 64, // 32 header + 8*4 buffer (default size 8)
    members: FIFO_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const name = ctx.instanceName;

        // Address offsets
        const PUSH = base + 0;
        const POP = base + 1;
        const RST = base + 2;
        const EMPTY = base + 3;
        const FULL = base + 4;
        const DATA_IN = base + 6;
        const DATA_OUT = base + 10;
        const COUNT = base + 14;
        const HEAD = base + 18;
        const TAIL = base + 22;
        const PUSH_PREV = base + 26;
        const POP_PREV = base + 27;
        const SIZE = base + 28;
        const BUFFER = base + 32;

        // Labels
        const lblReset = ctx.newLabel('fifo_rst');
        const lblNoReset = ctx.newLabel('fifo_no_rst');
        const lblCheckPush = ctx.newLabel('fifo_check_push');
        const lblNoPush = ctx.newLabel('fifo_no_push');
        const lblCheckPop = ctx.newLabel('fifo_check_pop');
        const lblNoPop = ctx.newLabel('fifo_no_pop');
        const lblUpdateFlags = ctx.newLabel('fifo_update_flags');
        const lblEnd = ctx.newLabel('fifo_end');

        ctx.emit(`    ; --- FIFO Logic (${name}) ---`);

        // Store input parameters
        for (const p of params) {
            if (p.name === 'PUSH') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE8 ${formatAddr(PUSH)}`);
            } else if (p.name === 'POP') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE8 ${formatAddr(POP)}`);
            } else if (p.name === 'RST') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE8 ${formatAddr(RST)}`);
            } else if (p.name === 'DATA_IN') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(DATA_IN)}`);
            } else if (p.name === 'SIZE') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(SIZE)}`);
            }
        }

        // Check RST
        ctx.emit(`    LOAD8 ${formatAddr(RST)}`);
        ctx.emit(`    JZ ${lblNoReset}`);

        // Reset: clear head, tail, count
        ctx.emit(`${lblReset}:`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${formatAddr(HEAD)}`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${formatAddr(TAIL)}`);
        ctx.emit(`    STORE32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE8 ${formatAddr(PUSH_PREV)}`);
        ctx.emit(`    STORE8 ${formatAddr(POP_PREV)}`);
        ctx.emit(`    JMP ${lblUpdateFlags}`);

        ctx.emit(`${lblNoReset}:`);

        // Check PUSH rising edge: PUSH AND NOT _push_prev
        ctx.emit(`${lblCheckPush}:`);
        ctx.emit(`    LOAD8 ${formatAddr(PUSH)}`);
        ctx.emit(`    DUP`);
        ctx.emit(`    LOAD8 ${formatAddr(PUSH_PREV)}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${lblNoPush}`);

        // Check if not FULL
        ctx.emit(`    LOAD8 ${formatAddr(FULL)}`);
        ctx.emit(`    JNZ ${lblNoPush}`);

        // Push: buffer[tail] = DATA_IN, tail = (tail + 1) % SIZE, count++
        ctx.emit(`    ; Push DATA_IN to buffer[tail]`);
        // Calculate address: BUFFER + (tail * 4)
        ctx.emit(`    PUSH16 ${BUFFER}`);
        ctx.emit(`    LOAD32 ${formatAddr(TAIL)}`);
        ctx.emit(`    PUSH8 4`);
        ctx.emit(`    MUL`);
        ctx.emit(`    ADD`);
        // Stack: [addr]
        ctx.emit(`    LOAD32 ${formatAddr(DATA_IN)}`);
        // Stack: [addr value]
        ctx.emit(`    STOREI32`);
        // Stack: []

        // Increment tail (simplified without modulo for now)
        ctx.emit(`    LOAD32 ${formatAddr(TAIL)}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    LOAD32 ${formatAddr(SIZE)}`);
        ctx.emit(`    MOD`);
        ctx.emit(`    STORE32 ${formatAddr(TAIL)}`);

        // Increment count
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    STORE32 ${formatAddr(COUNT)}`);

        ctx.emit(`${lblNoPush}:`);
        // Update _push_prev
        ctx.emit(`    LOAD8 ${formatAddr(PUSH)}`);
        ctx.emit(`    STORE8 ${formatAddr(PUSH_PREV)}`);

        // Check POP rising edge
        ctx.emit(`${lblCheckPop}:`);
        ctx.emit(`    LOAD8 ${formatAddr(POP)}`);
        ctx.emit(`    DUP`);
        ctx.emit(`    LOAD8 ${formatAddr(POP_PREV)}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${lblNoPop}`);

        // Check if not EMPTY
        ctx.emit(`    LOAD8 ${formatAddr(EMPTY)}`);
        ctx.emit(`    JNZ ${lblNoPop}`);

        // Pop: DATA_OUT = buffer[head], head = (head + 1) % SIZE, count--
        ctx.emit(`    ; Pop buffer[head] to DATA_OUT`);
        // Calculate address: BUFFER + (head * 4)
        ctx.emit(`    PUSH16 ${BUFFER}`);
        ctx.emit(`    LOAD32 ${formatAddr(HEAD)}`);
        ctx.emit(`    PUSH8 4`);
        ctx.emit(`    MUL`);
        ctx.emit(`    ADD`);
        // Stack: [addr]
        ctx.emit(`    LOADI32`);
        // Stack: [value]
        ctx.emit(`    STORE32 ${formatAddr(DATA_OUT)}`);

        // Increment head
        ctx.emit(`    LOAD32 ${formatAddr(HEAD)}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    LOAD32 ${formatAddr(SIZE)}`);
        ctx.emit(`    MOD`);
        ctx.emit(`    STORE32 ${formatAddr(HEAD)}`);

        // Decrement count
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    SUB`);
        ctx.emit(`    STORE32 ${formatAddr(COUNT)}`);

        ctx.emit(`${lblNoPop}:`);
        // Update _pop_prev
        ctx.emit(`    LOAD8 ${formatAddr(POP)}`);
        ctx.emit(`    STORE8 ${formatAddr(POP_PREV)}`);

        // Update EMPTY and FULL flags
        ctx.emit(`${lblUpdateFlags}:`);
        ctx.emit(`    ; EMPTY = (COUNT == 0)`);
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    EQ`);
        ctx.emit(`    STORE8 ${formatAddr(EMPTY)}`);

        ctx.emit(`    ; FULL = (COUNT >= SIZE)`);
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    LOAD32 ${formatAddr(SIZE)}`);
        ctx.emit(`    GE`);
        ctx.emit(`    STORE8 ${formatAddr(FULL)}`);

        ctx.emit(`${lblEnd}:`);
        ctx.emit(`    ; --- End FIFO ---`);
    }
};

// ============================================================================
// LIFO - Last-In-First-Out Buffer (Stack)
// ============================================================================

/**
 * LIFO Function Block
 *
 * A stack that stores DINT values.
 * Push adds to top, Pop removes from top.
 *
 * Memory Layout (24 bytes base + buffer):
 *   +0: PUSH (BOOL, 1) - Push trigger (edge-detected)
 *   +1: POP (BOOL, 1) - Pop trigger (edge-detected)
 *   +2: RST (BOOL, 1) - Reset trigger
 *   +3: EMPTY (BOOL, 1) - Buffer is empty
 *   +4: FULL (BOOL, 1) - Buffer is full
 *   +5: reserved (1)
 *   +6: DATA_IN (DINT, 4) - Value to push
 *  +10: DATA_OUT (DINT, 4) - Last popped value
 *  +14: COUNT (DINT, 4) - Current item count (also = top index)
 *  +18: _push_prev (BOOL, 1) - Previous PUSH state
 *  +19: _pop_prev (BOOL, 1) - Previous POP state
 *  +20: SIZE (DINT, 4) - Buffer capacity
 *  +24: Buffer starts here...
 *
 * Total: 24 bytes + (SIZE * 4) bytes for buffer
 * Default SIZE = 8 -> 56 bytes total
 */

const LIFO_MEMBERS: MemberDef[] = [
    inputMember('PUSH', 1, 0),
    inputMember('POP', 1, 1),
    inputMember('RST', 1, 2),
    outputMember('EMPTY', 1, 3),
    outputMember('FULL', 1, 4),
    // reserved byte at 5
    inputMember('DATA_IN', 4, 6),
    outputMember('DATA_OUT', 4, 10),
    outputMember('COUNT', 4, 14),
    internalMember('_push_prev', 1, 18),
    internalMember('_pop_prev', 1, 19),
    inputMember('SIZE', 4, 20),
];

export const LIFO_FB: FunctionBlockDef = {
    name: 'LIFO',
    size: 56, // 24 header + 8*4 buffer (default size 8)
    members: LIFO_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const name = ctx.instanceName;

        // Address offsets
        const PUSH = base + 0;
        const POP = base + 1;
        const RST = base + 2;
        const EMPTY = base + 3;
        const FULL = base + 4;
        const DATA_IN = base + 6;
        const DATA_OUT = base + 10;
        const COUNT = base + 14;
        const PUSH_PREV = base + 18;
        const POP_PREV = base + 19;
        const SIZE = base + 20;
        const BUFFER = base + 24;

        // Labels
        const lblNoReset = ctx.newLabel('lifo_no_rst');
        const lblNoPush = ctx.newLabel('lifo_no_push');
        const lblNoPop = ctx.newLabel('lifo_no_pop');
        const lblUpdateFlags = ctx.newLabel('lifo_update_flags');
        const lblEnd = ctx.newLabel('lifo_end');

        ctx.emit(`    ; --- LIFO Logic (${name}) ---`);

        // Store input parameters
        for (const p of params) {
            if (p.name === 'PUSH') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE8 ${formatAddr(PUSH)}`);
            } else if (p.name === 'POP') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE8 ${formatAddr(POP)}`);
            } else if (p.name === 'RST') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE8 ${formatAddr(RST)}`);
            } else if (p.name === 'DATA_IN') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(DATA_IN)}`);
            } else if (p.name === 'SIZE') {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(SIZE)}`);
            }
        }

        // Check RST
        ctx.emit(`    LOAD8 ${formatAddr(RST)}`);
        ctx.emit(`    JZ ${lblNoReset}`);

        // Reset: clear count
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE8 ${formatAddr(PUSH_PREV)}`);
        ctx.emit(`    STORE8 ${formatAddr(POP_PREV)}`);
        ctx.emit(`    JMP ${lblUpdateFlags}`);

        ctx.emit(`${lblNoReset}:`);

        // Check PUSH rising edge
        ctx.emit(`    LOAD8 ${formatAddr(PUSH)}`);
        ctx.emit(`    DUP`);
        ctx.emit(`    LOAD8 ${formatAddr(PUSH_PREV)}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${lblNoPush}`);

        // Check if not FULL
        ctx.emit(`    LOAD8 ${formatAddr(FULL)}`);
        ctx.emit(`    JNZ ${lblNoPush}`);

        // Push: buffer[count] = DATA_IN, count++
        ctx.emit(`    ; Push DATA_IN to buffer[count]`);
        // Calculate address: BUFFER + (count * 4)
        ctx.emit(`    PUSH16 ${BUFFER}`);
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 4`);
        ctx.emit(`    MUL`);
        ctx.emit(`    ADD`);
        // Stack: [addr]
        ctx.emit(`    LOAD32 ${formatAddr(DATA_IN)}`);
        // Stack: [addr value]
        ctx.emit(`    STOREI32`);
        // Stack: []

        // Increment count
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    ADD`);
        ctx.emit(`    STORE32 ${formatAddr(COUNT)}`);

        ctx.emit(`${lblNoPush}:`);
        ctx.emit(`    LOAD8 ${formatAddr(PUSH)}`);
        ctx.emit(`    STORE8 ${formatAddr(PUSH_PREV)}`);

        // Check POP rising edge
        ctx.emit(`    LOAD8 ${formatAddr(POP)}`);
        ctx.emit(`    DUP`);
        ctx.emit(`    LOAD8 ${formatAddr(POP_PREV)}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    AND`);
        ctx.emit(`    JZ ${lblNoPop}`);

        // Check if not EMPTY
        ctx.emit(`    LOAD8 ${formatAddr(EMPTY)}`);
        ctx.emit(`    JNZ ${lblNoPop}`);

        // Pop: count--, DATA_OUT = buffer[count]
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    SUB`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${formatAddr(COUNT)}`);

        ctx.emit(`    ; Pop buffer[count] to DATA_OUT`);
        // Calculate address: BUFFER + (count * 4)
        // count is already on stack
        ctx.emit(`    PUSH8 4`);
        ctx.emit(`    MUL`);
        ctx.emit(`    PUSH16 ${BUFFER}`);
        ctx.emit(`    ADD`);
        // Stack: [addr]
        ctx.emit(`    LOADI32`);
        // Stack: [value]
        ctx.emit(`    STORE32 ${formatAddr(DATA_OUT)}`);

        ctx.emit(`${lblNoPop}:`);
        ctx.emit(`    LOAD8 ${formatAddr(POP)}`);
        ctx.emit(`    STORE8 ${formatAddr(POP_PREV)}`);

        // Update EMPTY and FULL flags
        ctx.emit(`${lblUpdateFlags}:`);
        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    EQ`);
        ctx.emit(`    STORE8 ${formatAddr(EMPTY)}`);

        ctx.emit(`    LOAD32 ${formatAddr(COUNT)}`);
        ctx.emit(`    LOAD32 ${formatAddr(SIZE)}`);
        ctx.emit(`    GE`);
        ctx.emit(`    STORE8 ${formatAddr(FULL)}`);

        ctx.emit(`${lblEnd}:`);
        ctx.emit(`    ; --- End LIFO ---`);
    }
};

// ============================================================================
// CYCLE_TIME - Get Last Cycle Execution Time
// ============================================================================

/**
 * CYCLE_TIME() : DINT
 *
 * Returns the execution time of the last PLC cycle in microseconds.
 * Reads from system register at IPI offset 0x0FF0 (ZPLC_SYS_CYCLE_TIME).
 *
 * The scheduler updates this value BEFORE each task cycle, so the program
 * can monitor its own execution time from the previous cycle.
 *
 * Usage in ST:
 *   last_cycle := CYCLE_TIME();
 *   IF last_cycle > 5000 THEN  (* More than 5ms *)
 *       cycle_warning := TRUE;
 *   END_IF;
 */
export const CYCLE_TIME_FN: FunctionDef = {
    name: 'CYCLE_TIME',
    argCount: 0,
    variadic: false,

    generateInline(ctx: CodeGenContext, _args: Expression[]): void {
        ctx.emit(`    ; CYCLE_TIME() - Read last cycle execution time from system registers`);
        ctx.emit(`    LOAD32 0x0FF0`);  // ZPLC_SYS_CYCLE_TIME in IPI
    }
};

// ============================================================================
// WATCHDOG_RESET - Reset Watchdog Timer
// ============================================================================

/**
 * WATCHDOG_RESET()
 *
 * Resets the software watchdog timer.
 * Note: This is a stub - actual implementation depends on HAL.
 */
export const WATCHDOG_RESET_FN: FunctionDef = {
    name: 'WATCHDOG_RESET',
    argCount: 0,
    variadic: false,

    generateInline(ctx: CodeGenContext, _args: Expression[]): void {
        ctx.emit(`    ; WATCHDOG_RESET() - Reset watchdog (stub)`);
        ctx.emit(`    ; TODO: Requires HAL integration`);
        ctx.emit(`    NOP`);
    }
};
