/**
 * ZPLC semantic checks
 *
 * SPDX-License-Identifier: MIT
 *
 * What a parsed unit must satisfy before code is generated for it, and which the grammar cannot say: the
 * names it uses for types are types. A check finds every error of its kind (CMP-007) and returns them as
 * positioned diagnostics; the build stops when any exists (CMP-002).
 */

import { NameMap, isArrayType } from './ast.ts';
import type {
    CompilationUnit,
    Expression,
    FunctionBlockDecl,
    FunctionDecl,
    MethodDecl,
    NamedArgument,
    Program,
    STDataType,
    Statement,
    VarDecl,
} from './ast.ts';
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

    // the file of the declarations being read: a diagnostic is placed in it (CMP-042)
    let file: string | undefined;
    const declarations: Array<{ type: STDataType; at: SourceSpan; what: string; file?: string }> = [];
    const variable = (declaration: VarDecl): void => {
        declarations.push({ type: declaration.dataType, at: declaration.typeAt ?? declaration, what: `the declaration of '${declaration.name}'`, file });
    };
    const method = (owner: string, declaration: MethodDecl): void => {
        for (const each of [...declaration.inputs, ...declaration.outputs, ...declaration.locals]) variable(each);
        if (declaration.returnType !== null) {
            declarations.push({ type: declaration.returnType, at: declaration.returnTypeAt ?? declaration, what: `the return type of '${owner}.${declaration.name}'`, file });
        }
    };
    const block = (declaration: FunctionBlockDecl): void => {
        file = declaration.sourceRef;
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

        for (const globals of unit.globalVars) {
            file = globals.sourceRef;
            globals.variables.forEach(variable);
        }
        for (const declaration of unit.functions) {
            file = declaration.sourceRef;
            [...declaration.inputs, ...declaration.locals].forEach(variable);
            declarations.push({ type: declaration.returnType, at: declaration.returnTypeAt ?? declaration, what: `the return type of '${declaration.name}'`, file });
        }
        unit.functionBlocks.forEach(block);
        for (const iface of unit.interfaces) {
            file = iface.sourceRef;
            iface.methods.forEach((each) => method(iface.name, each));
        }
        for (const type of unit.typeDefinitions) {
            file = type.sourceRef;
            if (type.kind === 'StructDecl') type.members.forEach(variable);
        }
        for (const program of unit.programs) {
            file = program.sourceRef;
            for (const section of program.varBlocks) section.variables.forEach(variable);
        }
    }

    const errors: CodegenError[] = [];
    const check = (type: STDataType, at: SourceSpan, what: string, where?: string): void => {
        if (isArrayType(type)) return check(type.elementType, at, what, where);
        if (typeof type === 'object' && type !== null) return check(type.baseType, at, what, where);
        if (typeof type !== 'string') return;
        const key = type.toUpperCase();
        if (known.has(key) || STRING_TYPE.test(type)) return;
        const message = DEFERRED_TYPES.has(key)
            ? `The type '${type}' is not supported in this release (it is planned for 2.x); it is used in ${what}`
            : `Unknown type '${type}' in ${what}`;
        const error = new CodegenError(message, at.line, at.column, at.endLine, at.endColumn);
        if (where !== undefined) error.sourceRef = where;
        errors.push(error);
    };
    for (const { type, at, what, file: where } of declarations) check(type, at, what, where);
    return errors;
}

// ============================================================================
// Recursion (CMP-035)
// ============================================================================

interface CallSite {
    callee: string;
    at: SourceSpan;
    /** The file of the function the call is in (CMP-042). */
    file?: string;
}

