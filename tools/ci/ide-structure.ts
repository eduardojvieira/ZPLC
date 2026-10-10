// Structural rules of Studio's TypeScript (IDE-014, IDE-033), checked without a new dependency:
//
//   bun tools/ci/ide-structure.ts            check the repository (also run by `bun run lint:ide`)
//   bun tools/ci/ide-structure.ts --write    lower the recorded size of the listed offenders that shrank
//
// The rules, each one a failure:
//   - layering (IDE-033): a module of src/store/ must not import from src/components/, and a module of src/cli/
//     or src/mcp/ must not import from electron/. Every import counts, a type-only one too: the direction is
//     the rule, not the runtime edge.
//     The pairs on tools/ci/layering-exceptions.json are accepted, each with the reason it cannot move yet; an
//     entry whose import is gone fails (a stale entry), so that list can only shrink as well.
//   - import cycles (IDE-033): a static value import that leads back to its module. `import type` is erased and
//     `import()` is deferred, so neither can create an initialisation cycle and neither is an edge. Each cycle is
//     reported once, with its path.
//   - module size (IDE-014): a hand-written module of src/ or electron/ has at most MODULE_LINE_LIMIT lines.
//     Tests (.test.ts, .test.tsx) and declaration files (.d.ts) are not modules of the product and are not
//     measured; there are no generated sources in these two folders. The modules above the limit when the rule
//     was added are on tools/ci/module-size-offenders.json, one entry each with the lines it had. The list can
//     only shrink: a module above the limit that is not listed fails, a listed module that grew fails, one that
//     shrank must have its entry lowered (--write does it), and a listed module that is within the limit, or
//     gone, must have its entry removed.
//
// Why 800 lines: when the rule was added 203 of the 218 hand-written modules (93 per cent) were within it, the
// median module had 100 lines, and the 15 above it were the oversized ones (the next step down, 600 lines, would
// have listed 27 and asked for splits inside the visual editors and the store that other work packages are
// rewriting). 800 lines is about ten screens, where a module stops being reviewable in one sitting.
// ponytail: line counts, not complexity; a 700-line module of one function is as bad, and a rule on function
// length would need the type-aware lint this repository does not run over the product yet.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import ts from 'typescript';

export const MODULE_LINE_LIMIT = 800;
export const IDE_ROOT = 'packages/zplc-ide';
const SOURCE_FOLDERS = [`${IDE_ROOT}/src/`, `${IDE_ROOT}/electron/`];
const OFFENDERS_PATH = new URL('./module-size-offenders.json', import.meta.url);
const EXCEPTIONS_PATH = new URL('./layering-exceptions.json', import.meta.url);

export interface SourceModule { path: string; text: string }
export interface Offender { file: string; requirement: string; added: string; lines: number; reason: string }
export interface LayeringException { file: string; imports: string; requirement: string; added: string; reason: string }
export interface StructureOptions { limit: number; offenders: Offender[]; exceptions?: LayeringException[] }
type ImportKind = 'value' | 'type' | 'dynamic';
interface Import { specifier: string; kind: ImportKind }

/** A module of the product: a TypeScript source that is not a test and not a declaration file. */
export const isProductModule = (path: string): boolean =>
  /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts')
  && SOURCE_FOLDERS.some((folder) => path.startsWith(folder));

/** The static imports and re-exports of a module, and its `import()` calls, with how each one is written. */
export function importsOf(path: string, text: string): Import[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Import[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly = clause !== undefined && (clause.isTypeOnly
        || (clause.name === undefined && named !== undefined && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly)));
      found.push({ specifier: node.moduleSpecifier.text, kind: typeOnly ? 'type' : 'value' });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, kind: node.isTypeOnly ? 'type' : 'value' });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0])) {
      found.push({ specifier: node.arguments[0].text, kind: 'dynamic' });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const lineCount = (text: string): number => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));

function resolveImport(from: string, specifier: string, known: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => known.has(candidate));
}

/** One concrete cycle through each strongly connected component of the value-import graph. */
function findCycles(graph: ReadonlyMap<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;
  const connect = (node: string): void => {
    index.set(node, counter); low.set(node, counter); counter += 1;
    stack.push(node); onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) { connect(next); low.set(node, Math.min(low.get(node)!, low.get(next)!)); }
      else if (onStack.has(next)) low.set(node, Math.min(low.get(node)!, index.get(next)!));
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); component.push(member); } while (member !== node);
      if (component.length > 1 || (graph.get(node) ?? []).includes(node)) components.push(component);
    }
  };
  for (const node of [...graph.keys()].sort()) if (!index.has(node)) connect(node);
  return components.map((component) => {
    const members = new Set(component);
    const start = [...component].sort()[0]!;
    // Breadth-first from the first module back to itself, inside the component.
    const previous = new Map<string, string>();
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const next of graph.get(node) ?? []) {
        if (!members.has(next)) continue;
        if (next === start) {
          const path = [start];
          for (let step: string | undefined = node; step !== undefined && step !== start; step = previous.get(step)) path.splice(1, 0, step);
          return [...path, start];
        }
        if (!previous.has(next)) { previous.set(next, node); queue.push(next); }
      }
    }
    return [start, start];
  });
}

