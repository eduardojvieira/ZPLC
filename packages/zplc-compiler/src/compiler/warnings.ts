/**
 * Warnings found by reading a unit (CMP-008)
 *
 * SPDX-License-Identifier: MIT
 *
 * What the code generator cannot say while it generates, and the grammar does not forbid: a variable that
 * is declared and never used, and a statement that can never run. The analysis reads the tree of a unit, merged
 * or of one file, and returns warnings; it never fails the build and never changes the tree.
 *
 * Language rules it applies, which the language reference states too:
 *
 *  - A variable is *used* when its name appears in the body of the unit it belongs to (the program, the
 *    function, the function block and its methods), as a value, as a call, as the base of a member, element
 *    or bit, or as the operand of REF. It is *write-only* when every appearance is the target of an
 *    assignment or an output binding.
 *  - Only VAR and VAR_TEMP variables are checked. An input, an output or an in-out variable is the interface of
 *    its unit, a global is shared by the project, and a variable with a direct address or a communication tag
 *    is read or written from outside the program.
 *  - A member of a function block that another unit reads or writes by `instance.member` is used.
 *  - A statement is unreachable when a statement before it in the same list is RETURN, EXIT or CONTINUE, or is
 *    an IF or CASE with an ELSE whose every branch leaves. A branch that a constant condition makes dead
 *    (`IF FALSE`) is not unreachable code: IEC 61131-3 defines no such rule and nothing here evaluates
 *    conditions.
 */

import { NameMap, VarSection } from './ast.ts';
import type {
    CompilationUnit,
    Expression,
    FBParameter,
    FunctionBlockDecl,
    FunctionDecl,
    MethodDecl,
    NamedArgument,
    Program,
    Statement,
    VarDecl,
} from './ast.ts';
import type { CodegenWarning } from './diagnostics.ts';

/** The names a body reads and the names it only writes. */
interface Usage {
    reads: Set<string>;
    writes: Set<string>;
}

const key = (name: string): string => name.toUpperCase();

function newUsage(): Usage {
    return { reads: new Set(), writes: new Set() };
}

/** The variable at the base of `x`, `x.m`, `x[i]` and `x.3`, when there is one. */
function baseName(expr: Expression): string | undefined {
    switch (expr.kind) {
        case 'Identifier': return expr.name;
        case 'MemberAccess': return baseName(expr.object);
        case 'ArrayAccess': return baseName(expr.array);
        case 'BitAccess': return baseName(expr.operand);
        default: return undefined;
    }
}

function valueOf(argument: Expression | NamedArgument): Expression {
    return argument.kind === 'NamedArgument' ? argument.value : argument;
}

/** Every name `expr` reads, added to `usage`; `members` collects the names written after a dot. */
function readExpression(expr: Expression, usage: Usage, members: Set<string>): void {
    const read = (inner: Expression): void => readExpression(inner, usage, members);
    switch (expr.kind) {
        case 'Identifier':
            usage.reads.add(key(expr.name));
            break;
        case 'MemberAccess':
            members.add(key(expr.member));
            read(expr.object);
            break;
        case 'ArrayAccess':
            read(expr.array);
            expr.indices.forEach(read);
            break;
        case 'UnaryExpr':
            read(expr.operand);
            break;
        case 'BinaryExpr':
            read(expr.left);
            read(expr.right);
            break;
        case 'FunctionCall':
            expr.args.forEach((argument) => read(valueOf(argument)));
            break;
        case 'MethodCall':
            read(expr.object);
            expr.args.forEach((argument) => read(valueOf(argument)));
            break;
        case 'FBCall':
            usage.reads.add(key(expr.fbName));
            parameters(expr.parameters, usage, members);
            break;
        case 'ReferenceExpr':
        case 'DereferenceExpr':
            read(expr.operand);
            break;
        case 'BitAccess':
            read(expr.operand);
            break;
        case 'ArrayLiteral':
            for (const element of expr.elements) {
                if (element.kind === 'ArrayLiteral' || element.kind === 'ArrayRepeat' || element.kind === 'StructInitializer') continue;
                read(element);
            }
            break;
        default:
            break;
    }
}

/** The arguments of a call: `Q => target` writes the target, anything else is read. */
function parameters(list: readonly FBParameter[], usage: Usage, members: Set<string>): void {
    for (const parameter of list) {
        if (parameter.output) {
            const target = baseName(parameter.value);
            if (target !== undefined) usage.writes.add(key(target));
            collectIndices(parameter.value, usage, members);
        } else {
            readExpression(parameter.value, usage, members);
        }
    }
}

