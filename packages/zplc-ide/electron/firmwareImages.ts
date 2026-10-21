/**
 * Reads the firmware images that an installation carries (REL-025): the manifest of the release and the files that the
 * installer put beside it. Read-only: it lists, hashes and answers. It never writes, never opens a port and never runs
 * anything, and the renderer sends it no path (the folder is the resources folder of this installation).
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  FIRMWARE_MANIFEST_SCHEMA,
  parseFirmwareImage,
  type FirmwareBundled,
  type FirmwareImage,
  type FirmwareImagesResult,
} from './firmwareImagesProtocol.js';

const MANIFEST = /^zplc-runtime-[0-9A-Za-z.-]{1,96}\.manifest\.json$/;
/** The manifest of a release is a few kilobytes; anything larger is not one. */
const MANIFEST_MAX_BYTES = 256 * 1024;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMMIT = /^[0-9a-f]{40}$/;

async function bundledState(folder: string, image: Omit<FirmwareImage, 'bundled'>): Promise<FirmwareBundled> {
  const path = join(folder, image.file);
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink()) return 'changed';
    if (status.size !== image.bytes) return 'changed';
    return createHash('sha256')
      .update(await readFile(path))
      .digest('hex') === image.sha256
      ? 'verified'
      : 'changed';
  } catch {
    return 'missing';
  }
}

export async function loadFirmwareImages(folder: string): Promise<FirmwareImagesResult> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return { status: 'absent' };
  }
  const manifests = names.filter((name) => MANIFEST.test(name));
  if (manifests.length !== 1) return manifests.length === 0 && names.length === 0 ? { status: 'absent' } : { status: 'invalid' };
  try {
    const path = join(folder, manifests[0]!);
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > MANIFEST_MAX_BYTES) return { status: 'invalid' };
    const manifest = JSON.parse(await readFile(path, 'utf8')) as {
      schema?: unknown;
      version?: unknown;
      commit?: unknown;
      images?: unknown;
    };
    if (manifest.schema !== FIRMWARE_MANIFEST_SCHEMA || typeof manifest.version !== 'string' || !VERSION.test(manifest.version))
      return { status: 'invalid' };
    if (
      typeof manifest.commit !== 'string' ||
      !COMMIT.test(manifest.commit) ||
      !Array.isArray(manifest.images) ||
      manifest.images.length === 0 ||
      manifest.images.length > 64
    )
      return { status: 'invalid' };
    if (manifests[0] !== `zplc-runtime-${manifest.version}.manifest.json`) return { status: 'invalid' };
    const images: FirmwareImage[] = [];
    for (const entry of manifest.images) {
      const shape = parseFirmwareImage(entry, 'missing');
      if (!shape) return { status: 'invalid' };
      if (!shape.file.startsWith(`zplc-runtime-${manifest.version}-`)) return { status: 'invalid' };
      images.push({ ...shape, bundled: await bundledState(folder, shape) });
    }
    return { status: 'available', version: manifest.version, commit: manifest.commit, folder, images };
  } catch {
    return { status: 'invalid' };
  }
}
