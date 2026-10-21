/**
 * ZPLC Standard Library - String Functions
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 String Functions:
 * - LEN(s)              : Get string length
 * - LEFT(s, n)          : Get n leftmost characters
 * - RIGHT(s, n)         : Get n rightmost characters  
 * - MID(s, pos, n)      : Get n characters starting at pos
 * - CONCAT(s1, s2)      : Concatenate two strings
 * - INSERT(s1, s2, pos) : Insert s2 into s1 at position
 * - DELETE(s, pos, n)   : Delete n characters at position
 * - REPLACE(s, s2, pos, n) : Replace n chars at pos with s2
 * - FIND(s1, s2)        : Find position of s2 in s1
 *
 * Additional Utility Functions:
 * - STRCMP(s1, s2)      : Compare strings (-1, 0, 1)
 * - COPY(src, dst)      : Copy string to destination
 * - CLEAR(s)            : Clear string to empty
 *
 * STRING Memory Layout:
 *   Offset 0: current_len (uint16_t)
 *   Offset 2: max_capacity (uint16_t)
 *   Offset 4: data[max_capacity+1] (null-terminated)
 *
 * All functions generate inline bytecode using the VM string opcodes.
 */

import type { FunctionDef, CodeGenContext } from './types.ts';
import type { Expression } from '../ast.ts';
import type { AsmLine } from '../asm-line.ts';

// String memory layout: [len:2][cap:2][data:cap+1]
// Constants defined in zplc_isa.h for consistency

/** "To the end of the string" for the length argument of the append routine. */
const REST = 0x7fff;

/**
 * A function that returns a string returns a work buffer, never one of its arguments: a string
 * function MUST NOT modify its arguments (CMP-021). The buffer holds as many characters as the
 * first argument can plus `extra`, and it is empty.
 */
function newString(ctx: CodeGenContext, first: Expression, extra = 0): number {
    if (!ctx.stringTemp) ctx.fail('This string function needs the code generator of a program', 'INTERNAL_COMPILER_ERROR');
    const capacity = Math.min(0xffff, (ctx.stringCapacity?.(first) ?? 80) + extra);
    const address = ctx.stringTemp(capacity);
    ctx.emit(`    PUSH16 ${address}`);
    ctx.emit('    STRCLR');
    return address;
}

/** Copy the string `source` into the buffer at `address`. */
function copyInto(ctx: CodeGenContext, address: number, source: Expression): void {
    ctx.emitExpression(source);
    ctx.emit(`    PUSH16 ${address}`);
    ctx.emit('    STRCPY');
}

/** Append characters of `source` to the buffer at `address`: [dst src start n] for the append routine. */
function append(ctx: CodeGenContext, address: number, source: Expression, start: () => void, count: () => void): void {
    ctx.emit(`    PUSH16 ${address}`);
    ctx.emitExpression(source);
    start();
    count();
    callHelper(ctx, 'strappend');
}

function callHelper(ctx: CodeGenContext, name: 'strappend' | 'strfind'): void {
    if (!ctx.callHelper) ctx.fail('This string function needs the code generator of a program', 'INTERNAL_COMPILER_ERROR');
    ctx.callHelper(name);
}

/** Six 32-bit work cells that the string routines share: none of them calls another of them. */
export interface StringCells {
    c0: number;
    c1: number;
    c2: number;
    c3: number;
    c4: number;
    c5: number;
}

const at = (n: number) => `0x${n.toString(16).padStart(4, '0')}`;

/**
 * Routine: append up to n characters of src, from the 0-based position start, to dst.
 * [dst src start n] -> []. A negative start or n is 0; what does not exist in src or does not fit
 * the capacity of dst is left out.
 */
