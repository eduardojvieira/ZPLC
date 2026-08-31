import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createReleaseIntegrityBundle } from './release-artifacts.mjs';

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

test('pins every upload-release action to an exact commit SHA', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const uploadRelease = workflow.match(/^  upload-release:\n[\s\S]*$/m)?.[0];
  assert.ok(uploadRelease, 'upload-release job is missing');
  const actions = [...uploadRelease.matchAll(/^\s+uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
  assert.deepEqual(actions.map((action) => action?.split('@')[0]).sort(), [
    'actions/download-artifact',
    'softprops/action-gh-release',
  ]);
  for (const action of actions) assert.match(action ?? '', /^[^@\s]+@[a-f0-9]{40}$/);
});

test('keeps the release body version-generic and evidence-scoped', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const uploadRelease = workflow.match(/^  upload-release:\n[\s\S]*$/m)?.[0];
  assert.ok(uploadRelease, 'upload-release job is missing');
  assert.match(uploadRelease, /name: "ZPLC v\$\{\{ needs\.validate-version\.outputs\.version \}\}"/);
  assert.match(uploadRelease, /prerelease: \$\{\{ contains\(needs\.validate-version\.outputs\.version, '-'\) \}\}/);
  assert.match(uploadRelease, /catalog\/evidence baseline, not 2\.0 HIL qualification/);
  assert.match(uploadRelease, /do not establish HIL, board qualification, timing, safety certification, or human release sign-off/);
  assert.doesNotMatch(uploadRelease, /Truth-Scoped Release/);
  assert.doesNotMatch(uploadRelease, /Representative HIL proof/);
});

test('mac packaging stages required workspace manifests for the frozen lockfile', async () => {
  const script = await readFile(new URL('../packages/zplc-ide/scripts/package-mac-release.mjs', import.meta.url), 'utf8');
  for (const manifest of ['docs/package.json', 'packages/zplc-hil/package.json']) {
    assert.match(script, new RegExp(`\\{ path: '${manifest.replace('/', '\\/').replace('.', '\\.')}', directory: false \\}`));
  }
});
