/**
 * Type names (CMP-030, CMP-033)
 *
 * SPDX-License-Identifier: MIT
 *
 * `TYPE Speed : INT; END_TYPE` names a type that is another one. The parser replaces each use of the
 * alias by the type it stands for, so the symbol table and the code generator never meet an alias:
 * a variable `s : Speed` is declared as `s : INT`, and takes the alias's default value when it has none.
 *
 * The library function blocks (TON, CTU, PULSE...) are not reserved words, so the lexer hands their names
 * over as identifiers. Here a type name that is one of them becomes the library block, unless the program
 * declares a type of that name: its own block, structure or enumeration wins.
 */

import { isArrayType } from './ast.ts';
import type {
    AliasDecl,
    CompilationUnit,
    Expression,
    FunctionBlockDecl,
    MethodDecl,
    STDataType,
    VarDecl,
} from './ast.ts';
import type { SourceSpan } from './diagnostics.ts';

export interface AliasIssue extends SourceSpan {
    message: string;
}

/** The library function blocks, by upper-case name, as the types the code generator knows them by. */
const LIBRARY_BLOCK_TYPES: Record<string, string> = Object.fromEntries([
    'TON', 'TOF', 'TP', 'R_TRIG', 'F_TRIG', 'RS', 'SR', 'CTU', 'CTD', 'CTUD', 'BLINK', 'PWM', 'PULSE',
    'HYSTERESIS', 'DEADBAND', 'LAG_FILTER', 'RAMP_REAL', 'INTEGRAL', 'DERIVATIVE', 'PID_Compact', 'FIFO', 'LIFO',
].map((name) => [name.toUpperCase(), name]));

/**
 * The elementary types a program may declare, by upper-case name. Type names are matched without regard to
 * case (CMP-004): `byte` is BYTE, and every later phase meets the upper-case spelling.
 */
export const ELEMENTARY_TYPES: ReadonlySet<string> = new Set([
    'BOOL', 'SINT', 'USINT', 'INT', 'UINT', 'DINT', 'UDINT', 'LINT', 'ULINT', 'REAL', 'LREAL', 'TIME',
    'STRING', 'WSTRING', 'DATE', 'TIME_OF_DAY', 'TOD', 'DATE_AND_TIME', 'DT', 'BYTE', 'WORD', 'DWORD', 'LWORD',
]);

/** `STRING[20]` and `WSTRING(10)` as the parser writes them: the capacity is part of the type name. */
const STRING_TYPE = /^(W?STRING)(\[\d+\])?$/i;

interface ResolvedAlias {
    type: STDataType;
    initialValue: Expression | null;
}

/**
 * Replace the use of every alias in `unit` by its base type.
 * @returns the errors found (a cycle, a duplicate name, an array of arrays)
 */