/** The index expressions of a target are read, whatever the target is. */
function collectIndices(target: Expression, usage: Usage, members: Set<string>): void {
    switch (target.kind) {
        case 'ArrayAccess':
            collectIndices(target.array, usage, members);
            target.indices.forEach((index) => readExpression(index, usage, members));
            break;
        case 'MemberAccess':
            members.add(key(target.member));
            collectIndices(target.object, usage, members);
            break;
        case 'BitAccess':
            collectIndices(target.operand, usage, members);
            break;
        case 'DereferenceExpr':
            readExpression(target.operand, usage, members);
            break;
        default:
            break;
    }
}

function readStatements(statements: readonly Statement[], usage: Usage, members: Set<string>): void {
    const expression = (expr: Expression | null | undefined): void => {
        if (expr) readExpression(expr, usage, members);
    };
    for (const statement of statements) {
        switch (statement.kind) {
            case 'Assignment': {
                if (statement.target.kind === 'DereferenceExpr') {
                    // the pointer is read; the variable it points at is written through it
                    readExpression(statement.target.operand, usage, members);
                } else {
                    const target = baseName(statement.target);
                    if (target !== undefined) usage.writes.add(key(target));
                    collectIndices(statement.target, usage, members);
                }
                expression(statement.value);
                break;
            }
            case 'IfStatement':
                expression(statement.condition);
                readStatements(statement.thenBranch, usage, members);
                for (const branch of statement.elsifBranches) {
                    expression(branch.condition);
                    readStatements(branch.statements, usage, members);
                }
                readStatements(statement.elseBranch ?? [], usage, members);
                break;
            case 'WhileStatement':
                expression(statement.condition);
                readStatements(statement.body, usage, members);
                break;
            case 'ForStatement':
                // the counter is written by the loop and read by its end test
                usage.reads.add(key(statement.counter));
                usage.writes.add(key(statement.counter));
                expression(statement.start);
                expression(statement.end);
                expression(statement.step);
                readStatements(statement.body, usage, members);
                break;
            case 'RepeatStatement':
                readStatements(statement.body, usage, members);
                expression(statement.condition);
                break;
            case 'CaseStatement':
                expression(statement.selector);
                for (const branch of statement.branches) {
                    for (const label of branch.values) {
                        expression(label.start);
                        expression(label.end);
                    }
                    readStatements(branch.statements, usage, members);
                }
                readStatements(statement.elseBranch ?? [], usage, members);
                break;
            case 'FBCallStatement':
                if (statement.instance) readExpression(statement.instance, usage, members);
                else usage.reads.add(key(statement.fbName));
                parameters(statement.parameters, usage, members);
                break;
            default:
                break;
        }
    }
}

// ============================================================================
// Unreachable statements
// ============================================================================

/** True when control never goes from this statement to the one after it. */
function leaves(statement: Statement): boolean {
    switch (statement.kind) {
        case 'ReturnStatement':
        case 'ExitStatement':
        case 'ContinueStatement':
            return true;
        case 'IfStatement':
            return statement.elseBranch !== null
                && listLeaves(statement.thenBranch)
                && statement.elsifBranches.every((branch) => listLeaves(branch.statements))
                && listLeaves(statement.elseBranch);
        case 'CaseStatement':
            return statement.elseBranch !== null
                && statement.branches.every((branch) => listLeaves(branch.statements))
                && listLeaves(statement.elseBranch);
        default:
            return false;
    }
}

function listLeaves(statements: readonly Statement[]): boolean {
    return statements.some(leaves);
}

/** The nested lists of statements of one statement. */
function nested(statement: Statement): Array<readonly Statement[]> {
    switch (statement.kind) {
        case 'IfStatement':
            return [statement.thenBranch, ...statement.elsifBranches.map((branch) => branch.statements), statement.elseBranch ?? []];
        case 'WhileStatement':
        case 'ForStatement':
        case 'RepeatStatement':
            return [statement.body];
        case 'CaseStatement':
            return [...statement.branches.map((branch) => branch.statements), statement.elseBranch ?? []];
        default:
            return [];
    }
}

function unreachable(statements: readonly Statement[], report: (statement: Statement) => void): void {
    for (const [index, statement] of statements.entries()) {
        if (index > 0 && leaves(statements[index - 1]!)) {
            // one warning for the rest of the list; what is inside it is no more reachable
            report(statement);
            return;
        }
        for (const list of nested(statement)) unreachable(list, report);
    }
}

// ============================================================================
// The unit
// ============================================================================

/** A declaration the usage check applies to: VAR and VAR_TEMP, without a direct address or a tag. */
function isChecked(variable: VarDecl): boolean {
    if (variable.ioAddress !== null) return false;
    if (Object.keys(variable.tags).length > 0) return false;
    return variable.section === VarSection.VAR || variable.section === VarSection.VAR_TEMP || variable.section === VarSection.VAR_RETAIN;
}

