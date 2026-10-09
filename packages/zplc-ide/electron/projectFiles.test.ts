import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createProjectFiles, readFolderDialogHook } from './projectFiles';
import {
  PROJECT_FILES_CHANNEL,
  PROJECT_FILES_LIMITS,
  type ProjectFilesOp,
  type ProjectFilesResult,
  type ProjectFolder,
} from './projectFilesProtocol';

const OWNER = 7;
const MAX = PROJECT_FILES_LIMITS.maxFileBytes;
const text = (bytes: unknown) => new TextDecoder().decode(bytes as Uint8Array);

let sandbox: string;
let root: string;
let outside: string;

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'zplc-project-files-')));
  root = path.join(sandbox, 'project');
  outside = path.join(sandbox, 'outside');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(root, 'src', 'main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  writeFileSync(path.join(outside, 'secret.txt'), 'secret');
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

async function open(chosen: string | null = root) {
  const files = createProjectFiles(async () => chosen);
  const opened = await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []);
  const folder = opened.ok ? (opened.value as ProjectFolder | null) : null;
  const rootId = folder?.rootId ?? 'none';
  const call = (op: ProjectFilesOp, request: Record<string, unknown>): Promise<ProjectFilesResult<unknown>> =>
    files.handle(OWNER, PROJECT_FILES_CHANNEL[op], [{ rootId, ...request }]);
  return { files, opened, rootId, call };
}

const refused = (result: ProjectFilesResult<unknown>) => (result.ok ? 'ok' : result.code);

describe('choosing the project folder', () => {
  it('holds a root only after the dialog answers and returns a name, never a path', async () => {
    const { opened } = await open();
    expect(opened).toEqual({ ok: true, value: { rootId: expect.any(String), name: 'project' } });
    expect(JSON.stringify(opened)).not.toContain(sandbox);
  });

  it('returns nothing and keeps the previous folder when the dialog is cancelled', async () => {
    let answer: string | null = root;
    const files = createProjectFiles(async () => answer);
    const first = await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []);
    const rootId = (first as { value: ProjectFolder }).value.rootId;
    answer = null;
    expect(await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, [])).toEqual({ ok: true, value: null });
    const listed = await files.handle(OWNER, PROJECT_FILES_CHANNEL.list, [{ rootId, path: '' }]);
    expect(listed.ok).toBe(true);
  });

  it('refuses a dialog answer that is not an existing directory and keeps the previous folder', async () => {
    let answer: string | null = root;
    const files = createProjectFiles(async () => answer);
    const first = await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []);
    const rootId = (first as { value: ProjectFolder }).value.rootId;
    answer = path.join(root, 'missing');
    expect(refused(await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []))).toBe('not-found');
    answer = path.join(root, 'src', 'main.st');
    expect(refused(await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []))).toBe('not-a-directory');
    expect((await files.handle(OWNER, PROJECT_FILES_CHANNEL.list, [{ rootId, path: '' }])).ok).toBe(true);
  });

  it('ignores arguments from the renderer: it cannot supply a root', async () => {
    const files = createProjectFiles(async () => root);
    expect(refused(await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, [outside]))).toBe('invalid-request');
    expect(refused(await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, [{ path: outside }]))).toBe('invalid-request');
  });

  it('refuses every operation before a folder is chosen, for a stale folder, another window and after revoking', async () => {
    const { files, rootId, call } = await open();
    expect(refused(await files.handle(99, PROJECT_FILES_CHANNEL.list, [{ rootId, path: '' }]))).toBe('no-folder');
    expect(refused(await call('list', { rootId: 'guess', path: '' }))).toBe('no-folder');
    expect(refused(await createProjectFiles(async () => root).handle(OWNER, PROJECT_FILES_CHANNEL.list, [{ rootId, path: '' }]))).toBe('no-folder');
    await files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []);
    expect(refused(await call('list', { path: '' }))).toBe('no-folder');
    files.revokeOwner(OWNER);
    expect(refused(await files.handle(OWNER, PROJECT_FILES_CHANNEL.list, [{ rootId, path: '' }]))).toBe('no-folder');
  });

  it('shares one dialog between concurrent requests of a window', async () => {
    let calls = 0;
    const files = createProjectFiles(async () => { calls += 1; await Bun.sleep(10); return root; });
    const [first, second] = await Promise.all([
      files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []),
      files.handle(OWNER, PROJECT_FILES_CHANNEL.chooseFolder, []),
    ]);
    expect(calls).toBe(1);
    expect(first).toEqual(second);
  });
});

