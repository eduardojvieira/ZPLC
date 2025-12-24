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
    FBCallStatement,
    Identifier,
    MemberAccess,
    BoolLiteral,
    IntLiteral,
    TimeLiteral,
    UnaryExpr,
    BinaryExpr,
} from './ast.ts';
import { buildSymbolTable, getLoadStoreSuffix, getMemberLoadStoreSuffix } from './symbol-table.ts';
import type { SymbolTable, Symbol } from './symbol-table.ts';
import { getFB } from './stdlib/index.ts';
import type { CodeGenContext } from './stdlib/types.ts';

// ============================================================================
// Code Generator
// ============================================================================

/**
 * Code generator state.
 */
interface CodeGenState {
    symbols: SymbolTable;
    output: string[];
    labelCounter: number;
}

/**
 * Generate ZPLC assembly from a parsed program.
 *
 * @param program - Parsed program AST
 * @returns Assembly source code
 */
export function generate(program: Program): string {
    const symbols = buildSymbolTable(program);
    const state: CodeGenState = {
        symbols,
        output: [],
        labelCounter: 0,
    };

    // Emit header comment
    emit(state, `; ============================================================================`);
    emit(state, `; ZPLC Generated Assembly`);
    emit(state, `; Program: ${program.name}`);
    emit(state, `; ============================================================================`);
    emit(state, ``);

    // Emit memory map comment
    emitMemoryMap(state);

    // Emit program entry
    emit(state, `; === Program Entry ===`);
    emit(state, `_start:`);

    // Emit initialization for variables with initial values
    emitInitialization(state, program);

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
    emit(state, ``);
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
    switch (stmt.kind) {
        case 'Assignment':
            emitAssignment(state, stmt);
            break;
        case 'IfStatement':
            emitIfStatement(state, stmt);
            break;
        case 'FBCallStatement':
            emitFBCallStatement(state, stmt);
            break;
        default:
            emit(state, `    ; TODO: ${(stmt as Statement).kind}`);
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
    const elseLabel = stmt.elseBranch ? newLabel(state, 'else') : endLabel;

    emit(state, ``);
    emit(state, `    ; IF condition`);
    emitExpression(state, stmt.condition);
    emit(state, `    JZ ${elseLabel}`);

    // Then branch
    emit(state, `    ; THEN branch`);
    for (const s of stmt.thenBranch) {
        emitStatement(state, s);
    }

    if (stmt.elseBranch) {
        emit(state, `    JMP ${endLabel}`);
        emit(state, `${elseLabel}:`);
        emit(state, `    ; ELSE branch`);
        for (const s of stmt.elseBranch) {
            emitStatement(state, s);
        }
    }

    emit(state, `${endLabel}:`);
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
        case 'TimeLiteral':
            emitTimeLiteral(state, expr);
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

function emitTimeLiteral(state: CodeGenState, expr: TimeLiteral): void {
    // Time is stored in milliseconds as a 32-bit integer
    emit(state, `    PUSH32 ${expr.valueMs}       ; ${expr.rawValue}`);
}

function emitIdentifier(state: CodeGenState, expr: Identifier): void {
    const sym = state.symbols.get(expr.name);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown variable ${expr.name}`);
        emit(state, `    PUSH8 0`);
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

function emitBinaryExpr(state: CodeGenState, expr: BinaryExpr): void {
    emitExpression(state, expr.left);
    emitExpression(state, expr.right);

    switch (expr.operator) {
        case 'AND': emit(state, `    AND`); break;
        case 'OR': emit(state, `    OR`); break;
        case 'XOR': emit(state, `    XOR`); break;
        case 'ADD': emit(state, `    ADD`); break;
        case 'SUB': emit(state, `    SUB`); break;
        case 'MUL': emit(state, `    MUL`); break;
        case 'DIV': emit(state, `    DIV`); break;
        case 'MOD': emit(state, `    MOD`); break;
        case 'EQ': emit(state, `    EQ`); break;
        case 'NE': emit(state, `    NE`); break;
        case 'LT': emit(state, `    LT`); break;
        case 'LE': emit(state, `    LE`); break;
        case 'GT': emit(state, `    GT`); break;
        case 'GE': emit(state, `    GE`); break;
    }
}

// ============================================================================
// Store Helper
// ============================================================================

function emitStore(state: CodeGenState, sym: Symbol): void {
    const suffix = getLoadStoreSuffix(sym.dataType);
    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
}
