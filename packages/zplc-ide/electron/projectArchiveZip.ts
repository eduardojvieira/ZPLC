/**
 * The zip container of a project archive (IDE-022), written and read with `node:zlib` and nothing else.
 *
 * What the writer produces is a function of the files alone: entries sorted by path, every entry stored (not deflated:
 * a PLC project is a few kilobytes, and the compressed bytes of a deflate stream depend on the zlib version), the
 * modification time fixed at 1980-01-01 00:00:00, UTF-8 names, no extra fields and no comment. Two machines that
 * export the same project give the same bytes.
 *
 * What the reader accepts is what other tools write: stored and deflated entries, directory entries, a data
 * descriptor. It refuses, with a typed code, everything that could write outside the folder the archive is extracted
 * into or exhaust the machine: a path that is absolute, has a `..` segment, a backslash, a drive or a name Windows
 * trims; a symbolic link; an encrypted entry; two entries that collide (case-insensitively, since the project may
 * move to a case-insensitive disk); more entries or bytes than the limits; and a checksum or size that does not
 * match. Sizes are taken from the central directory and a deflate stream is inflated no further than its declared
 * size, so a small archive cannot expand without bound.
 *
 * ponytail: no zip64, no multi-disk and no encryption. A project that needs more than 4 GiB or 65,535 files is not a
 * PLC project; the limits below are far inside that.
 */
import { inflateRawSync } from 'node:zlib';

export type ZipRefusal = 'not-a-zip' | 'unsupported' | 'unsafe-path' | 'duplicate' | 'too-large' | 'too-many' | 'corrupt';

export class ZipError extends Error {
  readonly code: ZipRefusal;
  constructor(code: ZipRefusal) {
    super(code);
    this.code = code;
  }
}

/** A file, or a folder (its path ends in "/"); paths are relative and separated by "/". */
export interface ZipEntry {
  path: string;
  kind: 'file' | 'directory';
  bytes: Uint8Array;
}

export const ZIP_LIMITS = {
  maxEntries: 4096,
  /** The largest file the project operations read or write (PROJECT_FILES_LIMITS.maxFileBytes). */
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
} as const;
export type ZipLimits = { readonly [Key in keyof typeof ZIP_LIMITS]: number };

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const DOS_DATE_1980_01_01 = 0x21;
const UTF8_NAME = 0x0800;
const UNIX_FILE = (0o100644 << 16) >>> 0;
const UNIX_DIRECTORY = ((0o040755 << 16) | 0x10) >>> 0;
const MAX_PATH_CHARS = 1024;
const MAX_SEGMENT_CHARS = 255;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

/** The archive of these entries, in path order. Paths are written as given; the reader is where they are judged. */
export function writeZip(entries: readonly ZipEntry[], limits: ZipLimits = ZIP_LIMITS): Uint8Array {
  if (entries.length > limits.maxEntries) throw new ZipError('too-many');
  const named = entries
    .map((entry) => {
      const path = entry.kind === 'directory' && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path;
      return { entry, name: encoder.encode(path) };
    })
    .sort((left, right) => Buffer.compare(left.name, right.name));

  let total = 22;
  for (const { entry, name } of named) {
    if (name.length > 0xffff || entry.bytes.length > limits.maxFileBytes) throw new ZipError('too-large');
    total += 30 + name.length + entry.bytes.length + 46 + name.length;
  }
  if (total > limits.maxTotalBytes) throw new ZipError('too-large');

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  const central: Array<{ name: Uint8Array; crc: number; size: number; offset: number; directory: boolean }> = [];
  for (const { entry, name } of named) {
    const directory = entry.kind === 'directory';
    const bytes = directory ? new Uint8Array(0) : entry.bytes;
    const crc = directory ? 0 : crc32(bytes);
    central.push({ name, crc, size: bytes.length, offset: at, directory });
    view.setUint32(at, LOCAL, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, UTF8_NAME, true);
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, DOS_DATE_1980_01_01, true);
    view.setUint32(at + 14, crc, true);
    view.setUint32(at + 18, bytes.length, true);
    view.setUint32(at + 22, bytes.length, true);
    view.setUint16(at + 26, name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(name, at + 30);
    out.set(bytes, at + 30 + name.length);
    at += 30 + name.length + bytes.length;
  }
  const directoryOffset = at;
  for (const { name, crc, size, offset, directory } of central) {
    view.setUint32(at, CENTRAL, true);
    view.setUint16(at + 4, (3 << 8) | 20, true); // made by Unix, version 2.0
    view.setUint16(at + 6, 20, true);
    view.setUint16(at + 8, UTF8_NAME, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, 0, true);
    view.setUint16(at + 14, DOS_DATE_1980_01_01, true);
    view.setUint32(at + 16, crc, true);
    view.setUint32(at + 20, size, true);
    view.setUint32(at + 24, size, true);
    view.setUint16(at + 28, name.length, true);
    view.setUint32(at + 38, directory ? UNIX_DIRECTORY : UNIX_FILE, true);
    view.setUint32(at + 42, offset, true);
    out.set(name, at + 46);
    at += 46 + name.length;
  }
  view.setUint32(at, END, true);
  view.setUint16(at + 8, central.length, true);
  view.setUint16(at + 10, central.length, true);
  view.setUint32(at + 12, at - directoryOffset, true);
  view.setUint32(at + 16, directoryOffset, true);
  return out;
}

