import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createReleaseIntegrityBundle, mergeChecksums } from './release-artifacts.mjs';

const identity = { version: '2.0.0-rc.1', tag: 'v2.0.0-rc.1', commitSha: 'a'.repeat(40) };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(prefix = 'zplc-release-artifacts-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const input = join(root, 'input');
  const output = join(root, 'output');
  await mkdir(input);
  return { root, input, output };
}

async function writeAsset(root, path, bytes) {
  const target = join(root, path);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, bytes);
}

test('creates a deterministic flat bundle with checksums, identity evidence, and byte-identical copies', async () => {
  const { input, output } = await fixture();
  const assets = new Map([
    ['nested/ZPLC-win-x64-Setup.exe', Buffer.from('windows')],
    ['ZPLC-linux-x64.AppImage', Buffer.from('linux')],
    ['ZPLC-mac-arm64.dmg', Buffer.from('macos')],
    ['ZPLC-2.0.0-rc.1.spdx.json', Buffer.from('{"spdxVersion":"SPDX-2.3"}\n')],
  ]);
  for (const [path, bytes] of assets) await writeAsset(input, path, bytes);

  const result = await createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity });

  assert.deepEqual(result, {
    schemaVersion: 1,
    version: identity.version,
    tag: identity.tag,
    commitSha: identity.commitSha,
    artifacts: [
      { name: 'ZPLC-2.0.0-rc.1.spdx.json', byteLength: 27, sha256: digest(Buffer.from('{"spdxVersion":"SPDX-2.3"}\n')) },
      { name: 'ZPLC-linux-x64.AppImage', byteLength: 5, sha256: digest(Buffer.from('linux')) },
      { name: 'ZPLC-mac-arm64.dmg', byteLength: 5, sha256: digest(Buffer.from('macos')) },
      { name: 'ZPLC-win-x64-Setup.exe', byteLength: 7, sha256: digest(Buffer.from('windows')) },
    ],
  });
  for (const [path, bytes] of assets) assert.deepEqual(await readFile(join(output, path.split('/').at(-1))), bytes);
  assert.equal(await readFile(join(output, 'SHA256SUMS'), 'utf8'), result.artifacts.map(({ name, sha256 }) => `${sha256}  ${name}`).join('\n') + '\n');
  assert.equal(await readFile(join(output, 'release-evidence.json'), 'utf8'), `${JSON.stringify(result, null, 2)}\n`);
});

test('changes only the affected artifact hash when same-length bytes change', async () => {
  const { input, output, root } = await fixture();
  await writeAsset(input, 'ZPLC-linux-x64.AppImage', Buffer.from('first'));
  await writeAsset(input, 'ZPLC-win-x64-Setup.exe', Buffer.from('other'));
  const first = await createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity });
  const firstSums = await readFile(join(output, 'SHA256SUMS'), 'utf8');
  const firstEvidence = await readFile(join(output, 'release-evidence.json'), 'utf8');
  await writeFile(join(input, 'ZPLC-linux-x64.AppImage'), 'later');
  const secondOutput = join(root, 'output-2');
  const second = await createReleaseIntegrityBundle({ inputDir: input, outputDir: secondOutput, ...identity });
  assert.notEqual(second.artifacts[0].sha256, first.artifacts[0].sha256);
  assert.deepEqual(second.artifacts[1], first.artifacts[1]);
  const secondSums = await readFile(join(secondOutput, 'SHA256SUMS'), 'utf8');
  assert.notEqual(secondSums, firstSums);
  assert.equal(secondSums.split('\n')[1], firstSums.split('\n')[1]);
  assert.notEqual(await readFile(join(secondOutput, 'release-evidence.json'), 'utf8'), firstEvidence);
});

test('fails closed without a partial bundle for invalid inputs and output state', async () => {
  const cases = [
    async (input) => {},
    async (input) => writeAsset(input, 'unexpected.txt', 'no'),
    async (input) => writeAsset(input, 'release-evidence.json', '{}'),
    async (input) => { await writeAsset(input, 'a/ZPLC.zip', 'one'); await writeAsset(input, 'b/ZPLC.zip', 'two'); },
    async (input) => { await writeAsset(input, 'a/ZPLC.zip', 'one'); await writeAsset(input, 'b/zplc.zip', 'two'); },
    async (input) => { await writeAsset(input, 'ZPLC.zip', 'one'); await symlink(join(input, 'ZPLC.zip'), join(input, 'linked.zip')); },
  ];
  for (const setup of cases) {
    const { input, output } = await fixture();
    await setup(input);
    await assert.rejects(() => createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity }));
    assert.equal(existsSync(output), false);
  }
  const { input, output } = await fixture();
  await writeAsset(input, 'ZPLC.zip', 'one');
  await mkdir(output);
  await writeFile(join(output, 'stale'), 'stale');
  await assert.rejects(() => createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity }));
  assert.deepEqual(await readFile(join(output, 'stale')), Buffer.from('stale'));
});