/** Read `statements` and the bodies of `methods`; the usage is shared by a function block and its methods. */
function bodyUsage(statements: readonly Statement[], methods: readonly MethodDecl[], members: Set<string>): Usage {
    const usage = newUsage();
    readStatements(statements, usage, members);
    for (const method of methods) readStatements(method.body, usage, members);
    return usage;
}

/**
 * The warnings of the analysis of `unit`, in the order of the declarations; the caller sorts them with the
 * rest. A warning carries the file of the declaration it belongs to when the unit is a merged project.
 */
export function analyzeUnit(unit: CompilationUnit): CodegenWarning[] {
    const warnings: CodegenWarning[] = [];

    // names that some unit reads or writes after a dot: a function block member used from outside is used
    const accessed = new Set<string>();
    const programs = unit.programs;
    const blockUsage = new NameMap<Usage>();
    const functionUsage = new Map<FunctionDecl, Usage>();
    const programUsage = new Map<Program, Usage>();

    for (const program of programs) programUsage.set(program, bodyUsage(program.statements, [], accessed));
    for (const declaration of unit.functions) functionUsage.set(declaration, bodyUsage(declaration.body, [], accessed));
    for (const declaration of unit.functionBlocks) {
        blockUsage.set(declaration.name, bodyUsage(declaration.body, declaration.methods, accessed));
    }
    for (const iface of unit.interfaces) for (const method of iface.methods) readStatements(method.body, newUsage(), accessed);

    const report = (variable: VarDecl, usage: Usage, owner: string, ref: string | undefined, outside: boolean): void => {
        const name = key(variable.name);
        const read = usage.reads.has(name) || outside;
        const written = usage.writes.has(name);
        const at = {
            line: variable.line,
            column: variable.column,
            ...(variable.endLine === undefined ? {} : { endLine: variable.endLine, endColumn: variable.endColumn }),
            ...(ref === undefined ? {} : { sourceRef: ref }),
        };
        if (!read && !written) {
            warnings.push({ code: 'UNUSED_VARIABLE', message: `The variable '${variable.name}' of ${owner} is declared and never used`, ...at });
        } else if (!read) {
            warnings.push({ code: 'WRITE_ONLY_VARIABLE', message: `The variable '${variable.name}' of ${owner} is written and never read`, ...at });
        }
    };

    for (const program of programs) {
        const usage = programUsage.get(program)!;
        for (const block of program.varBlocks) {
            for (const variable of block.variables) {
                if (isChecked(variable)) report(variable, usage, `PROGRAM ${program.name}`, variable.sourceRef ?? program.sourceRef, false);
            }
        }
    }
    for (const declaration of unit.functions) {
        const usage = functionUsage.get(declaration)!;
        for (const variable of declaration.locals) {
            if (isChecked(variable)) report(variable, usage, `FUNCTION ${declaration.name}`, declaration.sourceRef, false);
        }
    }
    for (const declaration of unit.functionBlocks as FunctionBlockDecl[]) {
        const usage = blockUsage.get(declaration.name)!;
        for (const variable of declaration.locals) {
            if (isChecked(variable)) {
                report(variable, usage, `FUNCTION_BLOCK ${declaration.name}`, declaration.sourceRef, accessed.has(key(variable.name)));
            }
        }
        for (const method of declaration.methods) {
            const methodUse = bodyUsage(method.body, [], accessed);
            for (const variable of method.locals) {
                if (isChecked(variable)) report(variable, methodUse, `METHOD ${declaration.name}.${method.name}`, declaration.sourceRef, false);
            }
        }
    }

    // unreachable statements, with the file of the unit they are in
    const unreachableIn = (statements: readonly Statement[], ref: string | undefined): void => {
        unreachable(statements, (statement) => {
            warnings.push({
                code: 'UNREACHABLE_STATEMENT',
                message: 'This statement can never run: the statement before it leaves the list (RETURN, EXIT or CONTINUE, or an IF or CASE that always leaves)',
                line: statement.line,
                column: statement.column,
                ...(statement.endLine === undefined ? {} : { endLine: statement.endLine, endColumn: statement.endColumn }),
                ...(ref === undefined ? {} : { sourceRef: ref }),
            });
        });
    };
    for (const program of programs) unreachableIn(program.statements, program.sourceRef);
    for (const declaration of unit.functions) unreachableIn(declaration.body, declaration.sourceRef);
    for (const declaration of unit.functionBlocks) {
        unreachableIn(declaration.body, declaration.sourceRef);
        for (const method of declaration.methods) unreachableIn(method.body, declaration.sourceRef);
    }
    return warnings;
}
