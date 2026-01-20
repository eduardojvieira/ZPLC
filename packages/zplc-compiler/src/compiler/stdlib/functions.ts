/**
 * ZPLC Standard Library - Standard Functions
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 Standard Functions (stateless, inline):
 * - MAX: Maximum of two values
 * - MIN: Minimum of two values
 * - LIMIT: Clamp value between bounds
 * - SEL: Binary selector (G ? IN1 : IN0)
 * - MUX: Multiplexer (select from N inputs)
 * - NAND: NOT AND (returns NOT(a AND b))
 * - NOR: NOT OR (returns NOT(a OR b))
 */

import type { FunctionDef, CodeGenContext } from './types.ts';
import type { Expression } from '../ast.ts';

// ============================================================================
// MAX - Maximum Value
// ============================================================================

/**
 * MAX(IN1, IN2) -> MAX
 *
 * Returns the greater of two values.
 * Stack: [IN1, IN2] -> [result]
 */
export const MAX_FN: FunctionDef = {
    name: 'MAX',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.emit(`    ; ERROR: MAX requires 2 arguments`);
            return;
        }

        const skipLabel = ctx.newLabel('max_skip');

        // Emit both arguments
        ctx.emitExpression(args[0]);  // IN1 on stack
        ctx.emitExpression(args[1]);  // IN2 on stack

        // Stack: [IN1, IN2]
        ctx.emit(`    ; MAX(IN1, IN2)`);
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1]
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1, IN2]
        ctx.emit(`    GT`);           // [IN1, IN2, IN1>IN2?]
        ctx.emit(`    JNZ ${skipLabel}`);
        // IN2 >= IN1, swap so IN2 is on bottom
        ctx.emit(`    SWAP`);         // [IN2, IN1]
        ctx.emit(`${skipLabel}:`);
        ctx.emit(`    DROP`);         // [max_value]
    },
};

// ============================================================================
// MIN - Minimum Value
// ============================================================================

/**
 * MIN(IN1, IN2) -> MIN
 *
 * Returns the lesser of two values.
 * Stack: [IN1, IN2] -> [result]
 */
export const MIN_FN: FunctionDef = {
    name: 'MIN',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.emit(`    ; ERROR: MIN requires 2 arguments`);
            return;
        }

        const skipLabel = ctx.newLabel('min_skip');

        ctx.emitExpression(args[0]);  // IN1 on stack
        ctx.emitExpression(args[1]);  // IN2 on stack

        // Stack: [IN1, IN2]
        ctx.emit(`    ; MIN(IN1, IN2)`);
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1]
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1, IN2]
        ctx.emit(`    LT`);           // [IN1, IN2, IN1<IN2?]
        ctx.emit(`    JNZ ${skipLabel}`);
        // IN2 <= IN1, swap so IN2 is on bottom
        ctx.emit(`    SWAP`);         // [IN2, IN1]
        ctx.emit(`${skipLabel}:`);
        ctx.emit(`    DROP`);         // [min_value]
    },
};

// ============================================================================
// LIMIT - Clamp Value
// ============================================================================

/**
 * LIMIT(MN, IN, MX) -> OUT
 *
 * Clamps IN between MN (minimum) and MX (maximum).
 * OUT = MAX(MN, MIN(IN, MX))
 *
 * IEC 61131-3 semantics:
 * - If IN < MN: OUT = MN
 * - If IN > MX: OUT = MX
 * - Otherwise: OUT = IN
 */
export const LIMIT_FN: FunctionDef = {
    name: 'LIMIT',
    argCount: 3,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 3) {
            ctx.emit(`    ; ERROR: LIMIT requires 3 arguments (MN, IN, MX)`);
            return;
        }

        const belowMin = ctx.newLabel('limit_below_min');
        const aboveMax = ctx.newLabel('limit_above_max');
        const limitEnd = ctx.newLabel('limit_end');

        // Stack layout: we need MN, IN, MX
        ctx.emitExpression(args[0]);  // MN
        ctx.emitExpression(args[1]);  // IN
        ctx.emitExpression(args[2]);  // MX

        ctx.emit(`    ; LIMIT(MN, IN, MX)`);
        // Stack: [MN, IN, MX]

        // Check if IN > MX
        ctx.emit(`    OVER`);         // [MN, IN, MX, IN]
        ctx.emit(`    OVER`);         // [MN, IN, MX, IN, MX]
        ctx.emit(`    GT`);           // [MN, IN, MX, IN>MX?]
        ctx.emit(`    JNZ ${aboveMax}`);

        // Check if IN < MN
        ctx.emit(`    DROP`);         // [MN, IN]
        ctx.emit(`    OVER`);         // [MN, IN, MN]
        ctx.emit(`    OVER`);         // [MN, IN, MN, IN]
        ctx.emit(`    GT`);           // [MN, IN, MN>IN?]
        ctx.emit(`    JNZ ${belowMin}`);

        // IN is within bounds
        ctx.emit(`    SWAP`);         // [IN, MN]
        ctx.emit(`    DROP`);         // [IN]
        ctx.emit(`    JMP ${limitEnd}`);

        // IN > MX: result is MX
        ctx.emit(`${aboveMax}:`);
        ctx.emit(`    SWAP`);         // [MN, MX, IN]
        ctx.emit(`    DROP`);         // [MN, MX]
        ctx.emit(`    SWAP`);         // [MX, MN]
        ctx.emit(`    DROP`);         // [MX]
        ctx.emit(`    JMP ${limitEnd}`);

        // IN < MN: result is MN
        ctx.emit(`${belowMin}:`);
        ctx.emit(`    DROP`);         // [MN, IN]
        ctx.emit(`    DROP`);         // [MN]

        ctx.emit(`${limitEnd}:`);
    },
};

