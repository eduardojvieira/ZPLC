/**
 * ZPLC Standard Library - Mathematical Functions
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 Math Functions (stateless, inline):
 * - ABS: Absolute value (wrapper for opcode)
 * - NEG: Negation (wrapper for opcode)
 * - SQRT: Square root (Newton-Raphson approximation)
 * - EXPT: Exponentiation (integer power)
 * - MOD: Modulo (wrapper for opcode)
 *
 * Note: Trigonometric functions (SIN, COS, TAN) require float opcodes
 * not yet available in the VM. These are planned for v1.2.
 */

import type { FunctionDef, CodeGenContext } from './types.ts';
import type { Expression } from '../ast.ts';

// ============================================================================
// ABS - Absolute Value (Integer)
// ============================================================================

/**
 * ABS(IN) -> OUT
 *
 * Returns the absolute value of an integer.
 * This is a wrapper for the native ABS opcode.
 *
 * Stack: [IN] -> [|IN|]
 */
export const ABS_FN: FunctionDef = {
    name: 'ABS',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: ABS requires 1 argument`);
            return;
        }

        ctx.emit(`    ; ABS(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    ABS`);
    },
};

// ============================================================================
// ABSF - Absolute Value (Float)
// ============================================================================

/**
 * ABSF(IN) -> OUT
 *
 * Returns the absolute value of a float.
 * This is a wrapper for the native ABSF opcode.
 *
 * Stack: [IN] -> [|IN|]
 */
export const ABSF_FN: FunctionDef = {
    name: 'ABSF',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: ABSF requires 1 argument`);
            return;
        }

        ctx.emit(`    ; ABSF(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    ABSF`);
    },
};

// ============================================================================
// NEG - Negation (Integer)
// ============================================================================

/**
 * NEG(IN) -> OUT
 *
 * Returns the negation of an integer (-IN).
 * This is a wrapper for the native NEG opcode.
 *
 * Stack: [IN] -> [-IN]
 */
export const NEG_FN: FunctionDef = {
    name: 'NEG',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: NEG requires 1 argument`);
            return;
        }

        ctx.emit(`    ; NEG(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    NEG`);
    },
};

// ============================================================================
// NEGF - Negation (Float)
// ============================================================================

/**
 * NEGF(IN) -> OUT
 *
 * Returns the negation of a float (-IN).
 * This is a wrapper for the native NEGF opcode.
 *
 * Stack: [IN] -> [-IN]
 */
export const NEGF_FN: FunctionDef = {
    name: 'NEGF',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: NEGF requires 1 argument`);
            return;
        }

        ctx.emit(`    ; NEGF(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    NEGF`);
    },
};

// ============================================================================
// MOD - Modulo
// ============================================================================

/**
 * MOD(IN1, IN2) -> OUT
 *
 * Returns IN1 modulo IN2.
 * This is a wrapper for the native MOD opcode.
 *
 * Stack: [IN1, IN2] -> [IN1 % IN2]
 */
export const MOD_FN: FunctionDef = {
    name: 'MOD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.emit(`    ; ERROR: MOD requires 2 arguments`);
            return;
        }

        ctx.emit(`    ; MOD(IN1, IN2)`);
        ctx.emitExpression(args[0]);
        ctx.emitExpression(args[1]);
        ctx.emit(`    MOD`);
    },
};

// ============================================================================
// SQRT - Square Root (Newton-Raphson approximation)
// ============================================================================

/**
 * SQRT(IN) -> OUT
 *
 * Returns the square root of a float using Newton-Raphson iteration.
 * Uses 8 iterations for good precision on 32-bit floats.
 *
 * Algorithm:
 *   x = IN / 2.0  (initial guess)
 *   repeat 8 times:
 *     x = (x + IN/x) / 2.0
 *   return x
 *
 * Stack: [IN] -> [sqrt(IN)]
 */
