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
import { LITERAL_INT, UNKNOWN_TYPE, commonType, isWide, type CompareOp } from '../numeric.ts';

/**
 * Emit the arguments as one numeric type and return that type: a REAL among them converts the
 * integer ones (MAX(count, 2.5)), an unsigned 32-bit type makes the comparison unsigned. A 64-bit
 * integer or an LREAL among them makes every value two cells (CMP-015).
 */
function emitOperands(ctx: CodeGenContext, args: Expression[]): string {
    const type = ctx.typeOf
        ? args.map((a) => ctx.typeOf!(a) ?? UNKNOWN_TYPE).reduce(commonType, LITERAL_INT)
        : UNKNOWN_TYPE;
    for (const arg of args) {
        if ((type === 'REAL' || isWide(type)) && ctx.emitOperand) {
            ctx.emitOperand(arg, type);
        } else {
            ctx.emitExpression(arg);
        }
    }
    return type;
}

/** [x(2) y(2)] -> [y(2)]: remove the two-cell value under the top one. */
function emitNipPair(ctx: CodeGenContext): void {
    ctx.emit(`    ROT`);
    ctx.emit(`    DROP`);
    ctx.emit(`    ROT`);
    ctx.emit(`    DROP`);
}

/** Copy the two-cell value that lies under the two-cell value on top of the stack. */
function emitCopyPairBelow(ctx: CodeGenContext): void {
    ctx.emit(`    PICK 3`);
    ctx.emit(`    PICK 3`);
}

