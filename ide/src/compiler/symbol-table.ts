/**
 * ZPLC Structured Text Symbol Table
 *
 * SPDX-License-Identifier: MIT
 *
 * Tracks variables and their memory addresses.
 * Handles memory layout according to ZPLC VM memory model:
 *   - IPI: 0x0000-0x0FFF (Input Process Image)
 *   - OPI: 0x1000-0x1FFF (Output Process Image)
 *   - WORK: 0x2000-0x3FFF (Work Memory)
 *   - RETAIN: 0x4000-0x4FFF (Retentive Memory)
 */

import { getDataTypeSize, getArrayTotalSize, isArrayType, DataType, VarSection } from './ast.ts';
import type { STDataType, DataTypeValue, VarSectionValue, IOAddress, VarDecl, Program, ArrayType, CompilationUnit, Expression } from './ast.ts';
import { getFB } from './stdlib/index.ts';

// ============================================================================
// Memory Layout Constants
// ============================================================================

export const MemoryLayout = {
    /** Input Process Image base address */
    IPI_BASE: 0x0000,
    /** Output Process Image base address */
    OPI_BASE: 0x1000,
    /** Work Memory base address */
    WORK_BASE: 0x2000,
    /** Retentive Memory base address */
    RETAIN_BASE: 0x4000,
} as const;

// ============================================================================
// Symbol Table Types
// ============================================================================

/**
 * A symbol entry in the symbol table.
 */
export interface Symbol {
    /** Variable name */
    name: string;
    /** Data type (elementary type, array type, or custom type) */
    dataType: STDataType;
    /** Absolute memory address */
    address: number;
    /** Size in bytes */
    size: number;
    /** Variable section (VAR, VAR_OUTPUT, etc.) */
    section: VarSectionValue;
    /** Optional I/O mapping */
    ioAddress: IOAddress | null;
    /** For function blocks and structs: member offsets */
    members: Map<string, number> | null;
}

/**
 * Definition of a user-defined function block.
 */
export interface UserFBDefinition {
    name: string;
    size: number;
    members: Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>;
}

/**
 * Definition of a user-defined struct.
 */
export interface UserStructDefinition {
    name: string;
    size: number;
    members: Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>;
}

/**
 * Symbol table for a compilation unit.
 */
export class SymbolTable {
    private symbols = new Map<string, Symbol>();
    private userFBs = new Map<string, UserFBDefinition>();
    private userStructs = new Map<string, UserStructDefinition>();
    private workOffset = 0;  // Current offset in work memory
    private readonly workBase: number;  // Base address for work memory

    /**
     * Create a new symbol table.
     * @param workMemoryBase - Base address for work memory allocation (default: 0x2000)
     */
    constructor(workMemoryBase: number = MemoryLayout.WORK_BASE) {
        this.workBase = workMemoryBase;
    }

    /**
     * Get the work memory base address.
     */
    getWorkBase(): number {
        return this.workBase;
    }

    /**
     * Get the current work memory offset (bytes used).
     */
    getWorkOffset(): number {
        return this.workOffset;
    }

    /**
     * Get a symbol by name.
     */
    get(name: string): Symbol | undefined {
        return this.symbols.get(name);
    }

    /**
     * Check if a symbol exists.
     */
    has(name: string): boolean {
        return this.symbols.has(name);
    }

    /**
     * Get all symbols.
     */
    all(): Symbol[] {
        return Array.from(this.symbols.values());
    }

