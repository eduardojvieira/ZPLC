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

import { MEMORY_REGION } from '../contract.generated.ts';

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
    /** Bit offset for bit-addressed BOOL variables */
    bitOffset?: number;
    /** For STRING: max capacity */
    capacity?: number;
    /** Tags associated with the variable */
    tags?: Record<string, string | true>;
    /** For FB instances: child member information */
    children?: Record<string, DebugMemberInfo>;
    /**
     * Source line where this variable was declared (1-based).
     * Used by the live editor overlay to map Monaco viewport lines → variable
     * addresses for inline value annotations (CodeSys-style online monitoring).
     */
    declarationLine?: number;
    /**
     * `global` for a variable declared in a VAR_GLOBAL block: it is seen by every program, whichever file declares
     * it, and the map lists it once, in the POU of its file (CMP-042).
     */
    scope?: 'global';
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
    /**
     * The element of the source the author edited that this range was generated for, when the source was translated
     * to Structured Text by a front end (LNG-004): `rung:r1/cell:0,2`, `block:and_1`, `step:s1`, `transition:t1`,
     * `action:a1`, or `line:12` of an IL source. A range of a plain Structured Text source has none.
     */
    element?: string;
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
    /** The element of the source the author edited that execution stops at, for a source translated by a front end (LNG-004). */
    element?: string;
}

// ============================================================================
// Program/POU Information
// ============================================================================

/**
 * The power at a point of a Ladder rung, as an expression of the variables that hold the states that make it up
 * (LNG-006): what an online display evaluates with the values it reads, so that it shows the power that really
 * reaches an element and not a guess from the name of its variable.
 */
export type DebugPowerExpr =
    | { op: 'true' }
    | { op: 'var'; variable: string; not?: boolean }
    | { op: 'and' | 'or'; terms: DebugPowerExpr[] };

/**
 * How an online display reads one element of a source that was translated to Structured Text (LNG-006): which
 * variable of this POU holds its state. The front end that translated the source writes it, so no tool has to
 * know the names it generated.
 *
 *  - `value`     the variable an element names: a contact, a coil, a variable block (`variable`)
 *  - `output`    the value an output pin of a block holds (`port`, `variable`)
 *  - `power`     the power that reaches an element of a rung, and the power that leaves it (`in`, `out`)
 *  - `step`      the active flag of an SFC step (`variable`); `time`, how long it has been active
 *  - `condition` whether the condition of an SFC transition holds (`variable`); `fired`, that it fired in this scan
 */
export interface DebugMonitorEntry {
    /** The element of the source: `rung:r1/cell:0,2`, `block:and_1`, `step:s1`, `transition:t1`. */
    element: string;
    role: 'value' | 'output' | 'power' | 'step' | 'time' | 'condition' | 'fired';
    port?: string;
    /** A variable of the POU, as `vars` names it: `X_s1`, `T_s1.ET`, `Motor.Running`. */
    variable?: string;
    in?: DebugPowerExpr;
    out?: DebugPowerExpr;
}

/**
 * Debug information for a Program Organization Unit (POU).
 */
