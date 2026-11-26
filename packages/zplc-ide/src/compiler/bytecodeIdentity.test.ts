/**
 * AIX-U8 guard: the element-to-PC map is read from the debug map, never from a change to code generation. Every
 * example project and every conformance source builds to the bytes it built to before (sha256 of the .zplc file,
 * recorded in `bytecode-identity.json` at 8d0f0517). A build that fails is recorded by its error code.
 *
 * Regenerate the record only when a change to code generation is intended: ZPLC_WRITE_BYTECODE_IDENTITY=1.
 */
import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { compilerCompile } from '../cli/toolApi';
import { compileSingleFileWithTask, type PLCLanguage } from './index';

const PROJECTS = join(import.meta.dir, '../../projects');
const CONFORMANCE = join(import.meta.dir, '../../../../conformance/lng');
const RECORD = join(import.meta.dir, 'bytecode-identity.json');

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const LANGUAGE_OF: Array<[RegExp, PLCLanguage]> = [
  [/\.ld\.json$/, 'LD'],
  [/\.fbd\.json$/, 'FBD'],
  [/\.sfc\.json$/, 'SFC'],
  [/\.il$/, 'IL'],
  [/\.st$/, 'ST'],
];

async function current(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const name of readdirSync(PROJECTS).sort()) {
    const root = join(PROJECTS, name);
    if (!existsSync(join(root, 'zplc.json'))) continue;
    const result = await compilerCompile(root);
    hashes[`projects/${name}`] = result.ok && result.zplcFile ? sha(result.zplcFile) : `error:${result.evidence.diagnostics[0]?.code ?? '?'}`;
  }
  for (const name of readdirSync(CONFORMANCE).sort()) {
    const language = LANGUAGE_OF.find(([pattern]) => pattern.test(name))?.[1];
    if (!language || name.endsWith('.expect.json')) continue;
    let hash: string;
    try {
      hash = sha(compileSingleFileWithTask(readFileSync(join(CONFORMANCE, name), 'utf8'), language, { sourceRef: name }).zplcFile);
    } catch (error) {
      hash = `error:${(error as { code?: string }).code ?? 'unknown'}`;
    }
    hashes[`conformance/lng/${name}`] = hash;
  }
  return hashes;
}

describe('AIX-U8 the emitted bytecode is byte-identical', () => {
  it('builds every example project and conformance source to the sha256 recorded before the map existed', async () => {
    const hashes = await current();
    if (process.env.ZPLC_WRITE_BYTECODE_IDENTITY === '1') writeFileSync(RECORD, `${JSON.stringify(hashes, null, 2)}\n`);
    const recorded = JSON.parse(readFileSync(RECORD, 'utf8')) as Record<string, string>;
    expect(Object.values(hashes).filter((hash) => !hash.startsWith('error:')).length).toBeGreaterThan(50);
    expect(hashes).toEqual(recorded);
  }, 300_000);
});
