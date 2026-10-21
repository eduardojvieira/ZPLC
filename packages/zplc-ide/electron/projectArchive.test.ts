/**
 * Exporting a project to one archive and importing it back (IDE-022), on real folders: the archive is the project's
 * files and nothing else, an import rebuilds an equal folder byte for byte, and a refused archive writes nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { createProjectArchive } from './projectArchive';
import { PROJECT_ARCHIVE_CHANNEL, type ArchiveExported, type ArchiveImported, type ArchiveSummary } from './projectArchiveProtocol';
import { readZip, writeZip, type ZipEntry } from './projectArchiveZip';

const OWNER = 7;
const text = (value: string) => new TextEncoder().encode(value);

/** Every file and folder under `root` as `path -> bytes` (folders map to null), for comparing two folders. */
function snapshot(root: string, directory = root): Record<string, string | null> {
  const found: Record<string, string | null> = {};
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const key = relative(root, path).split('\\').join('/');
    if (statSync(path).isDirectory()) {
      found[`${key}/`] = null;
      Object.assign(found, snapshot(root, path));
    } else found[key] = readFileSync(path).toString('base64');
  }
  return found;
}

let scratch: string;
let project: string;
let answers: { save: string | null; open: string | null; folder: string | null };
let asked: string[];

const archive = () =>
  createProjectArchive({
    rootOf: (ownerId, rootId) => (ownerId === OWNER && rootId === 'root-1' ? project : null),
    dialogs: {
      saveFile: async (_owner, defaultName) => {
        asked.push(`save:${defaultName}`);
        return answers.save;
      },
      openFile: async () => {
        asked.push('open');
        return answers.open;
      },
      chooseFolder: async () => {
        asked.push('folder');
        return answers.folder;
      },
    },
  });

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'zplc-archive-'));
  project = join(scratch, 'motor');
  mkdirSync(join(project, 'src', 'drivers'), { recursive: true });
  mkdirSync(join(project, 'empty'));
  writeFileSync(join(project, 'zplc.json'), '{\n  "schemaVersion": 2,\n  "name": "Motor"\n}\n');
  writeFileSync(join(project, 'src', 'Motor.st'), 'PROGRAM Motor\r\nEND_PROGRAM\r\n');
  writeFileSync(join(project, 'src', 'drivers', 'ñandú.st'), '(* 温度 *)\n');
  writeFileSync(join(project, '.gitignore'), 'build/\n');
  writeFileSync(join(project, 'binary.dat'), Buffer.from([0, 1, 2, 255, 254]));
  answers = { save: join(scratch, 'out.zip'), open: null, folder: null };
  asked = [];
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

