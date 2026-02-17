/**
 * ZPLC Debug Map Types
 *
 * SPDX-License-Identifier: MIT
 *
 * Provides source-level debugging information for compiled ZPLC programs.
 * This includes:
 * - Variable locations (address, type, region)
 * - Function Block instance internals (children members)
 * - Source line to bytecode PC mapping
 * - Breakpoint locations
 */

// ============================================================================
// Variable Information
// ============================================================================

/**
 * Memory region where a variable is stored.
 */
export type MemoryRegion = 'IPI' | 'OPI' | 'WORK' | 'RETAIN' | 'CODE';

/**
 * Data type for debug purposes.
 */
export type DebugDataType = 
    | 'BOOL' | 'BYTE' | 'SINT' | 'USINT'
    | 'INT' | 'UINT' | 'WORD'
    | 'DINT' | 'UDINT' | 'DWORD' | 'REAL'
    | 'LINT' | 'ULINT' | 'LWORD' | 'LREAL'
    | 'TIME' | 'STRING'
    | string; // FB type names

/**
 * Debug information for a variable.
 */
export interface DebugVarInfo {
    /** Absolute memory address */
    addr: number;
    /** Data type */
    type: DebugDataType;
    /** Memory region */
    region: MemoryRegion;
    /** Size in bytes */
    size: number;
    /** For STRING: max capacity */
    capacity?: number;
    /** For FB instances: child member information */
    children?: Record<string, DebugMemberInfo>;
}

/**
 * Debug information for a Function Block member.
 */
export interface DebugMemberInfo {
    /** Offset from instance base address */
    offset: number;
    /** Data type */
    type: DebugDataType;
    /** Size in bytes */
    size: number;
    /** True if this is an input */
    isInput?: boolean;
    /** True if this is an output */
    isOutput?: boolean;
}

// ============================================================================
// Source Mapping
// ============================================================================

/**
 * Mapping from source line to bytecode location.
 */
export interface SourceLineMapping {
    /** Source line number (1-based) */
    line: number;
    /** Source column (1-based, optional) */
    column?: number;
    /** Bytecode PC (program counter) where this line starts */
    pc: number;
    /** Number of bytecode bytes for this line */
    length: number;
}

/**
 * Breakpoint location information.
 */
export interface BreakpointLocation {
    /** Source line number */
    line: number;
    /** Bytecode PC for setting breakpoint */
    pc: number;
    /** True if this line is a valid breakpoint target */
    valid: boolean;
}

// ============================================================================
// Program/POU Information
// ============================================================================

/**
 * Debug information for a Program Organization Unit (POU).
 */
export interface DebugPOUInfo {
    /** POU type */
    type: 'PROGRAM' | 'FUNCTION' | 'FUNCTION_BLOCK';
    /** Entry point PC (for PROGRAM/FUNCTION) */
    entryPoint?: number;
    /** Variable information */
    vars: Record<string, DebugVarInfo>;
    /** Source line mappings */
    sourceMap: SourceLineMapping[];
    /** Valid breakpoint locations */
    breakpoints: BreakpointLocation[];
}

// ============================================================================
// Complete Debug Map
// ============================================================================

/**
 * Complete debug information for a compiled ZPLC program.
 * This is emitted alongside the .zplc binary file.
 */
export interface DebugMap {
    /** Version of the debug map format */
    version: string;
    /** Program name */
    programName: string;
    /** Compiler version that generated this map */
    compilerVersion: string;
    /** Timestamp when the map was generated */
    generatedAt: string;
    /** POU information indexed by name */
    pou: Record<string, DebugPOUInfo>;
    /** Global string literal pool */
    stringPool?: {
        baseAddress: number;
        entries: Array<{
            value: string;
            address: number;
            size: number;
        }>;
    };
    /** Memory layout information */
    memoryLayout: {
        ipiBase: number;
        ipiSize: number;
        opiBase: number;
        opiSize: number;
        workBase: number;
        workSize: number;
        retainBase: number;
        retainSize: number;
        codeBase: number;
        codeSize: number;
    };
}

// ============================================================================
// Builder Helpers
// ============================================================================

/**
 * Creates an empty debug map with default values.
 */
