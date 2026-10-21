// Learn starts no physical operation by itself (LRN-015; AGENTS.md rule 7).
//
//   bun tools/ci/learn-physical-guard.ts
//
// A source scan, and the only seam for this half of the rule: the behaviour test (packages/zplc-ide/src/learn/learnPhysical.test.tsx)
// drives every Learn action that exists today, and this guard keeps a later edit from adding one that reaches a device. The
// Learn modules (packages/zplc-ide/src/learn/**) and the Learn components (packages/zplc-ide/src/components/Learn* and learn*)
// must not import a module that reaches a device (the connection manager, the serial, native and WASM adapters, the debug
// controller, the deploy flow and the uploader) and must not call an operation that changes a device or a session: connect,
// disconnect, load a program (deploy), start, stop, pause, resume, step, reset, force or write, raw serial, a port request, or a
// flash. Reading a session (the watch read of the hardware recorder) is allowed. There is no offender list: the rule holds.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

export const IDE_SRC = 'packages/zplc-ide/src';
export interface SourceFile {
  path: string;
  text: string;
}
export interface Violation {
  file: string;
  line: number;
  rule: 'device-module' | 'physical-call';
  snippet: string;
}

export const isGuarded = (path: string): boolean =>
  /^packages\/zplc-ide\/src\/(?:learn\/.+|components\/[Ll]earn[^/]*)\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path);

const DEVICE_MODULE = new RegExp(
  String.raw`(?:from|import\()\s*['"][^'"]*(?:runtime\/(?:connectionManager|serialAdapter|framedSerialAdapter|nativeAdapter|` +
    String.raw`wasmAdapter)|hooks\/useDebugController\w*|components\/(?:deployFlow|deployConfirm|hardwareDeployConfirmation)|` +
    String.raw`uploader\/[^'"]*)['"]`,
);
const PHYSICAL_CALL = new RegExp(
  String.raw`\.(?:connect|disconnect|loadProgram|start|stop|pause|resume|step|reset|forceValue|clearForcedValue|` +
    String.raw`clearAllForcedValues|setValue|poke|pokeN|setIPI|setVirtualInput|sendRaw|requestPort|getPorts|enablePassthrough|` +
    String.raw`triggerNetworkBringUp|flash\w*)\s*\(|\bconnectionManager\b|\bnavigator\.serial\b|\bperformHardwareDeploy\b|` +
    String.raw`\buseDebugController\b`,
);

export function violationsOf(file: SourceFile): Violation[] {
  return file.text.split('\n').flatMap((text, index): Violation[] => {
    const rule = DEVICE_MODULE.test(text) ? 'device-module' : PHYSICAL_CALL.test(text) ? 'physical-call' : null;
    return rule ? [{ file: file.path, line: index + 1, rule, snippet: text.trim().slice(0, 160) }] : [];
  });
}

export function readSources(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (path: string): void => {
    if (statSync(join(root, path)).isDirectory()) for (const name of readdirSync(join(root, path)).sort()) walk(posix.join(path, name));
    else if (isGuarded(path)) files.push({ path, text: readFileSync(join(root, path), 'utf8') });
  };
  for (const folder of [`${IDE_SRC}/learn`, `${IDE_SRC}/components`]) if (existsSync(join(root, folder))) walk(folder);
  return files;
}

/** One line per violation: the requirement, where, and what. Empty when Learn reaches no device. */
export function checkRepository(root = resolve(dirname(new URL(import.meta.url).pathname), '../..')): string[] {
  return readSources(root)
    .flatMap(violationsOf)
    .map(
      (violation) =>
        `LRN-015: ${violation.file}:${violation.line} ${
          violation.rule === 'device-module' ? 'imports a module that reaches a device' : 'calls a physical operation'
        }: ${violation.snippet}`,
    );
}

if (import.meta.main) {
  const problems = checkRepository();
  for (const problem of problems) console.error(problem);
  console.log(
    problems.length === 0
      ? 'ok: Learn imports no device module and calls no physical operation'
      : `failed: ${problems.length} violation(s)`,
  );
  process.exit(problems.length === 0 ? 0 : 1);
}
