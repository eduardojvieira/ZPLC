/**
 * A project as one compilation unit (CMP-042)
 *
 * SPDX-License-Identifier: MIT
 *
 * Every source file of a project is read on its own, then merged into one `CompilationUnit`: a type, a function,
 * a function block, an interface or a global declared in any file is visible to every program of the project,
 * and a declaration made twice is an error at each place it is made. The code generator and the symbol table see
 * one unit, so a global has one storage location and a block is generated once, whichever programs use it.
 */

import { NameMap } from './ast.ts';
import type { CompilationUnit, Program } from './ast.ts';
import { CodegenError } from './diagnostics.ts';
import { resolveTypeNames } from './type-names.ts';

/** One file of the project, parsed. */
export interface UnitSource {
    /** The identity of the file in diagnostics and in the debug map: its project-relative path, or its name. */
    ref: string;
    unit: CompilationUnit;
    /** The program of this file that a task runs, when there is one; the other programs of a file are not built. */
    program?: Program;
}

export interface MergedUnit {
    unit: CompilationUnit;
    /** What the files declare twice, with the position of every declaration, in the order of the files. */
    errors: CodegenError[];
}

interface Declaration {
    kind: string;
    name: string;
    ref: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
}

/** The message of the declarations that share `name`, as seen from the one at `own`. */
function duplicateMessage(sites: Declaration[], own: Declaration, description: string): string {
    const where = (site: Declaration) => `in ${site.ref} (line ${site.line})`;
    if (new Set(sites.map((site) => site.kind)).size > 1) {
        return `'${own.name}' is declared as ${sites.map((site) => `${site.kind} ${where(site)}`).join(' and as ')}`;
    }
    if (sites.length === 2) return `${description} '${own.name}' is declared twice: ${where(sites[0]!)} and ${where(sites[1]!)}`;
    const last = sites[sites.length - 1]!;
    return `${description} '${own.name}' is declared ${sites.length} times: ${sites.slice(0, -1).map(where).join(', ')} and ${where(last)}`;
}

/** Report every group of declarations that share a name: one error at each declaration of the group. */
function reportDuplicates(declarations: Declaration[], describe: (kind: string) => string, errors: CodegenError[]): void {
    const groups = new NameMap<Declaration[]>();
    for (const declaration of declarations) {
        const group = groups.get(declaration.name);
        if (group) group.push(declaration);
        else groups.set(declaration.name, [declaration]);
    }
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        for (const site of group) {
            const error = new CodegenError('DUPLICATE_DECLARATION', duplicateMessage(group, site, describe(site.kind)), site.line, site.column, site.endLine, site.endColumn);
            error.sourceRef = site.ref;
            errors.push(error);
        }
    }
}

/**
 * Merge the files of a project into one unit, in the order given: the programs a task runs come first, in task
 * order, then the other files. Each declaration is stamped with its file.
 */
export function mergeUnits(sources: UnitSource[]): MergedUnit {
    const merged: CompilationUnit = {
        kind: 'CompilationUnit',
        globalVars: [],
        functions: [],
        functionBlocks: [],
        typeDefinitions: [],
        typeAliases: [],
        interfaces: [],
        programs: [],
        sourceFiles: sources.map((source) => source.ref),
        line: 1,
        column: 1,
    };
    const types: Declaration[] = [];
    const globals: Declaration[] = [];
    const site = (kind: string, name: string, ref: string, at: { line: number; column: number; endLine?: number; endColumn?: number }): Declaration =>
        ({ kind, name, ref, line: at.line, column: at.column, endLine: at.endLine, endColumn: at.endColumn });

    for (const { ref, unit, program } of sources) {
        for (const block of unit.globalVars) {
            block.sourceRef = ref;
            for (const variable of block.variables) {
                variable.sourceRef = ref;
                globals.push(site('VAR_GLOBAL', variable.name, ref, variable));
            }
            merged.globalVars.push(block);
        }
        for (const declaration of unit.functions) {
            declaration.sourceRef = ref;
            types.push(site('FUNCTION', declaration.name, ref, declaration));
            merged.functions.push(declaration);
        }
        for (const declaration of unit.functionBlocks) {
            declaration.sourceRef = ref;
            types.push(site('FUNCTION_BLOCK', declaration.name, ref, declaration));
            merged.functionBlocks.push(declaration);
        }
        for (const declaration of unit.typeDefinitions) {
            declaration.sourceRef = ref;
            types.push(site('TYPE', declaration.name, ref, declaration));
            merged.typeDefinitions.push(declaration);
        }
        for (const declaration of unit.typeAliases ?? []) {
            declaration.sourceRef = ref;
            types.push(site('TYPE', declaration.name, ref, declaration));
            merged.typeAliases!.push(declaration);
        }
        for (const declaration of unit.interfaces) {
            declaration.sourceRef = ref;
            types.push(site('INTERFACE', declaration.name, ref, declaration));
            merged.interfaces.push(declaration);
        }
        if (program) {
            program.sourceRef = ref;
            for (const block of program.varBlocks) for (const variable of block.variables) variable.sourceRef = ref;
            merged.programs.push(program);
        }
    }

    const errors: CodegenError[] = [];
    reportDuplicates(types, (kind) => kind, errors);
    reportDuplicates(globals, () => 'global variable', errors);

    // the aliases and the spelling of a type are resolved over the whole project: a name another file declares
    // is that file's (CMP-042); what a file alone could resolve was resolved when it was read
    if (sources.length > 1) {
        const aliases = merged.typeAliases!;
        for (const issue of resolveTypeNames(merged)) {
            if (/is already declared$/.test(issue.message)) continue; // reported with both places above
            const alias = aliases.find((each) => each.line === issue.line && each.column === issue.column);
            const error = new CodegenError(issue.code, issue.message, issue.line, issue.column, issue.endLine, issue.endColumn);
            if (alias?.sourceRef !== undefined) error.sourceRef = alias.sourceRef;
            errors.push(error);
        }
    }

    // in the order of the files, and in each file in the order of the lines
    const rank = new Map(sources.map((source, index) => [source.ref, index] as const));
    errors.sort((first, second) => (rank.get(first.sourceRef ?? '') ?? 0) - (rank.get(second.sourceRef ?? '') ?? 0)
        || first.line - second.line || first.column - second.column);
    return { unit: merged, errors };
}
