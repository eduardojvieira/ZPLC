import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createProjectFiles } from '../../electron/projectFiles';
import { PROJECT_FILES_CHANNEL, PROJECT_FILES_OPS, type ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { DEFAULT_ZPLC_CONFIG } from '../types';
import {
  copyProjectToFolder,
  createNewProject,
  isFileSystemAccessSupported,
  loadFileFromTree,
  openDirectoryPicker,
  readDirectoryRecursive,
  readProjectConfig,
  writeFileContent,
} from './fileSystem';

/**
 * The renderer code of the open, create, save and example flows, run over the real project-files module of the
 * main process (the same `handle` that sits behind the IPC channels) on real temporary folders.
 */
let sandbox: string;
let project: string;
let dialogAnswer: string | null;
let pickerCalls: number;

function loopbackBridge(): ProjectFilesBridge {
  const files = createProjectFiles(async () => dialogAnswer);
  const send = (channel: string, args: unknown[]) => files.handle(1, channel, args);
  const calls = PROJECT_FILES_OPS.map((op) => [op, (request: object) => send(PROJECT_FILES_CHANNEL[op], [request])] as const);
  return { chooseFolder: () => send(PROJECT_FILES_CHANNEL.chooseFolder, []), ...Object.fromEntries(calls) } as ProjectFilesBridge;
}

function installWindow(bridge: ProjectFilesBridge | undefined): void {
  const showDirectoryPicker = async () => { pickerCalls += 1; throw new Error('the renderer must not open a browser picker'); };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge ? { electronAPI: { isElectron: true, projectFiles: bridge }, showDirectoryPicker } : {},
  });
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'zplc-filesystem-bridge-')));
  project = path.join(sandbox, 'plant');
  mkdirSync(project);
  dialogAnswer = project;
  pickerCalls = 0;
  installWindow(loopbackBridge());
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  rmSync(sandbox, { recursive: true, force: true });
});

function seedProject(): void {
  writeFileSync(path.join(project, 'zplc.json'), JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'plant' }));
  mkdirSync(path.join(project, 'src'));
  writeFileSync(path.join(project, 'src', 'main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  writeFileSync(path.join(project, 'src', 'notes.txt'), 'not a PLC source');
  mkdirSync(path.join(project, 'node_modules'));
  writeFileSync(path.join(project, 'node_modules', 'ignored.st'), 'ignored');
}

describe('folder access in Electron', () => {
  it('is available through the bridge alone, and unavailable with neither bridge nor picker', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { isElectron: true, projectFiles: loopbackBridge() } } });
    expect('showDirectoryPicker' in window).toBe(false);
    expect(isFileSystemAccessSupported()).toBe(true);
    installWindow(undefined);
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('keeps using the browser picker where there is no bridge', async () => {
    const handle = { name: 'from-browser' } as FileSystemDirectoryHandle;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { showDirectoryPicker: async () => handle } });
    expect(isFileSystemAccessSupported()).toBe(true);
    expect(await openDirectoryPicker()).toBe(handle);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { showDirectoryPicker: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); } } });
    expect(await openDirectoryPicker()).toBeNull();
  });

  it('opens the folder the main process chose and never calls the browser picker', async () => {
    const handle = await openDirectoryPicker();
    expect(handle?.name).toBe('plant');
    expect(pickerCalls).toBe(0);
  });

  it('returns nothing when the dialog is cancelled', async () => {
    dialogAnswer = null;
    expect(await openDirectoryPicker()).toBeNull();
    expect(pickerCalls).toBe(0);
  });

  it('explains a folder that cannot be used, without its path', async () => {
    dialogAnswer = path.join(sandbox, 'missing');
    let error: Error | undefined;
    try { await openDirectoryPicker(); } catch (caught) { error = caught as Error; }
    expect(error?.name).toBe('NotFoundError');
    expect(error?.message).not.toContain(sandbox);
  });
});