    /**
     * Add a variable to the symbol table.
     * Automatically assigns memory address.
     */
    add(decl: VarDecl): Symbol {
        if (this.symbols.has(decl.name)) {
            throw new Error(`Symbol '${decl.name}' already defined`);
        }

        const varSize = isArrayType(decl.dataType as any)
            ? getArrayTotalSize(decl.dataType as any)
            : this.getTypeSizeByName(decl.dataType as any);

        let address: number;

        // Determine address based on section and I/O mapping
        if (decl.ioAddress) {
            // I/O mapped variable
            const isBool = decl.dataType === 'BOOL';
            const offset = isBool
                ? decl.ioAddress.byteOffset * 8 + decl.ioAddress.bitOffset
                : decl.ioAddress.byteOffset;

            if (decl.ioAddress.type === 'I') {
                address = MemoryLayout.IPI_BASE + offset;
            } else if (decl.ioAddress.type === 'Q') {
                address = MemoryLayout.OPI_BASE + offset;
            } else {
                address = this.workBase + offset;
            }
        } else {
            // Regular variable: allocate in work memory
            const alignment = Math.min(varSize, 4);
            this.workOffset = alignTo(this.workOffset, alignment);

            address = this.workBase + this.workOffset;
            this.workOffset += varSize;
        }

        // Create member map for function blocks or structs (stdlib or user-defined)
        let members: Map<string, number> | null = null;
        if (!isArrayType(decl.dataType)) {
            const typeName = decl.dataType as string;

            // 1. Check user-defined FBs
            const userFB = this.userFBs.get(typeName);
            if (userFB) {
                members = new Map();
                for (const [mName, mInfo] of userFB.members) {
                    members.set(mName, mInfo.offset);
                }
            } else {
                // 2. Check user-defined Structs
                const userStruct = this.userStructs.get(typeName);
                if (userStruct) {
                    members = new Map();
                    for (const [mName, mInfo] of userStruct.members) {
                        members.set(mName, mInfo.offset);
                    }
                } else {
                    // 3. Check stdlib FBs
                    const fbDef = getFB(typeName as DataTypeValue);
                    if (fbDef) {
                        members = new Map();
                        for (const member of fbDef.members) {
                            members.set(member.name, member.offset);
                        }
                    }
                }
            }
        }

        const symbol: Symbol = {
            name: decl.name,
            dataType: decl.dataType,
            address,
            size: varSize,
            section: decl.section,
            ioAddress: decl.ioAddress,
            members,
        };

        this.symbols.set(decl.name, symbol);
        return symbol;
    }

    /**
     * Get member address for a function block or struct.
     */
    getMemberAddress(parentName: string, memberName: string): number {
        const symbol = this.get(parentName);
        if (!symbol) {
            throw new Error(`Unknown symbol: ${parentName}`);
        }
        if (!symbol.members) {
            throw new Error(`Symbol '${parentName}' is not a function block instance or struct`);
        }
        const offset = symbol.members.get(memberName);
        if (offset === undefined) {
            throw new Error(`Unknown member '${memberName}' on instance '${parentName}'`);
        }
        return symbol.address + offset;
    }

    /**
     * Resolve a complex member path (e.g., SystemStatus.Motor1.Speed)
     * Returns the absolute memory address and the data type of the final member.
     */
    resolveMemberPath(expr: Expression): { address: number; dataType: STDataType } {
        if (expr.kind === 'Identifier') {
            const sym = this.get(expr.name);
            if (!sym) throw new Error(`Unknown variable: ${expr.name}`);
            return { address: sym.address, dataType: sym.dataType };
        }

        if (expr.kind === 'MemberAccess') {
            const parent = this.resolveMemberPath(expr.object);
            const typeName = (typeof parent.dataType === 'string') ? parent.dataType : null;

            if (!typeName) {
                throw new Error(`Cannot access member '${expr.member}' on non-struct type`);
            }

            // 1. Check user-defined structs
            const structDef = this.userStructs.get(typeName);
            if (structDef) {
                const member = structDef.members.get(expr.member);
                if (!member) throw new Error(`Unknown member '${expr.member}' on struct '${typeName}'`);
                return {
                    address: parent.address + member.offset,
                    dataType: member.dataType
                };
            }

            // 2. Check user-defined FBs
            const fbDef = this.userFBs.get(typeName);
            if (fbDef) {
                const member = fbDef.members.get(expr.member);
                if (!member) throw new Error(`Unknown member '${expr.member}' on FB '${typeName}'`);
                return {
                    address: parent.address + member.offset,
                    dataType: member.dataType
                };
            }

            // 3. Check stdlib FBs
            const stdFB = getFB(typeName as DataTypeValue);
            if (stdFB) {
                const member = stdFB.members.find(m => m.name === expr.member);
                if (!member) throw new Error(`Unknown member '${expr.member}' on FB '${typeName}'`);
                return {
                    address: parent.address + member.offset,
                    dataType: member.dataType as STDataType
                };
            }

            throw new Error(`Type '${typeName}' is not a struct or function block`);
        }

        if (expr.kind === 'ArrayAccess') {
            // NOTE: For now we only support constant array indexing in resolveMemberPath 
            // if it's used for target address calculation in simple ways.
            // But usually ArrayAccess address is calculated at runtime with MUL/ADD instructions.
            // However, nested member access AFTER an array access (e.g., arr[1].Member) 
            // would need this.
            throw new Error(`Array access in member path not fully implemented for codegen yet`);
        }

        throw new Error(`Invalid expression kind in member path: ${expr.kind}`);
    }