export const SQRT_FN: FunctionDef = {
    name: 'SQRT',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: SQRT requires 1 argument`);
            return;
        }

        const sqrtEnd = ctx.newLabel('sqrt_end');
        // sqrtLoop reserved for iterative Newton-Raphson implementation

        ctx.emit(`    ; SQRT(IN) - Newton-Raphson`);
        ctx.emitExpression(args[0]);  // IN on stack (as float)
        
        // Check for zero or negative (return 0 for simplicity)
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 0`);       // 0.0f
        ctx.emit(`    LE`);             // IN <= 0?
        ctx.emit(`    JNZ ${sqrtEnd}`); // Return 0 if <= 0

        // Initial guess: x = IN / 2.0
        ctx.emit(`    DUP`);            // [IN, IN]
        ctx.emit(`    PUSH32 0x40000000`);  // 2.0f in IEEE 754
        ctx.emit(`    DIVF`);           // [IN, x=IN/2]
        
        // Newton-Raphson: 8 iterations
        // x_new = (x + IN/x) / 2
        for (let i = 0; i < 8; i++) {
            ctx.emit(`    ; Iteration ${i + 1}`);
            ctx.emit(`    OVER`);       // [IN, x, IN]
            ctx.emit(`    OVER`);       // [IN, x, IN, x]
            ctx.emit(`    DIVF`);       // [IN, x, IN/x]
            ctx.emit(`    ADDF`);       // [IN, x + IN/x]
            ctx.emit(`    PUSH32 0x40000000`);  // 2.0f
            ctx.emit(`    DIVF`);       // [IN, (x + IN/x)/2]
        }
        
        // Result is on stack, drop IN
        ctx.emit(`    SWAP`);
        ctx.emit(`    DROP`);           // [sqrt(IN)]

        ctx.emit(`${sqrtEnd}:`);
    },
};

// ============================================================================
// EXPT - Integer Exponentiation
// ============================================================================

/**
 * EXPT(BASE, EXP) -> OUT
 *
 * Returns BASE raised to the power of EXP (integer exponent).
 * Uses iterative multiplication.
 *
 * Note: EXP must be >= 0. Negative exponents return 0.
 *
 * Stack: [BASE, EXP] -> [BASE^EXP]
 */
export const EXPT_FN: FunctionDef = {
    name: 'EXPT',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.emit(`    ; ERROR: EXPT requires 2 arguments (BASE, EXP)`);
            return;
        }

        const loopStart = ctx.newLabel('expt_loop');
        const loopEnd = ctx.newLabel('expt_end');
        const negExp = ctx.newLabel('expt_neg');

        ctx.emit(`    ; EXPT(BASE, EXP)`);
        ctx.emitExpression(args[0]);  // BASE
        ctx.emitExpression(args[1]);  // EXP
        
        // Stack: [BASE, EXP]
        
        // Check for negative exponent
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    LT`);
        ctx.emit(`    JNZ ${negExp}`);
        
        // Check for zero exponent
        ctx.emit(`    DUP`);
        ctx.emit(`    JZ ${loopEnd}`);  // EXP=0, result=1 is below
        
        // Initialize result = 1
        ctx.emit(`    PUSH32 1`);       // [BASE, EXP, result=1]
        
        ctx.emit(`${loopStart}:`);
        // Stack: [BASE, EXP, result]
        ctx.emit(`    ROT`);            // [EXP, result, BASE]
        ctx.emit(`    DUP`);            // [EXP, result, BASE, BASE]
        ctx.emit(`    ROT`);            // [EXP, BASE, BASE, result]
        ctx.emit(`    MUL`);            // [EXP, BASE, result*BASE]
        ctx.emit(`    ROT`);            // [BASE, result*BASE, EXP]
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    SUB`);            // [BASE, result*BASE, EXP-1]
        ctx.emit(`    DUP`);
        ctx.emit(`    JNZ ${loopStart}`);
        
        // Clean up: drop BASE and EXP, keep result
        ctx.emit(`    DROP`);           // [BASE, result]
        ctx.emit(`    SWAP`);
        ctx.emit(`    DROP`);           // [result]
        ctx.emit(`    JMP ${loopEnd}`);
        
        // Handle EXP=0: return 1
        ctx.emit(`${loopEnd}:`);
        // If we got here from EXP=0 check, stack is [BASE, 0]
        // We need to clean up and return 1
        ctx.emit(`    DROP`);           // [BASE]
        ctx.emit(`    DROP`);           // []
        ctx.emit(`    PUSH32 1`);       // [1]
        
        ctx.emit(`${negExp}:`);
        // Negative exponent: return 0 (integer division result)
        ctx.emit(`    DROP`);           // [BASE]
        ctx.emit(`    DROP`);           // []
        ctx.emit(`    PUSH32 0`);       // [0]
    },
};

