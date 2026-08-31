import { describe, expect, it } from 'bun:test';

import { copyProjectToFolder, createNewProject, readDirectoryRecursive, readProjectConfig, writeProjectConfig } from './fileSystem';
import { DEFAULT_ZPLC_CONFIG } from '../types';

const valid = JSON.stringify({ name: 'folder', version: '1.0.0', tasks: [{ name: 'main', file: 'Main.st' }] });

function fakeDirectory(content?: string, error?: Error) {
  const calls: Array<{ name: string; create?: boolean }> = [];
  const writes: string[] = [];
  const fileHandle = {
    getFile: async () => ({ text: async () => content ?? '' }),
    createWritable: async () => ({ write: async (value: string) => writes.push(value), close: async () => {} }),
  };
  return {
    calls,
    writes,
    handle: {
      name: 'folder',
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        calls.push({ name, create: options?.create });
        if (error) throw error;
        if (content === undefined && !options?.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
        return fileHandle;
      },
    } as unknown as FileSystemDirectoryHandle,
  };
}

function newProjectDirectory(options: {
  files?: string[];
  src?: 'missing' | 'directory' | 'file';
  srcFiles?: string[];
  errorAt?: string;
  failWriteAt?: string;
} = {}) {
  const operations: string[] = [];
  const writes = new Map<string, string>();
  const rootFiles = new Set(options.files);
  const srcFiles = new Set(options.srcFiles);
  let src = options.src ?? 'missing';

  const missing = () => Object.assign(new Error('missing'), { name: 'NotFoundError' });
  const denied = () => Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const mismatch = () => Object.assign(new Error('not a directory'), { name: 'TypeMismatchError' });
  const file = (path: string) => ({
    createWritable: async () => {
      operations.push(`writable:${path}`);
      return {
        write: async (value: string) => {
          operations.push(`write:${path}`);
          if (options.failWriteAt === path) throw new Error('write failed');
          writes.set(path, value);
        },
        close: async () => operations.push(`close:${path}`),
      };
    },
  });
  const getFile = (files: Set<string>, prefix: string) => async (name: string, create?: { create?: boolean }) => {
    const path = `${prefix}${name}`;
    operations.push(`file:${path}:${create?.create === true ? 'create' : 'read'}`);
    if (options.errorAt === path) throw denied();
    if (!files.has(name)) {
      if (!create?.create) throw missing();
      files.add(name);
    }
    return file(path);
  };
  const srcHandle = { getFileHandle: getFile(srcFiles, 'src/') } as unknown as FileSystemDirectoryHandle;

  return {
    operations,
    writes,
    handle: {
      name: 'folder',
      getFileHandle: getFile(rootFiles, ''),
      getDirectoryHandle: async (name: string, create?: { create?: boolean }) => {
        operations.push(`dir:${name}:${create?.create === true ? 'create' : 'read'}`);
        if (options.errorAt === name) throw denied();
        if (name !== 'src' || src === 'file') throw mismatch();
        if (src === 'missing') {
          if (!create?.create) throw missing();
          src = 'directory';
        }
        return srcHandle;
      },
    } as unknown as FileSystemDirectoryHandle,
  };
}