describe('exporting a project (IDE-022)', () => {
  it('writes one archive of the project files, and only those, with the folder name as the suggested file name', async () => {
    mkdirSync(join(project, '.git'));
    writeFileSync(join(project, '.git', 'HEAD'), 'ref');
    mkdirSync(join(project, 'build'));
    writeFileSync(join(project, 'build', 'out.zplc'), 'x');
    mkdirSync(join(project, 'node_modules'));
    writeFileSync(join(project, 'node_modules', 'a.js'), 'x');
    symlinkSync('/etc/passwd', join(project, 'passwd-link'));

    const result = await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }]);
    expect(result.ok).toBe(true);
    const value = (result as { value: ArchiveExported }).value;
    expect(asked).toEqual(['save:motor.zplc.zip']);
    expect(value).toMatchObject({ fileName: 'out.zip', fileCount: 5, folderCount: 3, skipped: 1 });
    const entries = readZip(readFileSync(join(scratch, 'out.zip')));
    expect(entries.map((entry) => entry.path)).toEqual([
      '.gitignore',
      'binary.dat',
      'empty/',
      'src/',
      'src/Motor.st',
      'src/drivers/',
      'src/drivers/ñandú.st',
      'zplc.json',
    ]);
  });

  it('gives the same bytes when the same project is exported twice', async () => {
    await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }]);
    const first = readFileSync(join(scratch, 'out.zip'));
    answers.save = join(scratch, 'again.zip');
    await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }]);
    expect(readFileSync(join(scratch, 'again.zip')).equals(first)).toBe(true);
  });

  it('adds the extension when the user typed none, and writes nothing when the dialog is cancelled', async () => {
    answers.save = join(scratch, 'typed-name');
    await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }]);
    expect(existsSync(join(scratch, 'typed-name.zip'))).toBe(true);
    answers.save = null;
    const cancelled = await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }]);
    expect(cancelled).toEqual({ ok: true, value: null });
  });

  it("refuses a request for a folder that is not the window's, and a message of the wrong shape, before any dialog", async () => {
    expect(await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'other' }])).toEqual({
      ok: false,
      code: 'no-folder',
    });
    expect(await archive().handle(OWNER + 1, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }])).toEqual({
      ok: false,
      code: 'no-folder',
    });
    for (const args of [[], [{}], [{ rootId: 'root-1', extra: 1 }], [{ rootId: 5 }], ['root-1'], [{ rootId: 'root-1' }, 1]]) {
      expect(await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, args)).toEqual({ ok: false, code: 'invalid-request' });
    }
    expect(asked).toEqual([]);
  });

  it('refuses a project that holds a file larger than the limit', async () => {
    writeFileSync(join(project, 'huge.bin'), Buffer.alloc(16 * 1024 * 1024 + 1));
    expect(await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }])).toEqual({
      ok: false,
      code: 'too-large',
    });
    expect(existsSync(join(scratch, 'out.zip'))).toBe(false);
  });
});

