/**
 * ZPLC Structured Text Compiler
 *
 * SPDX-License-Identifier: MIT
 *
 * Compiles IEC 61131-3 Structured Text to ZPLC bytecode.
 * Also supports visual languages (LD, FBD, SFC) via transpilation to ST.
 *
 * Usage:
 *   import { compileST, compileToBinary, compileProject } from './compiler';
 *
 *   // Compile ST directly
 *   const asm = compileST(source);
 *   console.log(asm);
 *
 *   // Get bytecode directly
 *   const result = compileToBinary(source);
 *   console.log(result.bytecode);
 *
 *   // Compile any language (ST, LD, FBD, SFC)
 *   const projectResult = compileProject(content, 'LD');
 *   console.log(projectResult.bytecode);
 */

// Re-export lexer
export { tokenize, TokenType, LexerError } from './lexer.ts';
export type { Token, TokenTypeValue } from './lexer.ts';

// Re-export AST types
export { DataType, VarSection, getDataTypeSize, parseTimeLiteral, parseIOAddress } from './ast.ts';
export type {
    ASTNode,
    CompilationUnit,
    Program,
    VarBlock,
    VarDecl,
    Statement,
    Expression,
    Assignment,
    IfStatement,
    FBCallStatement,
    FBCall,
    FBParameter,
    Identifier,
    MemberAccess,
    BoolLiteral,
    IntLiteral,
    TimeLiteral,
    UnaryExpr,
    BinaryExpr,
    IOAddress,
    DataTypeValue,
    VarSectionValue,
} from './ast.ts';

// Re-export parser
export { parse, ParseError } from './parser.ts';

// Re-export symbol table
export { SymbolTable, buildSymbolTable, MemoryLayout, getLoadStoreSuffix, getMemberLoadStoreSuffix } from './symbol-table.ts';
export type { Symbol } from './symbol-table.ts';

// Re-export stdlib
export { getFB, getFn, isFB, isFn, getAllFBNames, getAllFnNames } from './stdlib/index.ts';
export type { FunctionBlockDef, FunctionDef, CodeGenContext, MemberDef } from './stdlib/types.ts';

// Re-export code generator
export { generate } from './codegen.ts';

// Re-export transpilers
export { transpileLDToST, transpileFBDToST, transpileSFCToST } from './transpilers/index.ts';

// Import for main functions
import { parse } from './parser.ts';
import { generate } from './codegen.ts';
import { assemble } from '../assembler/index.ts';
import type { AssemblyResult } from '../assembler/index.ts';
import { transpileLDToST } from './transpilers/ld.ts';
import { transpileFBDToST } from './transpilers/fbd.ts';
import { transpileSFCToST } from './transpilers/sfc.ts';
import { parseLDModel } from '../models/ld.ts';
import { parseFBDModel } from '../models/fbd.ts';
import { parseSFCModel } from '../models/sfc.ts';

/**
 * Compiler error with source location.
 */
export class CompilerError extends Error {
    line: number;
    column: number;
    phase: 'lexer' | 'parser' | 'codegen' | 'assembler';

    constructor(message: string, line: number, column: number, phase: 'lexer' | 'parser' | 'codegen' | 'assembler') {
        super(`[${phase}] Error at ${line}:${column}: ${message}`);
        this.name = 'CompilerError';
        this.line = line;
        this.column = column;
        this.phase = phase;
    }
}

/**
 * Compilation result.
 */
export interface CompilationResult {
    /** Generated assembly source code */
    assembly: string;
    /** Raw bytecode (no header) */
    bytecode: Uint8Array;
    /** Complete .zplc file (header + segments + bytecode) */
    zplcFile: Uint8Array;
    /** Entry point address */
    entryPoint: number;
    /** Code size in bytes */
    codeSize: number;
}

/**
 * Compile Structured Text to ZPLC Assembly.
 *
 * @param source - ST source code
 * @returns Assembly source code as string
 * @throws CompilerError on compilation failure
 *
 * @example
 * ```typescript
 * const source = `
 * PROGRAM Blinky
 * VAR
 *     LedState : BOOL := FALSE;
 * END_VAR
 *
 * LedState := NOT LedState;
 *
 * END_PROGRAM
 * `;
 *
 * const assembly = compileST(source);
 * console.log(assembly);
 * ```
 */
export function compileST(source: string): string {
    // Parse ST to AST
    const ast = parse(source);

    if (ast.programs.length === 0) {
        throw new CompilerError('No program found in source', 1, 1, 'parser');
    }

    // For now, compile only the first program
    const program = ast.programs[0];

    // Generate assembly
    return generate(program);
}

