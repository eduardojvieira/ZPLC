/** Plant gate, check VIS-013: prints the size of every file under a dist folder, raw and gzipped. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: bun scripts/plant-gate/bundleSize.ts <distDir>');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(root)
  .sort()
  .map((path) => {
    const data = readFileSync(path);
    return { file: relative(root, path), bytes: data.length, gzipBytes: Bun.gzipSync(data).length };
  });

console.log(
  JSON.stringify({
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
    gzipBytes: files.reduce((sum, f) => sum + f.gzipBytes, 0),
    files,
  }),
);