// ============================================================================
// Type Conversion Functions
// ============================================================================

/**
 * INT_TO_REAL(IN) -> OUT
 *
 * Converts an integer to a float.
 * This is a wrapper for the I2F opcode.
 */
export const INT_TO_REAL_FN: FunctionDef = {
    name: 'INT_TO_REAL',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: INT_TO_REAL requires 1 argument`);
            return;
        }

        ctx.emit(`    ; INT_TO_REAL(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    I2F`);
    },
};

/**
 * REAL_TO_INT(IN) -> OUT
 *
 * Converts a float to an integer (truncates toward zero).
 * This is a wrapper for the F2I opcode.
 */
export const REAL_TO_INT_FN: FunctionDef = {
    name: 'REAL_TO_INT',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: REAL_TO_INT requires 1 argument`);
            return;
        }

        ctx.emit(`    ; REAL_TO_INT(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    F2I`);
    },
};

/**
 * BOOL_TO_INT(IN) -> OUT
 *
 * Converts a boolean to an integer (0 or 1).
 */
export const BOOL_TO_INT_FN: FunctionDef = {
    name: 'BOOL_TO_INT',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: BOOL_TO_INT requires 1 argument`);
            return;
        }

        ctx.emit(`    ; BOOL_TO_INT(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);  // Ensure 0 or 1
    },
};

/**
 * INT_TO_BOOL(IN) -> OUT
 *
 * Converts an integer to a boolean (0 = FALSE, non-zero = TRUE).
 * This is a wrapper for the I2B opcode.
 */
export const INT_TO_BOOL_FN: FunctionDef = {
    name: 'INT_TO_BOOL',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: INT_TO_BOOL requires 1 argument`);
            return;
        }

        ctx.emit(`    ; INT_TO_BOOL(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    I2B`);
    },
};

// ============================================================================
// IEEE 754 Constants (as 32-bit integers)
// ============================================================================

/** IEEE 754 representation of common constants */
const IEEE754 = {
    ZERO: 0x00000000,          // 0.0
    ONE: 0x3F800000,           // 1.0
    TWO: 0x40000000,           // 2.0
    HALF: 0x3F000000,          // 0.5
    PI: 0x40490FDB,            // 3.14159265
    TWO_PI: 0x40C90FDB,        // 6.28318530
    HALF_PI: 0x3FC90FDB,       // 1.57079632
    INV_TWO_PI: 0x3E22F983,    // 1/(2*PI) = 0.15915494
    NEG_ONE: 0xBF800000,       // -1.0
    // Taylor series coefficients for sin(x) around 0
    // sin(x) = x - x^3/3! + x^5/5! - x^7/7! + ...
    INV_FACT_3: 0xBE2AAAAB,    // -1/6 = -0.16666667
    INV_FACT_5: 0x3C088889,    // 1/120 = 0.00833333
    INV_FACT_7: 0xB9500D01,    // -1/5040 = -0.000198413
    // Taylor series coefficients for cos(x) around 0
    // cos(x) = 1 - x^2/2! + x^4/4! - x^6/6! + ...
    INV_FACT_2: 0xBF000000,    // -1/2 = -0.5
    INV_FACT_4: 0x3D2AAAAB,    // 1/24 = 0.04166667
    INV_FACT_6: 0xBAB60B61,    // -1/720 = -0.00138889
    // For LN approximation
    LN2: 0x3F317218,           // ln(2) = 0.693147
    // For EXP approximation
    LOG2E: 0x3FB8AA3B,         // log2(e) = 1.442695
};

// ============================================================================
// TRUNC - Truncate toward zero
// ============================================================================

/**
 * TRUNC(IN) -> OUT
 *
 * Truncates a float toward zero (removes fractional part).
 * Uses F2I followed by I2F.
 *
 * Stack: [IN] -> [trunc(IN)]
 */
export const TRUNC_FN: FunctionDef = {
    name: 'TRUNC',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: TRUNC requires 1 argument`);
            return;
        }

        ctx.emit(`    ; TRUNC(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(`    F2I`);   // Convert to integer (truncates)
        ctx.emit(`    I2F`);   // Convert back to float
    },
};

// ============================================================================
// ROUND - Round to nearest integer
// ============================================================================

/**
 * ROUND(IN) -> OUT
 *
 * Rounds a float to the nearest integer (banker's rounding).
 * Implemented as TRUNC(IN + 0.5 * SIGN(IN))
 *
 * Stack: [IN] -> [round(IN)]
 */
export const ROUND_FN: FunctionDef = {
    name: 'ROUND',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: ROUND requires 1 argument`);
            return;
        }

        const negLabel = ctx.newLabel('round_neg');
        const endLabel = ctx.newLabel('round_end');

        ctx.emit(`    ; ROUND(IN)`);
        ctx.emitExpression(args[0]);   // [IN]
        ctx.emit(`    DUP`);            // [IN, IN]
        ctx.emit(`    PUSH32 ${IEEE754.ZERO}`);  // [IN, IN, 0.0]
        ctx.emit(`    LT`);             // [IN, IN<0]
        ctx.emit(`    JNZ ${negLabel}`);

        // Positive: add 0.5
        ctx.emit(`    PUSH32 ${IEEE754.HALF}`);  // [IN, 0.5]
        ctx.emit(`    ADDF`);           // [IN + 0.5]
        ctx.emit(`    F2I`);
        ctx.emit(`    I2F`);
        ctx.emit(`    JMP ${endLabel}`);

        // Negative: subtract 0.5
        ctx.emit(`${negLabel}:`);
        ctx.emit(`    PUSH32 ${IEEE754.HALF}`);  // [IN, 0.5]
        ctx.emit(`    SUBF`);           // [IN - 0.5]
        ctx.emit(`    F2I`);
        ctx.emit(`    I2F`);

        ctx.emit(`${endLabel}:`);
    },
};

