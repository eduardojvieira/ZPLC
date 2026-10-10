/** The `files` patterns of electron-builder.yml, and which of them package a given file of the app folder. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** electron-builder keeps a file when the last pattern that decides it includes it: a later include undoes an earlier exclusion. */
export function packagedByPatterns(patterns: readonly string[], file: string): boolean {
  let included = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    if (new Bun.Glob(negated ? pattern.slice(1) : pattern).match(file)) included = !negated;
  }
  return included;
}

export function builderFilePatterns(): string[] {
  const config = Bun.YAML.parse(readFileSync(join(import.meta.dir, '..', 'electron-builder.yml'), 'utf8')) as { files: string[] };
  return config.files;
}