test('rejects invalid release identity before creating output', async () => {
  for (const patch of [{ version: '2.0' }, { tag: 'v2.0.0' }, { commitSha: 'A'.repeat(40) }]) {
    const { input, output } = await fixture();
    await writeAsset(input, 'ZPLC.zip', 'one');
    await assert.rejects(() => createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity, ...patch }));
    assert.equal(existsSync(output), false);
  }
});

test('CLI writes the same fail-closed bundle from explicit arguments', async () => {
  const { input, output } = await fixture();
  await writeAsset(input, 'ZPLC.zip', 'fixture');
  const run = spawnSync(process.execPath, ['scripts/release-artifacts.mjs', '--input-dir', input, '--output-dir', output, '--version', identity.version, '--tag', identity.tag, '--commit-sha', identity.commitSha], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'release-evidence.json'), 'utf8')), {
    schemaVersion: 1,
    ...identity,
    artifacts: [{ name: 'ZPLC.zip', byteLength: 7, sha256: digest(Buffer.from('fixture')) }],
  });
});

test('covers the standalone CLI and MCP executables, the bill of materials and the firmware images (REL-017)', async () => {
  const { input, output } = await fixture();
  const names = [
    'zplc-cli-2.0.0-rc.4-linux-x64',
    'zplc-mcp-2.0.0-rc.4-win-arm64.exe',
    'zplc-cli-2.0.0-rc.4-mac-arm64',
    'ZPLC-2.0.0-rc.4.cdx.json',
    'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2',
    'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin',
    'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.elf',
  ];
  for (const name of names) await writeAsset(input, name, name);
  const result = await createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity });
  assert.deepEqual(result.artifacts.map((artifact) => artifact.name).sort(), [...names].sort());
  const sums = await readFile(join(output, 'SHA256SUMS'), 'utf8');
  for (const name of names) assert.match(sums, new RegExp(`^[a-f0-9]{64}  ${name.replaceAll('.', '\\.')}$`, 'm'));
});

test('refuses an executable name that does not follow the scheme, so nothing unnamed is checksummed (REL-017)', async () => {
  for (const name of ['zplc-cli', 'zplc-cli-latest-linux-x64', 'zplc-tool-2.0.0-linux-x64', 'zplc-cli-2.0.0-rc.4-linux-ppc64']) {
    const { input, output } = await fixture();
    await writeAsset(input, name, 'x');
    await assert.rejects(() => createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity }), /unexpected asset extension/, name);
  }
});

const line = (character, name) => `${character.repeat(64)}  ${name}`;

test('merges the checksum files of the platforms into one SHA256SUMS, sorted, and refuses a name with two hashes (REL-017)', () => {
  const merged = mergeChecksums([
    `${line('b', 'zplc-cli-2.0.0-rc.4-mac-x64')}\n${line('a', 'ZPLC-mac.dmg')}\n`,
    `${line('c', 'ZPLC-linux.AppImage')}\n${line('a', 'ZPLC-mac.dmg')}\n`,
  ]);
  assert.equal(merged, `${line('c', 'ZPLC-linux.AppImage')}\n${line('a', 'ZPLC-mac.dmg')}\n${line('b', 'zplc-cli-2.0.0-rc.4-mac-x64')}\n`);
  assert.throws(() => mergeChecksums([`${line('a', 'x.zip')}\n`, `${line('b', 'x.zip')}\n`]), /x\.zip.*two different/);
  assert.throws(() => mergeChecksums(['not a checksum line\n']), /malformed/);
  assert.throws(() => mergeChecksums([]), /no checksum/);
});

