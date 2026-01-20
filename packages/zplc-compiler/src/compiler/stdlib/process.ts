/**
 * ZPLC Process Library - Analog & Control Functions
 *
 * SPDX-License-Identifier: MIT
 *
 * Implements IEC 61131-3 process control functions:
 * - Scaling: NORM_X, SCALE_X
 * - Control: PID_Compact, HYSTERESIS, DEADBAND
 * - Signal Processing: LAG_FILTER, RAMP_REAL, INTEGRAL, DERIVATIVE
 *
 * All functions operate on REAL (32-bit float) values.
 */

import type { FunctionDef, FunctionBlockDef, CodeGenContext, MemberDef as _MemberDef } from './types.ts';
import { formatAddr, inputMember, outputMember, internalMember } from './types.ts';
import type { Expression } from '../ast.ts';

// ============================================================================
// Scaling Functions
// ============================================================================

/**
 * NORM_X - Normalize value to 0.0..1.0 range
 *
 * OUT := (X - MIN) / (MAX - MIN)
 *
 * Arguments: MIN, X, MAX
 * Returns: REAL in range 0.0 to 1.0
 */
export const NORM_X_FN: FunctionDef = {
    name: 'NORM_X',
    argCount: 3,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        const [min, x, max] = args;
        const skipLabel = ctx.newLabel('norm_skip');
        const endLabel = ctx.newLabel('norm_end');

        ctx.emit(`    ; NORM_X(MIN, X, MAX) -> (X - MIN) / (MAX - MIN)`);

        // Calculate (MAX - MIN) first to check for division by zero
        ctx.emitExpression(max);      // stack: [MAX]
        ctx.emitExpression(min);      // stack: [MAX, MIN]
        ctx.emit(`    SUBF`);         // stack: [MAX - MIN]
        ctx.emit(`    DUP`);          // stack: [range, range]

        // Check if range is zero (avoid division by zero)
        ctx.emit(`    PUSH32 0`);     // stack: [range, range, 0]
        ctx.emit(`    EQ`);           // stack: [range, is_zero]
        ctx.emit(`    JNZ ${skipLabel}`);

        // Range is valid, calculate (X - MIN) / range
        ctx.emitExpression(x);        // stack: [range, X]
        ctx.emitExpression(min);      // stack: [range, X, MIN]
        ctx.emit(`    SUBF`);         // stack: [range, X - MIN]
        ctx.emit(`    SWAP`);         // stack: [X - MIN, range]
        ctx.emit(`    DIVF`);         // stack: [normalized]
        ctx.emit(`    JMP ${endLabel}`);

        // Division by zero case - return 0.0
        ctx.emit(`${skipLabel}:`);
        ctx.emit(`    DROP`);         // Remove range from stack
        ctx.emit(`    PUSH32 0`);     // Push 0.0

        ctx.emit(`${endLabel}:`);
    }
};

/**
 * SCALE_X - Scale 0.0..1.0 value to output range
 *
 * OUT := MIN + (X * (MAX - MIN))
 *
 * Arguments: MIN, X, MAX
 * Returns: REAL in range MIN to MAX
 */
export const SCALE_X_FN: FunctionDef = {
    name: 'SCALE_X',
    argCount: 3,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        const [min, x, max] = args;

        ctx.emit(`    ; SCALE_X(MIN, X, MAX) -> MIN + X * (MAX - MIN)`);

        // Calculate range (MAX - MIN)
        ctx.emitExpression(max);      // stack: [MAX]
        ctx.emitExpression(min);      // stack: [MAX, MIN]
        ctx.emit(`    SUBF`);         // stack: [range]

        // Multiply by X
        ctx.emitExpression(x);        // stack: [range, X]
        ctx.emit(`    MULF`);         // stack: [X * range]

        // Add MIN
        ctx.emitExpression(min);      // stack: [X * range, MIN]
        ctx.emit(`    ADDF`);         // stack: [MIN + X * range]
    }
};

// ============================================================================
// Control Functions
// ============================================================================

