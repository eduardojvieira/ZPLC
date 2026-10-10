// Seed corpus for the fuzzers (VF-014): the artifacts the repository compiler really produces.
//
//   bun tools/fuzz/seed-corpus.ts [pack.json] [--dir <out-dir>]
//
// Every bundled example project and every conformance case that builds is compiled with the same Tool API that
// Studio, the CLI and MCP use. The artifacts are written, as hex strings by name, to the pack (default
// tools/fuzz/seed-corpus.json, which is checked in so that the fuzz job needs no JavaScript toolchain) and, with
// --dir, as one .zplc file each. The set is deterministic: projects and cases are visited in sorted order.
// Regenerate it when the compiler or the examples change; a stale pack only means older seeds.
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compilerCompile } from '../../packages/zplc-ide/src/cli/toolApi.ts';
import { loadCases } from '../../packages/zplc-ide/src/conformance/cases.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const projectsRoot = join(repository, 'packages/zplc-ide/projects');
const conformanceRoot = join(repository, 'conformance');

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

async function compileDirectory(root: string): Promise<Uint8Array | undefined> {
  // The compile step may write beside the project: work on a copy.
  const copy = mkdtempSync(join(tmpdir(), 'zplc-seed-'));
  try {
    cpSync(root, copy, { recursive: true });
    const result = await compilerCompile(copy);
    return result.ok && result.zplcFile ? result.zplcFile : undefined;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

export async function generate(): Promise<Map<string, Uint8Array>> {
  const seeds = new Map<string, Uint8Array>();
  const skipped: string[] = [];

  for (const entry of readdirSync(projectsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const bytes = await compileDirectory(join(projectsRoot, entry.name));
    if (bytes) seeds.set(`example-${slug(entry.name)}.zplc`, bytes);
    else skipped.push(`example ${entry.name}`);
  }

  for (const found of loadCases(conformanceRoot)) {
    if (found.expectation.build !== 'succeeds') continue;
    const scanMs = found.expectation.scanMs;
    const root = mkdtempSync(join(tmpdir(), 'zplc-seed-case-'));
    try {
      mkdirSync(join(root, 'src'));
      const program = `main${found.extension}`;
      copyFileSync(found.source, join(root, 'src', program));
      for (const extra of found.extras) copyFileSync(extra, join(root, 'src', basename(extra)));
      writeFileSync(join(root, 'zplc.json'), JSON.stringify({
        schemaVersion: 2, name: 'conformance', version: '1.0.0', target: { board: 'posix' },
        tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: scanMs, priority: 1, programs: [program] }],
      }));
      const result = await compilerCompile(root);
      if (result.ok && result.zplcFile) seeds.set(`conformance-${slug(found.name)}.zplc`, result.zplcFile);
      else skipped.push(`conformance ${found.name}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  if (skipped.length > 0) console.error(`seed-corpus: ${skipped.length} sources produced no artifact (templates, or sources the compiler rejects):\n  ${skipped.join('\n  ')}`);
  return seeds;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dirAt = args.indexOf('--dir');
  const directory = dirAt >= 0 ? args[dirAt + 1] : undefined;
  const pack = args.find((arg, index) => !arg.startsWith('--') && index !== dirAt + 1) ?? join(repository, 'tools/fuzz/seed-corpus.json');
  const seeds = await generate();
  const artifacts: Record<string, string> = {};
  for (const [name, bytes] of seeds) artifacts[name] = Buffer.from(bytes).toString('hex');
  writeFileSync(pack, JSON.stringify({ schema: 1, generator: 'tools/fuzz/seed-corpus.ts', artifacts }, null, 1) + '\n');
  if (directory) {
    mkdirSync(directory, { recursive: true });
    for (const [name, bytes] of seeds) writeFileSync(join(directory, name), bytes);
  }
  console.log(`seed-corpus: ${seeds.size} artifacts written to ${pack}${directory ? ` and ${directory}` : ''}`);
}
