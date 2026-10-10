import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createProjectFiles } from '../../electron/projectFiles';
import { PROJECT_FILES_CHANNEL, PROJECT_FILES_OPS, type ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { readWorkspace, type WorkspaceSource } from '../cli/workspace';
import {
  DEFAULT_ZPLC_CONFIG,
  getExtensionForLanguage,
  getLanguageFromFilename,
  PLC_LANGUAGES,
  type FileTreeNode,
  type PLCLanguage,
} from '../types';
import { FileNameTakenError, listTaskPrograms, loadFileFromTree, openDirectoryPicker, readDirectoryRecursive } from './fileSystem';
import { resolveProgramSource } from './programSourceResolution';

// The store imports the bundled-example loader, which only exists under Vite (import.meta.glob); New File never touches it.
await mock.module('./projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
const { useIDEStore } = await import('../store/useIDEStore');

/**
 * LX-7: a Ladder, FBD or SFC file made with New File has to be there when the project is opened again.
 * The New File flow is the store's createFile; the reopen is the renderer's folder reader, and the build reads
 * the same folder through the workspace reader. All three run here over a real temporary folder, through the
 * project-files module of the main process (the same `handle` that sits behind the IPC channels).
 */
let sandbox: string;
let project: string;
let dialogAnswer: string | null;
let session = 7000;

function loopbackBridge(): ProjectFilesBridge {
  const files = createProjectFiles(async () => dialogAnswer);
  const send = (channel: string, args: unknown[]) => files.handle(1, channel, args);
  const calls = PROJECT_FILES_OPS.map((op) => [op, (request: object) => send(PROJECT_FILES_CHANNEL[op], [request])] as const);
  return { chooseFolder: () => send(PROJECT_FILES_CHANNEL.chooseFolder, []), ...Object.fromEntries(calls) } as ProjectFilesBridge;
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'zplc-visual-files-')));
  project = path.join(sandbox, 'plant');
  mkdirSync(project);
  dialogAnswer = project;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { isElectron: true, projectFiles: loopbackBridge() } } });
  writeFileSync(path.join(project, 'zplc.json'), JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'plant' }));
  mkdirSync(path.join(project, 'src'));
  writeFileSync(path.join(project, 'src', 'main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  rmSync(sandbox, { recursive: true, force: true });
});

function seed(files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(project, 'src', name), content);
}

/** The folder as the renderer shows it after opening the project (again). */
async function reopen(): Promise<FileTreeNode[]> {
  const tree = await readDirectoryRecursive((await openDirectoryPicker())!);
  return tree.children?.find((node) => node.name === 'src')?.children ?? [];
}

/** Open the project into the store the way the Explorer sees it, so createFile works on it. */
async function openIntoStore(): Promise<void> {
  const directoryHandle = (await openDirectoryPicker())!;
  const fileTree = await readDirectoryRecursive(directoryHandle);
  session += 1;
  useIDEStore.setState({ isProjectOpen: true, projectSession: session, directoryHandle, fileTree, loadedFiles: new Map(), openTabs: [], activeFileId: null });
}

async function workspaceSources(): Promise<WorkspaceSource[]> {
  const result = await readWorkspace(project);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.workspace.sources;
}

const listed = (nodes: FileTreeNode[]) => Object.fromEntries(nodes.map((node) => [node.name, node.language]));
const sourced = (sources: WorkspaceSource[]) => Object.fromEntries(sources.map((source) => [source.name, source.language]));

const CASED_NAMES: Record<string, PLCLanguage> = {
  'Upper.LD.JSON': 'LD',
  'Shout.FBD': 'FBD',
  'dot.ted.name.sfc.json': 'SFC',
  'Motor.ST': 'ST',
};

const VISUAL: Array<[PLCLanguage, string]> = [['LD', '.ld.json'], ['FBD', '.fbd.json'], ['SFC', '.sfc.json']];