describe('project config file boundary', () => {
  it('gives punctuation-distinct source paths distinct tree identities', async () => {
    const handle = {
      name: 'folder',
      values: async function* () {
        yield { kind: 'file', name: 'a-b.st' } as FileSystemHandle;
        yield { kind: 'file', name: 'a.b.st' } as FileSystemHandle;
      },
      getFileHandle: async () => ({ getFile: async () => ({ text: async () => '' }) }),
    } as unknown as FileSystemDirectoryHandle;

    const tree = await readDirectoryRecursive(handle);

    expect(tree.children?.map((file) => file.id)).toEqual(['file:a-b.st', 'file:a.b.st']);
  });

  it('copies a complete canonical project without touching a conflicting destination', async () => {
    const files = new Map<string, string>();
    const operations: string[] = [];
    const missing = () => Object.assign(new Error('missing'), { name: 'NotFoundError' });
    const directory = (prefix: string): FileSystemDirectoryHandle => ({
      name: prefix || 'folder',
      getFileHandle: async (name: string, options?: FileSystemGetFileOptions) => {
        const path = `${prefix}${name}`;
        operations.push(`file:${path}:${options?.create ? 'create' : 'read'}`);
        if (!files.has(path)) {
          if (!options?.create) throw missing();
          files.set(path, '');
        }
        return {
          getFile: async () => ({ size: files.get(path)?.length ?? 0, text: async () => files.get(path) ?? '' }),
          createWritable: async () => ({ write: async (content: string) => { operations.push(`write:${path}`); files.set(path, content); }, close: async () => {} }),
        } as unknown as FileSystemFileHandle;
      },
      getDirectoryHandle: async (name: string, options?: FileSystemGetDirectoryOptions) => {
        const path = `${prefix}${name}/`;
        operations.push(`dir:${path}:${options?.create ? 'create' : 'read'}`);
        if (files.has(path.slice(0, -1))) throw Object.assign(new Error('not a directory'), { name: 'TypeMismatchError' });
        if (!options?.create && ![...files.keys()].some((file) => file.startsWith(path))) throw missing();
        return directory(path);
      },
    } as unknown as FileSystemDirectoryHandle);

    const config = { ...DEFAULT_ZPLC_CONFIG, name: 'copied', $schema: '../../schema.json' } as typeof DEFAULT_ZPLC_CONFIG & { $schema: string };
    await expect(copyProjectToFolder(directory(''), config, [
      { path: 'src/main.st', content: 'PROGRAM Main END_PROGRAM' },
      { path: 'tests/main.scenario.json', content: '{"schemaVersion":1}' },
      { path: 'src/firmware.hex', content: '0000' },
    ])).resolves.toMatchObject({ name: 'copied', schemaVersion: 2 });

    expect(files.get('src/main.st')).toBe('PROGRAM Main END_PROGRAM');
    expect(files.get('tests/main.scenario.json')).toBe('{"schemaVersion":1}');
    expect(files.get('src/firmware.hex')).toBe('0000');
    expect(files.get('zplc.json')).toContain('"schemaVersion": 2');
    expect(files.get('zplc.json')).not.toContain('$schema');
    expect(operations.filter((operation) => operation.startsWith('write:')).at(-1)).toBe('write:zplc.json');

    const writesBeforeConflict = operations.filter((operation) => operation.startsWith('write:')).length;
    await expect(copyProjectToFolder(directory(''), config, [{ path: 'src/main.st', content: 'changed' }])).rejects.toThrow('src/main.st already exists');
    expect(operations.filter((operation) => operation.startsWith('write:'))).toHaveLength(writesBeforeConflict);
  });

  it('preflights every destination and rejects portable-unsafe paths before writing', async () => {
    const files = new Map<string, string>([['tests/later.scenario.json', 'existing']]);
    const writes: string[] = [];
    const missing = () => Object.assign(new Error('missing'), { name: 'NotFoundError' });
    const directory = (prefix = ''): FileSystemDirectoryHandle => ({
      name: 'folder',
      getFileHandle: async (name: string, options?: FileSystemGetFileOptions) => {
        const path = `${prefix}${name}`;
        if (!files.has(path)) { if (!options?.create) throw missing(); files.set(path, ''); }
        return { createWritable: async () => ({ write: async (content: string) => { writes.push(path); files.set(path, content); }, close: async () => {} }) } as unknown as FileSystemFileHandle;
      },
      getDirectoryHandle: async (name: string, options?: FileSystemGetDirectoryOptions) => {
        const path = `${prefix}${name}`;
        if (files.has(path)) throw Object.assign(new Error('not a directory'), { name: 'TypeMismatchError' });
        if (!options?.create && ![...files.keys()].some((file) => file.startsWith(`${path}/`))) throw missing();
        return directory(`${path}/`);
      },
    } as unknown as FileSystemDirectoryHandle);
    const config = { ...DEFAULT_ZPLC_CONFIG, name: 'copy' };
    await expect(copyProjectToFolder(directory(), config, [{ path: 'src/first.st', content: 'first' }, { path: 'tests/later.scenario.json', content: 'later' }])).rejects.toThrow('tests/later.scenario.json already exists');
    expect(writes).toEqual([]);

    for (const path of ['', '/absolute.st', 'C:/drive.st', 'src\\windows.st', './src/main.st', 'src/../main.st', 'src/./main.st', 'src/\0main.st']) {
      await expect(copyProjectToFolder(directory(), config, [{ path, content: '' }])).rejects.toThrow(/unsafe path/i);
    }
    await expect(copyProjectToFolder(directory(), config, [{ path: 'src/A.st', content: '' }, { path: 'src/a.st', content: '' }])).rejects.toThrow(/duplicate/i);
    await expect(copyProjectToFolder(directory(), config, [{ path: 'ZPLC.JSON', content: '' }])).rejects.toThrow(/zplc\.json/i);
    files.set('src', 'file');
    await expect(copyProjectToFolder(directory(), config, [{ path: 'src/main.st', content: '' }])).rejects.toThrow(/unable to inspect/i);
    expect(writes).toEqual([]);
  });

  it('canonicalizes a valid legacy local configuration', async () => {
    const directory = fakeDirectory(valid);
    await expect(readProjectConfig(directory.handle)).resolves.toMatchObject({
      kind: 'valid',
      config: { schemaVersion: 2 },
      changed: true,
      changes: [
        { op: 'add', path: '/schemaVersion' },
        { op: 'remove', path: '/tasks/0/file' },
        { op: 'add', path: '/tasks/0/interval_ms' },
        { op: 'add', path: '/tasks/0/priority' },
        { op: 'add', path: '/tasks/0/programs' },
        { op: 'add', path: '/tasks/0/trigger' },
      ],
    });
    expect(directory.writes).toEqual([]);
  });

  it('reports no migration changes for canonical v2 configuration', async () => {
    const directory = fakeDirectory(JSON.stringify({
      schemaVersion: 2,
      name: 'folder',
      version: '1.0.0',
      tasks: [{ name: 'main', interval_ms: 10, trigger: 'cyclic', priority: 1, programs: ['Main.st'] }],
    }));
    await expect(readProjectConfig(directory.handle)).resolves.toMatchObject({ kind: 'valid', changed: false, changes: [] });
    expect(directory.writes).toEqual([]);
  });

  it('rejects oversized manifests before reading their text or writing files', async () => {
    let textCalled = false;
    const directory = {
      writes: [] as string[],
      handle: {
        name: 'folder',
        getFileHandle: async () => ({
          getFile: async () => ({ size: 128 * 1024 + 1, text: async () => { textCalled = true; return valid; } }),
        }),
      } as unknown as FileSystemDirectoryHandle,
    };

    await expect(readProjectConfig(directory.handle)).resolves.toEqual({
      kind: 'invalid',
      diagnostics: [{ path: '$', message: 'Project configuration exceeds the size limit' }],
    });
    expect(textCalled).toBe(false);
    expect(directory.writes).toEqual([]);
  });

  it('distinguishes invalid files from missing files without creating one', async () => {
    const invalid = fakeDirectory('{ not json');
    await expect(readProjectConfig(invalid.handle)).resolves.toMatchObject({ kind: 'invalid' });
    expect(invalid.calls).toEqual([{ name: 'zplc.json', create: undefined }]);

    const missing = fakeDirectory();
    await expect(readProjectConfig(missing.handle)).resolves.toEqual({ kind: 'missing' });

    const denied = fakeDirectory(undefined, Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    await expect(readProjectConfig(denied.handle)).resolves.toMatchObject({ kind: 'invalid' });

    const secret = 'do-not-log';
    const sensitive = fakeDirectory(JSON.stringify({ name: 'folder', version: '1.0.0', tasks: [{ name: 'main', file: 'Main.st' }], vendor: { api_key: secret } }));
    const result = await readProjectConfig(sensitive.handle);
    expect(result).toMatchObject({ kind: 'invalid' });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sensitive.calls).toEqual([{ name: 'zplc.json', create: undefined }]);
  });

  it('validates before creating or truncating zplc.json', async () => {
    const directory = fakeDirectory();
    await expect(writeProjectConfig(directory.handle, { name: 'x', version: '1.0.0', tasks: [], network: { wifi: { password: 'never-write' } } } as never)).rejects.toThrow('Project configuration is invalid');
    expect(directory.calls).toEqual([]);

    const canonical = await writeProjectConfig(directory.handle, { ...DEFAULT_ZPLC_CONFIG, name: 'x' });
    expect(canonical.schemaVersion).toBe(2);
    expect(directory.calls).toEqual([{ name: 'zplc.json', create: true }]);
    expect(directory.writes.join('')).toContain('"schemaVersion": 2');

    const nonJson = fakeDirectory();
    await expect(writeProjectConfig(nonJson.handle, { ...DEFAULT_ZPLC_CONFIG, vendor: { revision: BigInt(1) } } as never)).rejects.toThrow();
    expect(nonJson.calls).toEqual([]);
    expect(nonJson.writes).toEqual([]);
  });

  it('does not create or truncate any scaffold target when one already exists', async () => {
    for (const conflictingPath of ['zplc.json', '.gitignore', 'src/main.st', 'src/globals.gvl']) {
      const directory = newProjectDirectory(
        conflictingPath.startsWith('src/')
          ? { src: 'directory', srcFiles: [conflictingPath.substring('src/'.length)] }
          : { files: [conflictingPath] },
      );

      await expect(createNewProject(directory.handle, 'folder')).rejects.toThrow(conflictingPath);
      expect(directory.operations.some((operation) => operation.endsWith(':create') || operation.startsWith('writable:') || operation.startsWith('write:'))).toBe(false);
    }
  });

  it('fails closed when a scaffold target cannot be inspected', async () => {
    const denied = newProjectDirectory({ errorAt: '.gitignore' });
    await expect(createNewProject(denied.handle, 'folder')).rejects.toThrow('.gitignore');
    expect(denied.operations.some((operation) => operation.endsWith(':create') || operation.startsWith('writable:') || operation.startsWith('write:'))).toBe(false);

    const wrongType = newProjectDirectory({ src: 'file' });
    await expect(createNewProject(wrongType.handle, 'folder')).rejects.toThrow('src');
    expect(wrongType.operations.some((operation) => operation.endsWith(':create') || operation.startsWith('writable:') || operation.startsWith('write:'))).toBe(false);
  });

  it('creates exactly the four scaffold files after all destinations are absent', async () => {
    const directory = newProjectDirectory();
    await expect(createNewProject(directory.handle, 'folder')).resolves.toMatchObject({ name: 'folder' });

    expect(directory.operations.filter((operation) => operation.endsWith(':create'))).toEqual([
      'file:zplc.json:create',
      'dir:src:create',
      'file:src/main.st:create',
      'file:src/globals.gvl:create',
      'file:.gitignore:create',
    ]);
    expect(directory.operations.filter((operation) => operation.startsWith('write:'))).toEqual([
      'write:zplc.json',
      'write:src/main.st',
      'write:src/globals.gvl',
      'write:.gitignore',
    ]);
    expect(directory.writes.get('zplc.json')).toContain('"name": "folder"');
    expect(directory.writes.get('src/main.st')).toContain('PROGRAM Main');
    expect(directory.writes.get('src/globals.gvl')).toContain('VAR_GLOBAL');
    expect(directory.writes.get('.gitignore')).toContain('build/');
  });

  it('allows an existing empty src directory', async () => {
    const directory = newProjectDirectory({ src: 'directory' });
    await expect(createNewProject(directory.handle, 'folder')).resolves.toMatchObject({ name: 'folder' });
    expect(directory.operations).toContain('dir:src:read');
  });

  it('reports a potentially incomplete project when scaffolding fails after preflight', async () => {
    const directory = newProjectDirectory({ failWriteAt: 'src/main.st' });

    await expect(createNewProject(directory.handle, 'folder')).rejects.toThrow(/incomplete.*review/i);
    expect(directory.operations).toContain('write:zplc.json');
    expect(directory.operations).toContain('write:src/main.st');
    expect(directory.writes.get('zplc.json')).toContain('"name": "folder"');
    expect(directory.writes.has('src/main.st')).toBe(false);
  });
});
