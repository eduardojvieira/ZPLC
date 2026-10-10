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

import { getDataTypeSize, getArrayElementCount, isArrayType, DataType, NameMap, sameName, VarSection } from './ast.ts';
import type { STDataType, DataTypeValue, VarSectionValue, IOAddress, VarDecl, Program, ArrayType, PointerType, CompilationUnit, Expression, Statement, InitialValue, TypeDefinition, FunctionBlockDecl } from './ast.ts';
import { getFB } from './stdlib/index.ts';
import { MEMORY_REGION } from '../contract.generated.ts';
import { CodegenError } from './diagnostics.ts';

// ============================================================================
// Memory Layout Constants
// ============================================================================

export const MemoryLayout = {
    /** Input Process Image base address */
    IPI_BASE: MEMORY_REGION.IPI.base,
    /** Output Process Image base address */
    OPI_BASE: MEMORY_REGION.OPI.base,
    /** Work Memory base address */
    WORK_BASE: MEMORY_REGION.WORK.base,
    /** Retentive Memory base address */
    RETAIN_BASE: MEMORY_REGION.RETAIN.base,
} as const;

/**
 * Bytes the retentive region reserves at its start when a program has a RETAIN variable. The first byte is set
 * once the initial values of the retained variables have been applied, and is saved with them: a region the
 * runtime restored has it set, so the initial values do not overwrite what was saved (CMP-029).
 */
export const RETAIN_MARKER_SIZE = 4;

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
    initialValue: InitialValue | null;
    /** Tags (like {publish}, {modbus:40001}) */
    tags?: Record<string, string | true>;
    /** Source line where this variable was declared (1-based) */
    declarationLine?: number;
    /** Placed in the retentive region (VAR RETAIN, CMP-029). */
    retain?: boolean;
    /**
     * The program that declares the variable; absent for a global, a constant of the unit or the variable
     * of a function (those are named `Function.name`). A function does not see a variable of a program (CMP-034).
     */
    owner?: string;
    /** The source file of the project the variable is declared in (CMP-042); absent for a unit of one file. */
    sourceRef?: string;
}

/**
 * Definition of a user-defined function block.
 */
export interface UserFBDefinition {
    name: string;
    size: number;
    extends: string | null;  // Base FB name
    implements: string[];    // Interface names
    members: Map<string, MemberInfo>;
    methods: Map<string, MethodInfo>;  // Methods defined in this FB
}

/**
 * One member of a user function block or structure.
 */
export interface MemberInfo {
    offset: number;
    size: number;
    /** The declared type. For a VAR_IN_OUT member the slot holds the address of a variable of this type. */
    dataType: STDataType | ArrayType;
    /** Declaration section of the member (VAR_INPUT, VAR_IN_OUT, VAR_TEMP, ...), when it comes from a function block. */
    section?: VarSectionValue;
    /** The initial value the declaration gives, if any (CMP-025). */
    initialValue?: InitialValue | null;
}

/**
 * Method information for code generation.
 */
export interface MethodInfo {
    name: string;
    returnType: STDataType | null;
    inputs: { name: string; dataType: STDataType; size: number; mangledName?: string; initialValue?: InitialValue | null }[];
    outputs: { name: string; dataType: STDataType; size: number; mangledName?: string; initialValue?: InitialValue | null }[];
    locals: { name: string; dataType: STDataType; size: number; mangledName?: string; initialValue?: InitialValue | null }[];
    label: string;  // Code label for the method
    isAbstract: boolean;
    isFinal: boolean;
    isOverride: boolean;
    body: Statement[]; // Method body for inlining
    /** The access specifier the method is declared with. */
    access: 'PUBLIC' | 'PRIVATE' | 'PROTECTED' | 'INTERNAL';
    /** The function block that declares the method (the base block for an inherited one); access is checked against it. */
    owner: string;
    /** The source file of the declaring block, for the diagnostics and the source ranges of the body (CMP-042). */
    sourceRef?: string;
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
    members: Map<string, MemberInfo>;
}

/** Bytes of the slot a VAR_IN_OUT member (and a REF_TO variable) keeps: the address of the referenced variable. */
export const REFERENCE_SIZE = 4;