describe('the extension the New File flow gives each language', () => {
  // Fails without the canonical extensions in PLC_LANGUAGES (types/index.ts): getExtensionForLanguage returned .ld, .fbd, .sfc.
  it.each(VISUAL)('gives %s the %s name family that the folder readers and the bundled examples use', (language, extension) => {
    expect(getExtensionForLanguage(language)).toBe(extension);
    expect(PLC_LANGUAGES[language].extension).toBe(extension);
  });

  it('keeps the text languages on .st and .il, and every extension reads back as its own language', () => {
    expect(getExtensionForLanguage('ST')).toBe('.st');
    expect(getExtensionForLanguage('IL')).toBe('.il');
    for (const language of Object.keys(PLC_LANGUAGES) as PLCLanguage[]) {
      expect(getLanguageFromFilename(`file${getExtensionForLanguage(language)}`)).toBe(language);
    }
  });
});

describe('a file made with New File', () => {
  // Fails without the canonical extension (types/index.ts): the file is saved as pump.ld and the folder reader skips it.
  it.each(VISUAL)('is listed again with its content after the project is reopened (%s)', async (language, extension) => {
    await openIntoStore();
    const id = await useIDEStore.getState().createFile('pump', language);
    expect(id).toBe(`file:src/pump${extension}`);

    const onDisk = readFileSync(path.join(project, 'src', `pump${extension}`), 'utf8');
    expect(JSON.parse(onDisk).name).toBe('NewProgram');
    expect(useIDEStore.getState().loadedFiles.get(id)?.content).toBe(onDisk);

    const reopened = await reopen();
    expect(listed(reopened)[`pump${extension}`]).toBe(language);
    const node = reopened.find((candidate) => candidate.name === `pump${extension}`)!;
    expect((await loadFileFromTree(node))?.content).toBe(onDisk);
  });

  // Fails without the canonical extension (types/index.ts) or without .ld/.fbd/.sfc in the workspace reader (cli/workspace.ts).
  it.each(VISUAL)('is found by the build under its task program name (%s)', async (language, extension) => {
    await openIntoStore();
    await useIDEStore.getState().createFile('pump', language);

    const sources = await workspaceSources();
    expect(sourced(sources)[`pump${extension}`]).toBe(language);
    // zplc.json names the program the short way ("pump.ld"), the way Project Settings writes it.
    expect(resolveProgramSource(`pump${extension.replace('.json', '')}`, sources)).toMatchObject({ name: 'pump', language, sourceRef: `src/pump${extension}` });
  });

  // Fails without the canonical extension (types/index.ts): the first file is saved as pump.ld, next to the pump.ld.json written here.
  it('refuses a second file with the same name instead of overwriting the first', async () => {
    await openIntoStore();
    await useIDEStore.getState().createFile('pump', 'LD');
    writeFileSync(path.join(project, 'src', 'pump.ld.json'), '{"name":"edited"}');

    await expect(useIDEStore.getState().createFile('pump', 'LD')).rejects.toThrow('already exists');
    expect(readFileSync(path.join(project, 'src', 'pump.ld.json'), 'utf8')).toBe('{"name":"edited"}');
    expect(readdirSync(path.join(project, 'src')).filter((name) => name.startsWith('pump'))).toEqual(['pump.ld.json']);
  });

  it('keeps extra dots in the name and does not double a canonical extension that was typed', async () => {
    await openIntoStore();
    expect(await useIDEStore.getState().createFile('my.pump.v2', 'LD')).toBe('file:src/my.pump.v2.ld.json');
    expect(await useIDEStore.getState().createFile('typed.fbd.json', 'FBD')).toBe('file:src/typed.fbd.json');

    expect(listed(await reopen())).toMatchObject({ 'my.pump.v2.ld.json': 'LD', 'typed.fbd.json': 'FBD' });
  });

  it('is still listed after a reopen when the name was typed with an uppercase extension', async () => {
    await openIntoStore();
    const id = await useIDEStore.getState().createFile('SHOUT.LD.JSON', 'LD');

    expect(listed(await reopen())[id.replace('file:src/', '')]).toBe('LD');
  });
});

