import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createReleaseIntegrityBundle } from './release-artifacts.mjs';
import { requireAcceptedNotaryResponse, requireMacReleaseSigning } from '../packages/zplc-ide/scripts/mac-release-signing.mjs';

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
  assert.match(uploadRelease, /macOS x64 and ARM64: DMG and ZIP/);
  assert.match(uploadRelease, /Windows x64 and ARM64: Setup and Portable executables/);
  assert.match(uploadRelease, /Linux x64 and ARM64: AppImage, DEB, and RPM/);
  assert.match(uploadRelease, /`SHA256SUMS` and `release-evidence\.json`/);
  assert.doesNotMatch(uploadRelease, /ZPLC IDE-\*-/);
  assert.doesNotMatch(uploadRelease, /Truth-Scoped Release/);
  assert.doesNotMatch(uploadRelease, /Representative HIL proof/);
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

  const evidence = workflow.match(/^  prepare-release-evidence:\n([\s\S]*?)(?=^  \S|\Z)/m)?.[0] ?? '';
  assert.match(
    evidence,
    /^    needs: \[validate-version, verify-linux-x64-payload-reproducibility, build-macos, build-windows, build-linux\]$/m,
    'release evidence must wait for the Linux x64 payload reproducibility result',
  );
});

test('mac packaging stages required workspace manifests for the frozen lockfile', async () => {
  const script = await readFile(new URL('../packages/zplc-ide/scripts/package-mac-release.mjs', import.meta.url), 'utf8');
  for (const manifest of ['docs/package.json', 'packages/zplc-hil/package.json']) {
    assert.match(script, new RegExp(`\\{ path: '${manifest.replace('/', '\\/').replace('.', '\\.')}', directory: false \\}`));
  }
});

test('fails closed when any macOS signing credential is absent', () => {
  const complete = {
    ZPLC_MACOS_CSC_LINK: 'certificate',
    ZPLC_MACOS_CSC_KEY_PASSWORD: 'password',
    ZPLC_APPLE_API_KEY_P8: 'private-key',
    ZPLC_APPLE_API_KEY_ID: 'key-id',
    ZPLC_APPLE_API_ISSUER: 'issuer',
    ZPLC_APPLE_TEAM_ID: 'team-id',
  };
  assert.doesNotThrow(() => requireMacReleaseSigning(complete));
  for (const field of Object.keys(complete)) {
    const incomplete = { ...complete, [field]: '  ' };
    assert.throws(() => requireMacReleaseSigning(incomplete), new RegExp(field));
  }
});

test('accepts only bounded accepted macOS notarization responses', () => {
  assert.doesNotThrow(() => requireAcceptedNotaryResponse('{"status":"Accepted"}'));
  for (const response of ['{"status":"Invalid"}', '{}', 'not json', 'x'.repeat(64 * 1024 + 1)]) {
    assert.throws(() => requireAcceptedNotaryResponse(response), /not accepted/);
  }
});

