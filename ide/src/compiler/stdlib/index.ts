/**
 * ZPLC Standard Library - Registry
 *
 * SPDX-License-Identifier: MIT
 *
 * Central registry for all Function Blocks and Functions.
 * Provides lookup by name for the code generator.
 *
 * Library Organization:
 * - Timers: TON, TOF, TP
 * - Bistables: R_TRIG, F_TRIG, RS, SR
 * - Counters: CTU, CTD, CTUD
 * - Generators: BLINK, PWM, PULSE
 * - Process Control: HYSTERESIS, DEADBAND, LAG_FILTER, RAMP_REAL, 
 *                    INTEGRAL, DERIVATIVE, PID_Compact
 * - System Buffers: FIFO, LIFO
 * - Selection: MAX, MIN, LIMIT, SEL, MUX
 * - Logic: NAND, NOR
 * - Bitwise: ROL, ROR, SHL, SHR, AND_WORD, OR_WORD, XOR_WORD, NOT_WORD,
 *            AND_DWORD, OR_DWORD, XOR_DWORD, NOT_DWORD
 * - Math: ABS, ABSF, NEG, NEGF, MOD, SQRT, EXPT
 * - Trigonometry: SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2
 * - Logarithmic: LN, LOG, EXP
 * - Rounding: TRUNC, ROUND
 * - Scaling: NORM_X, SCALE_X
 * - Type Conversion: INT_TO_REAL, REAL_TO_INT, BOOL_TO_INT, INT_TO_BOOL
 * - System: UPTIME, CYCLE_TIME, WATCHDOG_RESET
 * - Strings: LEN, CONCAT, LEFT, RIGHT, MID, FIND, INSERT, DELETE, REPLACE, STRCMP
 */

import type { FunctionBlockDef, FunctionDef } from './types.ts';

// Import all FB implementations
import { TON_FB, TOF_FB, TP_FB } from './timers.ts';
import { R_TRIG_FB, F_TRIG_FB, RS_FB, SR_FB } from './bistables.ts';
import { CTU_FB, CTD_FB, CTUD_FB } from './counters.ts';
import { BLINK_FB, PWM_FB, PULSE_FB } from './generators.ts';
import {
    HYSTERESIS_FB, DEADBAND_FB, LAG_FILTER_FB, RAMP_REAL_FB,
    INTEGRAL_FB, DERIVATIVE_FB, PID_COMPACT_FB
} from './process.ts';

// Import all Function implementations
import { MAX_FN, MIN_FN, LIMIT_FN, SEL_FN, MUX_FN, NAND_FN, NOR_FN } from './functions.ts';
import {
    ROL_FN, ROR_FN, SHL_FN, SHR_FN,
    AND_WORD_FN, OR_WORD_FN, XOR_WORD_FN, NOT_WORD_FN,
    AND_DWORD_FN, OR_DWORD_FN, XOR_DWORD_FN, NOT_DWORD_FN
} from './bitwise.ts';
import {
    ABS_FN, ABSF_FN, NEG_FN, NEGF_FN, MOD_FN, SQRT_FN, EXPT_FN,
    INT_TO_REAL_FN, REAL_TO_INT_FN, BOOL_TO_INT_FN, INT_TO_BOOL_FN,
    TRUNC_FN, ROUND_FN,
    SIN_FN, COS_FN, TAN_FN,
    ASIN_FN, ACOS_FN, ATAN_FN, ATAN2_FN,
    LN_FN, LOG_FN, EXP_FN
} from './math.ts';
import { NORM_X_FN, SCALE_X_FN } from './process.ts';
import {
    UPTIME_FN, CYCLE_TIME_FN, WATCHDOG_RESET_FN,
    FIFO_FB, LIFO_FB
} from './system.ts';
import { STRING_FUNCTIONS } from './strings.ts';

// ============================================================================
// Function Block Registry
// ============================================================================

/**
 * Registry of all available Function Blocks.
 */
const functionBlocks = new Map<string, FunctionBlockDef>();

/**
 * Register a Function Block definition.
 */
export function registerFB(fb: FunctionBlockDef): void {
    functionBlocks.set(fb.name, fb);
}

/**
 * Get a Function Block by name.
 */
export function getFB(name: string): FunctionBlockDef | undefined {
    return functionBlocks.get(name);
}

/**
 * Check if a name is a registered Function Block.
 */
export function isFB(name: string): boolean {
    return functionBlocks.has(name);
}

/**
 * Get all registered Function Block names.
 */
export function getAllFBNames(): string[] {
    return Array.from(functionBlocks.keys());
}

// ============================================================================
// Function Registry
// ============================================================================

/**
 * Registry of all available Functions.
 */