describe('the name typed in the New File dialog (LX-7b)', () => {
  // Fails without stripping a typed same-language suffix in createFile (store/useIDEStore.ts): pump.ld became pump.ld.ld.json.
  it.each([
    ['LD', 'pump.ld', 'pump.ld.json'],
    ['LD', 'pump.ld.json', 'pump.ld.json'],
    ['LD', 'PUMP.LD.JSON', 'PUMP.ld.json'],
    ['LD', 'Pump.Ld', 'Pump.ld.json'],
    ['FBD', 'mixer.fbd', 'mixer.fbd.json'],
    ['FBD', 'Mixer.FBD.Json', 'Mixer.fbd.json'],
    ['SFC', 'seq.sfc', 'seq.sfc.json'],
    ['SFC', 'SEQ.SFC', 'SEQ.sfc.json'],
    ['LD', 'x.fbd', 'x.fbd.ld.json'],
    ['FBD', 'x.ld.json', 'x.ld.json.fbd.json'],
    ['SFC', 'x.ld', 'x.ld.sfc.json'],
    ['ST', 'main2.st', 'main2.st'],
    ['IL', 'prog.il', 'prog.il'],
    ['ST', 'plain', 'plain.st'],
  ] as Array<[PLCLanguage, string, string]>)('creates %s "%s" as %s', async (language, typed, expected) => {
    await openIntoStore();
    expect(await useIDEStore.getState().createFile(typed, language)).toBe(`file:src/${expected}`);

    expect(readdirSync(path.join(project, 'src')).sort()).toEqual(['main.st', expected].sort());
    expect(listed(await reopen())[expected]).toBe(language);
  });
});

describe('a name that the build already reads as an existing file (LX-7b)', () => {
  // [file already there, name typed, language, the file the creation would write, are they the same name for the build]
  const PAIRS: Array<[string, string, PLCLanguage, string, boolean]> = [
    ['pump.ld', 'pump', 'LD', 'pump.ld.json', true],
    ['pump.ld', 'pump.ld', 'LD', 'pump.ld.json', true],
    ['PUMP.LD', 'pump', 'LD', 'pump.ld.json', true],
    ['Pump.fbd', 'pump', 'FBD', 'pump.fbd.json', true],
    ['pump.sfc', 'pump', 'SFC', 'pump.sfc.json', true],
    ['Pump.LD.JSON', 'pump', 'LD', 'pump.ld.json', true],
    ['pump.ld.json', 'pump', 'LD', 'pump.ld.json', true],
    ['pump.fbd', 'pump', 'LD', 'pump.ld.json', false],
    ['pump.ld', 'pump', 'ST', 'pump.st', false],
    ['pump.ld.json', 'pumps', 'LD', 'pumps.ld.json', false],
  ];

  // The table above has to say what the build reader says, or the guard and the build would drift apart.
  it.each(PAIRS.filter((pair) => pair[0] !== pair[3]))('the build reads %s and the file made from "%s" (%s) as %s the same name: %s', async (existing, _typed, _language, wouldBe, twin) => {
    seed({ [existing]: '{}', [wouldBe]: '{}' });
    const result = await readWorkspace(project);
    expect(!result.ok && result.diagnostics.some((diagnostic) => diagnostic.code === 'WORKSPACE_DUPLICATE_SOURCE')).toBe(twin);
  });

  // Fails without the twin check in createFile (store/useIDEStore.ts): pump.ld.json was written next to the legacy pump.ld.
  it.each(PAIRS.filter((pair) => pair[4]))('refuses "%s" -> "%s" (%s) in the dialog and names the file that is already there', async (existing, typed, language) => {
    seed({ [existing]: '{"name":"mine"}' });
    await openIntoStore();

    await expect(useIDEStore.getState().createFile(typed, language)).rejects.toThrow(existing);
    // The dialog shows the message of this class in place; any other error becomes its generic failure text.
    await expect(useIDEStore.getState().createFile(typed, language)).rejects.toBeInstanceOf(FileNameTakenError);
    expect(readdirSync(path.join(project, 'src')).sort()).toEqual(['main.st', existing].sort());
    expect(readFileSync(path.join(project, 'src', existing), 'utf8')).toBe('{"name":"mine"}');
  });

  // Guards the check from refusing names the build accepts.
  it.each(PAIRS.filter((pair) => !pair[4]))('still creates "%s" -> "%s" (%s) next to a different name', async (existing, typed, language, wouldBe) => {
    seed({ [existing]: '{}' });
    await openIntoStore();

    expect(await useIDEStore.getState().createFile(typed, language)).toBe(`file:src/${wouldBe}`);
    expect((await readWorkspace(project)).ok).toBe(true);
  });
});