/** Emit the comparison of the two values on top of the stack. */
function emitOrder(ctx: CodeGenContext, op: CompareOp, type: string): void {
    if (ctx.emitCompare) {
        ctx.emitCompare(op, type);
    } else {
        ctx.emit(`    ${op}`);
    }
}

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
            ctx.fail('MAX requires 2 arguments');
        }

        const skipLabel = ctx.newLabel('max_skip');

        // Emit both arguments
        const type = emitOperands(ctx, args);  // IN1, IN2 on stack

        if (isWide(type)) {
            // two-cell values [a b]: compare copies, keep the larger pair
            ctx.emit(`    ; MAX(IN1, IN2) on 64-bit values`);
            emitCopyPairBelow(ctx);   // [a b a]
            emitCopyPairBelow(ctx);   // [a b a b]
            emitOrder(ctx, 'GT', type);
            ctx.emit(`    JNZ ${skipLabel}`);
            emitNipPair(ctx);         // [b]
            ctx.emit(`    JMP ${skipLabel}_end`);
            ctx.emit(`${skipLabel}:`);
            ctx.emit(`    DROP`);
            ctx.emit(`    DROP`);     // [a]
            ctx.emit(`${skipLabel}_end:`);
            return;
        }

        // Stack: [IN1, IN2]
        ctx.emit(`    ; MAX(IN1, IN2)`);
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1]
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1, IN2]
        emitOrder(ctx, 'GT', type);   // [IN1, IN2, IN1>IN2?]
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
            ctx.fail('MIN requires 2 arguments');
        }

        const skipLabel = ctx.newLabel('min_skip');

        const type = emitOperands(ctx, args);  // IN1, IN2 on stack

        if (isWide(type)) {
            ctx.emit(`    ; MIN(IN1, IN2) on 64-bit values`);
            emitCopyPairBelow(ctx);   // [a b a]
            emitCopyPairBelow(ctx);   // [a b a b]
            emitOrder(ctx, 'LT', type);
            ctx.emit(`    JNZ ${skipLabel}`);
            emitNipPair(ctx);         // [b]
            ctx.emit(`    JMP ${skipLabel}_end`);
            ctx.emit(`${skipLabel}:`);
            ctx.emit(`    DROP`);
            ctx.emit(`    DROP`);     // [a]
            ctx.emit(`${skipLabel}_end:`);
            return;
        }

        // Stack: [IN1, IN2]
        ctx.emit(`    ; MIN(IN1, IN2)`);
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1]
        ctx.emit(`    OVER`);         // [IN1, IN2, IN1, IN2]
        emitOrder(ctx, 'LT', type);   // [IN1, IN2, IN1<IN2?]
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
            ctx.fail('LIMIT requires 3 arguments (MN, IN, MX)');
        }

        const belowMin = ctx.newLabel('limit_below_min');
        const aboveMax = ctx.newLabel('limit_above_max');
        const limitEnd = ctx.newLabel('limit_end');

        // Stack layout: we need MN, IN, MX
        const type = emitOperands(ctx, args);  // MN, IN, MX

        if (isWide(type)) {
            // [mn in mx] of two cells each
            ctx.emit(`    ; LIMIT(MN, IN, MX) on 64-bit values`);
            emitCopyPairBelow(ctx);   // [mn in mx in]
            emitCopyPairBelow(ctx);   // [mn in mx in mx]
            emitOrder(ctx, 'GT', type);
            ctx.emit(`    JNZ ${aboveMax}`);
            ctx.emit(`    DROP`);
            ctx.emit(`    DROP`);     // [mn in]
            emitCopyPairBelow(ctx);   // [mn in mn]
            emitCopyPairBelow(ctx);   // [mn in mn in]
            emitOrder(ctx, 'GT', type);
            ctx.emit(`    JNZ ${belowMin}`);
            emitNipPair(ctx);         // [in]
            ctx.emit(`    JMP ${limitEnd}`);
            ctx.emit(`${aboveMax}:`); // [mn in mx]
            emitNipPair(ctx);         // [mn mx]
            emitNipPair(ctx);         // [mx]
            ctx.emit(`    JMP ${limitEnd}`);
            ctx.emit(`${belowMin}:`); // [mn in]
            ctx.emit(`    DROP`);
            ctx.emit(`    DROP`);     // [mn]
            ctx.emit(`${limitEnd}:`);
            return;
        }

        ctx.emit(`    ; LIMIT(MN, IN, MX)`);
        // Stack: [MN, IN, MX]

        // Check if IN > MX
        ctx.emit(`    OVER`);         // [MN, IN, MX, IN]
        ctx.emit(`    OVER`);         // [MN, IN, MX, IN, MX]
        emitOrder(ctx, 'GT', type);   // [MN, IN, MX, IN>MX?]
        ctx.emit(`    JNZ ${aboveMax}`);

        // Check if IN < MN
        ctx.emit(`    DROP`);         // [MN, IN]
        ctx.emit(`    OVER`);         // [MN, IN, MN]
        ctx.emit(`    OVER`);         // [MN, IN, MN, IN]
        emitOrder(ctx, 'GT', type);   // [MN, IN, MN>IN?]
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
        ctx.emit(`    DROP`);         // [MN, IN] -> [MN]

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
            ctx.fail('SEL requires 3 arguments (G, IN0, IN1)');
        }

        const selectIN1 = ctx.newLabel('sel_in1');
        const selEnd = ctx.newLabel('sel_end');

        ctx.emit(`    ; SEL(G, IN0, IN1)`);

        // two-cell values are converted to their common type, so that both branches leave two cells
        const wideType = ctx.typeOf
            ? args.slice(1).map((a) => ctx.typeOf!(a) ?? UNKNOWN_TYPE).reduce(commonType, LITERAL_INT)
            : UNKNOWN_TYPE;
        const emitValue = (value: Expression): void => {
            if (isWide(wideType) && ctx.emitOperand) ctx.emitOperand(value, wideType);
            else ctx.emitExpression(value);
        };

        // Evaluate G first
        ctx.emitExpression(args[0]);  // G
        ctx.emit(`    JNZ ${selectIN1}`);

        // G is FALSE: use IN0
        emitValue(args[1]);  // IN0
        ctx.emit(`    JMP ${selEnd}`);

        // G is TRUE: use IN1
        ctx.emit(`${selectIN1}:`);
        emitValue(args[2]);  // IN1

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
            ctx.fail('MUX requires at least 2 arguments (K, IN0)');
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

        const wideType = ctx.typeOf
            ? args.slice(1).map((a) => ctx.typeOf!(a) ?? UNKNOWN_TYPE).reduce(commonType, LITERAL_INT)
            : UNKNOWN_TYPE;
        const emitValue = (value: Expression): void => {
            if (isWide(wideType) && ctx.emitOperand) ctx.emitOperand(value, wideType);
            else ctx.emitExpression(value);
        };

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
            emitValue(args[i + 1]);  // INi
            ctx.emit(`    JMP ${muxEnd}`);
        }

        // Default: use IN0
        ctx.emit(`${muxDefault}:`);
        emitValue(args[1]);  // IN0

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
            ctx.fail('NAND requires 2 arguments');
        }

        ctx.emit(`    ; NAND(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1 on stack
        ctx.emitExpression(args[1]);  // IN2 on stack
        ctx.emit(`    AND`);          // [IN1 AND IN2]
        // logical, not bitwise: NOT of 0 or 1 is -1 or -2, which a BOOL cannot hold
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    EQ`);           // [NOT(IN1 AND IN2)]
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
            ctx.fail('NOR requires 2 arguments');
        }

        ctx.emit(`    ; NOR(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1 on stack
        ctx.emitExpression(args[1]);  // IN2 on stack
        ctx.emit(`    OR`);           // [IN1 OR IN2]
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    EQ`);           // [NOT(IN1 OR IN2)]
    },
};