/**
 * Capacity and character width of a STRING or WSTRING type name: `STRING`, `STRING[20]`,
 * `WSTRING`, `WSTRING[10]`. Null for any other type.
 */
export function parseStringType(type: unknown): { wide: boolean; capacity: number } | null {
    if (typeof type !== 'string') return null;
    const match = /^(W?STRING)(?:\[(\d+)\])?$/i.exec(type);
    if (!match) return null;
    const wide = match[1].toUpperCase() === 'WSTRING';
    return { wide, capacity: match[2] === undefined ? 80 : parseInt(match[2], 10) };
}

/** A type as the language writes it: `INT`, `STRING[20]`, `REF_TO INT`, `ARRAY[0..3] OF DINT`. */
export function typeToString(type: unknown): string {
    if (typeof type === 'string') return type;
    if (typeof type === 'object' && type !== null) {
        const kind = (type as { kind?: string }).kind;
        if (kind === 'PointerType') return `REF_TO ${typeToString((type as PointerType).baseType)}`;
        if (kind === 'ArrayType') {
            const array = type as ArrayType;
            return `ARRAY[${array.dimensions.map((d) => `${d.lowerBound}..${d.upperBound}`).join(', ')}] OF ${typeToString(array.elementType)}`;
        }
    }
    return '?';
}