export function checkIdeStructure(modules: readonly SourceModule[], options: StructureOptions): string[] {
  const problems: string[] = [];
  const product = modules.filter((module) => isProductModule(module.path));
  const known = new Set(product.map((module) => module.path));
  const values = new Map<string, string[]>();
  const exceptions = options.exceptions ?? [];
  const usedExceptions = new Set<LayeringException>();
  const layering = (module: SourceModule, target: string, message: string): void => {
    const accepted = exceptions.find((entry) => entry.file === module.path && entry.imports === target);
    if (accepted) usedExceptions.add(accepted);
    else problems.push(`IDE-033: ${module.path} imports ${target}; ${message}`);
  };

  for (const module of product) {
    const edges: string[] = [];
    for (const { specifier, kind } of importsOf(module.path, module.text)) {
      const target = resolveImport(module.path, specifier, known);
      if (target === undefined) continue;
      if (module.path.startsWith(`${IDE_ROOT}/src/store/`) && target.startsWith(`${IDE_ROOT}/src/components/`)) {
        layering(module, target, 'the store must not depend on components, move what both need to a module of the store, a util or a model');
      }
      if ((module.path.startsWith(`${IDE_ROOT}/src/cli/`) || module.path.startsWith(`${IDE_ROOT}/src/mcp/`)) && target.startsWith(`${IDE_ROOT}/electron/`)) {
        layering(module, target, 'the command line and the MCP server must not depend on the Electron host, move what both need out of electron/');
      }
      if (kind === 'value') edges.push(target);
    }
    values.set(module.path, edges);
  }

  for (const entry of exceptions) {
    if (!usedExceptions.has(entry)) problems.push(`IDE-033: the exception for ${entry.file} -> ${entry.imports} matches no import; remove the entry`);
  }
  for (const cycle of findCycles(values)) problems.push(`IDE-033: import cycle ${cycle.join(' -> ')}`);

  const listed = new Map<string, Offender>();
  for (const offender of options.offenders) {
    if (!/^[A-Z]+-\d{3}$/.test(offender.requirement)) problems.push(`IDE-014: the entry for ${offender.file} must name its requirement (IDE-014)`);
    listed.set(offender.file, offender);
  }
  const sizes = new Map(product.map((module) => [module.path, lineCount(module.text)] as const));
  for (const [path, lines] of [...sizes].sort(([left], [right]) => left.localeCompare(right))) {
    const entry = listed.get(path);
    if (lines <= options.limit) continue;
    if (!entry) problems.push(`IDE-014: ${path} has ${lines} lines, above the limit of ${options.limit}; split it by responsibility (one panel or one concern per module)`);
    else if (lines > entry.lines) problems.push(`IDE-014: ${path} grew from ${entry.lines} to ${lines} lines; a module on tools/ci/module-size-offenders.json can only shrink`);
    else if (lines < entry.lines) problems.push(`IDE-014: ${path} now has ${lines} lines, recorded ${entry.lines}; lower the entry (bun tools/ci/ide-structure.ts --write)`);
  }
  for (const offender of options.offenders) {
    const lines = sizes.get(offender.file);
    if (lines === undefined) problems.push(`IDE-014: ${offender.file} is on the list of offenders but is not a module of the product any more; remove the entry`);
    else if (lines <= options.limit) problems.push(`IDE-014: ${offender.file} has ${lines} lines, within the limit of ${options.limit}; remove the entry`);
  }
  return problems;
}

/** Reads the product modules of the checked-out repository. */
export function readIdeModules(root: string): SourceModule[] {
  const modules: SourceModule[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(join(root, directory)).sort()) {
      const path = posix.join(directory, name);
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (isProductModule(path)) modules.push({ path, text: readFileSync(join(root, path), 'utf8') });
    }
  };
  for (const folder of SOURCE_FOLDERS) if (existsSync(join(root, folder))) walk(folder.slice(0, -1));
  return modules;
}

export function readOffenders(): Offender[] {
  return JSON.parse(readFileSync(OFFENDERS_PATH, 'utf8')) as Offender[];
}

export function readExceptions(): LayeringException[] {
  return JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8')) as LayeringException[];
}

/** The repository's result: the violations of the rules over the checked-out source. */
export function checkRepository(root = resolve(dirname(new URL(import.meta.url).pathname), '../..')): string[] {
  return checkIdeStructure(readIdeModules(root), { limit: MODULE_LINE_LIMIT, offenders: readOffenders(), exceptions: readExceptions() });
}

if (import.meta.main) {
  const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
  if (process.argv.includes('--write')) {
    const sizes = new Map(readIdeModules(root).map((module) => [module.path, lineCount(module.text)] as const));
    const lowered = readOffenders().map((offender) => {
      const lines = sizes.get(offender.file);
      return lines !== undefined && lines > MODULE_LINE_LIMIT && lines < offender.lines ? { ...offender, lines } : offender;
    });
    writeFileSync(OFFENDERS_PATH, `${JSON.stringify(lowered, null, 2)}\n`);
  }
  const problems = checkRepository(root);
  if (problems.length > 0) {
    console.error(problems.map((problem) => `ide-structure: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`ide-structure: ok (${readOffenders().length} modules above ${MODULE_LINE_LIMIT} lines are listed, ${relative(root, OFFENDERS_PATH.pathname)})`);
}
