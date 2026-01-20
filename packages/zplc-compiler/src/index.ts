/**
 * @zplc/compiler - IEC 61131-3 Structured Text Compiler
 *
 * SPDX-License-Identifier: MIT
 *
 * A standalone compiler for IEC 61131-3 Structured Text that generates
 * ZPLC bytecode for embedded PLC runtimes.
 *
 * @example
 * ```typescript
 * import { compileToBinary, compileST } from '@zplc/compiler';
 *
 * const source = `
 * PROGRAM Blinky
 * VAR
 *     led : BOOL := FALSE;
 * END_VAR
 *     led := NOT led;
 * END_PROGRAM
 * `;
 *
 * // Get assembly output
 * const asm = compileST(source);
 *
 * // Get binary output
 * const result = compileToBinary(source);
 * console.log('Bytecode size:', result.codeSize);
 * ```
 */

// Re-export everything from the compiler module
export * from './compiler/index.ts';