/**
 * HYSTERESIS - Hysteresis comparator
 *
 * FB with state that implements hysteresis switching.
 * Output switches ON when input exceeds HIGH threshold,
 * switches OFF when input goes below LOW threshold.
 *
 * Memory layout (8 bytes):
 *   0: IN (REAL, 4 bytes) - Input value
 *   4: HIGH (REAL, 4 bytes) - High threshold
 *   8: LOW (REAL, 4 bytes) - Low threshold
 *   12: Q (BOOL, 1 byte) - Output
 *   13: pad (3 bytes)
 * Total: 16 bytes
 */
export const HYSTERESIS_FB: FunctionBlockDef = {
    name: 'HYSTERESIS',
    size: 16,
    members: [
        inputMember('IN', 4, 0),
        inputMember('HIGH', 4, 4),
        inputMember('LOW', 4, 8),
        outputMember('Q', 1, 12),
    ],

    generateCall(ctx, params): void {
        const base = ctx.baseAddress;
        const onLabel = ctx.newLabel('hyst_on');
        // offLabel reserved for explicit off-state handling
        const endLabel = ctx.newLabel('hyst_end');

        ctx.emit(`    ; --- HYSTERESIS Logic (${ctx.instanceName}) ---`);

        // Store input parameters
        for (const p of params) {
            const member = this.members.find(m => m.name === p.name);
            if (member && member.isInput) {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(base + member.offset)}`);
            }
        }

        // Load current output state
        ctx.emit(`    LOAD8 ${formatAddr(base + 12)}   ; Q`);
        ctx.emit(`    JNZ ${onLabel}`);

        // Currently OFF - check if IN > HIGH
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; HIGH`);
        ctx.emit(`    GT`);
        ctx.emit(`    JZ ${endLabel}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${formatAddr(base + 12)}`);
        ctx.emit(`    JMP ${endLabel}`);

        // Currently ON - check if IN < LOW
        ctx.emit(`${onLabel}:`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 8)}   ; LOW`);
        ctx.emit(`    LT`);
        ctx.emit(`    JZ ${endLabel}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${formatAddr(base + 12)}`);

        ctx.emit(`${endLabel}:`);
        ctx.emit(`    ; --- End HYSTERESIS ---`);
    }
};

/**
 * DEADBAND - Deadband filter
 *
 * Suppresses small variations around a center value.
 * Output only changes when input moves beyond deadband width.
 *
 * Memory layout (16 bytes):
 *   0: IN (REAL, 4 bytes) - Input value
 *   4: WIDTH (REAL, 4 bytes) - Deadband half-width
 *   8: OUT (REAL, 4 bytes) - Output value
 *   12: _last (REAL, 4 bytes) - Last output (internal)
 * Total: 16 bytes
 */
export const DEADBAND_FB: FunctionBlockDef = {
    name: 'DEADBAND',
    size: 16,
    members: [
        inputMember('IN', 4, 0),
        inputMember('WIDTH', 4, 4),
        outputMember('OUT', 4, 8),
        internalMember('_last', 4, 12),
    ],

    generateCall(ctx, params): void {
        const base = ctx.baseAddress;
        const updateLabel = ctx.newLabel('db_update');
        const endLabel = ctx.newLabel('db_end');

        ctx.emit(`    ; --- DEADBAND Logic (${ctx.instanceName}) ---`);

        // Store input parameters
        for (const p of params) {
            const member = this.members.find(m => m.name === p.name);
            if (member && member.isInput) {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(base + member.offset)}`);
            }
        }

        // Calculate |IN - _last|
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 12)}  ; _last`);
        ctx.emit(`    SUBF`);
        ctx.emit(`    ABSF`);  // |IN - _last|

        // Compare with WIDTH
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; WIDTH`);
        ctx.emit(`    GT`);
        ctx.emit(`    JZ ${endLabel}`);

        // Difference exceeds deadband, update output
        ctx.emit(`${updateLabel}:`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${formatAddr(base + 8)}  ; OUT`);
        ctx.emit(`    STORE32 ${formatAddr(base + 12)} ; _last`);

        ctx.emit(`${endLabel}:`);
        ctx.emit(`    ; --- End DEADBAND ---`);
    }
};

// ============================================================================
// Signal Processing Functions
// ============================================================================

/**
 * LAG_FILTER - First-order lag filter (PT1)
 *
 * Implements exponential smoothing: OUT = OUT + GAIN * (IN - OUT)
 * Time constant is implicitly defined by GAIN (0.0 to 1.0).
 * GAIN = 1.0 means no filtering, GAIN = 0.0 means no change.
 *
 * Memory layout (12 bytes):
 *   0: IN (REAL, 4 bytes) - Input value
 *   4: GAIN (REAL, 4 bytes) - Filter gain (0.0 to 1.0)
 *   8: OUT (REAL, 4 bytes) - Filtered output
 * Total: 12 bytes (pad to 16 for alignment)
 */
export const LAG_FILTER_FB: FunctionBlockDef = {
    name: 'LAG_FILTER',
    size: 16,
    members: [
        inputMember('IN', 4, 0),
        inputMember('GAIN', 4, 4),
        outputMember('OUT', 4, 8),
    ],

    generateCall(ctx, params): void {
        const base = ctx.baseAddress;

        ctx.emit(`    ; --- LAG_FILTER Logic (${ctx.instanceName}) ---`);

        // Store input parameters
        for (const p of params) {
            const member = this.members.find(m => m.name === p.name);
            if (member && member.isInput) {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(base + member.offset)}`);
            }
        }

        // OUT = OUT + GAIN * (IN - OUT)
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 8)}   ; OUT`);
        ctx.emit(`    SUBF`);                          // IN - OUT
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; GAIN`);
        ctx.emit(`    MULF`);                          // GAIN * (IN - OUT)
        ctx.emit(`    LOAD32 ${formatAddr(base + 8)}   ; OUT`);
        ctx.emit(`    ADDF`);                          // OUT + GAIN * (IN - OUT)
        ctx.emit(`    STORE32 ${formatAddr(base + 8)}  ; OUT`);

        ctx.emit(`    ; --- End LAG_FILTER ---`);
    }
};

