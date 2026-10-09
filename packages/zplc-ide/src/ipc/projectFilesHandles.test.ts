import { describe, expect, it } from 'bun:test';

import type { ProjectFilesBridge, ProjectFilesErrorCode, ProjectFilesResult, ProjectFolder } from '../../electron/projectFilesProtocol';
import { chooseProjectFolder } from './projectFilesHandles';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** An in-memory bridge: the shape of the preload object, with `null` standing for a folder. */
function fakeBridge(seed: Record<string, string | null> = {}, folder: ProjectFilesResult<ProjectFolder | null> = { ok: true, value: { rootId: 'r1', name: 'plant' } }) {
  const nodes = new Map<string, Uint8Array | null>([['', null]]);
  for (const [path, text] of Object.entries(seed)) nodes.set(path, text === null ? null : encode(text));
  const calls: Array<{ op: string; request: Record<string, unknown> }> = [];
  const forced = new Map<string, ProjectFilesErrorCode>();
  const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
  const ok = <T>(value: T): ProjectFilesResult<T> => ({ ok: true, value });
  const fail = (code: ProjectFilesErrorCode): ProjectFilesResult<never> => ({ ok: false, code });
  const run = async <T>(op: string, request: Record<string, unknown>, produce: () => ProjectFilesResult<T>): Promise<ProjectFilesResult<T>> => {
    calls.push({ op, request });
    const code = forced.get(op);
    return code ? fail(code) : produce();
  };
  const bridge: ProjectFilesBridge = {
    chooseFolder: async () => folder,
    list: (request) => run('list', request, () => {
      if (!nodes.has(request.path)) return fail('not-found');
      if (nodes.get(request.path) !== null) return fail('not-a-directory');
      const names = [...nodes.keys()].filter((path) => path !== '' && parentOf(path) === request.path);
      return ok(names.map((path) => ({ name: path.slice(path.lastIndexOf('/') + 1), kind: nodes.get(path) === null ? 'directory' as const : 'file' as const })));
    }),
    stat: (request) => run('stat', request, () => {
      const node = nodes.get(request.path);
      if (node === undefined) return fail('not-found');
      return ok(node === null ? { kind: 'directory' as const, size: 0 } : { kind: 'file' as const, size: node.byteLength });
    }),
    read: (request) => run('read', request, () => {
      const node = nodes.get(request.path);
      if (node === undefined) return fail('not-found');
      return node === null ? fail('not-a-file') : ok(node);
    }),
    write: (request) => run('write', request, () => {
      if (nodes.get(parentOf(request.path)) !== null || !nodes.has(parentOf(request.path))) return fail('not-found');
      nodes.set(request.path, request.bytes);
      return ok(null);
    }),
    mkdir: (request) => run('mkdir', request, () => { nodes.set(request.path, null); return ok(null); }),
    remove: (request) => run('remove', request, () => {
      const hasChildren = [...nodes.keys()].some((path) => parentOf(path) === request.path && path !== request.path);
      if (hasChildren && !request.recursive) return fail('not-empty');
      nodes.delete(request.path);
      return ok(null);
    }),
    rename: (request) => run('rename', request, () => { nodes.set(request.to, nodes.get(request.from) ?? null); nodes.delete(request.from); return ok(null); }),
  };
  return { bridge, nodes, calls, forced };
}