export function createDebugMap(programName: string): DebugMap {
    return {
        version: '1.0.0',
        programName,
        compilerVersion: '1.2.0',
        generatedAt: new Date().toISOString(),
        pou: {},
        memoryLayout: {
            ipiBase: 0x0000,
            ipiSize: 0x1000,
            opiBase: 0x1000,
            opiSize: 0x1000,
            workBase: 0x2000,
            workSize: 0x2000,
            retainBase: 0x4000,
            retainSize: 0x1000,
            codeBase: 0x5000,
            codeSize: 0xB000,
        },
    };
}

/**
 * Creates debug variable info from symbol table entry.
 */
export function createDebugVarInfo(
    addr: number,
    type: string,
    region: MemoryRegion,
    size: number,
    children?: Record<string, DebugMemberInfo>
): DebugVarInfo {
    return {
        addr,
        type: type as DebugDataType,
        region,
        size,
        children,
    };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize debug map to JSON string.
 */
export function serializeDebugMap(map: DebugMap): string {
    return JSON.stringify(map, null, 2);
}

/**
 * Parse debug map from JSON string.
 */
export function parseDebugMap(json: string): DebugMap {
    return JSON.parse(json) as DebugMap;
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Find a variable by path (e.g., "MyTimer.ET").
 */
export function findVariable(
    map: DebugMap,
    path: string
): { varInfo: DebugVarInfo; absoluteAddr: number } | null {
    const parts = path.split('.');
    
    if (parts.length === 0) return null;
    
    // Search in all POUs
    for (const pouInfo of Object.values(map.pou)) {
        const rootVar = pouInfo.vars[parts[0]];
        if (!rootVar) continue;
        
        // If just the root variable
        if (parts.length === 1) {
            return { varInfo: rootVar, absoluteAddr: rootVar.addr };
        }
        
        // Navigate through children
        let currentAddr = rootVar.addr;
        let currentChildren = rootVar.children;
        
        for (let i = 1; i < parts.length; i++) {
            if (!currentChildren) return null;
            
            const member = currentChildren[parts[i]];
            if (!member) return null;
            
            currentAddr += member.offset;
            
            if (i === parts.length - 1) {
                // Found the target
                return {
                    varInfo: {
                        addr: currentAddr,
                        type: member.type,
                        region: rootVar.region,
                        size: member.size,
                    },
                    absoluteAddr: currentAddr,
                };
            }
        }
    }
    
    return null;
}

/**
 * Find the source line for a given PC.
 */
export function findSourceLine(map: DebugMap, pc: number): { pou: string; line: number } | null {
    for (const [pouName, pouInfo] of Object.entries(map.pou)) {
        for (const mapping of pouInfo.sourceMap) {
            if (pc >= mapping.pc && pc < mapping.pc + mapping.length) {
                return { pou: pouName, line: mapping.line };
            }
        }
    }
    return null;
}

/**
 * Find the PC for a given source line.
 */
export function findPC(map: DebugMap, pouName: string, line: number): number | null {
    const pou = map.pou[pouName];
    if (!pou) return null;
    
    const mapping = pou.sourceMap.find(m => m.line === line);
    return mapping?.pc ?? null;
}

/**
 * Get all valid breakpoint locations for a POU.
 */
export function getBreakpointLocations(map: DebugMap, pouName: string): BreakpointLocation[] {
    const pou = map.pou[pouName];
    return pou?.breakpoints ?? [];
}

// ============================================================================
// Builder Functions (from SymbolTable + Assembly Result)
// ============================================================================

import type { Symbol } from './symbol-table.ts';
import type { InstructionMapping } from '../assembler/types.ts';

/**
 * Determine memory region from address.
 */
function getRegionFromAddress(addr: number): MemoryRegion {
    if (addr < 0x1000) return 'IPI';
    if (addr < 0x2000) return 'OPI';
    if (addr < 0x4000) return 'WORK';
    if (addr < 0x5000) return 'RETAIN';
    return 'CODE';
}

/**
 * Interface for resolving FB/struct member types.
 * This bridges the gap between Symbol (which only stores offsets)
 * and FB/struct definitions (which store full type info).
 */
export interface TypeResolver {
    /** Get FB member info: returns { offset, size, dataType } or undefined */
    getMemberInfo(typeName: string, memberName: string): { offset: number; size: number; dataType: string } | undefined;
    /** Check if a type is an FB or struct */
    isCompositeType(typeName: string): boolean;
}

/**
 * Build variable info from a symbol table symbol.
 * Uses optional TypeResolver to get real member types instead of defaulting to DINT.
 */
function buildVarInfoFromSymbol(sym: Symbol, typeResolver?: TypeResolver): DebugVarInfo {
    const varInfo: DebugVarInfo = {
        addr: sym.address,
        type: sym.dataType as DebugDataType,
        region: getRegionFromAddress(sym.address),
        size: sym.size,
    };
    
    // Add FB member children if present
    if (sym.members && sym.members.size > 0) {
        varInfo.children = {};
        const typeName = sym.dataType as string;
        
        for (const [memberName, offset] of sym.members) {
            // Try to resolve real member type from FB/struct definition
            const memberInfo = typeResolver?.getMemberInfo(typeName, memberName);
            
            varInfo.children[memberName] = {
                offset,
                type: (memberInfo?.dataType ?? 'DINT') as DebugDataType,
                size: memberInfo?.size ?? 4,
            };
        }
    }
    
    return varInfo;
}

/**
 * Build source line mappings from instruction mappings with source annotations.
 * Groups consecutive instructions from the same source line.
 */
function buildSourceMappings(instructionMappings: InstructionMapping[]): SourceLineMapping[] {
    const mappings: SourceLineMapping[] = [];
    
    // Filter to only instructions with source annotations
    const annotated = instructionMappings.filter(m => m.sourceAnnotation);
    if (annotated.length === 0) return mappings;
    
    // Group consecutive instructions by source line
    let currentLine = annotated[0].sourceAnnotation!.line;
    let currentPC = annotated[0].pc;
    let currentLength = annotated[0].size;
    
    for (let i = 1; i < annotated.length; i++) {
        const m = annotated[i];
        const line = m.sourceAnnotation!.line;
        
        if (line === currentLine) {
            // Same source line - extend the range
            currentLength = (m.pc + m.size) - currentPC;
        } else {
            // New source line - save previous and start new
            mappings.push({
                line: currentLine,
                pc: currentPC,
                length: currentLength,
            });
            currentLine = line;
            currentPC = m.pc;
            currentLength = m.size;
        }
    }
    
    // Don't forget the last one
    mappings.push({
        line: currentLine,
        pc: currentPC,
        length: currentLength,
    });
    
    return mappings;
}

/**
 * Build breakpoint locations from source line mappings.
 * Each mapped source line is a valid breakpoint location.
 */
function buildBreakpointLocations(sourceMappings: SourceLineMapping[]): BreakpointLocation[] {
    return sourceMappings.map(m => ({
        line: m.line,
        pc: m.pc,
        valid: true,
    }));
}

/**
 * Options for building a debug map.
 */
export interface BuildDebugMapOptions {
    /** Program name */
    programName: string;
    /** Symbol table with all variables */
    symbols: { all(): Symbol[] };
    /** Instruction mappings from assembler */
    instructionMappings?: InstructionMapping[];
    /** String literal pool info (optional) */
    stringPool?: {
        baseAddress: number;
        entries: Array<{
            value: string;
            address: number;
            size: number;
        }>;
    };
    /** Code size */
    codeSize?: number;
    /** Optional type resolver for FB/struct member types */
    typeResolver?: TypeResolver;
}

/**
 * Build a complete DebugMap from compilation artifacts.
 * 
 * @param options - Build options including symbols and mappings
 * @returns Complete debug map for debugging
 * 
 * @example
 * ```typescript
 * const debugMap = buildDebugMap({
 *     programName: 'Blinky',
 *     symbols: symbolTable,
 *     instructionMappings: asmResult.instructionMappings,
 * });
 * ```
 */
export function buildDebugMap(options: BuildDebugMapOptions): DebugMap {
    const { programName, symbols, instructionMappings = [], stringPool, codeSize = 0, typeResolver } = options;
    
    const map = createDebugMap(programName);
    
    // Build POU info
    const pouInfo: DebugPOUInfo = {
        type: 'PROGRAM',
        entryPoint: 0,
        vars: {},
        sourceMap: buildSourceMappings(instructionMappings),
        breakpoints: [],
    };
    
    // Add variables from symbol table
    for (const sym of symbols.all()) {
        pouInfo.vars[sym.name] = buildVarInfoFromSymbol(sym, typeResolver);
    }
    
    // Build breakpoint locations from source map
    pouInfo.breakpoints = buildBreakpointLocations(pouInfo.sourceMap);
    
    map.pou[programName] = pouInfo;
    
    // Add string pool if present
    if (stringPool) {
        map.stringPool = stringPool;
    }
    
    // Update code size
    if (codeSize > 0) {
        map.memoryLayout.codeSize = codeSize;
    }
    
    return map;
}
