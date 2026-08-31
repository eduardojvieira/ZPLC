import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSET_EXTENSIONS = ['.dmg', '.zip', '.exe', '.AppImage', '.deb', '.rpm', '.spdx.json'];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(message) { throw new Error(`Release integrity bundle: ${message}`); }
function compareName(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function validateIdentity({ version, tag, commitSha }) {
  if (typeof version !== 'string' || !SEMVER.test(version)) fail('version must be canonical semver');
  if (tag !== `v${version}`) fail('tag must exactly match v<version>');
  if (typeof commitSha !== 'string' || !COMMIT_SHA.test(commitSha)) fail('commitSha must be a lowercase 40-character hex SHA');
}

async function collectAssets(inputDir, relative = '') {
  const entries = await readdir(join(inputDir, relative), { withFileTypes: true });
  const assets = [];
  for (const entry of entries.sort((left, right) => compareName(left.name, right.name))) {
    const path = join(relative, entry.name);
    const absolutePath = join(inputDir, path);
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink()) fail(`symlink is not allowed: ${path}`);
    if (details.isDirectory()) {
      assets.push(...await collectAssets(inputDir, path));
      continue;
    }
    if (!details.isFile()) fail(`non-regular file is not allowed: ${path}`);
    const name = basename(path);
    if (CONTROL.test(name)) fail(`asset basename contains a control character: ${JSON.stringify(name)}`);
    if (!ASSET_EXTENSIONS.some((extension) => name.endsWith(extension))) fail(`unexpected asset extension: ${path}`);
    assets.push({ absolutePath, name });
  }
  return assets;
}

async function ensureEmptyOutput(outputDir) {
  try {
    const details = await lstat(outputDir);
    if (details.isSymbolicLink() || !details.isDirectory()) fail('outputDir must be a real directory');
    if ((await readdir(outputDir)).length !== 0) fail('outputDir must be empty');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await mkdir(outputDir, { recursive: true });
    else throw error;
  }
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const value = hash.digest('hex');
  if (!SHA256.test(value)) fail(`could not produce SHA-256 for ${path}`);
  return value;
}

export async function createReleaseIntegrityBundle({ inputDir, outputDir, version, tag, commitSha }) {
  if (typeof inputDir !== 'string' || typeof outputDir !== 'string') fail('inputDir and outputDir are required');
  validateIdentity({ version, tag, commitSha });
  const inputDetails = await lstat(inputDir).catch(() => fail('inputDir must be a real directory'));
  if (inputDetails.isSymbolicLink() || !inputDetails.isDirectory()) fail('inputDir must be a real directory');
  const assets = await collectAssets(inputDir);
  if (assets.length === 0) fail('inputDir contains no release assets');
  const names = new Set();
  for (const asset of assets) {
    const key = asset.name.toLowerCase();
    if (names.has(key)) fail(`duplicate asset basename: ${asset.name}`);
    names.add(key);
  }
  assets.sort((left, right) => compareName(left.name, right.name));
  await ensureEmptyOutput(outputDir);

  const artifacts = [];
  for (const asset of assets) {
    const copiedPath = join(outputDir, asset.name);
    await copyFile(asset.absolutePath, copiedPath);
    const copiedDetails = await stat(copiedPath);
    if (!copiedDetails.isFile()) fail(`copied asset is not regular: ${asset.name}`);
    artifacts.push({ name: asset.name, byteLength: copiedDetails.size, sha256: await sha256(copiedPath) });
  }
  const evidence = { schemaVersion: 1, version, tag, commitSha, artifacts };
  await writeFile(join(outputDir, 'SHA256SUMS'), artifacts.map(({ name, sha256: value }) => `${value}  ${name}`).join('\n') + '\n');
  await writeFile(join(outputDir, 'release-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--input-dir', '--output-dir', '--version', '--tag', '--commit-sha'].includes(flag) || value === undefined || values.has(flag)) fail('expected each explicit release bundle argument once');
    values.set(flag, value);
  }
  if (argv.length !== 10) fail('expected --input-dir --output-dir --version --tag --commit-sha');
  return {
    inputDir: values.get('--input-dir'), outputDir: values.get('--output-dir'), version: values.get('--version'), tag: values.get('--tag'), commitSha: values.get('--commit-sha'),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createReleaseIntegrityBundle(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