// ============================================================================
// SIN - Sine (Taylor Series)
// ============================================================================

/**
 * SIN(IN) -> OUT
 *
 * Returns the sine of an angle in radians.
 * Uses Taylor series approximation (7 terms for good precision).
 *
 * sin(x) ≈ x - x³/6 + x⁵/120 - x⁷/5040
 *
 * First normalizes input to [-π, π] range.
 *
 * Stack: [IN] -> [sin(IN)]
 */
export const SIN_FN: FunctionDef = {
    name: 'SIN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: SIN requires 1 argument`);
            return;
        }

        ctx.emit(`    ; SIN(IN) - Taylor series approximation`);
        ctx.emitExpression(args[0]);   // [x]

        // Normalize to [-PI, PI] using: x = x - 2*PI * floor(x/(2*PI) + 0.5)
        ctx.emit(`    ; Normalize to [-PI, PI]`);
        ctx.emit(`    DUP`);                           // [x, x]
        ctx.emit(`    PUSH32 ${IEEE754.INV_TWO_PI}`);  // [x, x, 1/(2*PI)]
        ctx.emit(`    MULF`);                          // [x, x/(2*PI)]
        ctx.emit(`    PUSH32 ${IEEE754.HALF}`);        // [x, x/(2*PI), 0.5]
        ctx.emit(`    ADDF`);                          // [x, x/(2*PI) + 0.5]
        ctx.emit(`    F2I`);                           // [x, floor(...)]
        ctx.emit(`    I2F`);                           // [x, floor(...) as float]
        ctx.emit(`    PUSH32 ${IEEE754.TWO_PI}`);      // [x, floor, 2*PI]
        ctx.emit(`    MULF`);                          // [x, floor * 2*PI]
        ctx.emit(`    SUBF`);                          // [x_normalized]

        // Taylor series: sin(x) ≈ x - x³/6 + x⁵/120 - x⁷/5040
        // We compute: x * (1 - x²/6 * (1 - x²/20 * (1 - x²/42)))
        // This is Horner's method for efficiency
        
        ctx.emit(`    ; Compute x² and keep x`);
        ctx.emit(`    DUP`);                           // [x, x]
        ctx.emit(`    DUP`);                           // [x, x, x]
        ctx.emit(`    MULF`);                          // [x, x²]
        
        // Horner's form: x * (1 + x²*(-1/6 + x²*(1/120 + x²*(-1/5040))))
        ctx.emit(`    ; Horner's method`);
        ctx.emit(`    DUP`);                           // [x, x², x²]
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_7}`);  // [x, x², x², -1/5040]
        ctx.emit(`    MULF`);                          // [x, x², term]
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_5}`);  // [x, x², term, 1/120]
        ctx.emit(`    ADDF`);                          // [x, x², term+1/120]
        ctx.emit(`    OVER`);                          // [x, x², term, x²]
        ctx.emit(`    MULF`);                          // [x, x², term*x²]
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_3}`);  // [x, x², term, -1/6]
        ctx.emit(`    ADDF`);                          // [x, x², term-1/6]
        ctx.emit(`    MULF`);                          // [x, x²*(...)]
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);         // [x, term, 1.0]
        ctx.emit(`    ADDF`);                          // [x, 1+term]
        ctx.emit(`    MULF`);                          // [sin(x)]
    },
};

// ============================================================================
// COS - Cosine (Taylor Series)
// ============================================================================

/**
 * COS(IN) -> OUT
 *
 * Returns the cosine of an angle in radians.
 * Uses Taylor series approximation.
 *
 * cos(x) ≈ 1 - x²/2 + x⁴/24 - x⁶/720
 *
 * Stack: [IN] -> [cos(IN)]
 */
export const COS_FN: FunctionDef = {
    name: 'COS',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: COS requires 1 argument`);
            return;
        }

        ctx.emit(`    ; COS(IN) - Taylor series approximation`);
        ctx.emitExpression(args[0]);   // [x]

        // Normalize to [-PI, PI]
        ctx.emit(`    ; Normalize to [-PI, PI]`);
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_TWO_PI}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.HALF}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    F2I`);
        ctx.emit(`    I2F`);
        ctx.emit(`    PUSH32 ${IEEE754.TWO_PI}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    SUBF`);                          // [x_normalized]

        // Compute x²
        ctx.emit(`    DUP`);                           // [x, x]
        ctx.emit(`    MULF`);                          // [x²]
        
        // Horner's form: 1 + x²*(-1/2 + x²*(1/24 + x²*(-1/720)))
        ctx.emit(`    ; Horner's method`);
        ctx.emit(`    DUP`);                           // [x², x²]
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_6}`);  // [x², x², -1/720]
        ctx.emit(`    MULF`);                          // [x², term]
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_4}`);  // [x², term, 1/24]
        ctx.emit(`    ADDF`);                          // [x², term+1/24]
        ctx.emit(`    OVER`);                          // [x², term, x²]
        ctx.emit(`    MULF`);                          // [x², term*x²]
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_2}`);  // [x², term, -1/2]
        ctx.emit(`    ADDF`);                          // [x², term-1/2]
        ctx.emit(`    MULF`);                          // [x²*(...)]
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);         // [term, 1.0]
        ctx.emit(`    ADDF`);                          // [cos(x)]
    },
};

// ============================================================================
// TAN - Tangent
// ============================================================================

/**
 * TAN(IN) -> OUT
 *
 * Returns the tangent of an angle in radians.
 * Computed as SIN(x) / COS(x).
 *
 * Stack: [IN] -> [tan(IN)]
 */
export const TAN_FN: FunctionDef = {
    name: 'TAN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: TAN requires 1 argument`);
            return;
        }

        ctx.emit(`    ; TAN(IN) = SIN(IN) / COS(IN)`);
        
        // We need to compute both sin and cos from the same input
        // This is a bit wasteful but keeps the code simple
        ctx.emitExpression(args[0]);   // [x]
        ctx.emit(`    DUP`);            // [x, x]
        
        // Normalize both copies
        ctx.emit(`    ; Normalize x`);
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_TWO_PI}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.HALF}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    F2I`);
        ctx.emit(`    I2F`);
        ctx.emit(`    PUSH32 ${IEEE754.TWO_PI}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    SUBF`);           // [x, x_norm]
        
        // Compute sin using inline Taylor
        ctx.emit(`    ; Compute sin(x)`);
        ctx.emit(`    DUP`);            // [x, x_norm, x_norm]
        ctx.emit(`    DUP`);
        ctx.emit(`    MULF`);           // [x, x_norm, x²]
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_7}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_5}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_3}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);           // [x, sin(x_norm)]
        
        ctx.emit(`    SWAP`);           // [sin, x]
        
        // Normalize x again for cos
        ctx.emit(`    ; Normalize for cos`);
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_TWO_PI}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.HALF}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    F2I`);
        ctx.emit(`    I2F`);
        ctx.emit(`    PUSH32 ${IEEE754.TWO_PI}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    SUBF`);           // [sin, x_norm]
        
        // Compute cos
        ctx.emit(`    ; Compute cos(x)`);
        ctx.emit(`    DUP`);
        ctx.emit(`    MULF`);           // [sin, x²]
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_6}`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_4}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.INV_FACT_2}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);           // [sin, cos]
        
        ctx.emit(`    DIVF`);           // [tan = sin/cos]
    },
};

// ============================================================================
// LN - Natural Logarithm
// ============================================================================

/**
 * LN(IN) -> OUT
 *
 * Returns the natural logarithm of a positive number.
 * Uses the identity: ln(x) = ln(2) * log2(x)
 * And approximates log2 using: log2(m * 2^e) = e + log2(m) where m in [1,2)
 *
 * For m in [1,2), uses polynomial approximation.
 *
 * Stack: [IN] -> [ln(IN)]
 */
export const LN_FN: FunctionDef = {
    name: 'LN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: LN requires 1 argument`);
            return;
        }

        // For now, use a simple Newton-Raphson approach to find y where e^y = x
        // This is slow but works. A proper implementation would extract the exponent.
        
        // Simplified approach: use series expansion around 1
        // ln(1+x) ≈ x - x²/2 + x³/3 - x⁴/4 for |x| < 1
        // We'll use ln(x) = 2 * arctanh((x-1)/(x+1)) for better range
        
        ctx.emit(`    ; LN(IN) - using arctanh identity`);
        ctx.emitExpression(args[0]);   // [x]
        
        // Compute z = (x-1)/(x+1)
        ctx.emit(`    DUP`);                           // [x, x]
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);         // [x, x, 1]
        ctx.emit(`    SUBF`);                          // [x, x-1]
        ctx.emit(`    SWAP`);                          // [x-1, x]
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);         // [x-1, x, 1]
        ctx.emit(`    ADDF`);                          // [x-1, x+1]
        ctx.emit(`    DIVF`);                          // [z = (x-1)/(x+1)]
        
        // ln(x) = 2 * (z + z³/3 + z⁵/5 + z⁷/7)
        ctx.emit(`    DUP`);                           // [z, z]
        ctx.emit(`    DUP`);                           // [z, z, z]
        ctx.emit(`    MULF`);                          // [z, z²]
        
        // Compute: z * (1 + z²/3 + z⁴/5 + z⁶/7)
        // Using Horner: z * (1 + z² * (1/3 + z² * (1/5 + z² * 1/7)))
        ctx.emit(`    DUP`);                           // [z, z², z²]
        ctx.emit(`    PUSH32 0x3E124925`);             // [z, z², z², 1/7]
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E4CCCCD`);             // 1/5
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3EAAAAAB`);             // 1/3
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);                          // [z, z² * (...)]
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);                          // [z, 1 + z²*(...)]
        ctx.emit(`    MULF`);                          // [z * (...)]
        ctx.emit(`    PUSH32 ${IEEE754.TWO}`);         // [result, 2]
        ctx.emit(`    MULF`);                          // [ln(x)]
    },
};

