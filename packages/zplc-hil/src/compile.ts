import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256 } from './record';

/** The repository root: packages/zplc-hil/src/../../.. */
export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = join(REPOSITORY_ROOT, 'packages/zplc-ide/src/cli/index.ts');

export class CompileFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileFailure';
  }
}

export interface Compiled { zplc: Uint8Array; sha256: string }

/**
 * Compile a program with the repository compiler: the same `zplc-cli compile` that Studio, the CLI and MCP share.
 * A path to a source file, or a source text with the extension that names its language. The artifact is made in a
 * temporary directory and removed; nothing compiled is kept (HIL-006).
 */
export function compileSource(input: { path: string } | { text: string; extension: '.st' | '.il' }): Compiled {
  const directory = mkdtempSync(join(tmpdir(), 'zplc-hil-compile-'));
  try {
    let source: string;
    if ('path' in input) source = input.path;
    else {
      source = join(directory, `program${input.extension}`);
      writeFileSync(source, input.text);
    }
    const out = join(directory, 'program.zplc');
    const done = spawnSync(process.execPath, [CLI, 'compile', source, '-o', out], { cwd: REPOSITORY_ROOT, encoding: 'utf8' });
    if (done.status !== 0) throw new CompileFailure(`compilation failed: ${(done.stderr || done.stdout).trim()}`);
    const zplc = new Uint8Array(readFileSync(out));
    return { zplc, sha256: sha256(zplc) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