export function resolveTypeNames(unit: CompilationUnit): AliasIssue[] {
    const aliases = unit.typeAliases ?? [];

    const issues: AliasIssue[] = [];
    const byName = new Map<string, AliasDecl>();
    // the types the program declares, by upper-case name, with the spelling of the declaration
    const declared = new Map<string, string>([
        ...unit.typeDefinitions.map((type): [string, string] => [type.name.toUpperCase(), type.name]),
        ...unit.functionBlocks.map((block): [string, string] => [block.name.toUpperCase(), block.name]),
        ...unit.interfaces.map((iface): [string, string] => [iface.name.toUpperCase(), iface.name]),
    ]);
    const otherTypes = new Set<string>(declared.keys());
    for (const alias of aliases) {
        const key = alias.name.toUpperCase();
        if (byName.has(key) || otherTypes.has(key)) {
            issues.push({ message: `The type name '${alias.name}' is already declared`, line: alias.line, column: alias.column });
            continue;
        }
        byName.set(key, alias);
    }

    const resolved = new Map<string, ResolvedAlias | null>();
    const resolving = new Set<string>();

    /** The type behind `type`, following aliases; null when it cannot be resolved (an error is recorded). */
    const resolveType = (type: STDataType, at: SourceSpan): STDataType => {
        if (typeof type === 'string') {
            const key = type.toUpperCase();
            const alias = byName.get(key);
            if (alias) return resolveAlias(key, alias)?.type ?? type;
            // a name the program declares itself is its own, in the spelling of its declaration; a library name
            // is the library block; an elementary type is its upper-case name (CMP-004)
            const own = declared.get(key);
            if (own !== undefined) return own;
            if (ELEMENTARY_TYPES.has(key)) return key;
            const text = STRING_TYPE.exec(type);
            if (text) return `${text[1]!.toUpperCase()}${text[2] ?? ''}`;
            return LIBRARY_BLOCK_TYPES[key] ?? type;
        }
        if (isArrayType(type)) {
            const element = resolveType(type.elementType, at);
            if (typeof element !== 'string') {
                issues.push({ message: `An array of '${type.elementType}' is an array of arrays; declare one ARRAY with several dimensions`, line: at.line, column: at.column });
                return type;
            }
            return element === type.elementType ? type : { ...type, elementType: element as typeof type.elementType };
        }
        if (typeof type === 'object' && type.kind === 'PointerType') {
            const base = resolveType(type.baseType, at);
            return base === type.baseType ? type : { ...type, baseType: base };
        }
        return type;
    };

    const resolveAlias = (key: string, alias: AliasDecl): ResolvedAlias | null => {
        if (resolved.has(key)) return resolved.get(key)!;
        if (resolving.has(key)) {
            issues.push({ message: `The type alias '${alias.name}' refers to itself`, line: alias.line, column: alias.column });
            return null;
        }
        resolving.add(key);
        let result: ResolvedAlias | null = null;
        const base = resolveType(alias.baseType, alias);
        if (base !== undefined) {
            let initialValue = alias.initialValue;
            // an alias of an alias keeps the default of the nearest one that has one
            if (initialValue === null && typeof alias.baseType === 'string') {
                const inner = byName.get(alias.baseType.toUpperCase());
                if (inner) initialValue = resolveAlias(alias.baseType.toUpperCase(), inner)?.initialValue ?? null;
            }
            result = { type: base, initialValue };
        }
        resolving.delete(key);
        resolved.set(key, result);
        return result;
    };

    for (const [key, alias] of byName) resolveAlias(key, alias);

    const rewrite = (declaration: VarDecl): void => {
        if (typeof declaration.dataType === 'string') {
            const alias = byName.get(declaration.dataType.toUpperCase());
            const target = alias ? resolved.get(declaration.dataType.toUpperCase()) : undefined;
            if (target) {
                declaration.dataType = target.type;
                if (declaration.initialValue === null && target.initialValue !== null) {
                    declaration.initialValue = target.initialValue;
                }
                return;
            }
        }
        declaration.dataType = resolveType(declaration.dataType, declaration);
    };

    const rewriteMethod = (method: MethodDecl): void => {
        for (const variable of [...method.inputs, ...method.outputs, ...method.locals]) rewrite(variable);
        if (method.returnType !== null) method.returnType = resolveType(method.returnType, method);
    };
    const rewriteBlock = (block: FunctionBlockDecl): void => {
        for (const variable of [...block.inputs, ...block.outputs, ...block.inouts, ...block.locals]) rewrite(variable);
        for (const method of block.methods) rewriteMethod(method);
    };

    for (const block of unit.globalVars) block.variables.forEach(rewrite);
    for (const program of unit.programs) for (const block of program.varBlocks) block.variables.forEach(rewrite);
    for (const fn of unit.functions) {
        [...fn.inputs, ...fn.locals].forEach(rewrite);
        fn.returnType = resolveType(fn.returnType, fn) as typeof fn.returnType;
    }
    unit.functionBlocks.forEach(rewriteBlock);
    for (const iface of unit.interfaces) iface.methods.forEach(rewriteMethod);
    for (const type of unit.typeDefinitions) {
        if (type.kind === 'StructDecl') type.members.forEach(rewrite);
    }

    return issues;
}
