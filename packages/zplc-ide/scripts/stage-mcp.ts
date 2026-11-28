// Puts the standalone zplc-mcp where electron-builder reads it (extraResources: dist-native/mcp -> resources/zplc-mcp), so the
// installer carries the same executable the release publishes as a separate download.
//
//   bun scripts/stage-mcp.ts --from ../../dist-bin   the release workflow, after scripts/release/binaries.ts built it
//   bun scripts/stage-mcp.ts                          a local build: builds the host's executable with binaries.ts first
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Copies the one `zplc-mcp-<version>-<os>-<arch>[.exe]` of `from` to `<to>/zplc-mcp[.exe]` and answers that path. */
export function stageMcp(from: string, to: string): string {
  const found = readdirSync(from).filter((file) => /^zplc-mcp-.+-(mac|linux|win)-(x64|arm64)(\.exe)?$/.test(file));
  if (found.length !== 1) throw new Error(`stage-mcp: expected one zplc-mcp executable in ${from}, found ${found.length}`);
  const target = join(to, found[0]!.endsWith('.exe') ? 'zplc-mcp.exe' : 'zplc-mcp');
  mkdirSync(to, { recursive: true });
  copyFileSync(join(from, found[0]!), target);
  chmodSync(target, 0o755);
  return target;
}

if (import.meta.main) {
  const flag = process.argv.indexOf('--from');
  const ide = resolve(import.meta.dir, '..');
  let from = flag >= 0 ? resolve(process.argv[flag + 1] ?? '') : '';
  if (from === '') {
    from = mkdtempSync(join(tmpdir(), 'zplc-mcp-stage-'));
    const built = Bun.spawnSync(['bun', join(ide, '../../scripts/release/binaries.ts'), '--targets', 'host', '--out', from], {
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (built.exitCode !== 0) process.exit(built.exitCode ?? 1);
  }
  console.log(`stage-mcp: ${stageMcp(from, join(ide, 'dist-native', 'mcp'))}`);
}
