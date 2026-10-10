// Type-checks every TypeScript program of the repository (VF-010): `bun run typecheck`.
//
// PROGRAMS is the contract. tools/ci/typecheck-coverage.test.ts requires that every TypeScript file of the
// repository is matched by one of these projects, so a file or a project cannot fall out of the check unnoticed.
// The projects use the strict flags of their package; none of them emits. The IDE application project needs the
// compiler package built (`bun run build:compiler`), as `bun run build:ide` does.
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

export interface Program { cwd: string; project: string }

export const PROGRAMS: readonly Program[] = [
  { cwd: 'packages/zplc-compiler', project: 'tsconfig.json' },
  { cwd: 'packages/zplc-compiler', project: 'tsconfig.check.json' },
  { cwd: 'packages/zplc-hil', project: 'tsconfig.json' },
  { cwd: 'packages/zplc-ide', project: 'tsconfig.app.json' },
  { cwd: 'packages/zplc-ide', project: 'tsconfig.node.json' },
  { cwd: 'packages/zplc-ide', project: 'tsconfig.electron.json' },
  { cwd: 'packages/zplc-ide', project: 'tsconfig.preload.json' },
  { cwd: 'packages/zplc-ide', project: 'tsconfig.check.json' },
  { cwd: '.', project: 'tsconfig.tools.json' },
];

/** The project as the compiler reads it: its options and the files its `include` and `exclude` select. */
export function parseProgram(root: string, { cwd, project }: Program): ts.ParsedCommandLine {
  const path = join(root, cwd, project);
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => { throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')); },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(path, { noEmit: true }, host);
  if (!parsed) throw new Error(`Cannot read ${relative(root, path)}`);
  return parsed;
}

/** The diagnostics of one program, formatted as `tsc` prints them. */
export function checkProgram(root: string, program: Program): string[] {
  const parsed = parseProgram(root, program);
  const compilation = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences });
  const host: ts.FormatDiagnosticsHost = { getCurrentDirectory: () => join(root, program.cwd), getCanonicalFileName: (name) => name, getNewLine: () => '\n' };
  return [...parsed.errors, ...ts.getPreEmitDiagnostics(compilation)]
    .map((diagnostic) => ts.formatDiagnostic(diagnostic, host).trimEnd());
}

function main(): number {
  const root = resolve(import.meta.dir, '../..');
  if (!existsSync(join(root, 'packages/zplc-compiler/dist/index.d.ts'))) {
    console.error('The compiler package is not built: run `bun run build:compiler` first.');
    return 1;
  }
  let failed = 0;
  for (const program of PROGRAMS) {
    const label = join(program.cwd, program.project);
    const diagnostics = checkProgram(root, program);
    if (diagnostics.length === 0) { console.log(`ok   ${label}`); continue; }
    failed += diagnostics.length;
    console.error(`FAIL ${label}: ${diagnostics.length} error${diagnostics.length === 1 ? '' : 's'}`);
    for (const line of diagnostics) console.error(line);
  }
  if (failed > 0) console.error(`\n${failed} type error${failed === 1 ? '' : 's'}`);
  return failed > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();