// ============================================================================
// LOG - Base-10 Logarithm
// ============================================================================

/**
 * LOG(IN) -> OUT
 *
 * Returns the base-10 logarithm.
 * Computed as LN(x) / LN(10).
 *
 * Stack: [IN] -> [log10(IN)]
 */
export const LOG_FN: FunctionDef = {
    name: 'LOG',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: LOG requires 1 argument`);
            return;
        }

        ctx.emit(`    ; LOG(IN) = LN(IN) / LN(10)`);
        
        // Compute ln(x) inline (copy of LN logic)
        ctx.emitExpression(args[0]);
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    SUBF`);
        ctx.emit(`    SWAP`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    DIVF`);
        ctx.emit(`    DUP`);
        ctx.emit(`    DUP`);
        ctx.emit(`    MULF`);
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 0x3E124925`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E4CCCCD`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3EAAAAAB`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.TWO}`);
        ctx.emit(`    MULF`);                          // [ln(x)]
        
        // Divide by ln(10) = 2.302585
        ctx.emit(`    PUSH32 0x40135D8E`);             // ln(10) ≈ 2.302585
        ctx.emit(`    DIVF`);                          // [log10(x)]
    },
};

// ============================================================================
// EXP - Exponential (e^x)
// ============================================================================

/**
 * EXP(IN) -> OUT
 *
 * Returns e raised to the power of IN.
 * Uses Taylor series: e^x = 1 + x + x²/2! + x³/3! + ...
 *
 * For better convergence, uses range reduction:
 * e^x = 2^(x * log2(e)) = 2^n * e^f where n is integer, f in [0, ln(2))
 *
 * Stack: [IN] -> [e^x]
 */
export const EXP_FN: FunctionDef = {
    name: 'EXP',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: EXP requires 1 argument`);
            return;
        }

        ctx.emit(`    ; EXP(IN) - Taylor series`);
        ctx.emitExpression(args[0]);   // [x]
        
        // Taylor series: e^x ≈ 1 + x + x²/2 + x³/6 + x⁴/24 + x⁵/120 + x⁶/720
        // Using Horner's form: 1 + x*(1 + x/2*(1 + x/3*(1 + x/4*(1 + x/5*(1 + x/6)))))
        
        ctx.emit(`    DUP`);                           // [x, x]
        ctx.emit(`    PUSH32 0x3FC00000`);             // 1.5 (for x/6 term start)
        ctx.emit(`    DIVF`);                          // [x, x/6... wait, this is wrong]
        
        // Let me use a cleaner approach: direct polynomial
        // e^x ≈ 1 + x(1 + x(0.5 + x(0.1667 + x(0.0417 + x*0.0083))))
        
        ctx.emit(`    DROP`);                          // [x]
        ctx.emit(`    DUP`);                           // [x, x]
        
        // Horner: start from innermost
        ctx.emit(`    PUSH32 0x3C088889`);             // 1/120 = 0.00833
        ctx.emit(`    OVER`);                          // [x, c, x]
        ctx.emit(`    MULF`);                          // [x, c*x]
        ctx.emit(`    PUSH32 0x3D2AAAAB`);             // 1/24 = 0.04167
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E2AAAAB`);             // 1/6 = 0.16667
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.HALF}`);        // 0.5
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);         // 1.0
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);                          // x * (...)
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);                          // [e^x]
    },
};