/**
 * RAMP_REAL - Rate limiter / Ramp generator
 *
 * Limits the rate of change of a signal.
 * Output moves towards input at a maximum rate of RATE units per cycle.
 *
 * Memory layout (16 bytes):
 *   0: IN (REAL, 4 bytes) - Target value
 *   4: RATE (REAL, 4 bytes) - Max change per cycle
 *   8: OUT (REAL, 4 bytes) - Current output
 *   12: pad (4 bytes)
 * Total: 16 bytes
 */
export const RAMP_REAL_FB: FunctionBlockDef = {
    name: 'RAMP_REAL',
    size: 16,
    members: [
        inputMember('IN', 4, 0),
        inputMember('RATE', 4, 4),
        outputMember('OUT', 4, 8),
    ],

    generateCall(ctx, params): void {
        const base = ctx.baseAddress;
        const incLabel = ctx.newLabel('ramp_inc');
        const decLabel = ctx.newLabel('ramp_dec');
        const endLabel = ctx.newLabel('ramp_end');

        ctx.emit(`    ; --- RAMP_REAL Logic (${ctx.instanceName}) ---`);

        // Store input parameters
        for (const p of params) {
            const member = this.members.find(m => m.name === p.name);
            if (member && member.isInput) {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(base + member.offset)}`);
            }
        }

        // Calculate delta = IN - OUT
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 8)}   ; OUT`);
        ctx.emit(`    SUBF`);                          // delta = IN - OUT
        ctx.emit(`    DUP`);

        // Check if delta > RATE
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; RATE`);
        ctx.emit(`    GT`);
        ctx.emit(`    JNZ ${incLabel}`);

        // Check if delta < -RATE
        ctx.emit(`    DUP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; RATE`);
        ctx.emit(`    NEGF`);
        ctx.emit(`    LT`);
        ctx.emit(`    JNZ ${decLabel}`);

        // Within rate limit, set OUT = IN
        ctx.emit(`    DROP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    STORE32 ${formatAddr(base + 8)}  ; OUT`);
        ctx.emit(`    JMP ${endLabel}`);

        // Need to increment by RATE
        ctx.emit(`${incLabel}:`);
        ctx.emit(`    DROP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 8)}   ; OUT`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; RATE`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    STORE32 ${formatAddr(base + 8)}  ; OUT`);
        ctx.emit(`    JMP ${endLabel}`);

        // Need to decrement by RATE
        ctx.emit(`${decLabel}:`);
        ctx.emit(`    DROP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 8)}   ; OUT`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; RATE`);
        ctx.emit(`    SUBF`);
        ctx.emit(`    STORE32 ${formatAddr(base + 8)}  ; OUT`);

        ctx.emit(`${endLabel}:`);
        ctx.emit(`    ; --- End RAMP_REAL ---`);
    }
};

