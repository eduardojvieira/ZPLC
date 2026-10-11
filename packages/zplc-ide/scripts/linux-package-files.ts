// What the Linux packages hold (REL-013), read from the files electron-builder made and not from its configuration:
//
//   bun run scripts/linux-package-files.ts [<folder with the .deb and the .rpm>]
//
// The udev rule that lets the logged-in user open the serial port of a board must be in each package, at the vendor
// rules folder, with the bytes that scripts/release/udev-rules.ts generates from tools/hil/usb-ids.json. A .deb is read
// with ar and tar, an .rpm with rpm2cpio and cpio: the tools that the Linux runners and every distribution have.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RULE_TARGET, readUsbIds, renderUdevRules, type BoardEntry } from '../../../scripts/release/udev-rules';

const run = (command: string[], cwd?: string): { ok: boolean; stdout: Buffer; stderr: string } => {
  const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe', ...(cwd === undefined ? {} : { cwd }) });
  return { ok: result.exitCode === 0, stdout: Buffer.from(result.stdout), stderr: result.stderr.toString() };
};

/** The bytes of one file of a package, or null when the package does not hold it. `path` is absolute, as installed. */
export function fileOfPackage(packagePath: string, path: string): Buffer | null {
  if (packagePath.endsWith('.rpm')) {
    const work = mkdtempSync(join(tmpdir(), 'zplc-rpm-'));
    try {
      const cpio = run(['rpm2cpio', packagePath]);
      if (!cpio.ok) throw new Error(`rpm2cpio failed for ${packagePath}: ${cpio.stderr.trim()}`);
      const archive = join(work, 'payload.cpio');
      writeFileSync(archive, cpio.stdout);
      const extracted = run(['cpio', '--quiet', '-i', '--to-stdout', `.${path}`, '-F', archive]);
      return extracted.ok && extracted.stdout.length > 0 ? extracted.stdout : null;
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  if (packagePath.endsWith('.deb')) {
    const work = mkdtempSync(join(tmpdir(), 'zplc-deb-'));
    try {
      const unpacked = run(['ar', 'x', resolve(packagePath)], work);
      if (!unpacked.ok) throw new Error(`ar failed for ${packagePath}: ${unpacked.stderr.trim()}`);
      const data = readdirSync(work).find((name) => /^data\.tar(?:\.[a-z0-9]+)?$/.test(name));
      if (data === undefined) throw new Error(`${packagePath} holds no data archive`);
      for (const member of [`.${path}`, path.slice(1)]) {
        const extracted = run(['tar', '-xOf', join(work, data), member]);
        if (extracted.ok && extracted.stdout.length > 0) return extracted.stdout;
      }
      return null;
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  throw new Error(`${packagePath} is neither a .deb nor an .rpm`);
}

/** What is wrong with a package: the rule is missing, or it is not the one the identifier files generate. */
export function udevRuleProblems(packagePath: string, expected: string): string[] {
  const held = fileOfPackage(packagePath, RULE_TARGET);
  if (held === null) return [`${packagePath} does not hold ${RULE_TARGET}`];
  return held.toString('utf8') === expected ? [] : [`${packagePath} holds ${RULE_TARGET}, but not the rule that scripts/release/udev-rules.ts generates from tools/hil/usb-ids.json`];
}

function main(argv: string[]): number {
  const root = resolve(import.meta.dir, '..', '..', '..');
  const folder = resolve(argv[0] ?? join(import.meta.dir, '..', 'dist-electron'));
  const packages = readdirSync(folder).filter((name) => /\.(?:deb|rpm)$/.test(name)).sort();
  if (packages.length === 0) {
    console.error(`Linux package check: no .deb or .rpm in ${folder}`);
    return 1;
  }
  const boards = JSON.parse(readFileSync(join(root, 'firmware/app/boards/boards.json'), 'utf8')) as BoardEntry[];
  const expected = renderUdevRules(readUsbIds(join(root, 'tools/hil/usb-ids.json')), boards);
  let failed = 0;
  for (const name of packages) {
    const problems = udevRuleProblems(join(folder, name), expected);
    for (const problem of problems) console.error(`Linux package check: ${problem}`);
    failed += problems.length;
  }
  if (failed === 0) console.log(`Linux package check passed: ${packages.join(', ')} hold ${RULE_TARGET}, as generated.`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = main(Bun.argv.slice(2));
