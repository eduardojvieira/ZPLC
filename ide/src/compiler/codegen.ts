/**
 * ZPLC Structured Text Code Generator
 *
 * SPDX-License-Identifier: MIT
 *
 * Converts AST to ZPLC Assembly text.
 * This is the final stage of the ST compiler pipeline.
 *
 * The generated assembly can then be passed to the assembler
 * to produce bytecode.
 */

import type {
    Program,
    Statement,
    Expression,
    Assignment,
    IfStatement,
    WhileStatement,
    ForStatement,
    RepeatStatement,
    CaseStatement,
    ExitStatement as _ExitStatement,
    ContinueStatement as _ContinueStatement,
    ReturnStatement as _ReturnStatement,
    FBCallStatement,
    Identifier,
    MemberAccess,
    BoolLiteral,
    IntLiteral,
    RealLiteral,
    TimeLiteral,
    StringLiteral,
    UnaryExpr,
    BinaryExpr,
    FunctionCall,
} from './ast.ts';
import { buildSymbolTable, getLoadStoreSuffix, getMemberLoadStoreSuffix, MemoryLayout } from './symbol-table.ts';
import type { SymbolTable, Symbol } from './symbol-table.ts';
import { getFB, getFn } from './stdlib/index.ts';
import type { CodeGenContext } from './stdlib/types.ts';

// ============================================================================
// Memory Layout Constants
// ============================================================================

/**
 * Default address for the "already initialized" flag.
 * Located at the last byte of work memory to avoid conflicts with user variables.
 * Work memory: 0x2000-0x3FFF (8KB), so we use 0x3FFF by default.
 *
 * This flag ensures variable initialization only runs on the first cycle.
 * The VM resets PC to 0 each cycle, so without this guard, all variables
 * would be reset to initial values every scan cycle.
 * 
 * For multi-task compilation, each program gets its own init flag address
 * calculated relative to its work memory region.
 */
const DEFAULT_INIT_FLAG_ADDR = 0x3FFF;

/**
 * Size of work memory region allocated per program in multi-task mode.
 * Each program gets this many bytes of isolated work memory.
 * Must be a power of 2 for efficient alignment.
 */
export const WORK_MEMORY_REGION_SIZE = 256;

// ============================================================================
// Code Generator Configuration
// ============================================================================

/**
 * Configuration options for code generation.
 */
export interface CodeGenOptions {
    /**
     * Base address for work memory allocation.
     * Default: 0x2000 (standard ZPLC work memory base)
     */
    workMemoryBase?: number;
    
    /**
     * Address of the initialization flag.
     * If not specified, calculated as workMemoryBase + WORK_MEMORY_REGION_SIZE - 1
     */
    initFlagAddress?: number;
    
    /**
     * Enable source line annotations in assembly output for debugging.
     * When true, emits "; @source <line>" comments before statements.
     * Default: false
     */
    emitSourceAnnotations?: boolean;
}

// ============================================================================
// Code Generator
// ============================================================================

/**
 * String literal entry in the pool.
 */
interface StringLiteralEntry {
    value: string;
    address: number;
    size: number;  // Total bytes including header
}

/**
 * Loop context for EXIT/CONTINUE statement handling.
 * Each loop (WHILE, FOR, REPEAT) pushes a context onto the stack.
 */
interface LoopContext {
    /** Label to jump to for CONTINUE (start of next iteration) */
    continueLabel: string;
    /** Label to jump to for EXIT (end of loop) */
    exitLabel: string;
}

/**
 * Code generator state.
 */
interface CodeGenState {
    symbols: SymbolTable;
    output: string[];
    labelCounter: number;
    initFlagAddr: number;
    /** Pool of string literals allocated in work memory */
    stringLiterals: StringLiteralEntry[];
    /** Next available address for string literal allocation */
    stringLiteralNextAddr: number;
    /** Stack of loop contexts for EXIT/CONTINUE handling */
    loopStack: LoopContext[];
    /** Last emitted source line (for deduplication) */
    lastSourceLine: number;
    /** Enable source annotations in assembly output */
    emitSourceAnnotations: boolean;
}

/**
 * Generate ZPLC assembly from a parsed program.
 *
 * @param program - Parsed program AST
 * @param options - Optional code generation configuration
 * @returns Assembly source code
 */