describe('operations inside the project root', () => {
  it('lists, reads, writes, creates, renames and deletes', async () => {
    const { call } = await open();
    expect(await call('list', { path: '' })).toEqual({ ok: true, value: [{ name: 'src', kind: 'directory' }] });
    expect(await call('list', { path: 'src' })).toEqual({ ok: true, value: [{ name: 'main.st', kind: 'file' }] });
    expect(await call('stat', { path: 'src/main.st' })).toEqual({ ok: true, value: { kind: 'file', size: 25 } });
    expect(await call('stat', { path: 'src' })).toEqual({ ok: true, value: { kind: 'directory', size: 0 } });
    expect(text((await call('read', { path: 'src/main.st' }) as { value: unknown }).value)).toBe('PROGRAM Main\nEND_PROGRAM\n');

    expect((await call('mkdir', { path: 'tests/nested' })).ok).toBe(true);
    expect((await call('mkdir', { path: 'tests/nested' })).ok).toBe(true);
    expect((await call('write', { path: 'tests/nested/a.st', bytes: new TextEncoder().encode('A') })).ok).toBe(true);
    expect((await call('rename', { from: 'tests/nested/a.st', to: 'tests/b.st' })).ok).toBe(true);
    expect(readFileSync(path.join(root, 'tests', 'b.st'), 'utf8')).toBe('A');
    expect((await call('remove', { path: 'tests/b.st', recursive: false })).ok).toBe(true);
    expect((await call('remove', { path: 'tests', recursive: true })).ok).toBe(true);
    expect(existsSync(path.join(root, 'tests'))).toBe(false);
  });

  it('keeps bytes exactly: UTF-8 text, a BOM, CRLF and arbitrary binary', async () => {
    const { call } = await open();
    const samples = [
      new TextEncoder().encode('Temperatura := 3.5; (* ñandú 温度 *)\r\n'),
      new Uint8Array([0xef, 0xbb, 0xbf, 0x41]),
      Uint8Array.from({ length: 256 }, (_, index) => index),
      new Uint8Array(0),
    ];
    for (const bytes of samples) {
      expect((await call('write', { path: 'blob.bin', bytes })).ok).toBe(true);
      expect(Buffer.from(readFileSync(path.join(root, 'blob.bin'))).equals(Buffer.from(bytes))).toBe(true);
      const read = await call('read', { path: 'blob.bin' }) as { value: Uint8Array };
      expect(Buffer.from(read.value).equals(Buffer.from(bytes))).toBe(true);
      // A copy with its own buffer: the structured clone of a pooled Buffer would carry its neighbours.
      expect(read.value.buffer.byteLength).toBe(bytes.byteLength);
    }
  });

  it('replaces a file in one step and leaves no temporary file', async () => {
    const { call } = await open();
    await call('write', { path: 'src/main.st', bytes: new TextEncoder().encode('v2') });
    expect(readdirSync(path.join(root, 'src'))).toEqual(['main.st']);
    expect(readFileSync(path.join(root, 'src', 'main.st'), 'utf8')).toBe('v2');
  });

  it('allows a path that normalizes into the root, and a link that stays inside', async () => {
    const { call } = await open();
    for (const allowed of ['src/main.st', './src//main.st', 'src/./main.st', 'src/', './']) {
      const result = await call(allowed === './' ? 'list' : 'stat', { path: allowed });
      expect(refused(result)).toBe('ok');
    }
    symlinkSync(path.join(root, 'src'), path.join(root, 'alias'));
    expect(text(((await call('read', { path: 'alias/main.st' })) as { value: unknown }).value)).toContain('PROGRAM Main');
    expect(await call('list', { path: '' })).toEqual({ ok: true, value: expect.arrayContaining([{ name: 'alias', kind: 'directory' }]) });
  });

  it('refuses to create a file in a missing folder and to write over a folder', async () => {
    const { call } = await open();
    expect(refused(await call('write', { path: 'missing/dir/a.st', bytes: new Uint8Array(1) }))).toBe('not-found');
    expect(refused(await call('write', { path: 'src', bytes: new Uint8Array(1) }))).toBe('not-a-file');
    expect(refused(await call('write', { path: '', bytes: new Uint8Array(1) }))).toBe('not-a-file');
    expect(refused(await call('write', { path: 'src/main.st/inner', bytes: new Uint8Array(1) }))).toBe('not-a-directory');
    expect(refused(await call('mkdir', { path: 'src/main.st' }))).toBe('exists');
    expect(refused(await call('mkdir', { path: 'src/main.st/inner' }))).toBe('not-a-directory');
    expect(refused(await call('read', { path: 'src' }))).toBe('not-a-file');
    expect(refused(await call('read', { path: 'nothing.st' }))).toBe('not-found');
    expect(refused(await call('list', { path: 'src/main.st' }))).toBe('not-a-directory');
    expect(refused(await call('list', { path: 'nope' }))).toBe('not-found');
  });

  it('refuses to delete the root, a non-empty folder without recursion, and a missing entry', async () => {
    const { call } = await open();
    expect(refused(await call('remove', { path: '', recursive: true }))).toBe('invalid-path');
    expect(refused(await call('remove', { path: '.', recursive: true }))).toBe('invalid-path');
    expect(refused(await call('remove', { path: 'src', recursive: false }))).toBe('not-empty');
    expect(refused(await call('remove', { path: 'gone.st', recursive: false }))).toBe('not-found');
    expect(existsSync(path.join(root, 'src', 'main.st'))).toBe(true);
  });

  it('never overwrites on rename and never renames the root', async () => {
    const { call } = await open();
    writeFileSync(path.join(root, 'src', 'other.st'), 'other');
    expect(refused(await call('rename', { from: 'src/main.st', to: 'src/other.st' }))).toBe('exists');
    expect(refused(await call('rename', { from: '', to: 'moved' }))).toBe('invalid-path');
    expect(refused(await call('rename', { from: 'src/absent.st', to: 'src/x.st' }))).toBe('not-found');
    expect(readFileSync(path.join(root, 'src', 'other.st'), 'utf8')).toBe('other');
  });

  it('does not list entries it could not address, links that leave the root, or special files', async () => {
    const { call } = await open();
    symlinkSync(outside, path.join(root, 'leaves'));
    symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'leaves.txt'));
    symlinkSync(path.join(root, 'absent'), path.join(root, 'dangling'));
    writeFileSync(path.join(root, 'trailing.'), 'x');
    const listed = (await call('list', { path: '' })) as { value: Array<{ name: string }> };
    expect(listed.value.map((entry) => entry.name)).toEqual(['src']);
  });
});