async function open(seed: Record<string, string | null> = {}) {
  const fake = fakeBridge(seed);
  const root = await chooseProjectFolder(fake.bridge);
  if (!root) throw new Error('expected a folder');
  return { ...fake, root };
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

describe('the project folder handle', () => {
  it('is the folder the main process chose, shown by its name, and nothing when the dialog is cancelled', async () => {
    const { root } = await open();
    expect(root.kind).toBe('directory');
    expect(root.name).toBe('plant');
    expect(await chooseProjectFolder(fakeBridge({}, { ok: true, value: null }).bridge)).toBeNull();
  });

  it('turns a failed dialog into an error that explains it without a path', async () => {
    const error = await rejection(chooseProjectFolder(fakeBridge({}, { ok: false, code: 'not-found' }).bridge));
    expect(error.name).toBe('NotFoundError');
    const dead: ProjectFilesBridge = { ...fakeBridge().bridge, chooseFolder: async () => { throw new Error("Error invoking remote method 'project-files:choose-folder': Error: Request denied"); } };
    expect((await rejection(chooseProjectFolder(dead))).message).toBe('The operation failed. Try again.');
  });

  it('lists entries as handles that carry a kind and a name', async () => {
    const { root } = await open({ src: null, 'src/main.st': 'A', 'zplc.json': '{}' });
    const names: string[] = [];
    for await (const entry of root.values()) names.push(`${entry.kind}:${entry.name}`);
    expect(names.sort()).toEqual(['directory:src', 'file:zplc.json']);
    const pairs: string[] = [];
    for await (const [name, entry] of root.entries()) pairs.push(`${name}=${entry.kind}`);
    expect(pairs.sort()).toEqual(['src=directory', 'zplc.json=file']);
    const keys: string[] = [];
    for await (const key of root.keys()) keys.push(key);
    expect(keys.sort()).toEqual(['src', 'zplc.json']);
  });

  it('finds files and folders, and reports a missing one as NotFoundError, as the browser does', async () => {
    const { root } = await open({ src: null, 'src/main.st': 'A' });
    const src = await root.getDirectoryHandle('src');
    expect(src.name).toBe('src');
    expect((await src.getFileHandle('main.st')).kind).toBe('file');
    expect((await rejection(src.getFileHandle('absent.st'))).name).toBe('NotFoundError');
    expect((await rejection(root.getDirectoryHandle('absent'))).name).toBe('NotFoundError');
    expect((await rejection(root.getFileHandle('src'))).name).toBe('TypeMismatchError');
    expect((await rejection(src.getDirectoryHandle('main.st'))).name).toBe('TypeMismatchError');
  });

  it('creates what is missing only when asked to, and leaves what exists alone', async () => {
    const { root, nodes, calls } = await open({ src: null, 'src/main.st': 'keep' });
    const src = await root.getDirectoryHandle('src');
    await src.getFileHandle('main.st', { create: true });
    expect(decode(nodes.get('src/main.st')!)).toBe('keep');
    await src.getFileHandle('new.st', { create: true });
    expect(nodes.get('src/new.st')?.byteLength).toBe(0);
    await root.getDirectoryHandle('tests', { create: true });
    expect(nodes.get('tests')).toBeNull();
    await root.getDirectoryHandle('src', { create: true });
    expect(calls.filter((call) => call.op === 'mkdir')).toHaveLength(1);
  });

  it('rejects names that would address anything but a direct child, without asking the main process', async () => {
    const { root, calls } = await open({ src: null });
    const before = calls.length;
    for (const name of ['', '.', '..', 'a/b', '../x', 'a\\b', 'x\0y']) {
      expect((await rejection(root.getFileHandle(name, { create: true }))).name).toBe('TypeError');
      expect((await rejection(root.getDirectoryHandle(name, { create: true }))).name).toBe('TypeError');
      expect((await rejection(root.removeEntry(name))).name).toBe('TypeError');
    }
    expect(calls.length).toBe(before);
  });

  it('names its folder in every request and repeats the opaque root identifier', async () => {
    const { root, calls } = await open({ src: null, 'src/main.st': 'A' });
    await (await (await root.getDirectoryHandle('src')).getFileHandle('main.st')).getFile();
    expect(calls.map((call) => call.request)).toEqual([
      { rootId: 'r1', path: 'src' },
      { rootId: 'r1', path: 'src/main.st' },
      { rootId: 'r1', path: 'src/main.st' },
    ]);
  });

  it('removes an entry, recursively only when asked', async () => {
    const { root, nodes, forced } = await open({ old: null, 'old/a.st': 'A', 'b.st': 'B' });
    await root.removeEntry('b.st');
    expect(nodes.has('b.st')).toBe(false);
    forced.set('remove', 'not-empty');
    expect((await rejection(root.removeEntry('old'))).name).toBe('InvalidModificationError');
    forced.clear();
    await root.removeEntry('old', { recursive: true });
    expect(nodes.has('old')).toBe(false);
  });

  it('answers permission questions as granted: the main process owns the access', async () => {
    const { root } = await open();
    expect(await root.queryPermission({ mode: 'readwrite' })).toBe('granted');
    expect(await root.requestPermission({ mode: 'readwrite' })).toBe('granted');
    expect(await root.isSameEntry(root)).toBe(true);
  });
});

describe('the project file handle', () => {
  it('reads a File whose text is decoded as UTF-8', async () => {
    const { root } = await open({ 'a.st': 'Temperatura := 3.5; (* ñandú *)' });
    const file = await (await root.getFileHandle('a.st')).getFile();
    expect(file.name).toBe('a.st');
    expect(file.size).toBe(encode('Temperatura := 3.5; (* ñandú *)').byteLength);
    expect(await file.text()).toBe('Temperatura := 3.5; (* ñandú *)');
  });

  it('writes the whole content on close, as UTF-8, in one request', async () => {
    const { root, nodes, calls } = await open({ 'a.st': 'old' });
    const writable = await (await root.getFileHandle('a.st')).createWritable();
    await writable.write('nuevo ');
    await writable.write(encode('contenido ñ'));
    await writable.write(new Blob(['!']));
    expect(decode(nodes.get('a.st')!)).toBe('old');
    await writable.close();
    expect(decode(nodes.get('a.st')!)).toBe('nuevo contenido ñ!');
    expect(calls.filter((call) => call.op === 'write')).toHaveLength(1);
  });

  it('writes nothing when the stream is aborted, and refuses writes after close', async () => {
    const { root, nodes } = await open({ 'a.st': 'old' });
    const handle = await root.getFileHandle('a.st');
    const aborted = await handle.createWritable();
    await aborted.write('discarded');
    await aborted.abort();
    expect(decode(nodes.get('a.st')!)).toBe('old');
    const closed = await handle.createWritable();
    await closed.close();
    expect((await rejection(closed.write('late'))).name).toBe('TypeError');
    expect((await rejection(closed.close())).name).toBe('TypeError');
  });

  it('refuses a chunk it cannot turn into whole content', async () => {
    const { root } = await open({ 'a.st': 'old' });
    const writable = await (await root.getFileHandle('a.st')).createWritable();
    expect((await rejection(writable.write({ type: 'seek', position: 1 }))).name).toBe('TypeError');
    expect((await rejection(writable.write(42 as never))).name).toBe('TypeError');
  });

  it('reports a failed save with the reason in words, never a code or a path', async () => {
    const { root, forced } = await open({ 'a.st': 'old' });
    const writable = await (await root.getFileHandle('a.st')).createWritable();
    await writable.write('x');
    forced.set('write', 'too-large');
    expect((await rejection(writable.close())).message).toBe('The file is larger than 16 MiB.');
  });
});

describe('failure messages', () => {
  const table: Array<[ProjectFilesErrorCode, string, RegExp]> = [
    ['not-found', 'NotFoundError', /not found/i],
    ['denied', 'NotAllowedError', /not allowed|denied|permission/i],
    ['not-a-file', 'TypeMismatchError', /file/i],
    ['not-a-directory', 'TypeMismatchError', /folder/i],
    ['exists', 'InvalidModificationError', /exists/i],
    ['not-empty', 'InvalidModificationError', /not empty/i],
    ['too-large', 'QuotaExceededError', /16 MiB/],
    ['invalid-path', 'TypeError', /name/i],
    ['outside-root', 'OutsideProjectError', /project folder/i],
    ['no-folder', 'ProjectFolderClosedError', /choose the folder again/i],
    ['invalid-request', 'Error', /failed/i],
    ['failed', 'Error', /failed/i],
  ];

  for (const [code, name, message] of table) {
    it(`maps "${code}" to ${name} with a short message`, async () => {
      const { root, forced } = await open({ 'a.st': 'A' });
      forced.set('stat', code);
      const error = await rejection(root.getFileHandle('a.st'));
      expect(error.name).toBe(name);
      expect(error.message).toMatch(message);
      expect(error.message.length).toBeLessThan(80);
      expect(error.message).not.toMatch(/[\\/]/);
    });
  }
});
