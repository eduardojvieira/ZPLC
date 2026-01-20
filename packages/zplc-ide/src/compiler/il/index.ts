/**
 * ZPLC Instruction List (IL) Compiler Module
 *
 * SPDX-License-Identifier: MIT
 *
 * This module provides full IEC 61131-3 Instruction List language support.
 * IL programs are transpiled to Structured Text, then compiled using the
 * existing ST compiler pipeline.
 */

// Re-export lexer
export { tokenizeIL, ILLexerError, ILTokenType } from './lexer';
export type { ILToken, ILTokenTypeValue } from './lexer';

// Re-export parser
export { parseIL, ILParseError } from './parser';
export type {
    ILProgram,
    ILInstruction,
    ILVarBlock,
    ILVarDecl,
    ILOperand,
    ILFBParam,
    ILOperator,
    ILOperatorCategory,
} from './parser';

// Re-export transpiler
export { transpileILToST } from './ilToST';
export type { TranspileResult } from './ilToST';