test('publishing requires verified native signatures while previews remain isolated', async () => {
  const [workflow, builder, macScript] = await Promise.all([
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../packages/zplc-ide/electron-builder.yml', import.meta.url), 'utf8'),
    readFile(new URL('../packages/zplc-ide/scripts/package-mac-release.mjs', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(builder, /^\s*identity:\s*['"]-['"]\s*$/m, 'ad-hoc macOS signing is forbidden');
  assert.match(
    builder,
    /^win:\n(?:  [^\n]*\n)*?  signtoolOptions:\n    signingHashAlgorithms:\n      - sha256$/m,
    'Windows must configure SHA-256 under win.signtoolOptions',
  );
  assert.match(builder, /^win:\n(?:  [^\n]*\n)*?  signExts:\n    - \.exe$/m, 'Windows must explicitly sign executable extra resources');
  assert.doesNotMatch(
    builder,
    /^win:\n(?:  [^\n]*\n)*?  signingHashAlgorithms:/m,
    'signingHashAlgorithms is valid only under win.signtoolOptions',
  );
  assert.match(macScript, /requireMacReleaseSigning\(process\.env\)/);
  assert.match(macScript, /writeFileSync\(apiKeyPath, process\.env\.ZPLC_APPLE_API_KEY_P8, \{ mode: 0o600 \}\)/);
  assert.match(macScript, /builderEnv\.CSC_LINK = process\.env\.ZPLC_MACOS_CSC_LINK/);
  assert.match(macScript, /builderEnv\.APPLE_API_KEY = apiKeyPath/);
  assert.match(macScript, /'ZPLC_MACOS_CSC_LINK', 'ZPLC_MACOS_CSC_KEY_PASSWORD', 'ZPLC_APPLE_API_KEY_P8'/);
  assert.match(macScript, /\) delete builderEnv\[key\];/);
  assert.match(macScript, /-c\.forceCodeSigning=true/);
  assert.match(macScript, /-c\.mac\.notarize=false/);
  assert.match(macScript, /Expected exactly one staged macOS DMG/);
  assert.match(macScript, /submitNotaryDmg\(\[\n\s*'notarytool', 'submit', stagedDmg, '--key', apiKeyPath/);
  assert.match(macScript, /'--issuer', process\.env\.ZPLC_APPLE_API_ISSUER, '--wait', '--output-format', 'json'/);
  assert.match(macScript, /requireAcceptedNotaryResponse\(response\)/);
  assert.match(macScript, /'stapler', 'staple', stagedDmg/);
  assert.ok(
    macScript.indexOf("'stapler', 'staple', stagedDmg") < macScript.indexOf("if (process.env.ZPLC_MAC_COPY_APP_BUNDLE === '1')"),
    'DMG notarization and stapling must finish before artifacts are copied out of staging',
  );

  const mac = workflow;
  assert.match(mac, /environment: \$\{\{ needs\.validate-version\.outputs\.publishing == 'true' && 'release-signing' \|\| 'preview' \}\}/);
  assert.match(mac, /codesign --verify --deep --strict --verbose=2/);
  assert.match(mac, /Authority=Developer ID Application:/);
  assert.match(mac, /TeamIdentifier=\$ZPLC_APPLE_TEAM_ID/);
  assert.match(mac, /xcrun stapler validate "\$APP_PATH"/);
  assert.match(mac, /xcrun stapler validate "\$\{dmgs\[0\]\}"/);
  assert.match(mac, /spctl --assess --type execute/);
  assert.match(mac, /spctl --assess --type open/);

  const windows = workflow;
  assert.match(windows, /-c\.forceCodeSigning=true/);
  assert.match(windows, /Get-Command signtool\.exe/);
  assert.match(windows, /dist-electron\/win-unpacked\/zplc-ide\.exe/);
  assert.match(windows, /dist-electron\/win-unpacked\/resources\/native-runtime\/zplc_runtime\.exe/);
  assert.match(windows, /\$unpackedExecutables\.Count -ne 2/);
  assert.match(windows, /foreach \(\$artifact in @\(\$artifacts\) \+ \$unpackedExecutables\)/);
  assert.match(windows, /& \$signtool\.Source verify \/pa \/all \/tw \/v/);
  assert.match(windows, /Get-AuthenticodeSignature/);
  assert.match(windows, /\$signature\.Status -ne 'Valid'/);
  assert.match(windows, /\$null -eq \$signature\.TimeStamperCertificate/);
  assert.match(windows, /SignerCertificate\.Subject -ne \$env:ZPLC_WINDOWS_EXPECTED_PUBLISHER/);
  assert.ok(
    windows.indexOf('Verify Windows artifact signatures') < windows.indexOf('Upload Windows artifacts'),
    'Windows signature and timestamp verification must precede artifact upload',
  );

  const upload = workflow.match(/^  upload-release:\n[\s\S]*$/m)?.[0] ?? '';
  assert.match(upload, /environment: release-signing/);
  assert.match(upload, /needs\.validate-version\.outputs\.publishing == 'true'/);
  assert.match(upload, /name: release-bundle-publishable/);
  assert.doesNotMatch(upload, /release-bundle-preview/);
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