describe('open, edit, save and reopen on a real folder', () => {
  it('reads the project, saves an edit to disk and reads it back after reopening', async () => {
    seedProject();
    const root = (await openDirectoryPicker())!;
    const config = await readProjectConfig(root);
    expect(config.kind).toBe('valid');
    const tree = await readDirectoryRecursive(root);
    expect(tree.name).toBe('plant');
    expect(tree.children?.map((child) => child.name)).toEqual(['src']);
    expect(tree.children?.[0].children?.map((child) => child.name)).toEqual(['main.st']);

    const loaded = (await loadFileFromTree(tree.children![0].children![0]))!;
    expect(loaded.content).toBe('PROGRAM Main\nEND_PROGRAM\n');
    await writeFileContent(loaded.handle!, 'PROGRAM Main\n  Counter := Counter + 1; (* ñ *)\nEND_PROGRAM\r\n');
    expect(readFileSync(path.join(project, 'src', 'main.st'), 'utf8')).toBe('PROGRAM Main\n  Counter := Counter + 1; (* ñ *)\nEND_PROGRAM\r\n');
  });

  it('lists a folder that holds nothing yet (a new folder), and still hides one that holds only files Studio does not read', async () => {
    seedProject();
    mkdirSync(path.join(project, 'src', 'drivers'));
    mkdirSync(path.join(project, 'docs'));
    writeFileSync(path.join(project, 'docs', 'README.md'), 'notes');
    const tree = await readDirectoryRecursive((await openDirectoryPicker())!);
    const src = tree.children!.find((child) => child.name === 'src')!;
    expect(src.children!.map((child) => child.name)).toEqual(['drivers', 'main.st']);
    expect(src.children![0]!.children).toEqual([]);
    expect(tree.children!.map((child) => child.name)).toEqual(['src']);
  });

  it('shows the saved content after the folder is opened again', async () => {
    seedProject();
    const first = (await openDirectoryPicker())!;
    const firstTree = await readDirectoryRecursive(first);
    const file = (await loadFileFromTree(firstTree.children![0].children![0]))!;
    await writeFileContent(file.handle!, 'saved');

    const second = (await openDirectoryPicker())!;
    const secondTree = await readDirectoryRecursive(second);
    expect((await loadFileFromTree(secondTree.children![0].children![0]))!.content).toBe('saved');
  });

  it('refuses a handle from a folder that is no longer the open one', async () => {
    seedProject();
    const first = (await openDirectoryPicker())!;
    const stale = await first.getDirectoryHandle('src');
    const other = path.join(sandbox, 'other');
    mkdirSync(other);
    dialogAnswer = other;
    await openDirectoryPicker();
    let error: Error | undefined;
    try { await stale.getFileHandle('main.st'); } catch (caught) { error = caught as Error; }
    expect(error?.name).toBe('ProjectFolderClosedError');
    expect(readFileSync(path.join(project, 'src', 'main.st'), 'utf8')).toBe('PROGRAM Main\nEND_PROGRAM\n');
  });

  it('does not read a zplc.json that is a link leaving the folder', async () => {
    const outside = path.join(sandbox, 'elsewhere.json');
    writeFileSync(outside, JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'stolen' }));
    symlinkSync(outside, path.join(project, 'zplc.json'));
    const result = await readProjectConfig((await openDirectoryPicker())!);
    expect(result.kind).toBe('invalid');
  });
});

describe('create and copy an example on a real folder', () => {
  it('creates the project files in an empty folder, and refuses to overwrite them', async () => {
    const root = (await openDirectoryPicker())!;
    const config = await createNewProject(root, 'plant');
    expect(config.name).toBe('plant');
    for (const file of ['zplc.json', '.gitignore', 'src/main.st', 'src/globals.gvl']) expect(existsSync(path.join(project, file))).toBe(true);
    expect(readFileSync(path.join(project, 'src', 'main.st'), 'utf8')).toContain('PROGRAM Main');
    writeFileSync(path.join(project, 'src', 'main.st'), 'edited');
    await expect(createNewProject(root, 'plant')).rejects.toThrow('already exists');
    expect(readFileSync(path.join(project, 'src', 'main.st'), 'utf8')).toBe('edited');
  });

  it('copies an example, nested folders included, and reads it back as a valid project', async () => {
    const root = (await openDirectoryPicker())!;
    const files = [
      { path: 'src/Motor.st', content: 'PROGRAM Motor\nEND_PROGRAM\n' },
      { path: 'tests/motor.scenario.json', content: '{"scenario":true}' },
    ];
    await copyProjectToFolder(root, { ...DEFAULT_ZPLC_CONFIG, name: 'motor' }, files);
    expect(readFileSync(path.join(project, 'tests', 'motor.scenario.json'), 'utf8')).toBe('{"scenario":true}');
    const config = await readProjectConfig(root);
    expect(config.kind === 'valid' && config.config.name).toBe('motor');
    expect((await readDirectoryRecursive(root)).children?.map((child) => child.name)).toEqual(['src']);
  });

  it('stops before writing when an example file already exists', async () => {
    seedProject();
    const root = (await openDirectoryPicker())!;
    await expect(copyProjectToFolder(root, { ...DEFAULT_ZPLC_CONFIG, name: 'motor' }, [{ path: 'src/main.st', content: 'OVERWRITTEN' }])).rejects.toThrow();
    expect(readFileSync(path.join(project, 'src', 'main.st'), 'utf8')).toBe('PROGRAM Main\nEND_PROGRAM\n');
  });
});