describe('folders written by earlier versions and by hand', () => {
  const LEGACY = { 'old.ld': '{"name":"old"}', 'old.fbd': '{"name":"old"}', 'old.sfc': '{"name":"old"}' };

  // Fails without .ld, .fbd and .sfc in the folder reader (utils/fileSystem.ts).
  it('lists *.ld, *.fbd and *.sfc in the Explorer as the language they name', async () => {
    seed(LEGACY);
    expect(listed(await reopen())).toMatchObject({ 'old.ld': 'LD', 'old.fbd': 'FBD', 'old.sfc': 'SFC' });
    const node = (await reopen()).find((candidate) => candidate.name === 'old.ld')!;
    expect((await loadFileFromTree(node))?.content).toBe('{"name":"old"}');
  });

  // Fails without .ld, .fbd and .sfc in the workspace reader (cli/workspace.ts), which the build and the CLI use.
  it('reads *.ld, *.fbd and *.sfc into the build workspace, and a task finds them by name', async () => {
    seed(LEGACY);
    const sources = await workspaceSources();
    expect(sourced(sources)).toMatchObject({ 'old.ld': 'LD', 'old.fbd': 'FBD', 'old.sfc': 'SFC' });
    expect(resolveProgramSource('old.ld', sources)).toMatchObject({ name: 'old', language: 'LD', sourceRef: 'src/old.ld' });
    expect(resolveProgramSource('old.sfc', sources)).toMatchObject({ name: 'old', language: 'SFC', sourceRef: 'src/old.sfc' });
  });

  const CASED = CASED_NAMES;
  const IGNORED = ['notes.json', 'link.ld.txt', 'x.ld.json.bak', 'sfc', 'ld.json.old'];

  // Fails without the case-insensitive match in the folder reader (utils/fileSystem.ts).
  it('lists names with uppercase extensions and extra dots, and still ignores unrelated names', async () => {
    seed({ ...Object.fromEntries(Object.keys(CASED).map((name) => [name, '{}'])), ...Object.fromEntries(IGNORED.map((name) => [name, 'x'])) });

    expect(listed(await reopen())).toEqual({ 'main.st': 'ST', ...CASED });
    expect(sourced(await workspaceSources())).toEqual({ 'main.st': 'ST', ...CASED });
  });

  // Fails without the legacy twin rule in the workspace reader (cli/workspace.ts): the build would silently pick one of the two.
  it('fails the build loudly when main.ld and main.ld.json both exist, as it does for names that differ only by case', async () => {
    seed({ 'main.ld': '{}', 'main.ld.json': '{}' });
    expect(await readWorkspace(project)).toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_DUPLICATE_SOURCE' }] });

    rmSync(path.join(project, 'src', 'main.ld'));
    expect((await readWorkspace(project)).ok).toBe(true);
    seed({ 'Main.LD.JSON': '{}' });
    expect(await readWorkspace(project)).toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_DUPLICATE_SOURCE' }] });
  });
});

