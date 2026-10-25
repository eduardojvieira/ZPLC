import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The main process loads these modules as ES modules compiled by tsc (tsconfig.electron.json), where a relative import needs its
// extension: a missing one only fails when the application starts. This compiles the main process as the build does and loads each.
describe('the modules of src/ai that the main process loads', () => {
  test('load under Node after the build of the main process', () => {
    const out = mkdtempSync(join(tmpdir(), 'zplc-main-build-'));
    try {
      const root = join(import.meta.dir, '../..');
      const tsc = Bun.which('tsc') ?? join(root, '../../node_modules/.bin/tsc');
      const build = Bun.spawnSync([tsc, '-p', 'tsconfig.electron.json', '--outDir', out], { cwd: root });
      expect(build.exitCode, build.stdout.toString()).toBe(0);
      const node = Bun.which('node');
      expect(node).toBeTruthy();
      for (const file of ['candidatePaths', 'manifestPrivacy', 'proposals']) {
        const load = Bun.spawnSync([
          node!,
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(join(out, 'src/ai', `${file}.js`))})`,
        ]);
        expect(load.exitCode, `${file}: ${load.stderr.toString()}`).toBe(0);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