/** Bytes a string of this capacity takes: the header, the characters and the terminator. */
export function stringTotalSize(wide: boolean, capacity: number): number {
    return 4 + capacity * (wide ? 2 : 1) + (wide ? 2 : 1);
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
    // Names are matched without regard to case (CMP-004)
    private symbols = new NameMap<Symbol>();
    private userFBs = new NameMap<UserFBDefinition>();
    private userStructs = new NameMap<UserStructDefinition>();
    private userEnums = new NameMap<UserEnumDefinition>();
    private interfaces = new NameMap<InterfaceDefinition>();
    private workOffset = 0;  // Current offset in work memory
    private retainOffset = 0;  // Current offset in the retentive region (VAR RETAIN)
    /**
     * Names that are in scope only while the code generator inlines a function block body or generates a
     * function: the members of the instance being inlined, instances declared inside it among them
     * (CMP-038), and the variables of the function (CMP-034). They shadow the globals. The resolver
     * answers null for a name that is declared but not visible there, and undefined when the name is not
     * its to decide.
     */
    scopeResolver: ((name: string) => Symbol | undefined | null) | null = null;
    /**
     * The program whose variables a plain name finds first: the one being generated. The variables of a
     * program are stored as `Program.name`, so that two programs of one unit may use the same names (CMP-042).
     */
    programScope: string | null = null;
    /** The only program of the unit, when it has one: a table of one program answers plain names without a scope. */
    private soleProgram: string | null = null;
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
        const scoped = this.scopeResolver?.(name);
        if (scoped !== undefined) return scoped ?? undefined;
        const program = this.programScope ?? this.soleProgram;
        return (program === null ? undefined : this.symbols.get(`${program}.${name}`)) ?? this.symbols.get(name);
    }

    /**
     * A symbol by the name it was declared with, whatever the scope the generator is in: a global, a
     * constant, a variable of a function (`Function.name`), or the variable of any program (which is how a
     * function is told that the name is not its to see, CMP-034).
     */
    getDeclared(name: string): Symbol | undefined {
        const plain = this.symbols.get(name);
        if (plain) return plain;
        for (const symbol of this.symbols.values()) {
            if (symbol.owner !== undefined && sameName(symbol.name, name)) return symbol;
        }
        return undefined;
    }

    /** A global, a constant or an enumeration value by name: what a function block sees besides its own members. */
    getGlobal(name: string): Symbol | undefined {
        return this.symbols.get(name);
    }

    /** Declare that `program` is the only program of the unit (see soleProgram). */
    setSoleProgram(program: string | null): void {
        this.soleProgram = program;
    }

    /**
     * Check if a symbol exists.
     */
    has(name: string): boolean {
        return this.get(name) !== undefined;
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
    add(decl: VarDecl, scope: { program?: string; sourceRef?: string } = {}): Symbol {
        if (decl.section === VarSection.VAR_EXTERNAL) {
            return this.linkExternal(decl);
        }
        // a variable of a program is stored under the name of the program; it may not share a name with a global
        const key = scope.program === undefined ? decl.name : `${scope.program}.${decl.name}`;
        if (this.symbols.has(key) || (scope.program !== undefined && this.symbols.has(decl.name))) {
            throw new CodegenError(`Symbol '${decl.name}' already defined`, decl.line, decl.column, decl.line, decl.column + decl.name.length);
        }

        const varSize = this.sizeOf(decl.dataType);

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
        } else if (decl.retain) {
            // VAR RETAIN: the retentive region, which the runtime saves and restores (CMP-029)
            if (this.retainOffset === 0) this.retainOffset = RETAIN_MARKER_SIZE;
            const alignment = Math.min(varSize, 4);
            this.retainOffset = alignTo(this.retainOffset, alignment);

            address = MemoryLayout.RETAIN_BASE + this.retainOffset;
            this.retainOffset += varSize;
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
                members = new NameMap<number>();
                for (const [mName, mInfo] of userFB.members) {
                    members.set(mName, mInfo.offset);
                }
            } else {
                // 2. Check user-defined Structs
                const userStruct = this.userStructs.get(typeName);
                if (userStruct) {
                    members = new NameMap<number>();
                    for (const [mName, mInfo] of userStruct.members) {
                        members.set(mName, mInfo.offset);
                    }
                } else {
                    // 3. Check stdlib FBs
                    const fbDef = getFB(typeName as DataTypeValue);
                    if (fbDef) {
                        members = new NameMap<number>();
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
            declarationLine: decl.line,
            ...(decl.retain && !decl.ioAddress ? { retain: true } : {}),
            ...(scope.sourceRef === undefined ? {} : { sourceRef: scope.sourceRef }),
        };

        this.symbols.set(key, symbol);
        return symbol;
    }

    /**
     * VAR_EXTERNAL: the name refers to a VAR_GLOBAL variable declared elsewhere and takes no storage (CMP-030).
     */
    private linkExternal(decl: VarDecl): Symbol {
        const global = this.symbols.get(decl.name);
        const at = [decl.line, decl.column, decl.line, decl.column + decl.name.length] as const;
        if (!global) {
            throw new CodegenError(`VAR_EXTERNAL '${decl.name}' has no VAR_GLOBAL declaration`, ...at);
        }
        if (JSON.stringify(global.dataType).toUpperCase() !== JSON.stringify(decl.dataType).toUpperCase()) {
            throw new CodegenError(`VAR_EXTERNAL '${decl.name}' is declared with another type than its VAR_GLOBAL`, ...at);
        }
        return global;
    }

    /** Bytes of the retentive region the variables declared RETAIN take. */
    getRetainOffset(): number {
        return this.retainOffset;
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
                const member = stdFB.members.find(m => sameName(m.name, expr.member));
                if (!member) throw new Error(`Unknown member '${expr.member}' on FB '${typeName}'`);
                return {
                    address: parent.address + member.offset,
                    dataType: member.dataType as STDataType
                };
            }

            throw new Error(`Type '${typeName}' is not a struct or function block`);
        }

        if (expr.kind === 'ArrayAccess') {
            // Only a path whose indices are all constants has one address; the code generator
            // computes the others at run time (it does not use this method for them).
            const array = this.resolveMemberPath(expr.array);
            if (!isArrayType(array.dataType as STDataType)) throw new Error('Indexed value is not an array');
            const type = array.dataType as unknown as ArrayType;
            const stride = this.sizeOf(type.elementType);
            let element = 0;
            type.dimensions.forEach((dimension, d) => {
                const index = expr.indices[d];
                if (!index || index.kind !== 'IntLiteral') throw new Error('Array index is not a constant');
                if (index.value < dimension.lowerBound || index.value > dimension.upperBound) {
                    throw new Error(`Index ${index.value} is outside the array bounds ${dimension.lowerBound}..${dimension.upperBound}`);
                }
                const inner = type.dimensions.slice(d + 1).reduce((n, dim) => n * (dim.upperBound - dim.lowerBound + 1), 1);
                element += (index.value - dimension.lowerBound) * inner;
            });
            return { address: array.address + element * stride, dataType: type.elementType };
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
        return this.sizeOf(typeName);
    }

    /**
     * Bytes a variable of this type takes, whatever the type is: an elementary type, a string with its
     * capacity, a structure, a function block, an enumeration, a pointer or an array of any of them.
     */
    sizeOf(type: STDataType | ArrayType): number {
        if (isArrayType(type as STDataType)) {
            const array = type as ArrayType;
            return getArrayElementCount(array) * this.sizeOf(array.elementType);
        }

        if (typeof type === 'string') {
            const userFB = this.userFBs.get(type);
            if (userFB) return userFB.size;

            const structDef = this.userStructs.get(type);
            if (structDef) return structDef.size;

            const enumDef = this.userEnums.get(type);
            if (enumDef) return getDataTypeSize(enumDef.baseType);

            const text = parseStringType(type);
            if (text) return stringTotalSize(text.wide, text.capacity);

            const fbDef = getFB(type as DataTypeValue);
            if (fbDef) return fbDef.size;
        }

        return getDataTypeSize(type as STDataType);
    }

    /**
     * The type a value of `type` is stored and computed as: an enumeration is its base type
     * (INT), everything else is itself.
     */
    effectiveType(type: STDataType | ArrayType): STDataType | ArrayType {
        if (typeof type === 'string') {
            const enumDef = this.userEnums.get(type);
            if (enumDef) return enumDef.baseType;
        }
        return type;
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
 * The type definitions of a unit, each one after the definitions its members are of: the files of a project
 * are merged in an order that has nothing to do with which type uses which (CMP-042).
 */
function dependenciesFirst(definitions: TypeDefinition[]): TypeDefinition[] {
    const byName = new NameMap<TypeDefinition>();
    for (const definition of definitions) byName.set(definition.name, definition);
    const done = new Set<TypeDefinition>();
    const ordered: TypeDefinition[] = [];
    const nameOf = (type: unknown): string | undefined => {
        if (typeof type === 'string') return type;
        if (isArrayType(type as STDataType)) return nameOf((type as ArrayType).elementType);
        return undefined;
    };
    const visit = (definition: TypeDefinition): void => {
        if (done.has(definition)) return;
        done.add(definition);
        if (definition.kind === 'StructDecl') {
            for (const member of definition.members) {
                const name = nameOf(member.dataType);
                const used = name === undefined ? undefined : byName.get(name);
                if (used) visit(used);
            }
        }
        ordered.push(definition);
    };
    definitions.forEach(visit);
    return ordered;
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
    // the file of the declaration being processed: an error found here is placed in it (CMP-042)
    let currentFile: string | undefined;

    try {
    if (unit.kind === 'CompilationUnit') {
        // 1. First Pass: Process Type Definitions (STRUCTs and ENUMs)
        if (unit.typeDefinitions) {
            for (const typeDef of dependenciesFirst(unit.typeDefinitions)) {
                currentFile = typeDef.sourceRef;
                if (typeDef.kind === 'StructDecl') {
                    const members = new NameMap<MemberInfo>();
                    let currentOffset = 0;
                    for (const member of typeDef.members) {
                        const memberSize = table.sizeOf(member.dataType);

                        const alignment = Math.min(memberSize, 4); // Align struct members
                        currentOffset = alignTo(currentOffset, alignment);

                        members.set(member.name, {
                            offset: currentOffset,
                            size: memberSize,
                            dataType: member.dataType as any,
                            initialValue: member.initialValue,
                        });
                        currentOffset += memberSize;
                    }
                    table.addStructDefinition({
                        name: typeDef.name,
                        size: currentOffset,
                        members
                    });
                } else if (typeDef.kind === 'EnumDecl') {
                    const values = new NameMap<number>();
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
                            }, { sourceRef: typeDef.sourceRef });
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
                currentFile = iface.sourceRef;
                const methodSigs = new NameMap<MethodSignature>();
                
                for (const method of iface.methods) {
                    const inputs = method.inputs.map(v => ({
                        name: v.name,
                        dataType: v.dataType as DataTypeValue,
                        size: table.sizeOf(v.dataType)
                    }));
                    
                    const outputs = method.outputs.map(v => ({
                        name: v.name,
                        dataType: v.dataType as DataTypeValue,
                        size: table.sizeOf(v.dataType)
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
            // Find an FB that can be processed (no extends or base already processed), and whose members of a
            // function block type are of blocks already processed: their size is known (CMP-042)
            const baseReady = (fb: FunctionBlockDecl) => !fb.extends || table.getFBDefinition(fb.extends) !== undefined;
            const membersReady = (fb: FunctionBlockDecl) => [...fb.inputs, ...fb.outputs, ...fb.locals].every((member) => {
                const name = isArrayType(member.dataType) ? (member.dataType as ArrayType).elementType : member.dataType;
                return typeof name !== 'string' || !unprocessedFBs.some((other) => other !== fb && sameName(other.name, name));
            });
            let fbIndex = unprocessedFBs.findIndex((fb) => baseReady(fb) && membersReady(fb));
            if (fbIndex === -1) fbIndex = unprocessedFBs.findIndex(baseReady);

            if (fbIndex === -1) {
                const missing = unprocessedFBs.map(fb => `${fb.name} (extends ${fb.extends})`).join(', ');
                const first = unprocessedFBs[0]!;
                throw new CodegenError(`Circular inheritance or missing base FB in definitions: ${missing}`, first.line, first.column);
            }

            const fb = unprocessedFBs[fbIndex];
            unprocessedFBs.splice(fbIndex, 1);
            currentFile = fb.sourceRef;

            const fbMembers = new NameMap<MemberInfo>();
            const methods = new NameMap<MethodInfo>();
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
                
                // A VAR_IN_OUT member keeps the address of the caller's variable, not a copy of its value (CMP-028)
                const size = v.section === VarSection.VAR_IN_OUT ? REFERENCE_SIZE : table.sizeOf(v.dataType);

                const alignment = Math.min(size, 4);
                currentOffset = alignTo(currentOffset, alignment);

                fbMembers.set(v.name, {
                    offset: currentOffset,
                    size,
                    dataType: v.dataType as any,
                    section: v.section,
                    initialValue: v.initialValue,
                });
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
                        }, { sourceRef: fb.sourceRef });
                    }
                    
                    return {
                        name: v.name,
                        dataType: v.dataType as DataTypeValue,
                        size: table.sizeOf(v.dataType),
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
                        throw new CodegenError(`Method '${method.name}' marked as OVERRIDE but no base method found in '${fb.name}'`, method.line, method.column);
                    }
                    if (baseMethod.isFinal) {
                        throw new CodegenError(`Cannot override FINAL method '${method.name}' in '${fb.name}'`, method.line, method.column);
                    }
                    if (method.returnType !== baseMethod.returnType) {
                        throw new CodegenError(`Override method '${method.name}' return type '${method.returnType}' does not match base '${baseMethod.returnType}'`, method.line, method.column);
                    }
                } else if (baseMethod) {
                    throw new CodegenError(`Method '${method.name}' in '${fb.name}' hides inherited method. Use OVERRIDE explicitly.`, method.line, method.column);
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
                    access: method.accessSpecifier,
                    owner: fb.name,
                    ...(fb.sourceRef === undefined ? {} : { sourceRef: fb.sourceRef }),
                });
            }

            // Validate Interfaces
            if (fb.implements) {
                for (const ifaceName of fb.implements) {
                    const validateInterface = (name: string) => {
                        const iface = table.getInterfaceDefinition(name);
                        if (!iface) throw new CodegenError(`Unknown interface '${name}' implemented by '${fb.name}'`, fb.line, fb.column);
                        
                        // Check base interfaces
                        for (const base of iface.extends) {
                            validateInterface(base);
                        }

                        // Check methods
                        for (const [methodName, sig] of iface.methods) {
                            const method = methods.get(methodName);
                            if (!method) {
                                throw new CodegenError(`Function Block '${fb.name}' implements interface '${ifaceName}' but is missing required method '${methodName}'`, fb.line, fb.column);
                            }
                            
                            // Check signature
                            if (method.returnType !== sig.returnType) {
                                throw new CodegenError(`Method '${methodName}' in '${fb.name}' has return type '${method.returnType}' but interface '${ifaceName}' requires '${sig.returnType}'`, fb.line, fb.column);
                            }
                            
                            // Check inputs
                            if (method.inputs.length !== sig.inputs.length) {
                                throw new CodegenError(`Method '${methodName}' has different number of inputs than required by interface '${ifaceName}'`, fb.line, fb.column);
                            }
                            for (let i = 0; i < method.inputs.length; i++) {
                                if (!sameName(method.inputs[i].name, sig.inputs[i].name) || method.inputs[i].dataType !== sig.inputs[i].dataType) {
                                    throw new CodegenError(`Input ${i} of method '${methodName}' does not match interface '${ifaceName}' signature`, fb.line, fb.column);
                                }
                            }
                            
                            // Check outputs
                            if (method.outputs.length !== sig.outputs.length) {
                                throw new CodegenError(`Method '${methodName}' has different number of outputs than required by interface '${ifaceName}'`, fb.line, fb.column);
                            }
                            for (let i = 0; i < method.outputs.length; i++) {
                                if (!sameName(method.outputs[i].name, sig.outputs[i].name) || method.outputs[i].dataType !== sig.outputs[i].dataType) {
                                    throw new CodegenError(`Output ${i} of method '${methodName}' does not match interface '${ifaceName}' signature`, fb.line, fb.column);
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
            currentFile = globalBlock.sourceRef;
            for (const decl of globalBlock.variables) {
                table.add(decl, { sourceRef: globalBlock.sourceRef });
            }
        }

        // 4. Process functions (inputs and locals). Each function is a scope of its own (CMP-034): its variables
        // are declared as `Function.name`, so two functions may use the same names, and a parameter may be named
        // like a variable of a program. The code generator resolves a name inside a function to these first.
        for (const func of unit.functions) {
            currentFile = func.sourceRef;
            const scope = { sourceRef: func.sourceRef };
            const own = (name: string) => `${func.name}.${name}`;
            // Add inputs
            for (const input of func.inputs) {
                table.add({ ...input, name: own(input.name) }, scope);
            }
            // Add locals; a VAR_EXTERNAL names a global and takes no storage in the function
            for (const local of func.locals) {
                table.add(local.section === VarSection.VAR_EXTERNAL ? local : { ...local, name: own(local.name) }, scope);
            }
            // Add function name as result variable
            table.add({
                kind: 'VarDecl',
                name: own(func.name),
                dataType: func.returnType,
                section: VarSection.VAR,
                initialValue: null, tags: {},
                ioAddress: null,
                line: func.line,
                column: func.column,
            }, scope);
        }

        // 5. Process programs: each keeps its variables under its own name (CMP-042)
        for (const program of unit.programs) {
            currentFile = program.sourceRef;
            for (const block of program.varBlocks) {
                for (const decl of block.variables) {
                    const symbol = table.add(decl, { program: program.name, sourceRef: program.sourceRef });
                    if (decl.section !== VarSection.VAR_EXTERNAL) symbol.owner = program.name;
                }
            }
        }
        if (unit.programs.length === 1) table.setSoleProgram(unit.programs[0]!.name);
    } else {
        // Legacy support for single Program
        for (const block of (unit as Program).varBlocks) {
            for (const decl of block.variables) {
                table.add(decl);
            }
        }
    }
    } catch (error) {
        if (error instanceof CodegenError && error.sourceRef === undefined && currentFile !== undefined) error.sourceRef = currentFile;
        throw error;
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
 * Uses the user function block and structure definitions, then the stdlib registry.
 * The type name is looked up as written: a user type is case-sensitive here, as in the table.
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

    const bySize = (size: number): '8' | '16' | '32' | '64' | undefined => {
        switch (size) {
            case 1: return '8';
            case 2: return '16';
            case 4: return '32';
            case 8: return '64';
        }
        return undefined;
    };

    // 1. User-defined function blocks and structures
    const userMembers = table.getFBDefinition(fbType)?.members ?? table.getStructDefinition(fbType)?.members;
    if (userMembers) {
        const member = userMembers.get(memberName) || userMembers.get(name);
        if (member) {
            const suffix = bySize(member.size);
            if (suffix) return suffix;
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
            const suffix = bySize(member.size);
            if (suffix) return suffix;
        }
    }

    // 3. Last resort: check if it's a known elementary type (though rare in MemberAccess)
    const size = getDataTypeSize(name as DataTypeValue);
    if (size > 0) {
        const suffix = bySize(size);
        if (suffix) return suffix;
    }

    return '8'; // Default to 8-bit (safer for BOOLs)
}