describe('the program picker in Project Settings (LX-7b)', () => {
  const asTree = (children: FileTreeNode[]): FileTreeNode => ({ id: 'dir:/', name: 'plant', type: 'directory', path: '/', children });

  // Fails while the picker keeps its own extension list (utils/fileSystem.ts listTaskPrograms): the legacy names were missing.
  it('offers every file the build reads, under the name a task uses for it', async () => {
    seed({ 'old.ld': '{}', 'old.fbd': '{}', 'old.sfc': '{}', 'new.ld.json': '{}', 'Upper.LD.JSON': '{}', 'il_prog.il': 'x', 'Globals.gvl': 'VAR_GLOBAL END_VAR', 'notes.json': 'x', 'x.ld.json.bak': 'x' });

    const picker = listTaskPrograms(asTree(await reopen()));
    expect(picker).toEqual(['Upper.LD', 'il_prog.il', 'main.st', 'new.ld', 'old.fbd', 'old.ld', 'old.sfc'].sort());
    // A GVL is listed in the Explorer but is not a program.
    expect(listed(await reopen())['Globals.gvl']).toBe('ST');
    expect(picker).not.toContain('Globals.gvl');
  });

  // Fails while the picker keeps its own extension list: it must not drift away from what the build reads.
  it('offers exactly the programs the build workspace reads, whichever names the folder holds', async () => {
    seed({ ...Object.fromEntries(Object.keys(CASED_NAMES).map((name) => [name, '{}'])), 'old.ld': '{}', 'old.sfc': '{}', 'link.ld.txt': 'x', 'sfc': 'x', 'ld.json.old': 'x' });

    const fromBuild = (await workspaceSources()).map((source) => source.name.replace(/(\.(?:ld|fbd|sfc))\.json$/i, '$1'));
    expect(listTaskPrograms(asTree(await reopen()))).toEqual([...new Set(fromBuild)].sort());
  });

  it('finds programs in sub-folders and lists a program once when a folder holds both spellings of it', () => {
    const file = (name: string): FileTreeNode => ({ id: `file:${name}`, name, type: 'file', path: name, language: getLanguageFromFilename(name) });
    const folder = (name: string, children: FileTreeNode[]): FileTreeNode => ({ id: `dir:${name}`, name, type: 'directory', path: name, children });

    expect(listTaskPrograms(asTree([folder('src', [file('a.ld'), file('a.ld.json'), folder('lib', [file('b.fbd.json')])])]))).toEqual(['a.ld', 'b.fbd']);
    expect(listTaskPrograms(null)).toEqual([]);
  });
});

describe('the bundled example projects', () => {
  const projects = path.join(import.meta.dir, '..', '..', 'projects');
  // What the folder reader listed before LX-7: lower-case .st .il .ld.json .fbd.json .sfc.json .gvl, never zplc.json, never ignored folders.
  const BEFORE = ['.st', '.il', '.ld.json', '.fbd.json', '.sfc.json', '.gvl'];
  const IGNORED_DIRS = ['node_modules', '.git', 'build', 'dist', '.vscode'];
  const wasListed = (name: string) => name !== 'zplc.json' && BEFORE.some((extension) => name.endsWith(extension));

  function before(directory: string, prefix = ''): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return IGNORED_DIRS.includes(entry.name) ? [] : before(path.join(directory, entry.name), relative);
      return wasListed(entry.name) ? [relative] : [];
    });
  }

  function files(node: FileTreeNode): FileTreeNode[] {
    return node.type === 'file' ? [node] : (node.children ?? []).flatMap(files);
  }

  const examples = readdirSync(projects, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  it('are all there to check', () => {
    expect(examples.length).toBeGreaterThanOrEqual(20);
    expect(existsSync(path.join(projects, 'blinky', 'src', 'main.ld.json'))).toBe(true);
  });

  // Guards the reader change (utils/fileSystem.ts): the same file set, each in the language its name says, as before.
  it.each(examples)('%s lists the same files as before in the Explorer', async (example) => {
    dialogAnswer = path.join(projects, example);
    const nodes = files(await readDirectoryRecursive((await openDirectoryPicker())!));

    expect(nodes.map((node) => node.path).sort()).toEqual(before(dialogAnswer).sort());
    for (const node of nodes) expect(node.language).toBe(getLanguageFromFilename(node.name));
  });

  // Guards the reader change (cli/workspace.ts): the build reads the same sources as before from every example.
  it.each(examples)('%s reads the same sources as before into the build workspace', async (example) => {
    const src = path.join(projects, example, 'src');
    const result = await readWorkspace(path.join(projects, example));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const top = readdirSync(src, { withFileTypes: true }).filter((entry) => entry.isFile() && wasListed(entry.name) && !entry.name.endsWith('.gvl'));
    expect(result.workspace.sources.map((source) => source.name).sort()).toEqual(top.map((entry) => entry.name).sort());
  });
});
