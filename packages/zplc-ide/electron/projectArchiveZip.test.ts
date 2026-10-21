/**
 * The zip container of a project archive (IDE-022): a writer whose bytes depend only on the files, and a reader that
 * takes what other tools wrote and refuses what could write outside the folder it is extracted into.
 */
import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { readZip, writeZip, ZIP_LIMITS, ZipError, type ZipEntry, type ZipRefusal } from './projectArchiveZip';

const text = (value: string) => new TextEncoder().encode(value);
const file = (path: string, content: string): ZipEntry => ({ path, kind: 'file', bytes: text(content) });
const directory = (path: string): ZipEntry => ({ path, kind: 'directory', bytes: new Uint8Array(0) });
const refusal = (run: () => unknown): ZipRefusal | 'none' => {
  try {
    run();
    return 'none';
  } catch (error) {
    return error instanceof ZipError
      ? error.code
      : (() => {
          throw error;
        })();
  }
};

// A zip that Python's zipfile wrote: one deflated file, one stored file and one directory, 40-byte header names.
const FOREIGN = Buffer.from(
  'UEsDBBQAAAAIAIMYIlBEat7IKAAAACECAAALAAAAc3JjL01haW4uc3QLCPJ3D3L0VfBNzMzj0tBSSMvMyUktUtDSHOWM3DBw9XOJD4AkDC4AUEsDBBQAAAAAAIMYIlDuRqJAFA' +
    'AAABQAAAAJAAAAenBsYy5qc29ueyJzY2hlbWFWZXJzaW9uIjoyfQpQSwMEFAAAAAAAgxgiUAAAAAAAAAAAAAAAAAYAAABlbXB0eS9QSwECFAMUAAAACACDGCJQRGreyCgAAA' +
    'AhAgAACwAAAAAAAAAAAAAAgAEAAAAAc3JjL01haW4uc3RQSwECFAMUAAAAAACDGCJQ7kaiQBQAAAAUAAAACQAAAAAAAAAAAAAAgAFRAAAAenBsYy5qc29uUEsBAhQDFAAA' +
    'AAAAgxgiUAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAIABjAAAAGVtcHR5L1BLBQYAAAAAAwADAKQAAACwAAAAAAA=',
  'base64',
);