describe('importing an archive (IDE-022)', () => {
  const exported = async () => {
    await archive().handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }]);
    return join(scratch, 'out.zip');
  };

  it('rebuilds an equal project, file for file and byte for byte, in the empty folder the user chose', async () => {
    answers.open = await exported();
    const destination = join(scratch, 'imported');
    mkdirSync(destination);
    answers.folder = destination;
    const importer = archive();

    const inspected = await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, []);
    expect(inspected.ok).toBe(true);
    const summary = (inspected as { value: ArchiveSummary }).value;
    expect(summary).toMatchObject({ fileName: 'out.zip', fileCount: 5, folderCount: 3 });
    expect(summary.manifest).toBe('{\n  "schemaVersion": 2,\n  "name": "Motor"\n}\n');
    expect(summary.files.map((file) => file.path)).toContain('src/Motor.st');
    expect(readdirSync(destination)).toEqual([]); // nothing is written before the user has seen the summary

    const extracted = await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.extractArchive, [{ archiveId: summary.archiveId }]);
    expect(extracted).toEqual({ ok: true, value: { name: 'imported', fileCount: 5 } satisfies ArchiveImported });
    expect(snapshot(destination)).toEqual(snapshot(project));
    // The next dialog of the window answers with that folder once, so that the project opens without asking again.
    expect(importer.takeImportedFolder(OWNER)).toBe(destination);
    expect(importer.takeImportedFolder(OWNER)).toBeNull();
  });

  it('does not offer the imported folder to another window, or after it expired', async () => {
    answers.open = await exported();
    const destination = join(scratch, 'imported');
    mkdirSync(destination);
    answers.folder = destination;
    let clock = 1_000;
    const importer = createProjectArchive({
      rootOf: () => null,
      dialogs: { saveFile: async () => null, openFile: async () => answers.open, chooseFolder: async () => answers.folder },
      now: () => clock,
    });
    const summary = ((await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, [])) as { value: ArchiveSummary }).value;
    await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.extractArchive, [{ archiveId: summary.archiveId }]);
    expect(importer.takeImportedFolder(OWNER + 1)).toBeNull();
    clock += 60_000;
    expect(importer.takeImportedFolder(OWNER)).toBeNull();
  });

  it('refuses a folder that is not empty, and leaves it as it was', async () => {
    answers.open = await exported();
    const destination = join(scratch, 'busy');
    mkdirSync(destination);
    writeFileSync(join(destination, 'mine.txt'), 'keep');
    answers.folder = destination;
    const importer = archive();
    const summary = ((await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, [])) as { value: ArchiveSummary }).value;
    expect(await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.extractArchive, [{ archiveId: summary.archiveId }])).toEqual({
      ok: false,
      code: 'not-empty',
    });
    expect(readdirSync(destination)).toEqual(['mine.txt']);
    expect(importer.takeImportedFolder(OWNER)).toBeNull();
  });

  it('extracts an archive once: its id is spent, and another window cannot use it', async () => {
    answers.open = await exported();
    const destination = join(scratch, 'imported');
    mkdirSync(destination);
    answers.folder = destination;
    const importer = archive();
    const summary = ((await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, [])) as { value: ArchiveSummary }).value;
    expect(await importer.handle(OWNER + 1, PROJECT_ARCHIVE_CHANNEL.extractArchive, [{ archiveId: summary.archiveId }])).toEqual({
      ok: false,
      code: 'not-found',
    });
    expect((await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.extractArchive, [{ archiveId: summary.archiveId }])).ok).toBe(true);
    expect(await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.extractArchive, [{ archiveId: summary.archiveId }])).toEqual({
      ok: false,
      code: 'not-found',
    });
  });

  it('says why an archive is refused, and holds nothing of it', async () => {
    const importer = archive();
    const inspect = (bytes: Uint8Array | null) => {
      if (bytes) writeFileSync(join(scratch, 'bad.zip'), bytes);
      answers.open = bytes ? join(scratch, 'bad.zip') : join(scratch, 'missing.zip');
      return importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, []);
    };
    const file = (path: string): ZipEntry => ({ path, kind: 'file', bytes: text('x') });
    expect(await inspect(null)).toEqual({ ok: false, code: 'not-found' });
    expect(await inspect(text('not a zip'))).toEqual({ ok: false, code: 'not-a-zip' });
    expect(await inspect(writeZip([file('../escape.st')]))).toEqual({ ok: false, code: 'unsafe-path' });
    expect(await inspect(writeZip([file('a.st'), file('A.ST')]))).toEqual({ ok: false, code: 'duplicate' });
    answers.open = null;
    expect(await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, [])).toEqual({ ok: true, value: null });
  });

  it('does not hand the renderer a manifest that is too large, or none when the archive has no zplc.json', async () => {
    const importer = archive();
    writeFileSync(join(scratch, 'plain.zip'), writeZip([{ path: 'src/Main.st', kind: 'file', bytes: text('x') }]));
    answers.open = join(scratch, 'plain.zip');
    const plain = ((await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, [])) as { value: ArchiveSummary }).value;
    expect(plain.manifest).toBeNull();
    writeFileSync(
      join(scratch, 'big.zip'),
      writeZip([{ path: 'zplc.json', kind: 'file', bytes: text(`{"pad":"${'x'.repeat(1024 * 1024)}"}`) }]),
    );
    answers.open = join(scratch, 'big.zip');
    const big = ((await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, [])) as { value: ArchiveSummary }).value;
    expect(big.manifest).toBeNull();
  });

  it('is the same project after export, import, and export again', async () => {
    answers.open = await exported();
    const destination = join(scratch, 'imported');
    mkdirSync(destination);
    answers.folder = destination;
    const importer = archive();
    const summary = ((await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.inspectArchive, [])) as { value: ArchiveSummary }).value;
    await importer.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.extractArchive, [{ archiveId: summary.archiveId }]);
    const second = createProjectArchive({
      rootOf: (ownerId, rootId) => (ownerId === OWNER && rootId === 'root-1' ? destination : null),
      dialogs: { saveFile: async () => join(scratch, 'second.zip'), openFile: async () => null, chooseFolder: async () => null },
    });
    await second.handle(OWNER, PROJECT_ARCHIVE_CHANNEL.exportArchive, [{ rootId: 'root-1' }]);
    expect(readFileSync(join(scratch, 'second.zip')).equals(readFileSync(join(scratch, 'out.zip')))).toBe(true);
  });
});
