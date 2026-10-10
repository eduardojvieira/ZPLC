/**
 * ZPLC semantic checks
 *
 * SPDX-License-Identifier: MIT
 *
 * What a parsed unit must satisfy before code is generated for it, and which the grammar cannot say: the
 * names it uses for types are types. A check finds every error of its kind (CMP-007) and returns them as
 * positioned diagnostics; the build stops when any exists (CMP-002).
 */

import { isArrayType } from './ast.ts';
import type { CompilationUnit, FunctionBlockDecl, MethodDecl, Program, STDataType, VarDecl } from './ast.ts';
import { CodegenError } from './diagnostics.ts';
import type { SourceSpan } from './diagnostics.ts';
import { getAllFBNames } from './stdlib/index.ts';
import { ELEMENTARY_TYPES } from './type-names.ts';

/**
 * Types of the standard that ZPLC 2.0 does not have (decision D-04, planned for 2.x): a program that names
 * one is rejected, naming it, instead of getting a variable of no size.
 */
const DEFERRED_TYPES: ReadonlySet<string> = new Set(['LTIME', 'LDATE', 'LTOD', 'LDT', 'CHAR', 'WCHAR']);

const STRING_TYPE = /^W?STRING(\[\d+\])?$/i;

/**
 * The type names of the declarations of `unit` that name no type (CMP-003): an unknown name, or one of the
 * types deferred by decision D-04. Library function blocks and the types the unit declares are known.
 */
export function checkDeclaredTypes(unit: CompilationUnit | Program): CodegenError[] {
    const known = new Set<string>(ELEMENTARY_TYPES);
    for (const name of getAllFBNames()) known.add(name.toUpperCase());

    const declarations: Array<{ type: STDataType; at: SourceSpan; what: string }> = [];
    const variable = (declaration: VarDecl): void => {
        declarations.push({ type: declaration.dataType, at: declaration.typeAt ?? declaration, what: `the declaration of '${declaration.name}'` });
    };
    const method = (owner: string, declaration: MethodDecl): void => {
        for (const each of [...declaration.inputs, ...declaration.outputs, ...declaration.locals]) variable(each);
        if (declaration.returnType !== null) {
            declarations.push({ type: declaration.returnType, at: declaration.returnTypeAt ?? declaration, what: `the return type of '${owner}.${declaration.name}'` });
        }
    };
    const block = (declaration: FunctionBlockDecl): void => {
        known.add(declaration.name.toUpperCase());
        for (const each of [...declaration.inputs, ...declaration.outputs, ...declaration.inouts, ...declaration.locals]) variable(each);
        for (const each of declaration.methods) method(declaration.name, each);
    };

    if (unit.kind === 'Program') {
        for (const section of unit.varBlocks) section.variables.forEach(variable);
    } else {
        for (const type of unit.typeDefinitions) known.add(type.name.toUpperCase());
        for (const alias of unit.typeAliases ?? []) known.add(alias.name.toUpperCase());
        for (const iface of unit.interfaces) known.add(iface.name.toUpperCase());
        for (const declaration of unit.functionBlocks) known.add(declaration.name.toUpperCase());

        for (const globals of unit.globalVars) globals.variables.forEach(variable);
        for (const declaration of unit.functions) {
            [...declaration.inputs, ...declaration.locals].forEach(variable);
            declarations.push({ type: declaration.returnType, at: declaration.returnTypeAt ?? declaration, what: `the return type of '${declaration.name}'` });
        }
        unit.functionBlocks.forEach(block);
        for (const iface of unit.interfaces) iface.methods.forEach((each) => method(iface.name, each));
        for (const type of unit.typeDefinitions) {
            if (type.kind === 'StructDecl') type.members.forEach(variable);
        }
        for (const program of unit.programs) {
            for (const section of program.varBlocks) section.variables.forEach(variable);
        }
    }

    const errors: CodegenError[] = [];
    const check = (type: STDataType, at: SourceSpan, what: string): void => {
        if (isArrayType(type)) return check(type.elementType, at, what);
        if (typeof type === 'object' && type !== null) return check(type.baseType, at, what);
        if (typeof type !== 'string') return;
        const key = type.toUpperCase();
        if (known.has(key) || STRING_TYPE.test(type)) return;
        const message = DEFERRED_TYPES.has(key)
            ? `The type '${type}' is not supported in this release (it is planned for 2.x); it is used in ${what}`
            : `Unknown type '${type}' in ${what}`;
        errors.push(new CodegenError(message, at.line, at.column, at.endLine, at.endColumn));
    };
    for (const { type, at, what } of declarations) check(type, at, what);
    return errors;
}
