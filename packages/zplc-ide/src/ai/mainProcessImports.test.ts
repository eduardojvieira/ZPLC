import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The main process loads these modules as ES modules compiled by tsc (tsconfig.electron.json), where a relative import needs its
// extension; a missing one only fails when the application starts. They also import nothing of the window.
describe('the modules of src/ai that the main process loads', () => {
  for (const file of ['candidatePaths.ts', 'manifestPrivacy.ts', 'proposals.ts']) {
    test(`${file} imports only modules of its own folder, with their extension`, () => {
      const source = readFileSync(join(import.meta.dir, file), 'utf8');
      const specifiers = [...source.matchAll(/^import .* from '([^']+)';/gm)].map((match) => match[1]!);
      for (const specifier of specifiers) {
        expect(specifier, `${file}: ${specifier}`).toMatch(/^\.\/[A-Za-z]+\.js$/);
      }
    });
  }
});