export function strappendHelper(label: string, cells: StringCells, memcpyLabel: string): AsmLine[] {
    const dst = at(cells.c0),
        src = at(cells.c1),
        start = at(cells.c2),
        n = at(cells.c3);
    return [
        `${label}:`,
        `    STORE32 ${n}`,
        `    STORE32 ${start}`,
        `    STORE32 ${src}`,
        `    STORE32 ${dst}`,
        `    LOAD32 ${n}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_n_ok`,
        `    PUSH8 0`,
        `    STORE32 ${n}`,
        `${label}_n_ok:`,
        `    LOAD32 ${start}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_s_ok`,
        `    PUSH8 0`,
        `    STORE32 ${start}`,
        `${label}_s_ok:             ; n and start are not negative`,
        `    LOAD32 ${src}`,
        `    STRLEN`,
        `    LOAD32 ${start}`,
        `    SUB                 ; [avail] characters of src from start`,
        `    DUP`,
        `    LOAD32 ${n}`,
        `    LT                  ; [avail avail<n]`,
        `    JZ ${label}_keep_n`,
        `    STORE32 ${n}         ; n := avail`,
        `    JMP ${label}_clamped`,
        `${label}_keep_n:`,
        `    DROP`,
        `${label}_clamped:`,
        `    LOAD32 ${n}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_a_ok`,
        `    PUSH8 0`,
        `    STORE32 ${n}`,
        `${label}_a_ok:             ; room: capacity of dst minus its length`,
        `    LOAD32 ${dst}`,
        `    PUSH8 2`,
        `    ADD`,
        `    LOADI16`,
        `    LOAD32 ${dst}`,
        `    LOADI16`,
        `    SUB                 ; [room]`,
        `    DUP`,
        `    LOAD32 ${n}`,
        `    LT                  ; [room room<n]`,
        `    JZ ${label}_fits`,
        `    DUP`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_room_ok`,
        `    DROP`,
        `    PUSH8 0`,
        `${label}_room_ok:`,
        `    STORE32 ${n}         ; n := room`,
        `    JMP ${label}_copy`,
        `${label}_fits:`,
        `    DROP`,
        `${label}_copy:`,
        `    LOAD32 ${dst}`,
        `    LOADI16`,
        `    LOAD32 ${dst}`,
        `    ADD`,
        `    PUSH8 4`,
        `    ADD                 ; [dst + 4 + length]`,
        `    LOAD32 ${src}`,
        `    PUSH8 4`,
        `    ADD`,
        `    LOAD32 ${start}`,
        `    ADD                 ; [.. src + 4 + start]`,
        `    LOAD32 ${n}`,
        `    CALL ${memcpyLabel}`,
        `    LOAD32 ${dst}`,
        `    LOADI16`,
        `    LOAD32 ${n}`,
        `    ADD                 ; [new length]`,
        `    LOAD32 ${dst}`,
        `    OVER`,
        `    STOREI16            ; dst.length := new length`,
        `    LOAD32 ${dst}`,
        `    ADD`,
        `    PUSH8 4`,
        `    ADD`,
        `    PUSH8 0`,
        `    STOREI8             ; terminator`,
        `    RET`,
    ];
}

/**
 * Routine: keep, in place, up to n characters of s from the 0-based position start.
 * [s start n] -> []. LEFT, RIGHT and MID of a variable assigned to that same variable.
 */
export function strsubHelper(label: string, cells: StringCells, memcpyLabel: string): AsmLine[] {
    const s = at(cells.c0),
        start = at(cells.c1),
        n = at(cells.c2);
    return [
        `${label}:`,
        `    STORE32 ${n}`,
        `    STORE32 ${start}`,
        `    STORE32 ${s}`,
        `    LOAD32 ${n}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_n_ok`,
        `    PUSH8 0`,
        `    STORE32 ${n}`,
        `${label}_n_ok:`,
        `    LOAD32 ${start}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_s_ok`,
        `    PUSH8 0`,
        `    STORE32 ${start}`,
        `${label}_s_ok:`,
        `    LOAD32 ${s}`,
        `    STRLEN`,
        `    LOAD32 ${start}`,
        `    SUB                 ; [avail]`,
        `    DUP`,
        `    LOAD32 ${n}`,
        `    LT`,
        `    JZ ${label}_keep_n`,
        `    STORE32 ${n}`,
        `    JMP ${label}_clamped`,
        `${label}_keep_n:`,
        `    DROP`,
        `${label}_clamped:`,
        `    LOAD32 ${n}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_a_ok`,
        `    PUSH8 0`,
        `    STORE32 ${n}`,
        `${label}_a_ok:`,
        `    LOAD32 ${s}`,
        `    PUSH8 4`,
        `    ADD                 ; [s + 4]`,
        `    DUP`,
        `    LOAD32 ${start}`,
        `    ADD                 ; [dst src] the characters move towards the start`,
        `    LOAD32 ${n}`,
        `    CALL ${memcpyLabel}`,
        `    LOAD32 ${n}`,
        `    LOAD32 ${s}`,
        `    OVER`,
        `    STOREI16            ; s.length := n`,
        `    LOAD32 ${s}`,
        `    ADD`,
        `    PUSH8 4`,
        `    ADD`,
        `    PUSH8 0`,
        `    STOREI8             ; terminator`,
        `    RET`,
    ];
}

/**
 * Routine: remove, in place, up to n characters of s from the 0-based position pos.
 * [s pos n] -> []. DELETE of a variable assigned to that same variable.
 */
export function strdelHelper(label: string, cells: StringCells, memcpyLabel: string): AsmLine[] {
    const s = at(cells.c0),
        pos = at(cells.c1),
        n = at(cells.c2),
        len = at(cells.c3);
    return [
        `${label}:`,
        `    STORE32 ${n}`,
        `    STORE32 ${pos}`,
        `    STORE32 ${s}`,
        `    LOAD32 ${s}`,
        `    STRLEN`,
        `    STORE32 ${len}`,
        `    LOAD32 ${n}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_n_ok`,
        `    PUSH8 0`,
        `    STORE32 ${n}`,
        `${label}_n_ok:`,
        `    LOAD32 ${pos}`,
        `    PUSH8 0`,
        `    LT`,
        `    JZ ${label}_p_ok`,
        `    PUSH8 0`,
        `    STORE32 ${pos}`,
        `${label}_p_ok:`,
        `    LOAD32 ${pos}`,
        `    LOAD32 ${len}`,
        `    LT`,
        `    JNZ ${label}_inside`,
        `    RET                 ; nothing at or after pos`,
        `${label}_inside:`,
        `    LOAD32 ${len}`,
        `    LOAD32 ${pos}`,
        `    SUB                 ; [avail]`,
        `    DUP`,
        `    LOAD32 ${n}`,
        `    LT`,
        `    JZ ${label}_keep_n`,
        `    STORE32 ${n}`,
        `    JMP ${label}_move`,
        `${label}_keep_n:`,
        `    DROP`,
        `${label}_move:`,
        `    LOAD32 ${s}`,
        `    PUSH8 4`,
        `    ADD`,
        `    LOAD32 ${pos}`,
        `    ADD                 ; [dst = s + 4 + pos]`,
        `    DUP`,
        `    LOAD32 ${n}`,
        `    ADD                 ; [dst src = dst + n]`,
        `    LOAD32 ${len}`,
        `    LOAD32 ${pos}`,
        `    SUB`,
        `    LOAD32 ${n}`,
        `    SUB                 ; [dst src tail]`,
        `    CALL ${memcpyLabel}`,
        `    LOAD32 ${len}`,
        `    LOAD32 ${n}`,
        `    SUB                 ; [new length]`,
        `    LOAD32 ${s}`,
        `    OVER`,
        `    STOREI16`,
        `    LOAD32 ${s}`,
        `    ADD`,
        `    PUSH8 4`,
        `    ADD`,
        `    PUSH8 0`,
        `    STOREI8`,
        `    RET`,
    ];
}

/**
 * Routine: 1-based position of the first occurrence of s2 in s1, 0 when there is none (and for an
 * empty s2). [s1 s2] -> [pos].
 */
export function strfindHelper(label: string, cells: StringCells): AsmLine[] {
    const s1 = at(cells.c0),
        s2 = at(cells.c1),
        l1 = at(cells.c2),
        l2 = at(cells.c3),
        i = at(cells.c4),
        j = at(cells.c5);
    return [
        `${label}:`,
        `    STORE32 ${s2}`,
        `    STORE32 ${s1}`,
        `    LOAD32 ${s1}`,
        `    STRLEN`,
        `    STORE32 ${l1}`,
        `    LOAD32 ${s2}`,
        `    STRLEN`,
        `    STORE32 ${l2}`,
        `    LOAD32 ${l2}`,
        `    JZ ${label}_none`,
        `    PUSH8 0`,
        `    STORE32 ${i}`,
        `${label}_outer:`,
        `    LOAD32 ${i}`,
        `    LOAD32 ${l2}`,
        `    ADD`,
        `    LOAD32 ${l1}`,
        `    GT`,
        `    JNZ ${label}_none`,
        `    PUSH8 0`,
        `    STORE32 ${j}`,
        `${label}_inner:`,
        `    LOAD32 ${j}`,
        `    LOAD32 ${l2}`,
        `    LT`,
        `    JZ ${label}_found`,
        `    LOAD32 ${s1}`,
        `    PUSH8 4`,
        `    ADD`,
        `    LOAD32 ${i}`,
        `    ADD`,
        `    LOAD32 ${j}`,
        `    ADD`,
        `    LOADI8`,
        `    LOAD32 ${s2}`,
        `    PUSH8 4`,
        `    ADD`,
        `    LOAD32 ${j}`,
        `    ADD`,
        `    LOADI8`,
        `    NE`,
        `    JNZ ${label}_next`,
        `    LOAD32 ${j}`,
        `    PUSH8 1`,
        `    ADD`,
        `    STORE32 ${j}`,
        `    JMP ${label}_inner`,
        `${label}_next:`,
        `    LOAD32 ${i}`,
        `    PUSH8 1`,
        `    ADD`,
        `    STORE32 ${i}`,
        `    JMP ${label}_outer`,
        `${label}_found:`,
        `    LOAD32 ${i}`,
        `    PUSH8 1`,
        `    ADD`,
        `    RET`,
        `${label}_none:`,
        `    PUSH8 0`,
        `    RET`,
    ];
}

// ============================================================================
// LEN - Get String Length
// ============================================================================

/**
 * LEN(s: STRING) : INT
 *
 * Returns the current length of a string.
 * Uses STRLEN opcode which reads the length field directly.
 */
export const LEN_FN: FunctionDef = {
    name: 'LEN',
    argCount: 1,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; LEN(s)');
        ctx.emitExpression(args[0]);
        ctx.emit('    STRLEN');
    },
};

// ============================================================================
// CONCAT - Concatenate Two Strings
// ============================================================================

/**
 * CONCAT(s1: STRING, s2: STRING) : STRING
 *
 * Concatenates s1 and s2, appending s2 to s1.
 * Modifies s1 in place and returns its address.
 * Uses STRCAT opcode with bounds checking.
 */
export const CONCAT_FN: FunctionDef = {
    name: 'CONCAT',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; CONCAT(s1, s2) -> a new string s1 + s2');
        // The result is a work buffer: s1 and s2 are left as they were
        const result = newString(ctx, args[0], ctx.stringCapacity?.(args[1]) ?? 0);
        copyInto(ctx, result, args[0]);
        // STRCAT expects: [src_addr dst_addr]
        ctx.emitExpression(args[1]);
        ctx.emit(`    PUSH16 ${result}`);
        ctx.emit('    STRCAT');
        ctx.emit(`    PUSH16 ${result}   ; result`);
    },
};

// ============================================================================
// COPY - Copy String
// ============================================================================

/**
 * COPY(src: STRING, dst: STRING) : STRING
 *
 * Copies src to dst with bounds checking.
 * Returns dst address.
 */
export const COPY_FN: FunctionDef = {
    name: 'COPY',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; COPY(src, dst)');
        // STRCPY expects: [src_addr dst_addr]
        ctx.emitExpression(args[0]); // src
        ctx.emitExpression(args[1]); // dst
        ctx.emit('    STRCPY');
        // Return dst address
        ctx.emitExpression(args[1]);
    },
};

// ============================================================================
// CLEAR - Clear String
// ============================================================================

/**
 * CLEAR(s: STRING) : STRING
 *
 * Clears string to empty (length = 0).
 * Returns string address.
 */
export const CLEAR_FN: FunctionDef = {
    name: 'CLEAR',
    argCount: 1,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; CLEAR(s)');
        ctx.emitExpression(args[0]);
        ctx.emit('    STRCLR');
        ctx.emitExpression(args[0]);
    },
};

// ============================================================================
// LEFT - Get Leftmost Characters
// ============================================================================

/**
 * LEFT(s: STRING, n: INT) : STRING
 *
 * Truncates string to n leftmost characters.
 * Modifies s in place. If n >= LEN(s), no change.
 */
export const LEFT_FN: FunctionDef = {
    name: 'LEFT',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; LEFT(s, n) - the n leftmost characters, a new string');
        const result = newString(ctx, args[0]);
        append(
            ctx,
            result,
            args[0],
            () => ctx.emit('    PUSH8 0'),
            () => ctx.emitExpression(args[1]),
        );
        ctx.emit(`    PUSH16 ${result}   ; result`);
    },
};

// ============================================================================
// RIGHT - Get Rightmost Characters
// ============================================================================

/**
 * RIGHT(s: STRING, n: INT) : STRING
 *
 * Keeps only the n rightmost characters.
 * Shifts data left and updates length. If n >= LEN(s), no change.
 *
 * Algorithm:
 * 1. If n >= len, return unchanged
 * 2. offset = len - n (chars to skip)
 * 3. Copy data[offset..offset+n] to data[0..n]
 * 4. Update length to n
 *
 * Uses LOADI8/STOREI8 for byte-by-byte copy.
 */
export const RIGHT_FN: FunctionDef = {
    name: 'RIGHT',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; RIGHT(s, n) - the n rightmost characters, a new string');
        const result = newString(ctx, args[0]);
        append(
            ctx,
            result,
            args[0],
            () => {
                // start = LEN(s) - n; a negative start is taken as 0 (the whole string)
                ctx.emitExpression(args[0]);
                ctx.emit('    STRLEN');
                ctx.emitExpression(args[1]);
                ctx.emit('    SUB');
            },
            () => ctx.emitExpression(args[1]),
        );
        ctx.emit(`    PUSH16 ${result}   ; result`);
    },
};

// ============================================================================
// MID - Get Middle Substring
// ============================================================================

/**
 * MID(s: STRING, pos: INT, n: INT) : STRING
 *
 * Extracts n characters starting at position pos (1-based).
 * Modifies s in place by shifting data and updating length.
 *
 * Algorithm:
 * 1. offset = pos - 1 (convert to 0-based)
 * 2. actual_n = min(n, len - offset) (clamp to available chars)
 * 3. Copy data[offset..offset+actual_n] to data[0..actual_n]
 * 4. Update length to actual_n
 *
 * Uses LOADI8/STOREI8 for byte-by-byte copy.
 */
export const MID_FN: FunctionDef = {
    name: 'MID',
    argCount: 3,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; MID(s, pos, n) - n characters from the 1-based position pos, a new string');
        const result = newString(ctx, args[0]);
        append(
            ctx,
            result,
            args[0],
            () => {
                ctx.emitExpression(args[1]);
                ctx.emit('    PUSH8 1');
                ctx.emit('    SUB');
            },
            () => ctx.emitExpression(args[2]),
        );
        ctx.emit(`    PUSH16 ${result}   ; result`);
    },
};

// ============================================================================
// FIND - Find Substring Position
// ============================================================================

/**
 * FIND(s1: STRING, s2: STRING) : INT
 *
 * Returns position of first occurrence of s2 in s1 (1-based).
 * Returns 0 if not found.
 *
 * Implementation uses nested loops to search.
 */
export const FIND_FN: FunctionDef = {
    name: 'FIND',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; FIND(s1, s2) - 1-based position of s2 in s1, 0 when it is not there');
        ctx.emitExpression(args[0]);
        ctx.emitExpression(args[1]);
        callHelper(ctx, 'strfind');
    },
};

// ============================================================================
// INSERT - Insert Substring
// ============================================================================

/**
 * INSERT(s1: STRING, s2: STRING, pos: INT) : STRING
 *
 * Inserts s2 into s1 after the pos-th character (1-based) and returns the result as a new string; s1
 * is not modified (CMP-021).
 */
export const INSERT_FN: FunctionDef = {
    name: 'INSERT',
    argCount: 3,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; INSERT(s1, s2, pos) - s2 inserted into s1 after the pos-th character, a new string');
        const result = newString(ctx, args[0], ctx.stringCapacity?.(args[1]) ?? 0);
        // the first pos characters of s1, then s2, then the rest of s1
        append(
            ctx,
            result,
            args[0],
            () => ctx.emit('    PUSH8 0'),
            () => ctx.emitExpression(args[2]),
        );
        ctx.emitExpression(args[1]);
        ctx.emit(`    PUSH16 ${result}`);
        ctx.emit('    STRCAT');
        append(
            ctx,
            result,
            args[0],
            () => ctx.emitExpression(args[2]),
            () => ctx.emit(`    PUSH32 ${REST}`),
        );
        ctx.emit(`    PUSH16 ${result}   ; result`);
    },
};

// ============================================================================
// DELETE - Delete Characters
// ============================================================================

/**
 * DELETE(s: STRING, pos: INT, n: INT) : STRING
 *
 * Deletes n characters starting at position pos (1-based).
 * Returns modified string.
 *
 * Implementation: Reduces length by n (simplified).
 */
export const DELETE_FN: FunctionDef = {
    name: 'DELETE',
    argCount: 3,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; DELETE(s, pos, n) - s without n characters from the 1-based position pos, a new string');
        const result = newString(ctx, args[0]);
        // the characters before pos, then the ones after pos + n - 1
        append(
            ctx,
            result,
            args[0],
            () => ctx.emit('    PUSH8 0'),
            () => {
                ctx.emitExpression(args[1]);
                ctx.emit('    PUSH8 1');
                ctx.emit('    SUB');
            },
        );
        append(
            ctx,
            result,
            args[0],
            () => {
                ctx.emitExpression(args[1]);
                ctx.emitExpression(args[2]);
                ctx.emit('    ADD');
                ctx.emit('    PUSH8 1');
                ctx.emit('    SUB');
            },
            () => ctx.emit(`    PUSH32 ${REST}`),
        );
        ctx.emit(`    PUSH16 ${result}   ; result`);
    },
};

// ============================================================================
// REPLACE - Replace Characters
// ============================================================================

/**
 * REPLACE(s1: STRING, s2: STRING, pos: INT, n: INT) : STRING
 *
 * Replaces n characters at position pos in s1 with s2.
 * Returns modified s1.
 *
 * Simplified: Just copies s2 to s1 (full replace).
 */
export const REPLACE_FN: FunctionDef = {
    name: 'REPLACE',
    argCount: 4,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; REPLACE(s1, s2, pos, n) - n characters of s1 from pos replaced by s2, a new string');
        const result = newString(ctx, args[0], ctx.stringCapacity?.(args[1]) ?? 0);
        append(
            ctx,
            result,
            args[0],
            () => ctx.emit('    PUSH8 0'),
            () => {
                ctx.emitExpression(args[2]);
                ctx.emit('    PUSH8 1');
                ctx.emit('    SUB');
            },
        );
        ctx.emitExpression(args[1]);
        ctx.emit(`    PUSH16 ${result}`);
        ctx.emit('    STRCAT');
        append(
            ctx,
            result,
            args[0],
            () => {
                ctx.emitExpression(args[2]);
                ctx.emitExpression(args[3]);
                ctx.emit('    ADD');
                ctx.emit('    PUSH8 1');
                ctx.emit('    SUB');
            },
            () => ctx.emit(`    PUSH32 ${REST}`),
        );
        ctx.emit(`    PUSH16 ${result}   ; result`);
    },
};

// ============================================================================
// STRCMP - Compare Strings
// ============================================================================

/**
 * STRCMP(s1: STRING, s2: STRING) : INT
 *
 * Compares two strings lexicographically.
 * Returns: -1 if s1 < s2, 0 if s1 == s2, 1 if s1 > s2
 */
export const STRCMP_FN: FunctionDef = {
    name: 'STRCMP',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; STRCMP(s1, s2)');
        ctx.emitExpression(args[0]);
        ctx.emitExpression(args[1]);
        ctx.emit('    STRCMP');
    },
};

// ============================================================================
// EQ_STRING - String Equality
// ============================================================================

/**
 * EQ_STRING(s1: STRING, s2: STRING) : BOOL
 *
 * Returns TRUE if strings are equal, FALSE otherwise.
 */
export const EQ_STRING_FN: FunctionDef = {
    name: 'EQ_STRING',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; EQ_STRING(s1, s2) = (STRCMP == 0)');
        ctx.emitExpression(args[0]);
        ctx.emitExpression(args[1]);
        ctx.emit('    STRCMP');
        ctx.emit('    PUSH8 0');
        ctx.emit('    EQ');
    },
};

// ============================================================================
// NE_STRING - String Inequality
// ============================================================================

/**
 * NE_STRING(s1: STRING, s2: STRING) : BOOL
 *
 * Returns TRUE if strings are not equal, FALSE otherwise.
 */
export const NE_STRING_FN: FunctionDef = {
    name: 'NE_STRING',
    argCount: 2,
    variadic: false,
    generateInline: (ctx: CodeGenContext, args: Expression[]) => {
        ctx.emit('    ; NE_STRING(s1, s2) = (STRCMP != 0)');
        ctx.emitExpression(args[0]);
        ctx.emitExpression(args[1]);
        ctx.emit('    STRCMP');
        ctx.emit('    PUSH8 0');
        ctx.emit('    NE');
    },
};

// ============================================================================
// Exports
// ============================================================================

export const STRING_FUNCTIONS: FunctionDef[] = [
    // Standard IEC 61131-3
    LEN_FN,
    CONCAT_FN,
    LEFT_FN,
    RIGHT_FN,
    MID_FN,
    FIND_FN,
    INSERT_FN,
    DELETE_FN,
    REPLACE_FN,
    // Utility functions
    STRCMP_FN,
    COPY_FN,
    CLEAR_FN,
    EQ_STRING_FN,
    NE_STRING_FN,
];