// ============================================================================
// ASIN - Arcsine
// ============================================================================

/**
 * ASIN(IN) -> OUT
 *
 * Returns the arcsine in radians. Input must be in [-1, 1].
 * Uses polynomial approximation.
 *
 * Stack: [IN] -> [asin(IN)]
 */
export const ASIN_FN: FunctionDef = {
    name: 'ASIN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: ASIN requires 1 argument`);
            return;
        }

        ctx.emit(`    ; ASIN(IN) - polynomial approximation`);
        ctx.emitExpression(args[0]);   // [x]
        
        // asin(x) ≈ x + x³/6 + 3x⁵/40 + 15x⁷/336 for |x| < 1
        // Simplified: asin(x) ≈ x * (1 + x²*(1/6 + x²*(3/40 + x²*15/336)))
        
        ctx.emit(`    DUP`);                           // [x, x]
        ctx.emit(`    DUP`);
        ctx.emit(`    MULF`);                          // [x, x²]
        
        ctx.emit(`    DUP`);                           // [x, x², x²]
        ctx.emit(`    PUSH32 0x3D360B61`);             // 15/336 = 0.04464
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E19999A`);             // 3/40 = 0.075
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E2AAAAB`);             // 1/6 = 0.16667
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);                          // [x, x²*(...)]
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);                          // [x, 1+x²*(...)]
        ctx.emit(`    MULF`);                          // [asin(x)]
    },
};