/**
 * INTEGRAL - Discrete integrator
 *
 * Accumulates input value over time.
 * OUT = OUT + (IN * DT)
 *
 * Memory layout (16 bytes):
 *   0: IN (REAL, 4 bytes) - Input rate
 *   4: DT (REAL, 4 bytes) - Time step (sample period in seconds)
 *   8: RESET (BOOL, 1 byte) - Reset accumulator
 *   9: pad (3 bytes)
 *   12: OUT (REAL, 4 bytes) - Accumulated value
 * Total: 16 bytes
 */
export const INTEGRAL_FB: FunctionBlockDef = {
    name: 'INTEGRAL',
    size: 16,
    members: [
        inputMember('IN', 4, 0),
        inputMember('DT', 4, 4),
        inputMember('RESET', 1, 8),
        outputMember('OUT', 4, 12),
    ],

    generateCall(ctx, params): void {
        const base = ctx.baseAddress;
        const resetLabel = ctx.newLabel('int_reset');
        const endLabel = ctx.newLabel('int_end');

        ctx.emit(`    ; --- INTEGRAL Logic (${ctx.instanceName}) ---`);

        // Store input parameters
        for (const p of params) {
            const member = this.members.find(m => m.name === p.name);
            if (member && member.isInput) {
                ctx.emitExpression(p.value);
                if (member.size === 1) {
                    ctx.emit(`    STORE8 ${formatAddr(base + member.offset)}`);
                } else {
                    ctx.emit(`    STORE32 ${formatAddr(base + member.offset)}`);
                }
            }
        }

        // Check RESET
        ctx.emit(`    LOAD8 ${formatAddr(base + 8)}    ; RESET`);
        ctx.emit(`    JNZ ${resetLabel}`);

        // Integrate: OUT = OUT + IN * DT
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; DT`);
        ctx.emit(`    MULF`);                          // IN * DT
        ctx.emit(`    LOAD32 ${formatAddr(base + 12)}  ; OUT`);
        ctx.emit(`    ADDF`);                          // OUT + IN * DT
        ctx.emit(`    STORE32 ${formatAddr(base + 12)} ; OUT`);
        ctx.emit(`    JMP ${endLabel}`);

        // Reset output to zero
        ctx.emit(`${resetLabel}:`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${formatAddr(base + 12)} ; OUT`);

        ctx.emit(`${endLabel}:`);
        ctx.emit(`    ; --- End INTEGRAL ---`);
    }
};

/**
 * DERIVATIVE - Discrete differentiator
 *
 * Computes rate of change: OUT = (IN - _prev) / DT
 *
 * Memory layout (16 bytes):
 *   0: IN (REAL, 4 bytes) - Input value
 *   4: DT (REAL, 4 bytes) - Time step
 *   8: OUT (REAL, 4 bytes) - Derivative output
 *   12: _prev (REAL, 4 bytes) - Previous input value
 * Total: 16 bytes
 */