// ============================================================================
// SEL - Binary Selector
// ============================================================================

/**
 * SEL(G, IN0, IN1) -> OUT
 *
 * Binary selector:
 * - If G is FALSE: OUT = IN0
 * - If G is TRUE:  OUT = IN1
 *
 * This is equivalent to: G ? IN1 : IN0
 */
export const SEL_FN: FunctionDef = {
    name: 'SEL',
    argCount: 3,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 3) {
            ctx.emit(`    ; ERROR: SEL requires 3 arguments (G, IN0, IN1)`);
            return;
        }

        const selectIN1 = ctx.newLabel('sel_in1');
        const selEnd = ctx.newLabel('sel_end');

        ctx.emit(`    ; SEL(G, IN0, IN1)`);

        // Evaluate G first
        ctx.emitExpression(args[0]);  // G
        ctx.emit(`    JNZ ${selectIN1}`);

        // G is FALSE: use IN0
        ctx.emitExpression(args[1]);  // IN0
        ctx.emit(`    JMP ${selEnd}`);

        // G is TRUE: use IN1
        ctx.emit(`${selectIN1}:`);
        ctx.emitExpression(args[2]);  // IN1

        ctx.emit(`${selEnd}:`);
    },
};

// ============================================================================
// MUX - Multiplexer
// ============================================================================

/**
 * MUX(K, IN0, IN1, ..., INn) -> OUT
 *
 * Multiplexer: selects INk based on selector K.
 * - K = 0: OUT = IN0
 * - K = 1: OUT = IN1
 * - etc.
 *
 * Note: This implementation supports up to 8 inputs.
 * For more complex needs, use nested SEL or look-up tables.
 *
 * If K is out of range, behavior is undefined (we return IN0).
 */
export const MUX_FN: FunctionDef = {
    name: 'MUX',
    argCount: 2,  // Minimum: K + 1 input
    variadic: true,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length < 2) {
            ctx.emit(`    ; ERROR: MUX requires at least 2 arguments (K, IN0)`);
            return;
        }

        const numInputs = args.length - 1;
        const muxEnd = ctx.newLabel('mux_end');
        const muxDefault = ctx.newLabel('mux_default');
        const caseLabels: string[] = [];

        // Generate labels for each case
        for (let i = 0; i < numInputs; i++) {
            caseLabels.push(ctx.newLabel(`mux_case_${i}`));
        }

        ctx.emit(`    ; MUX(K, IN0, ..., IN${numInputs - 1})`);

        // Evaluate K
        ctx.emitExpression(args[0]);  // K on stack

        // Generate jump table using cascading comparisons
        // This is not optimal but works for small N
        for (let i = 0; i < numInputs; i++) {
            ctx.emit(`    DUP`);
            ctx.emit(`    PUSH8 ${i}`);
            ctx.emit(`    EQ`);
            ctx.emit(`    JNZ ${caseLabels[i]}`);
        }

        // Default case (K out of range): use IN0
        ctx.emit(`    DROP`);  // Drop K
        ctx.emit(`    JMP ${muxDefault}`);

        // Generate each case
        for (let i = 0; i < numInputs; i++) {
            ctx.emit(`${caseLabels[i]}:`);
            ctx.emit(`    DROP`);  // Drop K
            ctx.emitExpression(args[i + 1]);  // INi
            ctx.emit(`    JMP ${muxEnd}`);
        }

        // Default: use IN0
        ctx.emit(`${muxDefault}:`);
        ctx.emitExpression(args[1]);  // IN0

        ctx.emit(`${muxEnd}:`);
    },
};

// ============================================================================
// NAND - NOT AND
// ============================================================================

/**
 * NAND(IN1, IN2) -> OUT
 *
 * Logical NAND: returns NOT(IN1 AND IN2)
 * - If both inputs are TRUE: OUT = FALSE
 * - Otherwise: OUT = TRUE
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const NAND_FN: FunctionDef = {
    name: 'NAND',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.emit(`    ; ERROR: NAND requires 2 arguments`);
            return;
        }

        ctx.emit(`    ; NAND(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1 on stack
        ctx.emitExpression(args[1]);  // IN2 on stack
        ctx.emit(`    AND`);          // [IN1 AND IN2]
        ctx.emit(`    NOT`);          // [NOT(IN1 AND IN2)]
    },
};

// ============================================================================
// NOR - NOT OR
// ============================================================================

/**
 * NOR(IN1, IN2) -> OUT
 *
 * Logical NOR: returns NOT(IN1 OR IN2)
 * - If both inputs are FALSE: OUT = TRUE
 * - Otherwise: OUT = FALSE
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const NOR_FN: FunctionDef = {
    name: 'NOR',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.emit(`    ; ERROR: NOR requires 2 arguments`);
            return;
        }

        ctx.emit(`    ; NOR(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1 on stack
        ctx.emitExpression(args[1]);  // IN2 on stack
        ctx.emit(`    OR`);           // [IN1 OR IN2]
        ctx.emit(`    NOT`);          // [NOT(IN1 OR IN2)]
    },
};
