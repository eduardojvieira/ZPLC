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
import type { STDataType, DataTypeValue, VarSectionValue, IOAddress, VarDecl, Program, ArrayType, CompilationUnit, Expression, Statement, ArrayLiteral } from './ast.ts';
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
    /** Initial value expression (for constants) */
    initialValue: Expression | ArrayLiteral | null;
    /** Tags (like {publish}, {modbus:40001}) */
    tags?: Record<string, string | true>;
}

/**
 * Definition of a user-defined function block.
 */
export interface UserFBDefinition {
    name: string;
    size: number;
    extends: string | null;  // Base FB name
    implements: string[];    // Interface names
    members: Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>;
    methods: Map<string, MethodInfo>;  // Methods defined in this FB
}

/**
 * Method information for code generation.
 */
export interface MethodInfo {
    name: string;
    returnType: STDataType | null;
    inputs: { name: string; dataType: STDataType; size: number; mangledName?: string; initialValue?: Expression | null }[];
    outputs: { name: string; dataType: STDataType; size: number; mangledName?: string; initialValue?: Expression | null }[];
    locals: { name: string; dataType: STDataType; size: number; mangledName?: string; initialValue?: Expression | null }[];
    label: string;  // Code label for the method
    isAbstract: boolean;
    isFinal: boolean;
    isOverride: boolean;
    body: Statement[]; // Method body for inlining
}

/**
 * Interface definition.
 */
export interface InterfaceDefinition {
    name: string;
    extends: string[];  // Base interfaces
    methods: Map<string, MethodSignature>;  // Method signatures
}

/**
 * Method signature (for interfaces).
 */
export interface MethodSignature {
    name: string;
    returnType: STDataType | null;
    inputs: { name: string; dataType: STDataType; size: number }[];
    outputs: { name: string; dataType: STDataType; size: number }[];
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
 * Definition of a user-defined enum.
 */
export interface UserEnumDefinition {
    name: string;
    baseType: DataTypeValue;
    values: Map<string, number>;
}

/**
 * Symbol table for a compilation unit.
 */
export class SymbolTable {
    private symbols = new Map<string, Symbol>();
    private userFBs = new Map<string, UserFBDefinition>();
    private userStructs = new Map<string, UserStructDefinition>();
    private userEnums = new Map<string, UserEnumDefinition>();
    private interfaces = new Map<string, InterfaceDefinition>();
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
            // Always use byte offset for address calculation.
            // Bit handling requires Read-Modify-Write instructions or bit-banding,
            // which are handled during code generation if needed.
            const offset = decl.ioAddress.byteOffset;

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
            initialValue: decl.initialValue,
            tags: decl.tags,
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
    addFBDefinition(def: UserFBDefinition): void {
        this.userFBs.set(def.name, def);
    }

    /**
     * Register an interface definition.
     */
    addInterfaceDefinition(def: InterfaceDefinition): void {
        this.interfaces.set(def.name, def);
    }

    /**
     * Get an interface definition by name.
     */
    getInterfaceDefinition(name: string): InterfaceDefinition | undefined {
        return this.interfaces.get(name);
    }

    /**
     * Get method info for a specific FB and method.
     */
    getMethodInfo(fbType: string, methodName: string): MethodInfo | undefined {
        const fb = this.userFBs.get(fbType);
        if (!fb) return undefined;
        return fb.methods.get(methodName);
    }