function unsafeName(name: string, directory: boolean): boolean {
  const path = directory ? name.slice(0, -1) : name;
  if (path === '' || path.length > MAX_PATH_CHARS || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\')) return true;
  return path
    .split('/')
    .some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        segment.length > MAX_SEGMENT_CHARS ||
        segment.includes(':') ||
        [...segment].some((char) => char.charCodeAt(0) < 0x20) ||
        /[. ]$/.test(segment),
    );
}

/** Folders and files that macOS adds to an archive of a folder and that are not part of the project. */
const isArchiveJunk = (path: string): boolean => path.startsWith('__MACOSX/') || path.split('/').at(-1) === '.DS_Store';

/** The entries of the archive, in path order, or a `ZipError` that says why it is refused. */
export function readZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at -= 1) {
    if (view.getUint32(at, true) === END) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new ZipError('not-a-zip');
  const diskNumber = view.getUint16(end + 4, true);
  const directoryDisk = view.getUint16(end + 6, true);
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (diskNumber !== 0 || directoryDisk !== 0 || count === 0xffff || directoryOffset === 0xffffffff) throw new ZipError('unsupported');
  if (count > limits.maxEntries) throw new ZipError('too-many');
  if (directoryOffset + directorySize > end) throw new ZipError('not-a-zip');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const found: ZipEntry[] = [];
  const claimed = new Map<string, 'file' | 'directory'>();
  let total = 0;
  let at = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > end || view.getUint32(at, true) !== CENTRAL) throw new ZipError('corrupt');
    const madeBy = view.getUint16(at + 4, true);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const attributes = view.getUint32(at + 38, true);
    const localOffset = view.getUint32(at + 42, true);
    if (at + 46 + nameLength + extraLength + commentLength > end) throw new ZipError('corrupt');
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    } catch {
      throw new ZipError('unsafe-path');
    }
    at += 46 + nameLength + extraLength + commentLength;

    const directory = name.endsWith('/');
    if (unsafeName(name, directory)) throw new ZipError('unsafe-path');
    if (isArchiveJunk(name)) continue;
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) throw new ZipError('unsupported');
    if (method !== 0 && method !== 8) throw new ZipError('unsupported');
    const unixType = madeBy >> 8 === 3 ? (attributes >>> 16) & 0o170000 : 0;
    if (unixType !== 0 && unixType !== 0o100000 && unixType !== 0o040000) throw new ZipError('unsupported');
    if (size > limits.maxFileBytes) throw new ZipError('too-large');
    total += size;
    if (total > limits.maxTotalBytes) throw new ZipError('too-large');
    if (directory && size !== 0) throw new ZipError('corrupt');

    const path = directory ? name.slice(0, -1) : name;
    const key = path.toLowerCase();
    if (claimed.has(key)) throw new ZipError('duplicate');
    claimed.set(key, directory ? 'directory' : 'file');

    let content = new Uint8Array(0);
    if (!directory) {
      if (localOffset + 30 > directoryOffset || view.getUint32(localOffset, true) !== LOCAL) throw new ZipError('corrupt');
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      if (start + compressed > directoryOffset) throw new ZipError('corrupt');
      const stored = bytes.subarray(start, start + compressed);
      if (method === 0) {
        if (compressed !== size) throw new ZipError('corrupt');
        content = Uint8Array.from(stored);
      } else {
        try {
          content = new Uint8Array(inflateRawSync(stored, { maxOutputLength: Math.max(1, size) }));
        } catch {
          throw new ZipError('corrupt');
        }
      }
      if (content.length !== size || crc32(content) !== crc) throw new ZipError('corrupt');
    }
    found.push({ path: directory ? `${path}/` : path, kind: directory ? 'directory' : 'file', bytes: content });
  }

  // A file cannot also be a folder: no entry may sit under the path of a file.
  for (const key of claimed.keys()) {
    const parts = key.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) {
      if (claimed.get(parts.slice(0, depth).join('/')) === 'file') throw new ZipError('duplicate');
    }
  }
  return found.sort((left, right) => Buffer.compare(encoder.encode(left.path), encoder.encode(right.path)));
}