    /**
     * Register a user-defined function block definition.
     */
    addFBDefinition(name: string, members: Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>, totalSize: number): void {
        this.userFBs.set(name, { name, members, size: totalSize });
    }

    /**
     * Register a user-defined struct definition.
     */
    addStructDefinition(def: UserStructDefinition): void {
        this.userStructs.set(def.name, def);
    }

    getFBDefinition(name: string): UserFBDefinition | undefined {
        return this.userFBs.get(name);
    }

    getStructDefinition(name: string): UserStructDefinition | undefined {
        return this.userStructs.get(name);
    }

    /**
     * Check if a type is a function block (user-defined or stdlib).
     */
    isFBType(typeName: string): boolean {
        return this.userFBs.has(typeName) || !!getFB(typeName as DataTypeValue);
    }

    /**
     * Check if a type is a struct (user-defined).
     */
    isStructType(typeName: string): boolean {
        return this.userStructs.has(typeName);
    }

    /**
     * Get size of a data type (including user FBs and Structs).
     */
    getTypeSizeByName(typeName: DataTypeValue | string): number {
        const userFB = this.userFBs.get(typeName);
        if (userFB) return userFB.size;

        const structDef = this.userStructs.get(typeName);
        if (structDef) return structDef.size;

        const fbDef = getFB(typeName as DataTypeValue);
        if (fbDef) return fbDef.size;

        return getDataTypeSize(typeName as DataTypeValue);
    }

    /**
     * Get the size of the data type for a variable.
     */
    getTypeSize(name: string): number {
        const symbol = this.get(name);
        if (!symbol) {
            throw new Error(`Unknown symbol: ${name}`);
        }
        return symbol.size;
    }

