/**
 * Proves, on a macOS runner, that a built bundle is ad-hoc signed and sealed and that the native runtime inside
 * it was signed with it (REL-001, REL-002). It needs `codesign`, so it runs only on a hosted macOS runner; the
 * parsing and the rules are covered by verify-mac-signature.test.ts on sample output.
 *
 *   bun run scripts/verify-mac-signature.ts <x64|arm64>     (run from packages/zplc-ide, after the build)
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CodesignDetails {
  signed: boolean;
  adHoc: boolean;
  /** The names inside `flags=0x..(adhoc,runtime)`. */
  flags: string[];
  sealed: boolean;
  format: string | undefined;
}

export type Exec = (args: string[]) => { status: number; output: string };

type Arch = 'x64' | 'arm64';
const MACH_O: Record<Arch, string> = { x64: 'x86_64', arm64: 'arm64' };
const NATIVE_RUNTIME = 'Contents/Resources/native-runtime/zplc_runtime';

export function parseCodesignDisplay(output: string): CodesignDetails {
  return {
    signed: !/code object is not signed at all/.test(output),
    adHoc: /^Signature=adhoc$/m.test(output),
    flags: /^CodeDirectory .*\bflags=0x[0-9a-f]+\(([^)]*)\)/m.exec(output)?.[1]?.split(',').filter(Boolean) ?? [],
    sealed: /^Sealed Resources version=\d+/m.test(output),
    format: /^Format=(.+)$/m.exec(output)?.[1],
  };
}

function display(codesign: Exec, path: string, label: string, problems: string[]): CodesignDetails | undefined {
  const { status, output } = codesign(['-dv', '--verbose=4', path]);
  const details = parseCodesignDisplay(output);
  if (!details.signed) problems.push(`${label}: not signed at all`);
  else if (status !== 0) problems.push(`${label}: codesign -dv failed: ${output.trim()}`);
  else return details;
  return undefined;
}

function verify(codesign: Exec, args: string[], path: string, label: string, problems: string[]): void {
  const { status, output } = codesign(['--verify', ...args, '--verbose=2', path]);
  if (status !== 0) problems.push(`${label}: codesign --verify ${args.join(' ')} failed: ${output.trim()}`);
}

/** Returns what is wrong with the bundle; an empty list means every REL-002 check passed. */
export function verifyMacBundle(app: string, arch: Arch, codesign: Exec = runCodesign): string[] {
  const problems: string[] = [];
  const runtime = join(app, NATIVE_RUNTIME);

  verify(codesign, ['--deep', '--strict'], app, 'bundle', problems);
  const bundle = display(codesign, app, 'bundle', problems);
  if (bundle) {
    if (!bundle.adHoc) problems.push('bundle: Signature=adhoc is missing');
    if (!bundle.sealed) problems.push('bundle: resources are not sealed');
    if (!bundle.flags.includes('runtime')) problems.push('bundle: the hardened runtime flag is missing');
    if (!bundle.format?.includes(`Mach-O thin (${MACH_O[arch]})`)) {
      problems.push(`bundle: expected a Mach-O thin (${MACH_O[arch]}) bundle, codesign reports "${bundle.format ?? 'unknown'}"`);
    }
  }

  verify(codesign, ['--strict'], runtime, 'native runtime', problems);
  const nested = display(codesign, runtime, 'native runtime', problems);
  if (nested) {
    if (!nested.adHoc) problems.push('native runtime: Signature=adhoc is missing');
    // arm64 linkers sign every binary they produce, so "signed" alone would also pass an unsigned-by-us runtime.
    if (nested.flags.includes('linker-signed')) {
      problems.push('native runtime: only the linker signature is present, the runtime was not signed with the bundle');
    }
  }
  return problems;
}

/** The one `.app` directly under `distDir` or under one of its per-architecture folders. */
export function findAppBundle(distDir: string): string {
  const found: string[] = [];
  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(distDir, entry.name);
    if (entry.name.endsWith('.app')) found.push(directory);
    else for (const child of readdirSync(directory, { withFileTypes: true })) if (child.isDirectory() && child.name.endsWith('.app')) found.push(join(directory, child.name));
  }
  if (found.length !== 1) throw new Error(`Expected exactly one .app bundle under ${distDir}, found ${found.length}`);
  return found[0]!;
}

function runCodesign(args: string[]): { status: number; output: string } {
  const result = spawnSync('codesign', args, { encoding: 'utf8' });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}` };
}

if (import.meta.main) {
  const arch = process.argv[2];
  if (arch !== 'x64' && arch !== 'arm64') {
    console.error(`Usage: verify-mac-signature.ts <x64|arm64>, got '${arch ?? ''}'`);
    process.exit(2);
  }
  const app = findAppBundle(join(process.cwd(), 'dist-electron'));
  const problems = verifyMacBundle(app, arch, (args) => {
    const result = runCodesign(args);
    if (args[0] === '-dv') console.log(`$ codesign ${args.join(' ')}\n${result.output}`);
    return result;
  });
  if (problems.length > 0) {
    console.error(`macOS bundle signature check failed for ${arch}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`macOS bundle signature check passed for ${arch}: ${app} is ad-hoc signed, sealed and hardened, and its native runtime is signed with it. Host evidence only; not notarization or Gatekeeper evidence.`);
}