describe('writeZip (IDE-022)', () => {
  it('gives the same bytes for the same files, whatever the order they are given in', () => {
    const files = [file('src/b.st', 'B'), file('zplc.json', '{}\n'), directory('empty/'), file('src/a.st', 'A')];
    expect(writeZip([...files].reverse())).toEqual(writeZip(files));
  });

  it('stamps every entry with the fixed date 1980-01-01 and the file names as UTF-8', () => {
    const bytes = writeZip([file('ñ/温度.st', 'x')]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800); // the UTF-8 name flag
    expect(view.getUint16(10, true)).toBe(0); // modification time
    expect(view.getUint16(12, true)).toBe(0x21); // modification date: 1980-01-01
  });

  it('round-trips files, folders, empty files and non-ASCII names byte for byte', () => {
    const files = [
      file('zplc.json', '{"a":1}\n'),
      file('src/Motor.st', 'PROGRAM Motor\r\nEND_PROGRAM\r\n'),
      file('src/ñandú/温度.st', 'x'),
      file('empty.st', ''),
      directory('docs/'),
      { path: 'bin/data.bin', kind: 'file' as const, bytes: Uint8Array.from({ length: 300 }, (_, index) => index % 256) },
    ];
    const read = readZip(writeZip(files));
    expect(read.map((entry) => `${entry.kind}:${entry.path}`)).toEqual(
      [...files].sort((left, right) => (left.path < right.path ? -1 : 1)).map((entry) => `${entry.kind}:${entry.path}`),
    );
    for (const entry of files) expect(read.find((candidate) => candidate.path === entry.path)?.bytes).toEqual(entry.bytes);
  });

  it('writes an archive that other tools read: Python lists it, tests it and finds the same bytes', () => {
    const folder = mkdtempSync(join(tmpdir(), 'zplc-zip-'));
    try {
      const archive = join(folder, 'project.zip');
      writeFileSync(
        archive,
        writeZip([file('zplc.json', '{"x":1}\n'), file('src/Main.st', 'PROGRAM Main\nEND_PROGRAM\n'), directory('empty/')]),
      );
      const script =
        'import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint("|".join(sorted(i.filename + ":" + ' +
        'str(i.file_size) for i in z.infolist())))\nprint(z.read("zplc.json").decode(), end="")';
      const result = spawnSync('python3', ['-I', '-c', script, archive], { encoding: 'utf8' });
      if (result.error) return; // no python3 on this machine: the reader tests above and below carry the format
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('empty/:0|src/Main.st:25|zplc.json:8\n{"x":1}\n');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('readZip of an archive another tool wrote (IDE-022)', () => {
  it('reads deflated and stored entries and directories', () => {
    const entries = readZip(FOREIGN);
    expect(entries.map((entry) => `${entry.kind}:${entry.path}`)).toEqual(['directory:empty/', 'file:src/Main.st', 'file:zplc.json']);
    expect(new TextDecoder().decode(entries.find((entry) => entry.path === 'src/Main.st')!.bytes)).toBe(
      `PROGRAM Main\n${'(* filler *)\n'.repeat(40)}END_PROGRAM\n`,
    );
    expect(new TextDecoder().decode(entries.find((entry) => entry.path === 'zplc.json')!.bytes)).toBe('{"schemaVersion":2}\n');
  });

  it('skips the folder and the file a macOS archive adds, and nothing else', () => {
    const entries = readZip(
      writeZip([file('__MACOSX/._Main.st', 'junk'), file('.DS_Store', 'junk'), file('src/.DS_Store', 'junk'), file('src/Main.st', 'ok')]),
    );
    expect(entries.map((entry) => entry.path)).toEqual(['src/Main.st']);
  });
});

describe('readZip refusals (IDE-022)', () => {
  /** An archive with entries named as given, through the writer's own layout (names are not validated when writing). */
  const named = (...paths: string[]) => writeZip(paths.map((path) => file(path, 'x')));

  it.each([
    ['a parent segment', '../outside.st'],
    ['a nested parent segment', 'src/../../outside.st'],
    ['an absolute path', '/etc/cron.d/job'],
    ['a Windows drive', 'C:/Windows/job.st'],
    ['a backslash', 'src\\..\\outside.st'],
    ['an empty segment', 'src//Main.st'],
    ['a name Windows trims', 'src/Main.st.'],
    ['a stream colon', 'src/Main.st:evil'],
    ['a NUL', 'src/Main\0.st'],
  ])('refuses %s', (_label, path) => {
    expect(refusal(() => readZip(named(path)))).toBe('unsafe-path');
  });

  it('refuses a name written twice, and two names that differ only by case', () => {
    expect(refusal(() => readZip(named('src/Main.st', 'src/Main.st')))).toBe('duplicate');
    expect(refusal(() => readZip(named('src/Main.st', 'src/main.ST')))).toBe('duplicate');
  });

  it('refuses a file that is also a folder', () => {
    expect(refusal(() => readZip(writeZip([file('src', 'x'), file('src/Main.st', 'y')])))).toBe('duplicate');
  });

  it('refuses a file that is not a zip, and an archive cut short', () => {
    expect(refusal(() => readZip(text('this is not an archive')))).toBe('not-a-zip');
    expect(refusal(() => readZip(new Uint8Array(0)))).toBe('not-a-zip');
    expect(refusal(() => readZip(FOREIGN.subarray(0, 100)))).toBe('not-a-zip');
  });

  it('refuses an entry whose bytes do not match their checksum', () => {
    const bytes = writeZip([file('src/Main.st', 'PROGRAM Main')]);
    bytes[30 + 'src/Main.st'.length + 3] ^= 0xff; // a byte of the content
    expect(refusal(() => readZip(bytes))).toBe('corrupt');
  });

  it('refuses an encrypted entry, a symbolic link and a method other than stored or deflate', () => {
    const base = writeZip([file('src/Main.st', 'x')]);
    const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const centralAt = (bytes: Uint8Array) => {
      for (let at = 0; at < bytes.length - 4; at += 1) if (view(bytes).getUint32(at, true) === 0x02014b50) return at;
      throw new Error('no central header');
    };
    const encrypted = Uint8Array.from(base);
    view(encrypted).setUint16(centralAt(encrypted) + 8, 0x0801, true);
    expect(refusal(() => readZip(encrypted))).toBe('unsupported');
    const symlink = Uint8Array.from(base);
    view(symlink).setUint32(centralAt(symlink) + 38, (0o120777 << 16) >>> 0, true);
    expect(refusal(() => readZip(symlink))).toBe('unsupported');
    const bzip = Uint8Array.from(base);
    view(bzip).setUint16(centralAt(bzip) + 10, 12, true);
    expect(refusal(() => readZip(bzip))).toBe('unsupported');
  });

  it('refuses a deflated entry that declares less than it holds, and one over the size limit, without inflating it', () => {
    const entry = new TextEncoder().encode('A'.repeat(10_000));
    const archive = writeZip([{ path: 'big.st', kind: 'file', bytes: entry }]);
    expect(refusal(() => readZip(archive, { ...ZIP_LIMITS, maxFileBytes: 1_000 }))).toBe('too-large');
    // A deflate stream of 5 MB of zeros, declared as 10 bytes: the reader must stop at the declared size.
    const bomb = deflateRawSync(Buffer.alloc(5_000_000));
    const crafted = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(26), Buffer.from('a.st'), bomb]);
    crafted.writeUInt16LE(20, 4);
    crafted.writeUInt16LE(8, 8);
    crafted.writeUInt32LE(bomb.length, 18);
    crafted.writeUInt32LE(10, 22);
    crafted.writeUInt16LE(4, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(bomb.length, 20);
    central.writeUInt32LE(10, 24);
    central.writeUInt16LE(4, 28);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + 4, 12);
    end.writeUInt32LE(crafted.length, 16);
    expect(refusal(() => readZip(Buffer.concat([crafted, central, Buffer.from('a.st'), end])))).toBe('corrupt');
  });

  it('refuses more entries, and more bytes in all, than the limits', () => {
    const many = writeZip(Array.from({ length: 6 }, (_, index) => file(`f${index}.st`, 'x')));
    expect(refusal(() => readZip(many, { ...ZIP_LIMITS, maxEntries: 5 }))).toBe('too-many');
    const heavy = writeZip([file('a.st', 'x'.repeat(600)), file('b.st', 'x'.repeat(600))]);
    expect(refusal(() => readZip(heavy, { ...ZIP_LIMITS, maxTotalBytes: 1_000 }))).toBe('too-large');
  });
});