    /**
     * Dump symbol table for debugging.
     */
    dump(): string {
        const lines: string[] = [
            '=== Symbol Table ===',
            'Name                 Type        Address    Size  Section',
            '-------------------- ----------- ---------- ----- -----------',
        ];

        for (const sym of this.symbols.values()) {
            const addrHex = `0x${sym.address.toString(16).padStart(4, '0')}`;
            const typeStr = typeof sym.dataType === 'string' ? sym.dataType : 'ARRAY';
            lines.push(
                `${sym.name.padEnd(20)} ${typeStr.padEnd(11)} ${addrHex.padEnd(10)} ${sym.size.toString().padStart(5)}  ${sym.section}`
            );

            // Dump members for function blocks or structs
            if (sym.members) {
                for (const [member, offset] of sym.members) {
                    const memberAddr = sym.address + offset;
                    const memberAddrHex = `0x${memberAddr.toString(16).padStart(4, '0')}`;
                    lines.push(
                        `  .${member.padEnd(17)} ${''.padEnd(11)} ${memberAddrHex}`
                    );
                }
            }
        }

        return lines.join('\n');
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Align a value to a boundary.
 */
function alignTo(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

/**
 * Build a symbol table from a parsed compilation unit or program.
 *
 * @param unit - Parsed compilation unit or program AST
 * @param workMemoryBase - Base address for work memory (default: 0x2000)
 * @returns Symbol table with all variables mapped to addresses
 */
export function buildSymbolTable(unit: CompilationUnit | Program, workMemoryBase?: number): SymbolTable {
    const table = new SymbolTable(workMemoryBase);

    if (unit.kind === 'CompilationUnit') {
        // 1. First Pass: Process Type Definitions (STRUCTs)
        if (unit.typeDefinitions) {
            for (const struct of unit.typeDefinitions) {
                const members = new Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>();
                let currentOffset = 0;
                for (const member of struct.members) {
                    const memberSize = isArrayType(member.dataType as any)
                        ? getArrayTotalSize(member.dataType as any)
                        : table.getTypeSizeByName(member.dataType as any);

                    const alignment = Math.min(memberSize, 4); // Align struct members
                    currentOffset = alignTo(currentOffset, alignment);

                    members.set(member.name, { offset: currentOffset, size: memberSize, dataType: member.dataType as any });
                    currentOffset += memberSize;
                }
                table.addStructDefinition({
                    name: struct.name,
                    size: currentOffset,
                    members
                });
            }
        }

        // 2. Second Pass: Process User-Defined FUNCTION_BLOCK definitions
        // Calculation of internal memory layout for FBs
        for (const fb of unit.functionBlocks) {
            const fbMembers = new Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>();
            let currentOffset = 0;

            const allVars = [...fb.inputs, ...fb.outputs, ...fb.inouts, ...fb.locals];
            for (const v of allVars) {
                const size = isArrayType(v.dataType as any)
                    ? getArrayTotalSize(v.dataType as any)
                    : table.getTypeSizeByName(v.dataType as any); // Use getTypeSizeByName to handle nested FBs/Structs

                const alignment = Math.min(size, 4);
                currentOffset = alignTo(currentOffset, alignment);

                fbMembers.set(v.name, { offset: currentOffset, size, dataType: v.dataType as any });
                currentOffset += size;
            }

            table.addFBDefinition(fb.name, fbMembers, currentOffset);
        }

        // 3. Process VAR_GLOBAL blocks
        for (const globalBlock of unit.globalVars) {
            for (const decl of globalBlock.variables) {
                table.add(decl);
            }
        }

        // 4. Process functions (inputs and locals)
        for (const func of unit.functions) {
            // Add inputs
            for (const input of func.inputs) {
                table.add(input);
            }
            // Add locals
            for (const local of func.locals) {
                table.add(local);
            }
            // Add function name as result variable
            table.add({
                kind: 'VarDecl',
                name: func.name,
                dataType: func.returnType,
                section: VarSection.VAR,
                initialValue: null,
                ioAddress: null,
                line: func.line,
                column: func.column,
            });
        }

        // 5. Process programs
        for (const program of unit.programs) {
            for (const block of program.varBlocks) {
                for (const decl of block.variables) {
                    table.add(decl);
                }
            }
        }
    } else {
        // Legacy support for single Program
        for (const block of (unit as Program).varBlocks) {
            for (const decl of block.variables) {
                table.add(decl);
            }
        }
    }

    return table;
}

/**
 * Get the load instruction size suffix for a data type.
 */
export function getLoadStoreSuffix(dataType: DataTypeValue): '8' | '16' | '32' | '64' {
    switch (dataType) {
        case DataType.BOOL:
        case DataType.SINT:
        case DataType.USINT:
            return '8';
        case DataType.INT:
        case DataType.UINT:
            return '16';
        case DataType.DINT:
        case DataType.UDINT:
        case DataType.REAL:
        case DataType.TIME:
            return '32';
        case DataType.LINT:
        case DataType.ULINT:
        case DataType.LREAL:
            return '64';
        default:
            return '32';
    }
}

/**
 * Get the appropriate load/store size for a member access.
 * Uses either the user FB definitions or the stdlib registry.
 */
export function getMemberLoadStoreSuffix(
    table: SymbolTable,
    fbType: string,
    memberName: string
): '8' | '16' | '32' | '64' {
    // 1. Check User-Defined FB
    const userFB = table.getFBDefinition(fbType);
    if (userFB) {
        const member = userFB.members.get(memberName);
        if (member) {
            switch (member.size) {
                case 1: return '8';
                case 2: return '16';
                case 4: return '32';
                case 8: return '64';
            }
        }
    }

    // 2. Fallback to stdlib
    const fbDef = getFB(fbType as DataTypeValue);
    if (fbDef) {
        const member = fbDef.members.find(m => m.name === memberName);
        if (member) {
            switch (member.size) {
                case 1: return '8';
                case 2: return '16';
                case 4: return '32';
                case 8: return '64';
            }
        }
    }
    return '32'; // Default to 32-bit
}