test('the command line merges checksum files into one output file (REL-017)', async () => {
  const { root } = await fixture();
  const first = join(root, 'SHA256SUMS-linux');
  const second = join(root, 'SHA256SUMS-macos');
  const output = join(root, 'SHA256SUMS');
  await writeFile(first, `${line('a', 'linux.deb')}\n`);
  await writeFile(second, `${line('b', 'mac.dmg')}\n`);
  const run = spawnSync(process.execPath, ['scripts/release-artifacts.mjs', '--merge', output, first, second], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(await readFile(output, 'utf8'), `${line('a', 'linux.deb')}\n${line('b', 'mac.dmg')}\n`);
});

test('pins every action of the per-platform upload jobs to an exact commit SHA', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  for (const platform of ['macos', 'windows', 'linux']) {
    const job = workflow.match(new RegExp(`^  upload-release-${platform}:\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))`, 'm'))?.[0];
    assert.ok(job, `upload-release-${platform} job is missing`);
    const actions = [...job.matchAll(/^\s+uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
    assert.deepEqual(actions.map((action) => action?.split('@')[0]), ['actions/download-artifact']);
    for (const action of actions) assert.match(action ?? '', /^[^@\s]+@[a-f0-9]{40}$/);
  }
});

test('gates every release build on the reusable full CI for the release SHA', async () => {
  const [ci, release] = await Promise.all([
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(ci, /^  workflow_call:\s*$/m, 'CI must be callable by the release workflow');
  assert.match(
    release,
    /^  verify-release-candidate:\n    needs: validate-version\n    uses: \.\/\.github\/workflows\/ci\.yml$/m,
    'release must call the existing full CI as a reusable workflow',
  );

  for (const jobName of ['build-macos', 'build-windows', 'build-linux']) {
    const job = release.match(new RegExp(`^  ${jobName}:\\n([\\s\\S]*?)(?=^  \\S|\\Z)`, 'm'))?.[0] ?? '';
    assert.match(
      job,
      /^    needs: \[validate-version, verify-release-candidate\]$/m,
      `${jobName} must wait for the full CI result`,
    );
  }
});

test('gates release evidence on two clean Linux x64 payload builds of the exact SHA', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const job = workflow.match(/^  verify-linux-x64-payload-reproducibility:\n([\s\S]*?)(?=^  \S|\Z)/m)?.[0] ?? '';
  assert.ok(job, 'Linux payload reproducibility job is missing');
  assert.match(job, /^    needs: \[validate-version, verify-release-candidate\]$/m);
  assert.match(job, /git worktree add --detach .*\$\{\{ github\.sha \}\}/);
  assert.match(job, /SOURCE_DATE_EPOCH=.*git show -s --format=%ct/);
  assert.match(job, /verify-reproducible-linux-payload\.ts/);
  assert.match(job, /Linux x64 packaged payload reproducibility/);

  const evidence = workflow.match(/^  prepare-release-evidence-linux:\n([\s\S]*?)(?=^  \S|\Z)/m)?.[0] ?? '';
  assert.match(
    evidence,
    /^    needs: \[validate-version, verify-linux-x64-payload-reproducibility, build-linux\]$/m,
    'the Linux release evidence must wait for the Linux x64 payload reproducibility result',
  );
});

test('mac packaging stages required workspace manifests for the frozen lockfile', async () => {
  const script = await readFile(new URL('../packages/zplc-ide/scripts/package-mac-release.mjs', import.meta.url), 'utf8');
  for (const manifest of ['docs/package.json', 'packages/zplc-hil/package.json']) {
    assert.match(script, new RegExp(`\\{ path: '${manifest.replace('/', '\\/').replace('.', '\\.')}', directory: false \\}`));
  }
});

test('contains no paid credential, Developer ID, notarization or Windows certificate path (REL-003)', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [workflow, macScript] = await Promise.all([
    read('.github/workflows/release.yml'),
    read('packages/zplc-ide/scripts/package-mac-release.mjs'),
  ]);
  // Saying "not notarized" is a statement of fact; any other mention of notarization would be a step or an assertion.
  const paidPath = /notarytool|(?<!not )notariz|stapl|spctl|Developer ID|CSC_|APPLE_|ZPLC_MACOS|ZPLC_WINDOWS|ZPLC_PUBLISHING|signtool|Authenticode|forceCodeSigning=true|release-signing|\.p8\b|\.p12\b|\.pfx\b/i;

  assert.equal(existsSync(new URL('../packages/zplc-ide/scripts/mac-release-signing.mjs', import.meta.url)), false, 'the credential helpers must be deleted');
  assert.doesNotMatch(macScript, paidPath);
  assert.doesNotMatch(macScript, /mac-release-signing/);
  assert.doesNotMatch(macScript, /hardenedRuntime=false|forceCodeSigning/, 'electron-builder.yml owns the macOS signing settings');
  assert.match(macScript, /'x', 'electron-builder', '--mac', `--\$\{arch\}`, '--publish', 'never'/);
  assert.doesNotMatch(workflow, paidPath);
  assert.doesNotMatch(workflow, /\$\{\{\s*(?:secrets\.(?!GITHUB_TOKEN\b)|vars\.)/, 'the workflow may read no secret but the job token');
});

test('keeps Linux desktop identity and icon metadata aligned with the executable', async () => {
  const [packageJson, builder, icon] = await Promise.all([
    readFile(new URL('../packages/zplc-ide/package.json', import.meta.url), 'utf8'),
    readFile(new URL('../packages/zplc-ide/electron-builder.yml', import.meta.url), 'utf8'),
    readFile(new URL('../packages/zplc-ide/public/icon.png', import.meta.url)),
  ]);
  assert.equal(JSON.parse(packageJson).desktopName, 'zplc-ide');
  assert.match(builder, /^linux:\n(?:  [^\n]*\n)*?  syncDesktopName: true$/m);
  assert.deepEqual(icon.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
});