export function generate(program: Program, options?: CodeGenOptions): string {
    const workMemoryBase = options?.workMemoryBase ?? MemoryLayout.WORK_BASE;
    const initFlagAddr = options?.initFlagAddress ?? 
        (options?.workMemoryBase !== undefined 
            ? workMemoryBase + WORK_MEMORY_REGION_SIZE - 1 
            : DEFAULT_INIT_FLAG_ADDR);
    const emitSourceAnnotations = options?.emitSourceAnnotations ?? false;
    
    const symbols = buildSymbolTable(program, workMemoryBase);
    
    // Calculate string literal pool base address
    // Place it after all declared variables but before the init flag
    const workOffset = symbols.getWorkOffset();
    const stringLiteralBase = workMemoryBase + workOffset;
    
    const state: CodeGenState = {
        symbols,
        output: [],
        labelCounter: 0,
        initFlagAddr,
        stringLiterals: [],
        stringLiteralNextAddr: stringLiteralBase,
        loopStack: [],
        lastSourceLine: 0,
        emitSourceAnnotations,
    };

    // First pass: collect all string literals from the program
    collectStringLiterals(state, program);

    // Emit header comment
    emit(state, `; ============================================================================`);
    emit(state, `; ZPLC Generated Assembly`);
    emit(state, `; Program: ${program.name}`);
    if (options?.workMemoryBase !== undefined) {
        emit(state, `; Work Memory Base: ${formatAddress(workMemoryBase)}`);
        emit(state, `; Init Flag: ${formatAddress(initFlagAddr)}`);
    }
    if (state.stringLiterals.length > 0) {
        emit(state, `; String Literals: ${state.stringLiterals.length} (${formatAddress(stringLiteralBase)} - ${formatAddress(state.stringLiteralNextAddr - 1)})`);
    }
    emit(state, `; ============================================================================`);
    emit(state, ``);

    // Emit memory map comment
    emitMemoryMap(state);

    // Emit program entry
    emit(state, `; === Program Entry ===`);
    emit(state, `_start:`);

    // Check if already initialized - skip to _cycle if so
    // This is critical because run_cycle() resets PC=0 each scan
    emit(state, `    ; Check if already initialized`);
    emit(state, `    LOAD8 ${formatAddress(state.initFlagAddr)}    ; _initialized flag`);
    emit(state, `    JNZ _cycle                  ; Skip init if already done`);

    // Emit initialization for variables with initial values
    emitInitialization(state, program);
    
    // Emit string literal initialization
    emitStringLiteralInit(state);

    // Set initialization flag
    emit(state, ``);
    emit(state, `    ; Mark as initialized`);
    emit(state, `    PUSH8 1`);
    emit(state, `    STORE8 ${formatAddress(state.initFlagAddr)}`);

    // Emit main loop label (for cyclic execution)
    emit(state, ``);
    emit(state, `; === Main Cycle ===`);
    emit(state, `_cycle:`);

    // Emit statements
    for (const stmt of program.statements) {
        emitStatement(state, stmt);
    }

    // Emit end of cycle
    emit(state, ``);
    emit(state, `    ; End of cycle`);
    emit(state, `    HALT`);

    return state.output.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

function emit(state: CodeGenState, line: string): void {
    state.output.push(line);
}

/**
 * Emit a source line annotation comment.
 * This allows the assembler to track source line → bytecode PC mapping.
 * Only emits if the line is different from the last emitted line (deduplication).
 */
function emitSourceAnnotation(state: CodeGenState, line: number | undefined): void {
    if (!state.emitSourceAnnotations || !line || line === state.lastSourceLine) {
        return;
    }
    state.lastSourceLine = line;
    emit(state, `    ; @source ${line}`);
}

function newLabel(state: CodeGenState, prefix: string): string {
    return `${prefix}_${state.labelCounter++}`;
}

function formatAddress(addr: number): string {
    return `0x${addr.toString(16).padStart(4, '0')}`;
}

// ============================================================================
// Memory Map Comment
// ============================================================================

function emitMemoryMap(state: CodeGenState): void {
    emit(state, `; === Memory Map ===`);
    
    // Document the reserved init flag
    emit(state, `; ${formatAddress(state.initFlagAddr)}: _initialized (BOOL, 1 byte) [RESERVED]`);
    
    for (const sym of state.symbols.all()) {
        const addrHex = formatAddress(sym.address);
        emit(state, `; ${addrHex}: ${sym.name} (${sym.dataType}, ${sym.size} bytes)`);

        // Emit member offsets for function blocks
        if (sym.members) {
            for (const [member, offset] of sym.members) {
                const memberAddr = formatAddress(sym.address + offset);
                emit(state, `;   ${memberAddr}: .${member}`);
            }
        }
    }
    
    // Document string literals
    if (state.stringLiterals.length > 0) {
        emit(state, `; --- String Literals ---`);
        for (let i = 0; i < state.stringLiterals.length; i++) {
            const lit = state.stringLiterals[i];
            const preview = lit.value.length > 20 ? lit.value.substring(0, 20) + '...' : lit.value;
            emit(state, `; ${formatAddress(lit.address)}: _str${i} = '${preview}' (${lit.size} bytes)`);
        }
    }
    
    emit(state, ``);
}

// ============================================================================
// String Literal Collection and Allocation
// ============================================================================

/**
 * STRING memory layout constants.
 * Matches zplc_isa.h definitions.
 */
const STRING_HEADER_SIZE = 4;  // 2 bytes length + 2 bytes capacity
// Default capacity is defined in zplc_isa.h as 80 bytes

/**
 * Calculate the size in bytes for a string literal.
 * Layout: [len:2][cap:2][data:cap+1]
 */
function getStringLiteralSize(value: string): number {
    // Use the string length as capacity (plus null terminator)
    const capacity = Math.max(value.length, 1);  // At least 1 char capacity
    return STRING_HEADER_SIZE + capacity + 1;  // +1 for null terminator
}

/**
 * Recursively collect all string literals from the program AST.
 * Allocates addresses for each unique literal.
 */
function collectStringLiterals(state: CodeGenState, program: Program): void {
    const seen = new Map<string, number>();  // value -> index in pool
    
    function visitExpression(expr: Expression): void {
        switch (expr.kind) {
            case 'StringLiteral':
                // Check if we've seen this literal before
                if (!seen.has(expr.value)) {
                    const size = getStringLiteralSize(expr.value);
                    const entry: StringLiteralEntry = {
                        value: expr.value,
                        address: state.stringLiteralNextAddr,
                        size,
                    };
                    seen.set(expr.value, state.stringLiterals.length);
                    state.stringLiterals.push(entry);
                    state.stringLiteralNextAddr += size;
                }
                break;
            case 'UnaryExpr':
                visitExpression(expr.operand);
                break;
            case 'BinaryExpr':
                visitExpression(expr.left);
                visitExpression(expr.right);
                break;
            case 'FunctionCall':
                for (const arg of expr.args) {
                    visitExpression(arg);
                }
                break;
            case 'FBCall':
                for (const param of expr.parameters) {
                    visitExpression(param.value);
                }
                break;
            default:
                break;
        }
    }
    
    function visitStatement(stmt: Statement): void {
        switch (stmt.kind) {
            case 'Assignment':
                visitExpression(stmt.value);
                break;
            case 'IfStatement':
                visitExpression(stmt.condition);
                for (const s of stmt.thenBranch) {
                    visitStatement(s);
                }
                // Visit ELSIF branches
                if (stmt.elsifBranches) {
                    for (const elsif of stmt.elsifBranches) {
                        visitExpression(elsif.condition);
                        for (const s of elsif.statements) {
                            visitStatement(s);
                        }
                    }
                }
                if (stmt.elseBranch) {
                    for (const s of stmt.elseBranch) {
                        visitStatement(s);
                    }
                }
                break;
            case 'WhileStatement':
                visitExpression(stmt.condition);
                for (const s of stmt.body) {
                    visitStatement(s);
                }
                break;
            case 'ForStatement':
                visitExpression(stmt.start);
                visitExpression(stmt.end);
                if (stmt.step) {
                    visitExpression(stmt.step);
                }
                for (const s of stmt.body) {
                    visitStatement(s);
                }
                break;
            case 'RepeatStatement':
                visitExpression(stmt.condition);
                for (const s of stmt.body) {
                    visitStatement(s);
                }
                break;
            case 'CaseStatement':
                visitExpression(stmt.selector);
                for (const branch of stmt.branches) {
                    for (const s of branch.statements) {
                        visitStatement(s);
                    }
                }
                if (stmt.elseBranch) {
                    for (const s of stmt.elseBranch) {
                        visitStatement(s);
                    }
                }
                break;
            case 'FBCallStatement':
                for (const param of stmt.parameters) {
                    visitExpression(param.value);
                }
                break;
            // ExitStatement, ContinueStatement, ReturnStatement have no expressions
            case 'ExitStatement':
            case 'ContinueStatement':
            case 'ReturnStatement':
                break;
        }
    }
    
    // Visit all variable initializers
    for (const block of program.varBlocks) {
        for (const decl of block.variables) {
            if (decl.initialValue) {
                visitExpression(decl.initialValue);
            }
        }
    }
    
    // Visit all statements
    for (const stmt of program.statements) {
        visitStatement(stmt);
    }
}

/**
 * Find the address of a string literal in the pool.
 * Returns undefined if not found.
 */
function findStringLiteralAddress(state: CodeGenState, value: string): number | undefined {
    const entry = state.stringLiterals.find(e => e.value === value);
    return entry?.address;
}

/**
 * Emit initialization code for all string literals.
 * Each string is initialized with its header (len, cap) and data bytes.
 */
function emitStringLiteralInit(state: CodeGenState): void {
    if (state.stringLiterals.length === 0) {
        return;
    }
    
    emit(state, ``);
    emit(state, `    ; --- String Literal Initialization ---`);
    
    for (let i = 0; i < state.stringLiterals.length; i++) {
        const lit = state.stringLiterals[i];
        const len = lit.value.length;
        const cap = len > 0 ? len : 1;  // At least capacity of 1
        
        emit(state, `    ; _str${i} = '${lit.value.substring(0, 20)}${lit.value.length > 20 ? '...' : ''}'`);
        
        // Store length (uint16 at offset 0)
        emit(state, `    PUSH16 ${len}`);
        emit(state, `    STORE16 ${formatAddress(lit.address)}`);
        
        // Store capacity (uint16 at offset 2)
        emit(state, `    PUSH16 ${cap}`);
        emit(state, `    STORE16 ${formatAddress(lit.address + 2)}`);
        
        // Store each character byte (offset 4+)
        for (let j = 0; j < len; j++) {
            const charCode = lit.value.charCodeAt(j);
            emit(state, `    PUSH8 ${charCode}       ; '${lit.value[j]}'`);
            emit(state, `    STORE8 ${formatAddress(lit.address + STRING_HEADER_SIZE + j)}`);
        }
        
        // Store null terminator
        emit(state, `    PUSH8 0           ; null terminator`);
        emit(state, `    STORE8 ${formatAddress(lit.address + STRING_HEADER_SIZE + len)}`);
    }
}

// ============================================================================
// Initialization
// ============================================================================

function emitInitialization(state: CodeGenState, program: Program): void {
    let hasInit = false;

    for (const block of program.varBlocks) {
        for (const decl of block.variables) {
            if (decl.initialValue) {
                if (!hasInit) {
                    emit(state, ``);
                    emit(state, `    ; --- Variable Initialization ---`);
                    hasInit = true;
                }

                const sym = state.symbols.get(decl.name);
                if (!sym) continue;

                emit(state, `    ; ${decl.name} := initial value`);
                emitExpression(state, decl.initialValue);
                emitStore(state, sym);
            }
        }
    }
}

// ============================================================================
// Statements
// ============================================================================

function emitStatement(state: CodeGenState, stmt: Statement): void {
    // Emit source annotation before the first instruction of this statement
    emitSourceAnnotation(state, stmt.line);
    
    switch (stmt.kind) {
        case 'Assignment':
            emitAssignment(state, stmt);
            break;
        case 'IfStatement':
            emitIfStatement(state, stmt);
            break;
        case 'WhileStatement':
            emitWhileStatement(state, stmt);
            break;
        case 'ForStatement':
            emitForStatement(state, stmt);
            break;
        case 'RepeatStatement':
            emitRepeatStatement(state, stmt);
            break;
        case 'CaseStatement':
            emitCaseStatement(state, stmt);
            break;
        case 'ExitStatement':
            emitExitStatement(state);
            break;
        case 'ContinueStatement':
            emitContinueStatement(state);
            break;
        case 'ReturnStatement':
            emitReturnStatement(state);
            break;
        case 'FBCallStatement':
            emitFBCallStatement(state, stmt);
            break;
        default:
            emit(state, `    ; ERROR: Unknown statement type ${(stmt as Statement).kind}`);
    }
}

function emitAssignment(state: CodeGenState, stmt: Assignment): void {
    emit(state, ``);

    if (stmt.target.kind === 'Identifier') {
        const sym = state.symbols.get(stmt.target.name);
        if (!sym) {
            emit(state, `    ; ERROR: Unknown variable ${stmt.target.name}`);
            return;
        }

        emit(state, `    ; ${stmt.target.name} := ...`);
        emitExpression(state, stmt.value);
        emitStore(state, sym);
    } else if (stmt.target.kind === 'MemberAccess') {
        const sym = state.symbols.get(stmt.target.object.name);
        if (!sym) {
            emit(state, `    ; ERROR: Unknown variable ${stmt.target.object.name}`);
            return;
        }

        emit(state, `    ; ${stmt.target.object.name}.${stmt.target.member} := ...`);
        emitExpression(state, stmt.value);

        const memberAddr = state.symbols.getMemberAddress(stmt.target.object.name, stmt.target.member);
        const suffix = getMemberLoadStoreSuffix(sym.dataType, stmt.target.member);
        emit(state, `    STORE${suffix} ${formatAddress(memberAddr)}`);
    }
}

function emitIfStatement(state: CodeGenState, stmt: IfStatement): void {
    const endLabel = newLabel(state, 'end_if');
    const hasElsif = stmt.elsifBranches && stmt.elsifBranches.length > 0;
    const hasElse = stmt.elseBranch && stmt.elseBranch.length > 0;
    
    // Generate labels for each ELSIF branch
    const elsifLabels: string[] = [];
    for (let i = 0; i < (stmt.elsifBranches?.length ?? 0); i++) {
        elsifLabels.push(newLabel(state, 'elsif'));
    }
    const elseLabel = hasElse ? newLabel(state, 'else') : null;
    
    // Determine where to jump if the main IF condition is false
    const firstFalseLabel = elsifLabels.length > 0 
        ? elsifLabels[0] 
        : (elseLabel ?? endLabel);

    emit(state, ``);
    emit(state, `    ; IF condition`);
    emitExpression(state, stmt.condition);
    emit(state, `    JZ ${firstFalseLabel}`);

    // THEN branch
    emit(state, `    ; THEN branch`);
    for (const s of stmt.thenBranch) {
        emitStatement(state, s);
    }
    
    // Jump to end after THEN (only if there are more branches)
    if (hasElsif || hasElse) {
        emit(state, `    JMP ${endLabel}`);
    }

    // ELSIF branches
    if (stmt.elsifBranches) {
        for (let i = 0; i < stmt.elsifBranches.length; i++) {
            const elsif = stmt.elsifBranches[i];
            const currentLabel = elsifLabels[i];
            
            // Determine where to jump if this ELSIF condition is false
            const nextFalseLabel = i + 1 < elsifLabels.length 
                ? elsifLabels[i + 1] 
                : (elseLabel ?? endLabel);
            
            emit(state, `${currentLabel}:`);
            emit(state, `    ; ELSIF condition`);
            emitExpression(state, elsif.condition);
            emit(state, `    JZ ${nextFalseLabel}`);
            
            emit(state, `    ; ELSIF branch`);
            for (const s of elsif.statements) {
                emitStatement(state, s);
            }
            emit(state, `    JMP ${endLabel}`);
        }
    }

    // ELSE branch
    if (hasElse && elseLabel) {
        emit(state, `${elseLabel}:`);
        emit(state, `    ; ELSE branch`);
        for (const s of stmt.elseBranch!) {
            emitStatement(state, s);
        }
    }

    emit(state, `${endLabel}:`);
}

/**
 * Emit a WHILE statement.
 *
 * Pattern:
 *   while_loop_N:
 *       <condition>
 *       JZ end_while_N
 *       <body>
 *       JMP while_loop_N
 *   end_while_N:
 */
function emitWhileStatement(state: CodeGenState, stmt: WhileStatement): void {
    const loopLabel = newLabel(state, 'while_loop');
    const endLabel = newLabel(state, 'end_while');
    
    // Push loop context for EXIT/CONTINUE handling
    state.loopStack.push({
        continueLabel: loopLabel,  // CONTINUE jumps to loop start (re-evaluate condition)
        exitLabel: endLabel,
    });
    
    emit(state, ``);
    emit(state, `    ; WHILE loop`);
    emit(state, `${loopLabel}:`);
    emit(state, `    ; condition`);
    emitExpression(state, stmt.condition);
    emit(state, `    JZ ${endLabel}`);
    
    emit(state, `    ; loop body`);
    for (const s of stmt.body) {
        emitStatement(state, s);
    }
    
    emit(state, `    JMP ${loopLabel}`);
    emit(state, `${endLabel}:`);
    
    // Pop loop context
    state.loopStack.pop();
}

/**
 * Emit a FOR statement.
 *
 * Pattern:
 *   ; FOR counter := start TO end BY step
 *   <start>
 *   STORE32 <counter_addr>
 *   for_loop_N:
 *       LOAD32 <counter_addr>
 *       <end>
 *       GT
 *       JNZ end_for_N
 *       <body>
 *   for_continue_N:
 *       LOAD32 <counter_addr>
 *       <step or PUSH8 1>
 *       ADD
 *       STORE32 <counter_addr>
 *       JMP for_loop_N
 *   end_for_N:
 */
function emitForStatement(state: CodeGenState, stmt: ForStatement): void {
    const loopLabel = newLabel(state, 'for_loop');
    const continueLabel = newLabel(state, 'for_continue');
    const endLabel = newLabel(state, 'end_for');
    
    // Get counter variable symbol
    const counterSym = state.symbols.get(stmt.counter);
    if (!counterSym) {
        emit(state, `    ; ERROR: Unknown loop counter variable ${stmt.counter}`);
        return;
    }
    
    const counterAddr = formatAddress(counterSym.address);
    const suffix = getLoadStoreSuffix(counterSym.dataType);
    
    // Push loop context for EXIT/CONTINUE handling
    state.loopStack.push({
        continueLabel: continueLabel,  // CONTINUE jumps to increment section
        exitLabel: endLabel,
    });
    
    emit(state, ``);
    emit(state, `    ; FOR ${stmt.counter} := start TO end`);
    
    // Initialize counter
    emit(state, `    ; counter := start`);
    emitExpression(state, stmt.start);
    emit(state, `    STORE${suffix} ${counterAddr}`);
    
    // Loop condition check
    emit(state, `${loopLabel}:`);
    emit(state, `    ; check: counter > end?`);
    emit(state, `    LOAD${suffix} ${counterAddr}`);
    emitExpression(state, stmt.end);
    emit(state, `    GT`);
    emit(state, `    JNZ ${endLabel}`);
    
    // Loop body
    emit(state, `    ; loop body`);
    for (const s of stmt.body) {
        emitStatement(state, s);
    }
    
    // Increment section (CONTINUE target)
    emit(state, `${continueLabel}:`);
    emit(state, `    ; counter := counter + step`);
    emit(state, `    LOAD${suffix} ${counterAddr}`);
    if (stmt.step) {
        emitExpression(state, stmt.step);
    } else {
        emit(state, `    PUSH8 1       ; default step`);
    }
    emit(state, `    ADD`);
    emit(state, `    STORE${suffix} ${counterAddr}`);
    emit(state, `    JMP ${loopLabel}`);
    
    emit(state, `${endLabel}:`);
    
    // Pop loop context
    state.loopStack.pop();
}

/**
 * Emit a REPEAT statement.
 *
 * Pattern:
 *   repeat_loop_N:
 *       <body>           ; executes at least once
 *   repeat_continue_N:
 *       <condition>
 *       JZ repeat_loop_N ; repeat while condition is FALSE
 *   end_repeat_N:
 */
function emitRepeatStatement(state: CodeGenState, stmt: RepeatStatement): void {
    const loopLabel = newLabel(state, 'repeat_loop');
    const continueLabel = newLabel(state, 'repeat_continue');
    const endLabel = newLabel(state, 'end_repeat');
    
    // Push loop context for EXIT/CONTINUE handling
    state.loopStack.push({
        continueLabel: continueLabel,  // CONTINUE jumps to condition check
        exitLabel: endLabel,
    });
    
    emit(state, ``);
    emit(state, `    ; REPEAT...UNTIL loop`);
    emit(state, `${loopLabel}:`);
    
    emit(state, `    ; loop body (executes at least once)`);
    for (const s of stmt.body) {
        emitStatement(state, s);
    }
    
    // Condition check (CONTINUE target)
    emit(state, `${continueLabel}:`);
    emit(state, `    ; UNTIL condition`);
    emitExpression(state, stmt.condition);
    emit(state, `    JZ ${loopLabel}   ; repeat while FALSE`);
    
    emit(state, `${endLabel}:`);
    
    // Pop loop context
    state.loopStack.pop();
}

/**
 * Emit a CASE statement.
 *
 * Pattern:
 *   ; CASE selector OF
 *   <selector>
 *   DUP
 *   PUSH8 <value1>
 *   EQ
 *   JNZ case_branch_0
 *   DUP
 *   PUSH8 <value2>
 *   EQ
 *   JNZ case_branch_1
 *   ...
 *   JMP case_else_N (or end_case if no else)
 *   case_branch_0:
 *       DROP
 *       <statements>
 *       JMP end_case_N
 *   case_branch_1:
 *       DROP
 *       <statements>
 *       JMP end_case_N
 *   case_else_N:
 *       DROP
 *       <statements>
 *   end_case_N:
 */
function emitCaseStatement(state: CodeGenState, stmt: CaseStatement): void {
    const endLabel = newLabel(state, 'end_case');
    const elseLabel = stmt.elseBranch ? newLabel(state, 'case_else') : null;
    
    // Generate labels for each branch
    const branchLabels: string[] = stmt.branches.map(() => newLabel(state, 'case_branch'));
    
    emit(state, ``);
    emit(state, `    ; CASE statement`);
    emit(state, `    ; evaluate selector`);
    emitExpression(state, stmt.selector);
    
    // Emit comparison for each branch
    for (let i = 0; i < stmt.branches.length; i++) {
        const branch = stmt.branches[i];
        const branchLabel = branchLabels[i];
        
        // Each branch can have multiple values or ranges
        for (const value of branch.values) {
            if (typeof value === 'number') {
                // Single value comparison
                emit(state, `    DUP`);
                if (value >= -128 && value <= 127) {
                    emit(state, `    PUSH8 ${value}`);
                } else if (value >= -32768 && value <= 32767) {
                    emit(state, `    PUSH16 ${value}`);
                } else {
                    emit(state, `    PUSH32 ${value}`);
                }
                emit(state, `    EQ`);
                emit(state, `    JNZ ${branchLabel}`);
            } else {
                // Range comparison: value.start..value.end
                // Check: selector >= start AND selector <= end
                emit(state, `    DUP`);
                if (value.start >= -128 && value.start <= 127) {
                    emit(state, `    PUSH8 ${value.start}`);
                } else {
                    emit(state, `    PUSH32 ${value.start}`);
                }
                emit(state, `    GE`);
                emit(state, `    DUP`);
                emit(state, `    JZ _skip_range_${state.labelCounter}`);
                emit(state, `    DROP`);
                emit(state, `    DUP`);
                if (value.end >= -128 && value.end <= 127) {
                    emit(state, `    PUSH8 ${value.end}`);
                } else {
                    emit(state, `    PUSH32 ${value.end}`);
                }
                emit(state, `    LE`);
                emit(state, `_skip_range_${state.labelCounter++}:`);
                emit(state, `    JNZ ${branchLabel}`);
            }
        }
    }
    
    // Jump to else or end if no match
    emit(state, `    JMP ${elseLabel ?? endLabel}`);
    
    // Emit each branch body
    for (let i = 0; i < stmt.branches.length; i++) {
        const branch = stmt.branches[i];
        const branchLabel = branchLabels[i];
        
        emit(state, `${branchLabel}:`);
        emit(state, `    DROP        ; discard selector`);
        for (const s of branch.statements) {
            emitStatement(state, s);
        }
        emit(state, `    JMP ${endLabel}`);
    }
    
    // Else branch
    if (elseLabel && stmt.elseBranch) {
        emit(state, `${elseLabel}:`);
        emit(state, `    DROP        ; discard selector`);
        emit(state, `    ; ELSE branch`);
        for (const s of stmt.elseBranch) {
            emitStatement(state, s);
        }
    } else if (!stmt.elseBranch) {
        // No else - still need to drop the selector before end
        // This handles the case where no branch matched and there's no else
        // We need a small shim to drop before ending
        emit(state, `${newLabel(state, 'case_drop')}:`);
        emit(state, `    DROP        ; discard selector (no match)`);
    }
    
    emit(state, `${endLabel}:`);
}

/**
 * Emit an EXIT statement.
 * Jumps to the exit label of the innermost loop.
 */
function emitExitStatement(state: CodeGenState): void {
    if (state.loopStack.length === 0) {
        emit(state, `    ; ERROR: EXIT outside of loop`);
        return;
    }
    
    const loopCtx = state.loopStack[state.loopStack.length - 1];
    emit(state, `    ; EXIT`);
    emit(state, `    JMP ${loopCtx.exitLabel}`);
}

/**
 * Emit a CONTINUE statement.
 * Jumps to the continue label of the innermost loop.
 */
function emitContinueStatement(state: CodeGenState): void {
    if (state.loopStack.length === 0) {
        emit(state, `    ; ERROR: CONTINUE outside of loop`);
        return;
    }
    
    const loopCtx = state.loopStack[state.loopStack.length - 1];
    emit(state, `    ; CONTINUE`);
    emit(state, `    JMP ${loopCtx.continueLabel}`);
}

/**
 * Emit a RETURN statement.
 * In PROGRAM context, this acts like HALT (end the cycle early).
 * In FUNCTION/FUNCTION_BLOCK context, this would emit RET.
 */
function emitReturnStatement(state: CodeGenState): void {
    emit(state, `    ; RETURN`);
    // For PROGRAM, RETURN ends the cycle early
    // We jump to the HALT at the end
    emit(state, `    HALT`);
}

function emitFBCallStatement(state: CodeGenState, stmt: FBCallStatement): void {
    const sym = state.symbols.get(stmt.fbName);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown function block ${stmt.fbName}`);
        return;
    }

    emit(state, ``);
    emit(state, `    ; ${stmt.fbName}(...)`);

    // Look up the FB definition in the stdlib registry
    const fbDef = getFB(sym.dataType);
    if (fbDef) {
        // Create the code generation context for this FB instance
        const ctx: CodeGenContext = {
            baseAddress: sym.address,
            instanceName: sym.name,
            newLabel: (prefix: string) => newLabel(state, prefix),
            emit: (line: string) => emit(state, line),
            emitExpression: (expr: Expression) => emitExpression(state, expr),
        };

        // Let the FB generate its own code
        fbDef.generateCall(ctx, stmt.parameters);
    } else {
        emit(state, `    ; ERROR: Unknown function block type ${sym.dataType}`);
    }
}

// ============================================================================
// Expressions
// ============================================================================

function emitExpression(state: CodeGenState, expr: Expression): void {
    switch (expr.kind) {
        case 'BoolLiteral':
            emitBoolLiteral(state, expr);
            break;
        case 'IntLiteral':
            emitIntLiteral(state, expr);
            break;
        case 'RealLiteral':
            emitRealLiteral(state, expr);
            break;
        case 'TimeLiteral':
            emitTimeLiteral(state, expr);
            break;
        case 'StringLiteral':
            emitStringLiteral(state, expr);
            break;
        case 'Identifier':
            emitIdentifier(state, expr);
            break;
        case 'MemberAccess':
            emitMemberAccess(state, expr);
            break;
        case 'UnaryExpr':
            emitUnaryExpr(state, expr);
            break;
        case 'BinaryExpr':
            emitBinaryExpr(state, expr);
            break;
        case 'FunctionCall':
            emitFunctionCall(state, expr);
            break;
        case 'FBCall':
            emit(state, `    ; TODO: Inline FB call expression`);
            break;
        default:
            emit(state, `    ; TODO: Expression type ${(expr as Expression).kind}`);
    }
}

function emitBoolLiteral(state: CodeGenState, expr: BoolLiteral): void {
    emit(state, `    PUSH8 ${expr.value ? 1 : 0}`);
}

function emitIntLiteral(state: CodeGenState, expr: IntLiteral): void {
    if (expr.value >= -128 && expr.value <= 127) {
        emit(state, `    PUSH8 ${expr.value}`);
    } else if (expr.value >= -32768 && expr.value <= 32767) {
        emit(state, `    PUSH16 ${expr.value}`);
    } else {
        emit(state, `    PUSH32 ${expr.value}`);
    }
}

/**
 * Emit a REAL (floating-point) literal.
 * Converts the float to IEEE 754 single-precision (32-bit) representation.
 */
function emitRealLiteral(state: CodeGenState, expr: RealLiteral): void {
    // Convert float to 32-bit IEEE 754 representation
    const buffer = new ArrayBuffer(4);
    const floatView = new Float32Array(buffer);
    const intView = new Uint32Array(buffer);
    
    floatView[0] = expr.value;
    const ieee754Bits = intView[0];
    
    emit(state, `    PUSH32 ${ieee754Bits}       ; ${expr.value} (REAL)`);
}

function emitTimeLiteral(state: CodeGenState, expr: TimeLiteral): void {
    // Time is stored in milliseconds as a 32-bit integer
    emit(state, `    PUSH32 ${expr.valueMs}       ; ${expr.rawValue}`);
}

/**
 * Emit a STRING literal.
 *
 * String literals are pre-allocated in work memory during the collection phase.
 * This function emits a PUSH of the literal's address.
 */
function emitStringLiteral(state: CodeGenState, expr: StringLiteral): void {
    const addr = findStringLiteralAddress(state, expr.value);
    if (addr !== undefined) {
        emit(state, `    PUSH16 ${formatAddress(addr)}   ; '${expr.value.substring(0, 20)}${expr.value.length > 20 ? '...' : ''}'`);
    } else {
        // Should not happen if collectStringLiterals was called
        emit(state, `    ; ERROR: String literal not found in pool: '${expr.value}'`);
        emit(state, `    PUSH16 0`);
    }
}

function emitIdentifier(state: CodeGenState, expr: Identifier): void {
    const sym = state.symbols.get(expr.name);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown variable ${expr.name}`);
        emit(state, `    PUSH8 0`);
        return;
    }

    // For STRING type, push the address (not load the value)
    if (sym.dataType === 'STRING') {
        emit(state, `    PUSH16 ${formatAddress(sym.address)}   ; &${expr.name}`);
        return;
    }

    const suffix = getLoadStoreSuffix(sym.dataType);
    emit(state, `    LOAD${suffix} ${formatAddress(sym.address)}`);
}