/**
 * Compile Structured Text to ZPLC bytecode.
 *
 * This is a convenience function that chains the ST compiler with the assembler.
 *
 * @param source - ST source code
 * @returns Compilation result with bytecode and assembly
 * @throws CompilerError on compilation failure
 *
 * @example
 * ```typescript
 * const result = compileToBinary(source);
 *
 * // Download as .zplc file
 * const blob = new Blob([result.zplcFile], { type: 'application/octet-stream' });
 * ```
 */
export function compileToBinary(source: string): CompilationResult {
    // First, compile ST to assembly
    const assembly = compileST(source);

    // Then, assemble to bytecode
    let asmResult: AssemblyResult;
    try {
        asmResult = assemble(assembly);
    } catch (e) {
        const err = e as Error;
        throw new CompilerError(err.message, 0, 0, 'assembler');
    }

    return {
        assembly,
        bytecode: asmResult.bytecode,
        zplcFile: asmResult.zplcFile,
        entryPoint: asmResult.entryPoint,
        codeSize: asmResult.codeSize,
    };
}

/**
 * Validate Structured Text source without generating output.
 *
 * @param source - ST source code
 * @returns null if valid, or error message if invalid
 */
export function validate(source: string): string | null {
    try {
        parse(source);
        return null;
    } catch (e) {
        return (e as Error).message;
    }
}

// =============================================================================
// Unified Project Compilation
// =============================================================================

/**
 * Supported PLC languages.
 */
export type PLCLanguage = 'ST' | 'LD' | 'FBD' | 'SFC' | 'IL';

/**
 * Result of transpiling a visual language to ST.
 */
export interface TranspileResult {
    success: boolean;
    source: string;
    errors: string[];
}

/**
 * Result of compiling a project (any language).
 */
export interface ProjectCompilationResult extends CompilationResult {
    /** Original language */
    language: PLCLanguage;
    /** Intermediate ST code (for visual languages) */
    intermediateSTSource?: string;
    /** Transpilation errors (if any) */
    transpileErrors?: string[];
}

/**
 * Transpile a visual language to Structured Text.
 *
 * @param content - Source content (JSON for visual languages)
 * @param language - Source language (LD, FBD, SFC)
 * @returns TranspileResult with ST source code
 */
export function transpileToST(content: string, language: PLCLanguage): TranspileResult {
    switch (language) {
        case 'LD': {
            const model = parseLDModel(content);
            return transpileLDToST(model);
        }
        case 'FBD': {
            const model = parseFBDModel(content);
            return transpileFBDToST(model);
        }
        case 'SFC': {
            const model = parseSFCModel(content);
            return transpileSFCToST(model);
        }
        case 'ST':
            return { success: true, source: content, errors: [] };
        case 'IL':
            return { success: false, source: '', errors: ['IL compilation not yet supported. Use ST or visual languages.'] };
        default:
            return { success: false, source: '', errors: [`Unknown language: ${language}`] };
    }
}

/**
 * Compile a project from any supported language to ZPLC bytecode.
 *
 * This is the main entry point for the IDE "Compile" button. It handles:
 * - ST: Direct compilation
 * - LD/FBD/SFC: Transpile to ST, then compile
 *
 * @param content - Source content (ST code or JSON for visual languages)
 * @param language - Source language
 * @returns Compilation result with bytecode and metadata
 * @throws CompilerError on compilation failure
 *
 * @example
 * ```typescript
 * // Compile ST
 * const result = compileProject(stSource, 'ST');
 *
 * // Compile LD (from JSON)
 * const result = compileProject(ldJson, 'LD');
 * console.log(result.intermediateSTSource); // See transpiled ST
 *
 * // Download as .zplc file
 * const blob = new Blob([result.zplcFile], { type: 'application/octet-stream' });
 * ```
 */
export function compileProject(content: string, language: PLCLanguage): ProjectCompilationResult {
    let stSource = content;
    let intermediateSTSource: string | undefined;
    let transpileErrors: string[] = [];

    // Step 1: Transpile visual languages to ST
    if (language !== 'ST') {
        const transpileResult = transpileToST(content, language);
        
        if (!transpileResult.success) {
            throw new CompilerError(
                `Transpilation failed: ${transpileResult.errors.join('; ')}`,
                0, 0, 'parser'
            );
        }
        
        stSource = transpileResult.source;
        intermediateSTSource = transpileResult.source;
        transpileErrors = transpileResult.errors;
    }

    // Step 2: Compile ST to bytecode
    const compilationResult = compileToBinary(stSource);

    return {
        ...compilationResult,
        language,
        intermediateSTSource,
        transpileErrors: transpileErrors.length > 0 ? transpileErrors : undefined,
    };
}
