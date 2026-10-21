/**
 * The build options of a project file (CMP-046, CMP-059)
 *
 * SPDX-License-Identifier: MIT
 *
 * `zplc.json` names how a project is built: which warnings are reported, whether an implicit narrowing is an
 * error, whether source-level debug information is generated, which folders are libraries. This module reads
 * those options from the raw project value and says what each one does; the project model validates them with
 * `buildOptionProblems`, the compile entry points apply them with `buildOptionsOf`.
 *
 * | Option                      | Values                         | Default   | Effect                                           |
 * |-----------------------------|--------------------------------|-----------|--------------------------------------------------|
 * | compiler.warnings           | none, default, all             | default   | which warnings the build reports                 |
 * | compiler.strictTypes        | boolean                        | false     | an implicit narrowing is an error                |
 * | compiler.debug              | boolean                        | true      | statement ranges and line mappings in the map    |
 * | compiler.optimization       | none, size, speed              | none      | none: one code generator, same code at each value |
 * | build.generateDebugInfo     | boolean                        | false     | the CLI writes the debug map beside the artifact |
 * | libraries                   | [folders]                      | []        | folders of source files compiled with the project |
 */

import type { WarningSelection } from '@zplc/compiler';

/** The values of `compiler.warnings`: a level. (The compiler API also takes a list of warning codes.) */
export const WARNING_LEVELS = ['none', 'default', 'all'] as const;

/** The values of `compiler.optimization`: the code generator has one behaviour, so they produce the same code. */
export const OPTIMIZATION_LEVELS = ['none', 'size', 'speed'] as const;
export type OptimizationLevel = (typeof OPTIMIZATION_LEVELS)[number];

export interface BuildOptions {
  reportWarnings: WarningSelection;
  strictTypes: boolean;
  debug: boolean;
  optimization: OptimizationLevel;
  generateDebugInfo: boolean;
  libraries: string[];
}

export interface BuildOptionProblem {
  path: string;
  message: string;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A library folder: a relative path of plain names inside the workspace, not `src` itself and not `tests`. */
const LIBRARY_FOLDER = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;

export function libraryFolderProblem(folder: string): string | undefined {
  if (folder.length > 128) return 'A library folder is at most 128 characters';
  if (!LIBRARY_FOLDER.test(folder) || folder.split('/').some((part) => part === '.' || part === '..' || part.endsWith('.'))) {
    return 'A library folder is a relative path of plain names with `/` between them, inside the project';
  }
  const first = folder.split('/')[0]!.toLowerCase();
  if (folder.toLowerCase() === 'src') return 'src is the source folder of the project, not a library';
  if (first === 'tests') return 'tests holds the scenarios of the project, not source files';
  return undefined;
}

/** What is wrong with the build options of a raw project value, one entry for each problem. */
export function buildOptionProblems(project: JsonObject): BuildOptionProblem[] {
  const problems: BuildOptionProblem[] = [];
  const compiler = project.compiler;
  if (compiler !== undefined) {
    if (!isObject(compiler)) {
      problems.push({ path: 'compiler', message: 'compiler must be an object' });
    } else {
      if (compiler.warnings !== undefined && !(WARNING_LEVELS as readonly unknown[]).includes(compiler.warnings)) {
        problems.push({ path: 'compiler.warnings', message: "compiler.warnings must be 'none', 'default' or 'all'" });
      }
      if (compiler.optimization !== undefined && !(OPTIMIZATION_LEVELS as readonly unknown[]).includes(compiler.optimization)) {
        problems.push({
          path: 'compiler.optimization',
          message: `compiler.optimization must be one of ${OPTIMIZATION_LEVELS.map((level) => `'${level}'`).join(', ')}`,
        });
      }
      for (const name of ['debug', 'strictTypes'] as const) {
        if (compiler[name] !== undefined && typeof compiler[name] !== 'boolean')
          problems.push({ path: `compiler.${name}`, message: `compiler.${name} must be true or false` });
      }
    }
  }
  const build = project.build;
  if (build !== undefined && isObject(build) && build.generateDebugInfo !== undefined && typeof build.generateDebugInfo !== 'boolean') {
    problems.push({ path: 'build.generateDebugInfo', message: 'build.generateDebugInfo must be true or false' });
  }
  if (project.libraries !== undefined) {
    if (!Array.isArray(project.libraries)) {
      problems.push({ path: 'libraries', message: 'libraries must be a list of folders' });
    } else {
      const seen = new Set<string>();
      project.libraries.forEach((entry, index) => {
        const path = `libraries[${index}]`;
        if (typeof entry !== 'string') {
          problems.push({ path, message: 'A library is the name of a folder' });
          return;
        }
        const problem = libraryFolderProblem(entry);
        if (problem) problems.push({ path, message: problem });
        else if (seen.has(entry.toLowerCase())) problems.push({ path, message: `The library folder '${entry}' is listed twice` });
        seen.add(entry.toLowerCase());
      });
    }
  }
  return problems;
}

/** The build options of a project, with the default of each option that the file does not set. */
export function buildOptionsOf(project: unknown): BuildOptions {
  const record = isObject(project) ? project : {};
  const compiler = isObject(record.compiler) ? record.compiler : {};
  const build = isObject(record.build) ? record.build : {};
  const warnings = (WARNING_LEVELS as readonly unknown[]).includes(compiler.warnings) ? (compiler.warnings as WarningSelection) : 'default';
  const optimization = (OPTIMIZATION_LEVELS as readonly unknown[]).includes(compiler.optimization)
    ? (compiler.optimization as OptimizationLevel)
    : 'none';
  return {
    reportWarnings: warnings,
    strictTypes: compiler.strictTypes === true,
    debug: compiler.debug !== false,
    optimization,
    generateDebugInfo: build.generateDebugInfo === true,
    libraries: Array.isArray(record.libraries) ? record.libraries.filter((entry): entry is string => typeof entry === 'string') : [],
  };
}