function emitMemberAccess(state: CodeGenState, expr: MemberAccess): void {
    const sym = state.symbols.get(expr.object.name);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown variable ${expr.object.name}`);
        emit(state, `    PUSH8 0`);
        return;
    }

    const memberAddr = state.symbols.getMemberAddress(expr.object.name, expr.member);
    const suffix = getMemberLoadStoreSuffix(sym.dataType, expr.member);
    emit(state, `    LOAD${suffix} ${formatAddress(memberAddr)}   ; ${expr.object.name}.${expr.member}`);
}

function emitUnaryExpr(state: CodeGenState, expr: UnaryExpr): void {
    emitExpression(state, expr.operand);
    switch (expr.operator) {
        case 'NOT':
            emit(state, `    NOT`);
            // For boolean NOT, we need to mask to get 0 or 1
            emit(state, `    PUSH8 1`);
            emit(state, `    AND`);
            break;
        case 'NEG':
            emit(state, `    NEG`);
            break;
    }
}

/**
 * Infer the data type of an expression.
 * Returns 'STRING' if the expression is a string type, otherwise returns the inferred type.
 */
function inferExpressionType(state: CodeGenState, expr: Expression): string {
    switch (expr.kind) {
        case 'StringLiteral':
            return 'STRING';
        case 'BoolLiteral':
            return 'BOOL';
        case 'IntLiteral':
            return 'INT';
        case 'RealLiteral':
            return 'REAL';
        case 'TimeLiteral':
            return 'TIME';
        case 'Identifier': {
            const sym = state.symbols.get(expr.name);
            return sym?.dataType ?? 'UNKNOWN';
        }
        case 'FunctionCall': {
            // String functions return STRING
            const stringFunctions = ['CONCAT', 'LEFT', 'RIGHT', 'MID', 'INSERT', 'DELETE', 'REPLACE', 'COPY', 'CLEAR'];
            if (stringFunctions.includes(expr.name)) {
                return 'STRING';
            }
            // Most other functions return numeric types
            return 'UNKNOWN';
        }
        case 'BinaryExpr':
            // For comparison operators, return BOOL
            if (['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'].includes(expr.operator)) {
                return 'BOOL';
            }
            // For arithmetic, inherit from left operand
            return inferExpressionType(state, expr.left);
        default:
            return 'UNKNOWN';
    }
}

/**
 * Check if an expression is of STRING type.
 */
function isStringExpression(state: CodeGenState, expr: Expression): boolean {
    return inferExpressionType(state, expr) === 'STRING';
}

/**
 * Check if an expression is of REAL (floating-point) type.
 * Returns true if the expression evaluates to a REAL value.
 */
function isFloatExpression(state: CodeGenState, expr: Expression): boolean {
    const exprType = inferExpressionType(state, expr);
    return exprType === 'REAL' || exprType === 'LREAL';
}

/**
 * Determine if a binary expression should use floating-point arithmetic.
 * Returns true if either operand is a float type (type promotion).
 */
function shouldUseFloatArithmetic(state: CodeGenState, left: Expression, right: Expression): boolean {
    return isFloatExpression(state, left) || isFloatExpression(state, right);
}

function emitBinaryExpr(state: CodeGenState, expr: BinaryExpr): void {
    // Check if this is a string operation
    const leftIsString = isStringExpression(state, expr.left);
    const rightIsString = isStringExpression(state, expr.right);
    
    if (leftIsString || rightIsString) {
        // String comparison: s1 = s2, s1 <> s2
        if (expr.operator === 'EQ' || expr.operator === 'NE') {
            emit(state, `    ; String comparison`);
            emitExpression(state, expr.left);
            emitExpression(state, expr.right);
            emit(state, `    STRCMP`);
            emit(state, `    PUSH8 0`);
            emit(state, expr.operator === 'EQ' ? `    EQ` : `    NE`);
            return;
        }
        
        // String concatenation: s1 + s2 is not standard IEC 61131-3
        // but we can support it by calling CONCAT
        if (expr.operator === 'ADD') {
            emit(state, `    ; String concatenation (s1 + s2)`);
            emit(state, `    ; NOTE: Use CONCAT() for proper string concatenation`);
            // For now, emit an error comment - proper concatenation needs a destination
            emit(state, `    ; ERROR: String + operator requires destination. Use CONCAT(s1, s2) instead.`);
            emitExpression(state, expr.left);
            return;
        }
        
        // Other operators don't make sense for strings
        emit(state, `    ; WARNING: Operator ${expr.operator} not supported for STRING type`);
    }
    
    // Check if we should use floating-point arithmetic
    const useFloat = shouldUseFloatArithmetic(state, expr.left, expr.right);
    
    // Standard numeric/boolean operations
    emitExpression(state, expr.left);
    emitExpression(state, expr.right);

    switch (expr.operator) {
        // Logical operators - always integer
        case 'AND': emit(state, `    AND`); break;
        case 'OR': emit(state, `    OR`); break;
        case 'XOR': emit(state, `    XOR`); break;
        
        // Arithmetic operators - use float variants when operands are REAL
        case 'ADD': emit(state, useFloat ? `    ADDF` : `    ADD`); break;
        case 'SUB': emit(state, useFloat ? `    SUBF` : `    SUB`); break;
        case 'MUL': emit(state, useFloat ? `    MULF` : `    MUL`); break;
        case 'DIV': emit(state, useFloat ? `    DIVF` : `    DIV`); break;
        
        // MOD doesn't have a float variant (integer only)
        case 'MOD': emit(state, `    MOD`); break;
        
        // Comparison operators - same opcodes work for int and float
        // (the VM compares 32-bit values on the stack bitwise)
        case 'EQ': emit(state, `    EQ`); break;
        case 'NE': emit(state, `    NE`); break;
        case 'LT': emit(state, `    LT`); break;
        case 'LE': emit(state, `    LE`); break;
        case 'GT': emit(state, `    GT`); break;
        case 'GE': emit(state, `    GE`); break;
    }
}

function emitFunctionCall(state: CodeGenState, expr: FunctionCall): void {
    const fnDef = getFn(expr.name);
    if (!fnDef) {
        emit(state, `    ; ERROR: Unknown function '${expr.name}'`);
        emit(state, `    PUSH8 0`);
        return;
    }

    emit(state, `    ; ${expr.name}(...)`);

    // Create code generation context for inline function
    const ctx: CodeGenContext = {
        baseAddress: 0, // Not used for stateless functions
        instanceName: expr.name,
        newLabel: (prefix: string) => newLabel(state, prefix),
        emit: (line: string) => emit(state, line),
        emitExpression: (e: Expression) => emitExpression(state, e),
    };

    // Let the function generate its inline code
    fnDef.generateInline(ctx, expr.args);
}

// ============================================================================
// Store Helper
// ============================================================================

function emitStore(state: CodeGenState, sym: Symbol): void {
    const suffix = getLoadStoreSuffix(sym.dataType);
    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
}