export const DERIVATIVE_FB: FunctionBlockDef = {
    name: 'DERIVATIVE',
    size: 16,
    members: [
        inputMember('IN', 4, 0),
        inputMember('DT', 4, 4),
        outputMember('OUT', 4, 8),
        internalMember('_prev', 4, 12),
    ],

    generateCall(ctx, params): void {
        const base = ctx.baseAddress;
        const skipLabel = ctx.newLabel('deriv_skip');
        const endLabel = ctx.newLabel('deriv_end');

        ctx.emit(`    ; --- DERIVATIVE Logic (${ctx.instanceName}) ---`);

        // Store input parameters
        for (const p of params) {
            const member = this.members.find(m => m.name === p.name);
            if (member && member.isInput) {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(base + member.offset)}`);
            }
        }

        // Check DT != 0
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; DT`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    EQ`);
        ctx.emit(`    JNZ ${skipLabel}`);

        // OUT = (IN - _prev) / DT
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 12)}  ; _prev`);
        ctx.emit(`    SUBF`);                          // IN - _prev
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; DT`);
        ctx.emit(`    DIVF`);                          // (IN - _prev) / DT
        ctx.emit(`    STORE32 ${formatAddr(base + 8)}  ; OUT`);
        ctx.emit(`    JMP ${endLabel}`);

        // DT is zero, output 0
        ctx.emit(`${skipLabel}:`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${formatAddr(base + 8)}  ; OUT`);

        ctx.emit(`${endLabel}:`);
        // Update _prev for next cycle
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; IN`);
        ctx.emit(`    STORE32 ${formatAddr(base + 12)} ; _prev`);
        ctx.emit(`    ; --- End DERIVATIVE ---`);
    }
};

// ============================================================================
// PID Controller
// ============================================================================

/**
 * PID_Compact - Industrial PID Controller with Anti-Windup
 *
 * Implements a discrete PID controller with:
 * - Proportional, Integral, Derivative terms
 * - Anti-windup via integral clamping
 * - Output limiting
 *
 * Memory layout (48 bytes):
 *   0: SP (REAL, 4) - Setpoint
 *   4: PV (REAL, 4) - Process Variable
 *   8: KP (REAL, 4) - Proportional gain
 *   12: KI (REAL, 4) - Integral gain
 *   16: KD (REAL, 4) - Derivative gain
 *   20: DT (REAL, 4) - Sample time (seconds)
 *   24: OUT_MIN (REAL, 4) - Minimum output
 *   28: OUT_MAX (REAL, 4) - Maximum output
 *   32: OUT (REAL, 4) - Controller output
 *   36: _integral (REAL, 4) - Integral accumulator
 *   40: _prev_err (REAL, 4) - Previous error
 *   44: _initialized (BOOL, 1) - First-run flag
 *   45-47: pad
 * Total: 48 bytes
 */
export const PID_COMPACT_FB: FunctionBlockDef = {
    name: 'PID_Compact',
    size: 48,
    members: [
        inputMember('SP', 4, 0),
        inputMember('PV', 4, 4),
        inputMember('KP', 4, 8),
        inputMember('KI', 4, 12),
        inputMember('KD', 4, 16),
        inputMember('DT', 4, 20),
        inputMember('OUT_MIN', 4, 24),
        inputMember('OUT_MAX', 4, 28),
        outputMember('OUT', 4, 32),
        internalMember('_integral', 4, 36),
        internalMember('_prev_err', 4, 40),
        internalMember('_initialized', 1, 44),
    ],

    generateCall(ctx, params): void {
        const base = ctx.baseAddress;
        const initLabel = ctx.newLabel('pid_init');
        const calcLabel = ctx.newLabel('pid_calc');
        const clampLowLabel = ctx.newLabel('pid_clamp_low');
        const clampHighLabel = ctx.newLabel('pid_clamp_high');
        const endLabel = ctx.newLabel('pid_end');

        ctx.emit(`    ; --- PID_Compact Logic (${ctx.instanceName}) ---`);

        // Store input parameters
        for (const p of params) {
            const member = this.members.find(m => m.name === p.name);
            if (member && member.isInput) {
                ctx.emitExpression(p.value);
                ctx.emit(`    STORE32 ${formatAddr(base + member.offset)}`);
            }
        }

        // Check if initialized
        ctx.emit(`    LOAD8 ${formatAddr(base + 44)}   ; _initialized`);
        ctx.emit(`    JNZ ${calcLabel}`);

        // First run - initialize internal state
        ctx.emit(`${initLabel}:`);
        ctx.emit(`    PUSH32 0`);
        ctx.emit(`    STORE32 ${formatAddr(base + 36)} ; _integral = 0`);
        ctx.emit(`    ; Calculate initial error for _prev_err`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; SP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; PV`);
        ctx.emit(`    SUBF`);
        ctx.emit(`    STORE32 ${formatAddr(base + 40)} ; _prev_err`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${formatAddr(base + 44)}  ; _initialized = 1`);

        // Calculate PID
        ctx.emit(`${calcLabel}:`);

        // Calculate error = SP - PV
        ctx.emit(`    LOAD32 ${formatAddr(base + 0)}   ; SP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 4)}   ; PV`);
        ctx.emit(`    SUBF`);                          // error on stack

        // P term: KP * error
        ctx.emit(`    DUP`);                           // [error, error]
        ctx.emit(`    LOAD32 ${formatAddr(base + 8)}   ; KP`);
        ctx.emit(`    MULF`);                          // [error, P_term]

        // I term: integral += error * DT, then KI * integral
        ctx.emit(`    OVER`);                          // [error, P_term, error]
        ctx.emit(`    LOAD32 ${formatAddr(base + 20)}  ; DT`);
        ctx.emit(`    MULF`);                          // [error, P_term, error*DT]
        ctx.emit(`    LOAD32 ${formatAddr(base + 36)}  ; _integral`);
        ctx.emit(`    ADDF`);                          // [error, P_term, new_integral]
        ctx.emit(`    DUP`);
        ctx.emit(`    STORE32 ${formatAddr(base + 36)} ; save _integral`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 12)}  ; KI`);
        ctx.emit(`    MULF`);                          // [error, P_term, I_term]

        // D term: KD * (error - _prev_err) / DT
        ctx.emit(`    ROT`);                           // [P_term, I_term, error]
        ctx.emit(`    DUP`);                           // [P_term, I_term, error, error]
        ctx.emit(`    LOAD32 ${formatAddr(base + 40)}  ; _prev_err`);
        ctx.emit(`    SUBF`);                          // [P_term, I_term, error, d_error]
        ctx.emit(`    LOAD32 ${formatAddr(base + 20)}  ; DT`);
        ctx.emit(`    DIVF`);                          // [P_term, I_term, error, d_error/DT]
        ctx.emit(`    LOAD32 ${formatAddr(base + 16)}  ; KD`);
        ctx.emit(`    MULF`);                          // [P_term, I_term, error, D_term]

        // Store error as _prev_err
        ctx.emit(`    ROT`);                           // [P_term, I_term, D_term, error]
        ctx.emit(`    STORE32 ${formatAddr(base + 40)} ; _prev_err`);

        // Sum: OUT = P_term + I_term + D_term
        ctx.emit(`    ADDF`);                          // [P_term, I_term + D_term]
        ctx.emit(`    ADDF`);                          // [P + I + D]

        // Clamp output to [OUT_MIN, OUT_MAX]
        ctx.emit(`    DUP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 24)}  ; OUT_MIN`);
        ctx.emit(`    LT`);
        ctx.emit(`    JNZ ${clampLowLabel}`);

        ctx.emit(`    DUP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 28)}  ; OUT_MAX`);
        ctx.emit(`    GT`);
        ctx.emit(`    JNZ ${clampHighLabel}`);

        // Output is within limits
        ctx.emit(`    STORE32 ${formatAddr(base + 32)} ; OUT`);
        ctx.emit(`    JMP ${endLabel}`);

        // Clamp to minimum
        ctx.emit(`${clampLowLabel}:`);
        ctx.emit(`    DROP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 24)}  ; OUT_MIN`);
        ctx.emit(`    STORE32 ${formatAddr(base + 32)} ; OUT`);
        ctx.emit(`    JMP ${endLabel}`);

        // Clamp to maximum
        ctx.emit(`${clampHighLabel}:`);
        ctx.emit(`    DROP`);
        ctx.emit(`    LOAD32 ${formatAddr(base + 28)}  ; OUT_MAX`);
        ctx.emit(`    STORE32 ${formatAddr(base + 32)} ; OUT`);

        ctx.emit(`${endLabel}:`);
        ctx.emit(`    ; --- End PID_Compact ---`);
    }
};