/** Every expression of `statements`, outermost first, and the function-block call statements among them. */
function visitStatements(statements: readonly Statement[], onExpression: (expr: Expression) => void,
                         onCall: (name: string, at: SourceSpan) => void): void {
    const expression = (expr: Expression | NamedArgument | null | undefined): void => {
        if (!expr) return;
        if ((expr as { kind: string }).kind === 'NamedArgument') {
            expression((expr as NamedArgument).value);
            return;
        }
        const node = expr as Expression;
        onExpression(node);
        switch (node.kind) {
            case 'MemberAccess': expression(node.object); break;
            case 'ArrayAccess': expression(node.array); node.indices.forEach(expression); break;
            case 'UnaryExpr': expression(node.operand); break;
            case 'BinaryExpr': expression(node.left); expression(node.right); break;
            case 'FunctionCall': node.args.forEach(expression); break;
            case 'MethodCall': expression(node.object); node.args.forEach(expression); break;
            case 'FBCall': node.parameters.forEach((parameter) => expression(parameter.value)); break;
            case 'ReferenceExpr': expression(node.operand); break;
            case 'DereferenceExpr': expression(node.operand); break;
            case 'BitAccess': expression(node.operand); break;
            default: break;
        }
    };
    for (const statement of statements) {
        switch (statement.kind) {
            case 'Assignment':
                expression(statement.target);
                expression(statement.value);
                break;
            case 'IfStatement':
                expression(statement.condition);
                visitStatements(statement.thenBranch, onExpression, onCall);
                for (const branch of statement.elsifBranches ?? []) {
                    expression(branch.condition);
                    visitStatements(branch.statements, onExpression, onCall);
                }
                visitStatements(statement.elseBranch ?? [], onExpression, onCall);
                break;
            case 'WhileStatement':
                expression(statement.condition);
                visitStatements(statement.body, onExpression, onCall);
                break;
            case 'ForStatement':
                expression(statement.start);
                expression(statement.end);
                expression(statement.step);
                visitStatements(statement.body, onExpression, onCall);
                break;
            case 'RepeatStatement':
                visitStatements(statement.body, onExpression, onCall);
                expression(statement.condition);
                break;
            case 'CaseStatement':
                expression(statement.selector);
                for (const branch of statement.branches) {
                    for (const label of branch.values) {
                        expression(label.start);
                        expression(label.end);
                    }
                    visitStatements(branch.statements, onExpression, onCall);
                }
                visitStatements(statement.elseBranch ?? [], onExpression, onCall);
                break;
            case 'FBCallStatement':
                onCall(statement.fbName, statement);
                statement.parameters.forEach((parameter) => expression(parameter.value));
                break;
            default:
                break;
        }
    }
}

/**
 * A function that calls itself, directly or through other functions, is an error at the call that closes the
 * cycle (CMP-035): a function has static storage, so a recursive call would overwrite the variables of the
 * call it is made from. The check reads the calls of the declared functions only.
 */
export function checkRecursion(unit: CompilationUnit): CodegenError[] {
    const functions = new NameMap<FunctionDecl>();
    for (const declaration of unit.functions) functions.set(declaration.name, declaration);
    if (functions.size === 0) return [];

    const calls = new NameMap<CallSite[]>();
    for (const declaration of unit.functions) {
        // a variable of the function that is named like another function is that variable, not a call
        const variables = new NameMap<true>();
        for (const variable of [...declaration.inputs, ...declaration.locals]) variables.set(variable.name, true);
        const sites: CallSite[] = [];
        visitStatements(declaration.body, (expr) => {
            if (expr.kind === 'FunctionCall' && functions.has(expr.name)) sites.push({ callee: expr.name, at: expr, file: declaration.sourceRef });
        }, (name, at) => {
            if (functions.has(name) && !variables.has(name)) sites.push({ callee: name, at, file: declaration.sourceRef });
        });
        calls.set(declaration.name, sites);
    }

    const errors: CodegenError[] = [];
    const done = new Set<string>();
    const path: string[] = [];
    const walk = (name: string): void => {
        const key = name.toUpperCase();
        if (done.has(key)) return;
        path.push(functions.get(name)!.name);
        for (const site of calls.get(name) ?? []) {
            const target = functions.get(site.callee)!;
            const at = path.findIndex((entry) => entry.toUpperCase() === target.name.toUpperCase());
            if (at >= 0) {
                const cycle = [...path.slice(at), target.name];
                const message = cycle.length === 2
                    ? `Function '${target.name}' calls itself: a function cannot be recursive`
                    : `Function '${target.name}' calls itself through ${cycle.slice(1, -1).map((each) => `'${each}'`).join(', ')}: a function cannot be recursive`;
                const error = new CodegenError(message, site.at.line, site.at.column, site.at.endLine, site.at.endColumn);
                if (site.file !== undefined) error.sourceRef = site.file;
                errors.push(error);
            } else {
                walk(target.name);
            }
        }
        path.pop();
        done.add(key);
    };
    for (const declaration of unit.functions) walk(declaration.name);
    return errors;
}