    /**
     * Check if an FB has a specific method (including inherited methods).
     */
    hasMethod(fbType: string, methodName: string): boolean {
        const fb = this.userFBs.get(fbType);
        if (!fb) return false;
        
        // Check direct methods
        if (fb.methods.has(methodName)) return true;
        
        // Check inherited methods from base FB
        if (fb.extends) {
            return this.hasMethod(fb.extends, methodName);
        }
        
        return false;
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
     * Register a user-defined enum definition.
     */
    addEnumDefinition(def: UserEnumDefinition): void {
        this.userEnums.set(def.name, def);
    }

    getEnumDefinition(name: string): UserEnumDefinition | undefined {
        return this.userEnums.get(name);
    }

    /**
     * Get size of a data type (including user FBs, Structs, and Enums).
     */
    getTypeSizeByName(typeName: STDataType): number {
        if (typeof typeName === 'string') {
            const userFB = this.userFBs.get(typeName);
            if (userFB) return userFB.size;

            const structDef = this.userStructs.get(typeName);
            if (structDef) return structDef.size;

            const enumDef = this.userEnums.get(typeName);
            if (enumDef) return getDataTypeSize(enumDef.baseType);

            const fbDef = getFB(typeName as DataTypeValue);
            if (fbDef) return fbDef.size;
        }

        return getDataTypeSize(typeName);
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
export function alignTo(value: number, alignment: number): number {
    if (alignment <= 0) return value;
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
        // 1. First Pass: Process Type Definitions (STRUCTs and ENUMs)
        if (unit.typeDefinitions) {
            for (const typeDef of unit.typeDefinitions) {
                if (typeDef.kind === 'StructDecl') {
                    const members = new Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>();
                    let currentOffset = 0;
                    for (const member of typeDef.members) {
                        const memberSize = isArrayType(member.dataType as any)
                            ? getArrayTotalSize(member.dataType as any)
                            : table.getTypeSizeByName(member.dataType as any);

                        const alignment = Math.min(memberSize, 4); // Align struct members
                        currentOffset = alignTo(currentOffset, alignment);

                        members.set(member.name, { offset: currentOffset, size: memberSize, dataType: member.dataType as any });
                        currentOffset += memberSize;
                    }
                    table.addStructDefinition({
                        name: typeDef.name,
                        size: currentOffset,
                        members
                    });
                } else if (typeDef.kind === 'EnumDecl') {
                    const values = new Map<string, number>();
                    for (const v of typeDef.values) {
                        values.set(v.name, v.value);
                        try {
                            table.add({
                                kind: 'VarDecl',
                                name: v.name,
                                dataType: typeDef.baseType,
                                section: VarSection.CONSTANT,
                                initialValue: { kind: 'IntLiteral', value: v.value } as any,
                                ioAddress: null,
                                tags: {},
                                line: typeDef.line,
                                column: typeDef.column,
                            });
                        } catch (e) {
                            // Ignore duplicates for now
                        }
                    }
                    table.addEnumDefinition({
                        name: typeDef.name,
                        baseType: typeDef.baseType,
                        values
                    });
                }
            }
        }

        // 2. Second Pass: Process INTERFACE definitions
        if (unit.interfaces) {
            for (const iface of unit.interfaces) {
                const methodSigs = new Map<string, MethodSignature>();
                
                for (const method of iface.methods) {
                    const inputs = method.inputs.map(v => ({
                        name: v.name,
                        dataType: v.dataType as DataTypeValue,
                        size: isArrayType(v.dataType) 
                            ? getArrayTotalSize(v.dataType) 
                            : table.getTypeSizeByName(v.dataType)
                    }));
                    
                    const outputs = method.outputs.map(v => ({
                        name: v.name,
                        dataType: v.dataType as DataTypeValue,
                        size: isArrayType(v.dataType)
                            ? getArrayTotalSize(v.dataType)
                            : table.getTypeSizeByName(v.dataType)
                    }));
                    
                    methodSigs.set(method.name, {
                        name: method.name,
                        returnType: method.returnType as DataTypeValue | null,
                        inputs,
                        outputs
                    });
                }
                
                table.addInterfaceDefinition({
                    name: iface.name,
                    extends: iface.extends,
                    methods: methodSigs
                });
            }
        }

        // 3. Third Pass: Process User-Defined FUNCTION_BLOCK definitions
        // Handle inheritance (process base classes first)
        const unprocessedFBs = [...unit.functionBlocks];
        
        while (unprocessedFBs.length > 0) {
            // Find an FB that can be processed (no extends or base already processed)
            const fbIndex = unprocessedFBs.findIndex(fb => {
                return !fb.extends || table.getFBDefinition(fb.extends) !== undefined;
            });

            if (fbIndex === -1) {
                const missing = unprocessedFBs.map(fb => `${fb.name} (extends ${fb.extends})`).join(', ');
                throw new Error(`Circular inheritance or missing base FB in definitions: ${missing}`);
            }

            const fb = unprocessedFBs[fbIndex];
            unprocessedFBs.splice(fbIndex, 1);

            const fbMembers = new Map<string, { offset: number; size: number; dataType: STDataType | ArrayType }>();
            const methods = new Map<string, MethodInfo>();
            let currentOffset = 0;

            // Inheritance: Copy members and methods from base FB
            if (fb.extends) {
                const baseFB = table.getFBDefinition(fb.extends);
                if (baseFB) {
                    // 1. Copy members (variables)
                    // Base members come first in memory layout
                    for (const [name, info] of baseFB.members) {
                        fbMembers.set(name, info);
                    }
                    currentOffset = baseFB.size;

                    // 2. Copy methods (for inheritance)
                    for (const [name, info] of baseFB.methods) {
                        methods.set(name, info);
                    }
                }
            }

            const allVars = [...fb.inputs, ...fb.outputs, ...fb.inouts, ...fb.locals];
            for (const v of allVars) {
                // Shadowing check: warn or error if member exists in base?
                // For now, allow shadowing but it effectively hides the base member in symbol lookup
                // (though memory addresses are distinct if offsets are different, but here we append)
                
                const size = isArrayType(v.dataType as any)
                    ? getArrayTotalSize(v.dataType as any)
                    : table.getTypeSizeByName(v.dataType as any);

                const alignment = Math.min(size, 4);
                currentOffset = alignTo(currentOffset, alignment);

                fbMembers.set(v.name, { offset: currentOffset, size, dataType: v.dataType as any });
                currentOffset += size;
            }

            // Process methods (new or overrides)
            for (const method of fb.methods) {
                const processMethodVar = (v: VarDecl) => {
                    const mangledName = `__M_${fb.name}_${method.name}_${v.name}`;
                    // Register global symbol for static allocation
                    // We check if it already exists (e.g. from previous pass or duplicate) to avoid error
                    if (!table.has(mangledName)) {
                        table.add({
                            ...v,
                            name: mangledName,
                            section: VarSection.VAR // Allocate in WORK memory
                        });
                    }
                    
                    return {
                        name: v.name,
                        dataType: v.dataType as DataTypeValue,
                        size: isArrayType(v.dataType)
                            ? getArrayTotalSize(v.dataType)
                            : table.getTypeSizeByName(v.dataType),
                        mangledName,
                        initialValue: v.initialValue,
                    };
                };

                const inputs = method.inputs.map(processMethodVar);
                const outputs = method.outputs.map(processMethodVar);
                const locals = method.locals.map(processMethodVar);

                // Check for override
                const baseMethod = methods.get(method.name);
                
                if (method.isOverride) {
                    if (!baseMethod) {
                        throw new Error(`Method '${method.name}' marked as OVERRIDE but no base method found in '${fb.name}'`);
                    }
                    if (baseMethod.isFinal) {
                        throw new Error(`Cannot override FINAL method '${method.name}' in '${fb.name}'`);
                    }
                    if (method.returnType !== baseMethod.returnType) {
                        throw new Error(`Override method '${method.name}' return type '${method.returnType}' does not match base '${baseMethod.returnType}'`);
                    }
                } else if (baseMethod) {
                    throw new Error(`Method '${method.name}' in '${fb.name}' hides inherited method. Use OVERRIDE explicitly.`);
                }
                
                // If overriding, we replace the entry in the map
                methods.set(method.name, {
                    name: method.name,
                    returnType: method.returnType as DataTypeValue | null,
                    inputs,
                    outputs,
                    locals,
                    label: `${fb.name}__${method.name}`,  // Code label specific to this FB type
                    isAbstract: method.isAbstract,
                    isFinal: method.isFinal,
                    isOverride: method.isOverride || !!baseMethod, // Mark as override if it shadows base
                    body: method.body,
                });
            }

            // Validate Interfaces
            if (fb.implements) {
                for (const ifaceName of fb.implements) {
                    const validateInterface = (name: string) => {
                        const iface = table.getInterfaceDefinition(name);
                        if (!iface) throw new Error(`Unknown interface '${name}' implemented by '${fb.name}'`);
                        
                        // Check base interfaces
                        for (const base of iface.extends) {
                            validateInterface(base);
                        }

                        // Check methods
                        for (const [methodName, sig] of iface.methods) {
                            const method = methods.get(methodName);
                            if (!method) {
                                throw new Error(`Function Block '${fb.name}' implements interface '${ifaceName}' but is missing required method '${methodName}'`);
                            }
                            
                            // Check signature
                            if (method.returnType !== sig.returnType) {
                                throw new Error(`Method '${methodName}' in '${fb.name}' has return type '${method.returnType}' but interface '${ifaceName}' requires '${sig.returnType}'`);
                            }
                            
                            // Check inputs
                            if (method.inputs.length !== sig.inputs.length) {
                                throw new Error(`Method '${methodName}' has different number of inputs than required by interface '${ifaceName}'`);
                            }
                            for (let i = 0; i < method.inputs.length; i++) {
                                if (method.inputs[i].name !== sig.inputs[i].name || method.inputs[i].dataType !== sig.inputs[i].dataType) {
                                    throw new Error(`Input ${i} of method '${methodName}' does not match interface '${ifaceName}' signature`);
                                }
                            }
                            
                            // Check outputs
                            if (method.outputs.length !== sig.outputs.length) {
                                throw new Error(`Method '${methodName}' has different number of outputs than required by interface '${ifaceName}'`);
                            }
                            for (let i = 0; i < method.outputs.length; i++) {
                                if (method.outputs[i].name !== sig.outputs[i].name || method.outputs[i].dataType !== sig.outputs[i].dataType) {
                                    throw new Error(`Output ${i} of method '${methodName}' does not match interface '${ifaceName}' signature`);
                                }
                            }
                        }
                    };
                    
                    validateInterface(ifaceName);
                }
            }

            table.addFBDefinition({
                name: fb.name,
                size: currentOffset,
                extends: fb.extends,
                implements: fb.implements,
                members: fbMembers,
                methods
            });
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
                initialValue: null, tags: {},
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
 * Accepts string to handle parser-generated type names that may be aliases.
 */
export function getLoadStoreSuffix(dataType: DataTypeValue | string): '8' | '16' | '32' | '64' {
    // Normalize to uppercase string for comparison
    const typeStr = typeof dataType === 'string' ? dataType.toUpperCase() : dataType;
    
    switch (typeStr) {
        case 'BOOL':
        case 'SINT':
        case 'USINT':
        case 'BYTE':
            return '8';
        case 'INT':
        case 'UINT':
        case 'WORD':
            return '16';
        case 'DINT':
        case 'UDINT':
        case 'REAL':
        case 'TIME':
        case 'DWORD':
        case 'DATE':            // D#... literal, 32-bit timestamp
        case 'TIME_OF_DAY':     // TOD#... literal, 32-bit ms from midnight
        case 'TOD':             // Alias for TIME_OF_DAY
            return '32';
        case 'LINT':
        case 'ULINT':
        case 'LREAL':
        case 'LWORD':
        case 'DATE_AND_TIME':   // Full name
        case 'DT':              // Alias for DATE_AND_TIME
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
    const typeName = fbType.toUpperCase();
    let name = memberName.toUpperCase();
    
    // If name starts with dot (from some parser outputs), strip it
    if (name.startsWith('.')) name = name.substring(1);

    // 1. Check User-Defined FB
    const userFB = table.getFBDefinition(typeName);
    if (userFB) {
        const member = userFB.members.get(memberName) || userFB.members.get(name);
        if (member) {
            switch (member.size) {
                case 1: return '8';
                case 2: return '16';
                case 4: return '32';
                case 8: return '64';
            }
        }
    }

    // 2. Check stdlib FBs
    const fbDef = getFB(typeName as DataTypeValue);
    if (fbDef) {
        // Try exact match, then normalized match
        const member = fbDef.members.find(m => 
            m.name.toUpperCase() === name || 
            m.name.toUpperCase() === memberName.toUpperCase()
        );
        
        if (member) {
            switch (member.size) {
                case 1: return '8';
                case 2: return '16';
                case 4: return '32';
                case 8: return '64';
            }
        }
    }

    // 3. Last resort: check if it's a known elementary type (though rare in MemberAccess)
    const size = getDataTypeSize(name as DataTypeValue);
    if (size > 0) {
        if (size === 1) return '8';
        if (size === 2) return '16';
        if (size === 4) return '32';
        if (size === 8) return '64';
    }

    return '8'; // Default to 8-bit (safer for BOOLs)
}