describe('containment', () => {
  const traversal = ['..', '../outside/secret.txt', 'src/../../outside/secret.txt', 'src/..', '..\\outside', 'src/../main.st', 'a/./../b', '.../x', 'src/..../x'];
  const absolute = (): string[] => [path.join(outside, 'secret.txt'), '/etc/passwd', '\\\\server\\share\\x', 'C:\\Windows\\win.ini', 'C:/Windows/win.ini', 'c:x', '/'];
  const malformed = ['src\\main.st', 'src/main.st\0', 'bad\0name', 'stream:name', 'name ', 'name.'];

  for (const op of ['list', 'stat', 'read', 'mkdir'] as const) {
    it(`${op} refuses a ".." segment, an absolute path and malformed names`, async () => {
      const { call } = await open();
      for (const candidate of [...traversal, ...absolute(), ...malformed]) {
        expect(refused(await call(op, { path: candidate }))).toBe('invalid-path');
      }
    });
  }

  it('write, remove and rename refuse the same paths and change nothing', async () => {
    const { call } = await open();
    for (const candidate of [...traversal, ...absolute(), ...malformed]) {
      expect(refused(await call('write', { path: candidate, bytes: new Uint8Array(1) }))).toBe('invalid-path');
      expect(refused(await call('remove', { path: candidate, recursive: true }))).toBe('invalid-path');
      expect(refused(await call('rename', { from: 'src/main.st', to: candidate }))).toBe('invalid-path');
      expect(refused(await call('rename', { from: candidate, to: 'x.st' }))).toBe('invalid-path');
    }
    expect(readdirSync(sandbox).sort()).toEqual(['outside', 'project']);
    expect(readdirSync(outside)).toEqual(['secret.txt']);
    expect(readdirSync(root).sort()).toEqual(['src']);
  });

  it('refuses a link inside the root that points outside, for every operation', async () => {
    const { call } = await open();
    symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'file-link'));
    symlinkSync(outside, path.join(root, 'dir-link'));
    expect(refused(await call('read', { path: 'file-link' }))).toBe('outside-root');
    expect(refused(await call('stat', { path: 'file-link' }))).toBe('outside-root');
    expect(refused(await call('write', { path: 'file-link', bytes: new TextEncoder().encode('pwn') }))).toBe('outside-root');
    expect(refused(await call('list', { path: 'dir-link' }))).toBe('outside-root');
    expect(refused(await call('mkdir', { path: 'dir-link/new' }))).toBe('outside-root');
    expect(refused(await call('rename', { from: 'src/main.st', to: 'dir-link/main.st' }))).toBe('outside-root');
    expect(readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret');
    expect(readdirSync(outside)).toEqual(['secret.txt']);
  });

  it('refuses a symlinked ancestor, for existing and for new targets', async () => {
    const { call } = await open();
    mkdirSync(path.join(outside, 'sub'));
    writeFileSync(path.join(outside, 'sub', 'deep.txt'), 'deep');
    symlinkSync(outside, path.join(root, 'src', 'ancestor'));
    expect(refused(await call('read', { path: 'src/ancestor/sub/deep.txt' }))).toBe('outside-root');
    expect(refused(await call('write', { path: 'src/ancestor/sub/new.txt', bytes: new Uint8Array(1) }))).toBe('outside-root');
    expect(refused(await call('write', { path: 'src/ancestor/brand/new/file.txt', bytes: new Uint8Array(1) }))).toBe('outside-root');
    expect(refused(await call('mkdir', { path: 'src/ancestor/brand/new' }))).toBe('outside-root');
    expect(readdirSync(outside).sort()).toEqual(['secret.txt', 'sub']);
    expect(readdirSync(path.join(outside, 'sub'))).toEqual(['deep.txt']);
  });

  it('refuses to create a file through a dangling link that points outside', async () => {
    const { call } = await open();
    symlinkSync(path.join(outside, 'created-by-attacker.txt'), path.join(root, 'dangling'));
    expect(refused(await call('write', { path: 'dangling', bytes: new TextEncoder().encode('pwn') }))).toBe('outside-root');
    expect(refused(await call('mkdir', { path: 'dangling' }))).toBe('outside-root');
    expect(existsSync(path.join(outside, 'created-by-attacker.txt'))).toBe(false);
  });

  it('deletes and renames the link itself, never what it points to', async () => {
    const { call } = await open();
    symlinkSync(outside, path.join(root, 'dir-link'));
    expect(refused(await call('rename', { from: 'dir-link', to: 'renamed-link' }))).toBe('ok');
    expect(lstatSync(path.join(root, 'renamed-link')).isSymbolicLink()).toBe(true);
    expect(refused(await call('remove', { path: 'renamed-link', recursive: true }))).toBe('ok');
    expect(existsSync(path.join(root, 'renamed-link'))).toBe(false);
    expect(readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });

  it('refuses a case variant of a link or traversal without leaking or escaping', async () => {
    const { call } = await open();
    symlinkSync(outside, path.join(root, 'link'));
    for (const variant of ['LINK/secret.txt', 'Link/secret.txt', 'lInK']) {
      // A case-sensitive disk has no such entry; a case-insensitive disk resolves the link, which is refused.
      expect(['not-found', 'outside-root', 'not-a-file']).toContain(refused(await call('read', { path: variant })));
    }
    for (const variant of ['SRC/MAIN.ST', 'Src/Main.st']) {
      const result = await call('read', { path: variant });
      expect(result.ok ? text((result as { value: unknown }).value) : result.code).toMatch(/^(not-found|PROGRAM Main)/);
    }
    expect(refused(await call('read', { path: 'SRC/../MAIN.ST' }))).toBe('invalid-path');
  });

  it('applies the size limit to reads and to writes', async () => {
    const { call } = await open();
    const big = path.join(root, 'big.bin');
    writeFileSync(big, '');
    truncateSync(big, MAX + 1);
    expect(refused(await call('read', { path: 'big.bin' }))).toBe('too-large');
    truncateSync(big, MAX);
    expect(refused(await call('read', { path: 'big.bin' }))).toBe('ok');

    expect(refused(await call('write', { path: 'huge.bin', bytes: new Uint8Array(MAX + 1) }))).toBe('too-large');
    expect(existsSync(path.join(root, 'huge.bin'))).toBe(false);
    expect(refused(await call('write', { path: 'limit.bin', bytes: new Uint8Array(MAX) }))).toBe('ok');
    expect(lstatSync(path.join(root, 'limit.bin')).size).toBe(MAX);
  });

  it('refuses to list a folder with more entries than the limit', async () => {
    const { call } = await open();
    const crowded = path.join(root, 'crowded');
    mkdirSync(crowded);
    for (let index = 0; index <= PROJECT_FILES_LIMITS.maxListEntries; index += 1) writeFileSync(path.join(crowded, `f${index}`), '');
    expect(refused(await call('list', { path: 'crowded' }))).toBe('too-large');
  });

  it.skipIf(process.platform === 'win32')('refuses a named pipe for read, write and stat without opening it', async () => {
    const { call } = await open();
    const pipe = path.join(root, 'pipe');
    expect(spawnSync('mkfifo', [pipe]).status).toBe(0);
    expect(refused(await call('read', { path: 'pipe' }))).toBe('not-a-file');
    expect(refused(await call('write', { path: 'pipe', bytes: new Uint8Array(1) }))).toBe('not-a-file');
    expect(refused(await call('stat', { path: 'pipe' }))).toBe('not-a-file');
  });

  it('returns a typed code and never an absolute path or an operating-system message', async () => {
    const { call } = await open();
    symlinkSync(outside, path.join(root, 'dir-link'));
    const failures = [
      await call('read', { path: 'nothing.st' }), await call('read', { path: '../x' }), await call('read', { path: 'dir-link/secret.txt' }),
      await call('list', { path: 'src/main.st' }), await call('remove', { path: 'src', recursive: false }),
    ];
    for (const failure of failures) {
      expect(Object.keys(failure).sort()).toEqual(['code', 'ok']);
      expect(JSON.stringify(failure)).not.toContain(sandbox);
      expect(JSON.stringify(failure)).not.toMatch(/ENOENT|EACCES|ENOTDIR|\/tmp|\/var/);
    }
  });
});

