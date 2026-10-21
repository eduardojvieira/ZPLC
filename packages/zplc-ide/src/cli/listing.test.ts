/**
 * The assembly listing of a build stays available for inspection (CMP-060)
 *
 * SPDX-License-Identifier: MIT
 *
 * The listing is checked by what it is for: assembling it again gives the bytecode of the artifact. These tests do
 * not read its text.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';
import { assemble } from '@zplc/compiler';
import { main } from './index';
import { compilerCompile } from './toolApi';

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

const PROGRAM =
  'PROGRAM Main\nVAR t : TON; run AT %IX0.0 : BOOL; done AT %QX0.0 : BOOL; END_VAR\n    t(IN := run, PT := T#1s);\n    done := ' +
  't.Q;\nEND_PROGRAM\n';

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-listing-'));
  roots.push(root);
  await mkdir(join(root, 'src'));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'Listing',
      version: '1.0.0',
      tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
    }),
  );
  await writeFile(join(root, 'src', 'Main.st'), PROGRAM);
  return root;
}

function capture() {
  const lines: string[] = [];
  const errors: string[] = [];
  return { lines, errors, log: (line: string) => lines.push(line), error: (line: string) => errors.push(line) };
}

describe('zplc-cli compile --emit asm', () => {
  it('writes the listing of a workspace to the output, and assembling it gives the bytecode of the artifact', async () => {
    const root = await workspace();
    const built = await compilerCompile(root);
    expect(built.ok).toBe(true);
    const io = capture();
    const target = join(root, 'out.asm');
    expect(await main(['compile', root, '--emit', 'asm', '--output', target], io)).toBe(0);
    const listing = await readFile(target, 'utf8');
    expect(Buffer.from(assemble(listing).bytecode).equals(Buffer.from(built.bytecode!))).toBe(true);
  });

  it('prints it when there is no output', async () => {
    const root = await workspace();
    const built = await compilerCompile(root);
    const io = capture();
    expect(await main(['compile', root, '--emit', 'asm'], io)).toBe(0);
    expect(Buffer.from(assemble(io.lines.join('\n')).bytecode).equals(Buffer.from(built.bytecode!))).toBe(true);
  });

  it('does the same for a single source file', async () => {
    const root = await workspace();
    const file = join(root, 'src', 'Main.st');
    const io = capture();
    expect(await main(['compile', file, '--emit', 'asm'], io)).toBe(0);
    const direct = capture();
    const target = join(root, 'single.asm');
    expect(await main(['compile', file, '--emit', 'asm', '--output', target], direct)).toBe(0);
    expect(io.lines.join('\n')).toBe((await readFile(target, 'utf8')).replace(/\n$/, ''));
    expect(assemble(io.lines.join('\n')).bytecode.length).toBeGreaterThan(0);
  });

  it('refuses what it cannot do: another format, a command that builds nothing, JSON', async () => {
    const root = await workspace();
    for (const args of [
      ['compile', root, '--emit', 'hex'],
      ['check', root, '--emit', 'asm'],
      ['compile', root, '--emit', 'asm', '--json'],
    ]) {
      const io = capture();
      expect(await main(args, io)).toBe(1);
      expect([...io.lines, ...io.errors].join('\n')).toContain('emit');
    }
  });
});