export interface DebugPOUInfo {
    /**
     * POU type. A source file with no program that declares functions, function blocks or variables is a
     * POU of its own (`LIBRARY` when it declares neither of the first two): its source reference is the file.
     */
    type: 'PROGRAM' | 'FUNCTION' | 'FUNCTION_BLOCK' | 'LIBRARY';
    /** Entry point PC (for PROGRAM/FUNCTION) */
    entryPoint?: number;
    /** Variable information */
    vars: Record<string, DebugVarInfo>;
    /** Source line mappings */
    sourceMap: SourceLineMapping[];
    /** Valid breakpoint locations */
    breakpoints: BreakpointLocation[];
    /** Physical source reference used to compile this POU, when available. */
    sourceRef?: string;
    /**
     * For a source translated to Structured Text by a front end: where the state of each of its elements is read
     * online (LNG-006). Absent for a plain Structured Text source.
     */
    monitor?: DebugMonitorEntry[];
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
    /** Version of the compiler package that generated this map */
    compilerVersion: string;
    /**
     * The build identity of the artifact this map describes: 8 hexadecimal digits, the one the artifact carries
     * in its BUILD segment (CMP-056). A tool that has the map and the artifact, or the identity of the running
     * program, can tell a map that does not belong to it. Absent from the maps of builds that predate it.
     */
    buildId?: string;
    /**
     * Not written by the compiler: a build is a function of its sources, so the same project gives the
     * same map byte for byte (CMP-053). Maps of older builds may carry the time of the build here.
     */
    generatedAt?: string;
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
 * Version of the compiler package, recorded in every debug map (CMP-053). It is the `version` of this
 * package's package.json: `scripts/release-version.ts` rewrites it with the manifests and its --check
 * fails when they differ, and the compiler test `debug-map.test.ts` fails the same way, so a version bump
 * cannot ship a map that names the old compiler.
 */
export const COMPILER_VERSION = '2.0.0-rc.3';

/**
 * Creates an empty debug map with default values.
 */
export function createDebugMap(programName: string, memoryProfile?: { workSize: number; retainSize: number; codeSizeMax: number }): DebugMap {
    return {
        version: '1.0.0',
        programName,
        compilerVersion: COMPILER_VERSION,
        pou: {},
        memoryLayout: {
            ipiBase: MEMORY_REGION.IPI.base,
            ipiSize: MEMORY_REGION.IPI.size,
            opiBase: MEMORY_REGION.OPI.base,
            opiSize: MEMORY_REGION.OPI.size,
            workBase: MEMORY_REGION.WORK.base,
            workSize: memoryProfile?.workSize ?? MEMORY_REGION.WORK.size,
            retainBase: MEMORY_REGION.RETAIN.base,
            retainSize: memoryProfile?.retainSize ?? MEMORY_REGION.RETAIN.size,
            codeBase: MEMORY_REGION.CODE.base,
            codeSize: memoryProfile?.codeSizeMax ?? MEMORY_REGION.CODE.size,
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
    bitOffset?: number,
    children?: Record<string, DebugMemberInfo>
): DebugVarInfo {
    return {
        addr,
        type: type as DebugDataType,
        region,
        size,
        bitOffset,
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
        // a variable of a function is declared as `Function.name` (CMP-034): the whole path may be its name
        const declared = pouInfo.vars[path];
        if (declared) return { varInfo: declared, absoluteAddr: declared.addr };

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
                        bitOffset: rootVar.bitOffset,
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
import { parseStringType, typeToString } from './symbol-table.ts';
import type { InstructionMapping } from '../assembler/types.ts';

/**
 * Determine memory region from address.
 */
function getRegionFromAddress(addr: number): MemoryRegion {
    if (addr < MEMORY_REGION.OPI.base) return 'IPI';
    if (addr < MEMORY_REGION.WORK.base) return 'OPI';
    if (addr < MEMORY_REGION.RETAIN.base) return 'WORK';
    if (addr < MEMORY_REGION.CODE.base) return 'RETAIN';
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
    const text = parseStringType(sym.dataType);
    const varInfo: DebugVarInfo = {
        addr: sym.address,
        // a string is STRING or WSTRING with its capacity beside it; a reference is written REF_TO <type>
        type: (text ? (text.wide ? 'WSTRING' : 'STRING')
            : typeof sym.dataType === 'object' && (sym.dataType as { kind?: string }).kind === 'PointerType' ? typeToString(sym.dataType)
                : sym.dataType) as DebugDataType,
        region: getRegionFromAddress(sym.address),
        size: sym.size,
        tags: sym.tags,
        declarationLine: sym.declarationLine,
        ...(sym.owner === undefined && sym.section === 'VAR_GLOBAL' ? { scope: 'global' as const } : {}),
    };
    if (text) {
        varInfo.capacity = text.capacity;
    }

    if (sym.ioAddress?.size === 'X') {
        varInfo.bitOffset = sym.ioAddress.bitOffset;
    }
    
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
 * Build the source ranges: each statement owns every instruction from its first one to the next
 * annotation, so any program counter inside it resolves to it (CMP-055). An annotation of line 0 is
 * the end of a statement with no other one following (the end of the cycle, the return of a function).
 * A statement that holds others has one range for each stretch of its own instructions.
 */
function buildSourceMappings(
    instructionMappings: InstructionMapping[],
    /** The file of the statement an instruction belongs to, when the unit has several; the index of `files` below. */
    fileOf?: (mapping: InstructionMapping) => number,
    files?: number[],
): SourceLineMapping[] {
    const mappings: SourceLineMapping[] = [];
    let open: { line: number; column?: number; pc: number; file: number } | null = null;
    const close = (end: number): void => {
        if (open && end > open.pc) {
            mappings.push({
                line: open.line,
                ...(open.column === undefined ? {} : { column: open.column }),
                pc: open.pc,
                length: end - open.pc,
            });
            files?.push(open.file);
        }
        open = null;
    };

    for (const m of instructionMappings) {
        const annotation = m.sourceAnnotation;
        if (!annotation) continue;
        close(m.pc);
        if (annotation.line > 0) open = { line: annotation.line, column: annotation.column, pc: m.pc, file: fileOf ? fileOf(m) : 0 };
    }
    const last = instructionMappings[instructionMappings.length - 1];
    if (last) close(last.pc + last.size);

    return mappings;
}

/**
 * Build breakpoint locations from source ranges: a line is one location, at the first instruction of
 * its first range.
 */
function buildBreakpointLocations(sourceMappings: SourceLineMapping[]): BreakpointLocation[] {
    const seen = new Set<number>();
    const locations: BreakpointLocation[] = [];
    for (const mapping of sourceMappings) {
        if (seen.has(mapping.line)) continue;
        seen.add(mapping.line);
        locations.push({ line: mapping.line, pc: mapping.pc, valid: true });
    }
    return locations;
}

/**
 * Options for building a debug map.
 */
export interface BuildDebugMapOptions {
    /** Program name */
    programName: string;
    /** Physical source reference used to compile this program (optional for legacy maps). */
    sourceRef?: string;
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
    /** Effective target memory limits. */
    memoryProfile?: { workSize: number; retainSize: number; codeSizeMax: number };
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
    const { programName, sourceRef, symbols, instructionMappings = [], stringPool, codeSize = 0, typeResolver, memoryProfile } = options;
    
    const map = createDebugMap(programName, memoryProfile);
    
    // Build POU info
    const pouInfo: DebugPOUInfo = {
        type: 'PROGRAM',
        entryPoint: 0,
        vars: {},
        sourceMap: buildSourceMappings(instructionMappings),
        breakpoints: [],
    };

    if (sourceRef) {
        pouInfo.sourceRef = sourceRef;
    }
    
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

// ============================================================================
// The debug map of a project built as one unit (CMP-042, CMP-054)
// ============================================================================

/** One source file of a unit, as the map names it. */
export interface UnitDebugFile {
    /** The identity of the file in the unit: what the symbols and the annotations of the code name it by. */
    ref: string;
    /** The source reference the POU of the file records; absent for a unit that was compiled from bare text. */
    sourceRef?: string;
    /** The key of its POU: the name of its program when a task runs one, else `ref`. */
    key: string;
    type: DebugPOUInfo['type'];
    /** Absolute address of the entry of its program. */
    entryPoint?: number;
}

export interface BuildUnitDebugMapOptions {
    /** Name of the project */
    projectName: string;
    /** The files in the order the code generator numbered them in its annotations. */
    files: UnitDebugFile[];
    /** The symbol table the code was generated with: one layout for code and map. */
    symbols: { all(): Symbol[] };
    instructionMappings: InstructionMapping[];
    /** The assembly the mappings come from, where each annotation names its file. */
    assembly: string;
    typeResolver?: TypeResolver;
    memoryProfile?: { workSize: number; retainSize: number; codeSizeMax: number };
    codeSize?: number;
}

/**
 * The debug map of a unit: one POU for each file that holds a program, a variable or code, each variable and
 * each source range in the POU of the file it was declared in. A global is listed once, in the file that
 * declares it; the statements of a function block that a program inlines are ranges of the block's file.
 */
export function buildUnitDebugMap(options: BuildUnitDebugMapOptions): DebugMap {
    const { projectName, files, symbols, instructionMappings, assembly, typeResolver, memoryProfile, codeSize = 0 } = options;
    const map = createDebugMap(projectName, memoryProfile);

    const pous: DebugPOUInfo[] = files.map((file) => ({
        type: file.type,
        entryPoint: file.entryPoint ?? 0,
        vars: {},
        sourceMap: [],
        breakpoints: [],
        ...(file.sourceRef === undefined ? {} : { sourceRef: file.sourceRef }),
    }));
    const indexOf = new Map(files.map((file, index) => [file.ref, index] as const));
    const firstProgram = Math.max(0, files.findIndex((file) => file.type === 'PROGRAM'));

    for (const sym of symbols.all()) {
        const pou = pous[(sym.sourceRef === undefined ? undefined : indexOf.get(sym.sourceRef)) ?? firstProgram];
        if (pou) pou.vars[sym.name] = buildVarInfoFromSymbol(sym, typeResolver);
    }

    // each annotation names its file: `; @source line:column @file` (a unit of one file has no `@file`)
    const lines = assembly.split('\n');
    const annotation = /;\s*@source\s+\d+(?::\d+)?(?:\s+@(\d+))?\s*$/;
    const fileOfLine: number[] = [];
    let current = 0;
    for (let index = 0; index < lines.length; index++) {
        const found = annotation.exec(lines[index]!);
        if (found) current = found[1] === undefined ? 0 : parseInt(found[1], 10);
        fileOfLine.push(current);
    }
    const ranges: number[] = [];
    const sourceMap = buildSourceMappings(instructionMappings, (mapping) => fileOfLine[mapping.asmLine - 1] ?? 0, ranges);
    sourceMap.forEach((range, index) => (pous[ranges[index]!] ?? pous[firstProgram])?.sourceMap.push(range));

    pous.forEach((pou, index) => {
        pou.breakpoints = buildBreakpointLocations(pou.sourceMap);
        const file = files[index]!;
        const used = file.type === 'PROGRAM' || Object.keys(pou.vars).length > 0 || pou.sourceMap.length > 0;
        if (used) map.pou[file.key] = pou;
    });

    if (codeSize > 0) map.memoryLayout.codeSize = codeSize;
    return map;
}