describe('request validation at the handler', () => {
  it('answers a malformed request with a typed code and touches nothing', async () => {
    const { files, rootId } = await open();
    const send = (channel: string, args: unknown[]) => files.handle(OWNER, channel, args);
    expect(refused(await send(PROJECT_FILES_CHANNEL.read, []))).toBe('invalid-request');
    expect(refused(await send(PROJECT_FILES_CHANNEL.read, [{ rootId }]))).toBe('invalid-request');
    expect(refused(await send(PROJECT_FILES_CHANNEL.read, [{ rootId, path: 1 }]))).toBe('invalid-request');
    expect(refused(await send(PROJECT_FILES_CHANNEL.read, [{ rootId, path: 'a', root: outside }]))).toBe('invalid-request');
    expect(refused(await send(PROJECT_FILES_CHANNEL.write, [{ rootId, path: 'a', bytes: 'text' }]))).toBe('invalid-request');
    expect(refused(await send(PROJECT_FILES_CHANNEL.remove, [{ rootId, path: 'a' }]))).toBe('invalid-request');
    expect(refused(await send('project-files:exec', [{ rootId, path: 'a' }]))).toBe('invalid-request');
    expect(refused(await send('project-files:list', [{ rootId, path: '' }, 'extra']))).toBe('invalid-request');
    expect(readdirSync(root)).toEqual(['src']);
  });
});

describe('test hook for the native dialog', () => {
  const env = (answerFile: string | undefined) => ({ ZPLC_SMOKE_FOLDER_ANSWER_FILE: answerFile });

  it('is inert in a packaged build, whatever the environment says', () => {
    const file = path.join(sandbox, 'answer.txt');
    writeFileSync(file, root);
    expect(readFolderDialogHook(true, env(file))).toBeUndefined();
  });

  it('is absent without the variable', () => {
    expect(readFolderDialogHook(false, {})).toBeUndefined();
    expect(readFolderDialogHook(false, env(''))).toBeUndefined();
  });

  it('answers with the trimmed path in the file, or with a cancel when the file is empty or unreadable', () => {
    const file = path.join(sandbox, 'answer.txt');
    writeFileSync(file, `${root}\n`);
    expect(readFolderDialogHook(false, env(file))).toBe(root);
    writeFileSync(file, '  \n');
    expect(readFolderDialogHook(false, env(file))).toBeNull();
    expect(readFolderDialogHook(false, env(path.join(sandbox, 'absent.txt')))).toBeNull();
  });
});