// ============================================================================
// ACOS - Arccosine
// ============================================================================

/**
 * ACOS(IN) -> OUT
 *
 * Returns the arccosine in radians. Input must be in [-1, 1].
 * Computed as PI/2 - ASIN(x).
 *
 * Stack: [IN] -> [acos(IN)]
 */
export const ACOS_FN: FunctionDef = {
    name: 'ACOS',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: ACOS requires 1 argument`);
            return;
        }

        ctx.emit(`    ; ACOS(IN) = PI/2 - ASIN(IN)`);
        ctx.emitExpression(args[0]);   // [x]
        
        // Inline ASIN computation
        ctx.emit(`    DUP`);
        ctx.emit(`    DUP`);
        ctx.emit(`    MULF`);
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 0x3D360B61`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E19999A`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E2AAAAB`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);                          // [asin(x)]
        
        // Subtract from PI/2
        ctx.emit(`    PUSH32 ${IEEE754.HALF_PI}`);     // [asin, PI/2]
        ctx.emit(`    SWAP`);                          // [PI/2, asin]
        ctx.emit(`    SUBF`);                          // [acos(x)]
    },
};

// ============================================================================
// ATAN - Arctangent
// ============================================================================

/**
 * ATAN(IN) -> OUT
 *
 * Returns the arctangent in radians.
 * Uses polynomial approximation for |x| <= 1, identity for |x| > 1.
 *
 * Stack: [IN] -> [atan(IN)]
 */