const functions = new Map<string, FunctionDef>();

/**
 * Register a Function definition.
 */
export function registerFn(fn: FunctionDef): void {
    functions.set(fn.name, fn);
}

/**
 * Get a Function by name.
 */
export function getFn(name: string): FunctionDef | undefined {
    return functions.get(name);
}

/**
 * Check if a name is a registered Function.
 */
export function isFn(name: string): boolean {
    return functions.has(name);
}

/**
 * Get all registered Function names.
 */
export function getAllFnNames(): string[] {
    return Array.from(functions.keys());
}

// ============================================================================
// Initialize Registry
// ============================================================================

/**
 * Register all standard library blocks.
 * Called once at module load.
 */
function initRegistry(): void {
    // ===== Function Blocks =====

    // Timers
    registerFB(TON_FB);
    registerFB(TOF_FB);
    registerFB(TP_FB);

    // Edge detectors and bistables
    registerFB(R_TRIG_FB);
    registerFB(F_TRIG_FB);
    registerFB(RS_FB);
    registerFB(SR_FB);

    // Counters
    registerFB(CTU_FB);
    registerFB(CTD_FB);
    registerFB(CTUD_FB);

    // Generators (NEW in v1.1)
    registerFB(BLINK_FB);
    registerFB(PWM_FB);
    registerFB(PULSE_FB);

    // Process Control (NEW in v1.2)
    registerFB(HYSTERESIS_FB);
    registerFB(DEADBAND_FB);
    registerFB(LAG_FILTER_FB);
    registerFB(RAMP_REAL_FB);
    registerFB(INTEGRAL_FB);
    registerFB(DERIVATIVE_FB);
    registerFB(PID_COMPACT_FB);

    // System Buffers (NEW in v1.2)
    registerFB(FIFO_FB);
    registerFB(LIFO_FB);

    // ===== Functions =====

    // Selection functions
    registerFn(MAX_FN);
    registerFn(MIN_FN);
    registerFn(LIMIT_FN);
    registerFn(SEL_FN);
    registerFn(MUX_FN);

    // Logic functions (NEW in v1.2.1)
    registerFn(NAND_FN);
    registerFn(NOR_FN);

    // Bitwise functions (NEW in v1.1)
    registerFn(ROL_FN);
    registerFn(ROR_FN);
    registerFn(SHL_FN);
    registerFn(SHR_FN);
    registerFn(AND_WORD_FN);
    registerFn(OR_WORD_FN);
    registerFn(XOR_WORD_FN);
    registerFn(NOT_WORD_FN);
    registerFn(AND_DWORD_FN);
    registerFn(OR_DWORD_FN);
    registerFn(XOR_DWORD_FN);
    registerFn(NOT_DWORD_FN);

    // Math functions (NEW in v1.1)
    registerFn(ABS_FN);
    registerFn(ABSF_FN);
    registerFn(NEG_FN);
    registerFn(NEGF_FN);
    registerFn(MOD_FN);
    registerFn(SQRT_FN);
    registerFn(EXPT_FN);

    // Type conversion functions (NEW in v1.1)
    registerFn(INT_TO_REAL_FN);
    registerFn(REAL_TO_INT_FN);
    registerFn(BOOL_TO_INT_FN);
    registerFn(INT_TO_BOOL_FN);

    // Rounding functions (NEW in v1.2)
    registerFn(TRUNC_FN);
    registerFn(ROUND_FN);

    // Trigonometry functions (NEW in v1.2)
    registerFn(SIN_FN);
    registerFn(COS_FN);
    registerFn(TAN_FN);

    // Inverse trigonometry functions (NEW in v1.2)
    registerFn(ASIN_FN);
    registerFn(ACOS_FN);
    registerFn(ATAN_FN);
    registerFn(ATAN2_FN);

    // Logarithmic/Exponential functions (NEW in v1.2)
    registerFn(LN_FN);
    registerFn(LOG_FN);
    registerFn(EXP_FN);

    // Scaling functions (NEW in v1.2)
    registerFn(NORM_X_FN);
    registerFn(SCALE_X_FN);

    // System functions (NEW in v1.2)
    registerFn(UPTIME_FN);
    registerFn(CYCLE_TIME_FN);
    registerFn(WATCHDOG_RESET_FN);

    // String functions (NEW in v1.2)
    STRING_FUNCTIONS.forEach(fn => registerFn(fn));
}

// Initialize on module load
initRegistry();

// ============================================================================
// Exports
// ============================================================================

export type { FunctionBlockDef, FunctionDef, CodeGenContext, MemberDef, MemberSize } from './types.ts';
export { formatAddr, getSizeSuffix, inputMember, outputMember, internalMember } from './types.ts';
