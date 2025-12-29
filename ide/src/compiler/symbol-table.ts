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

import { DataType, getDataTypeSize } from './ast.ts';
import type { DataTypeValue, VarSectionValue, IOAddress, VarDecl, Program } from './ast.ts';
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
    /** Data type */
    dataType: DataTypeValue;
    /** Absolute memory address */
    address: number;
    /** Size in bytes */
    size: number;
    /** Variable section (VAR, VAR_OUTPUT, etc.) */
    section: VarSectionValue;
    /** Optional I/O mapping */
    ioAddress: IOAddress | null;
    /** For function blocks: member offsets */
    members: Map<string, number> | null;
}

/**
 * Symbol table for a compilation unit.
 */
export class SymbolTable {
    private symbols = new Map<string, Symbol>();
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

        const size = getDataTypeSize(decl.dataType);
        let address: number;

        // Determine address based on section and I/O mapping
        if (decl.ioAddress) {
            // I/O mapped variable
            // For BOOL: each bit address gets its own byte (wastes memory but simplifies logic)
            // For larger types: use byte offset directly
            const isBool = decl.dataType === 'BOOL';
            const offset = isBool 
                ? decl.ioAddress.byteOffset * 8 + decl.ioAddress.bitOffset  // Spread bits across bytes
                : decl.ioAddress.byteOffset;
            
            if (decl.ioAddress.type === 'I') {
                // Input: IPI base + offset
                address = MemoryLayout.IPI_BASE + offset;
            } else if (decl.ioAddress.type === 'Q') {
                // Output: OPI base + offset
                address = MemoryLayout.OPI_BASE + offset;
            } else {
                // Memory: Work base + offset (uses instance work base)
                address = this.workBase + offset;
            }
        } else {
            // Regular variable: allocate in work memory
            // Align to natural boundary
            const alignment = Math.min(size, 4);
            this.workOffset = alignTo(this.workOffset, alignment);

            address = this.workBase + this.workOffset;
            this.workOffset += size;
        }

        // Create member map for function blocks using stdlib registry
        let members: Map<string, number> | null = null;
        const fbDef = getFB(decl.dataType);
        if (fbDef) {
            members = new Map();
            for (const member of fbDef.members) {
                members.set(member.name, member.offset);
            }
        }

        const symbol: Symbol = {
            name: decl.name,
            dataType: decl.dataType,
            address,
            size,
            section: decl.section,
            ioAddress: decl.ioAddress,
            members,
        };

        this.symbols.set(decl.name, symbol);
        return symbol;
    }

    /**
     * Get member address for a function block.
     */
    getMemberAddress(fbName: string, memberName: string): number {
        const symbol = this.get(fbName);
        if (!symbol) {
            throw new Error(`Unknown symbol: ${fbName}`);
        }
        if (!symbol.members) {
            throw new Error(`Symbol '${fbName}' is not a function block`);
        }
        const offset = symbol.members.get(memberName);
        if (offset === undefined) {
            throw new Error(`Unknown member '${memberName}' on '${fbName}'`);
        }
        return symbol.address + offset;
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
            lines.push(
                `${sym.name.padEnd(20)} ${sym.dataType.padEnd(11)} ${addrHex.padEnd(10)} ${sym.size.toString().padStart(5)}  ${sym.section}`
            );

            // Dump members for function blocks
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
 * Build a symbol table from a parsed program.
 * 
 * @param program - Parsed program AST
 * @param workMemoryBase - Base address for work memory (default: 0x2000)
 * @returns Symbol table with all variables mapped to addresses
 */
export function buildSymbolTable(program: Program, workMemoryBase?: number): SymbolTable {
    const table = new SymbolTable(workMemoryBase);

    for (const block of program.varBlocks) {
        for (const decl of block.variables) {
            table.add(decl);
        }
    }

    return table;
}

/**
 * Get the load instruction size suffix for a data type.
 */
export function getLoadStoreSuffix(dataType: DataTypeValue): '8' | '16' | '32' {
    switch (dataType) {
        case DataType.BOOL:
            return '8';
        case DataType.INT:
            return '16';
        case DataType.DINT:
        case DataType.REAL:
        case DataType.TIME:
            return '32';
        default:
            return '32';
    }
}

/**
 * Get the appropriate load/store size for a member access.
 * Uses the stdlib registry to look up member sizes dynamically.
 */
export function getMemberLoadStoreSuffix(fbType: DataTypeValue, memberName: string): '8' | '16' | '32' {
    const fbDef = getFB(fbType);
    if (fbDef) {
        const member = fbDef.members.find(m => m.name === memberName);
        if (member) {
            switch (member.size) {
                case 1: return '8';
                case 2: return '16';
                case 4: return '32';
            }
        }
    }
    return '32'; // Default to 32-bit
}