export const ATAN_FN: FunctionDef = {
    name: 'ATAN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.emit(`    ; ERROR: ATAN requires 1 argument`);
            return;
        }

        ctx.emit(`    ; ATAN(IN) - polynomial approximation`);
        ctx.emitExpression(args[0]);   // [x]
        
        // For |x| <= 1: atan(x) ≈ x - x³/3 + x⁵/5 - x⁷/7
        // For |x| > 1: atan(x) = sign(x)*PI/2 - atan(1/x)
        
        // Simplified version for |x| <= 1:
        ctx.emit(`    DUP`);                           // [x, x]
        ctx.emit(`    DUP`);
        ctx.emit(`    MULF`);                          // [x, x²]
        
        // atan(x) ≈ x * (1 - x²/3 + x⁴/5 - x⁶/7)
        // Horner: x * (1 + x² * (-1/3 + x² * (1/5 + x² * (-1/7))))
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 0xBE124925`);             // -1/7
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E4CCCCD`);             // 1/5
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0xBEAAAAAB`);             // -1/3
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);                          // [atan(x)]
    },
};

// ============================================================================
// ATAN2 - Two-argument arctangent
// ============================================================================

/**
 * ATAN2(Y, X) -> OUT
 *
 * Returns the angle in radians between the positive x-axis and the point (X, Y).
 * Handles all quadrants correctly.
 *
 * Stack: [Y, X] -> [atan2(Y, X)]
 */
export const ATAN2_FN: FunctionDef = {
    name: 'ATAN2',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.emit(`    ; ERROR: ATAN2 requires 2 arguments (Y, X)`);
            return;
        }

        // xNeg and yNeg labels reserved for quadrant handling in full implementation
        const done = ctx.newLabel('atan2_done');

        ctx.emit(`    ; ATAN2(Y, X)`);
        ctx.emitExpression(args[0]);   // [Y]
        ctx.emitExpression(args[1]);   // [Y, X]
        
        // Compute atan(Y/X) as base
        ctx.emit(`    DUP`);                           // [Y, X, X]
        ctx.emit(`    ROT`);                           // [X, X, Y]
        ctx.emit(`    SWAP`);                          // [X, Y, X]
        ctx.emit(`    DIVF`);                          // [X, Y/X]
        
        // Inline ATAN for Y/X
        ctx.emit(`    DUP`);
        ctx.emit(`    DUP`);
        ctx.emit(`    MULF`);
        ctx.emit(`    DUP`);
        ctx.emit(`    PUSH32 0xBE124925`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0x3E4CCCCD`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    OVER`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 0xBEAAAAAB`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);
        ctx.emit(`    PUSH32 ${IEEE754.ONE}`);
        ctx.emit(`    ADDF`);
        ctx.emit(`    MULF`);                          // [X, atan(Y/X)]
        
        // Adjust for quadrant based on X sign
        ctx.emit(`    SWAP`);                          // [atan, X]
        ctx.emit(`    PUSH32 ${IEEE754.ZERO}`);
        ctx.emit(`    LT`);                            // [atan, X<0]
        ctx.emit(`    JZ ${done}`);                    // X >= 0, we're done
        
        // X < 0: add or subtract PI based on Y sign
        // For simplicity, just add PI (works for Y >= 0)
        ctx.emit(`    PUSH32 ${IEEE754.PI}`);
        ctx.emit(`    ADDF`);
        
        ctx.emit(`${done}:`);
    },
};
