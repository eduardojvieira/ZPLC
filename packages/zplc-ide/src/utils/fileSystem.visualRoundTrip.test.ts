import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createProjectFiles } from '../../electron/projectFiles';
import { PROJECT_FILES_CHANNEL, PROJECT_FILES_OPS, type ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { DEFAULT_ZPLC_CONFIG } from '../types';
import { openDirectoryPicker, readDirectoryRecursive } from './fileSystem';

// The store imports the bundled-example loader, which only exists under Vite (import.meta.glob); opening a file never touches it.
await mock.module('./projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
const { useIDEStore } = await import('../store/useIDEStore');

/**
 * LNG-014 through the real open and save of Studio: the folder reader and writer of the main process, the store's
 * openFile and saveFile. A Ladder, FBD or SFC file that is opened and saved with no edit is the file it was, whatever
 * layout it was written in: the editors read a model from the text and the store keeps the text.
 */
let sandbox: string;
let project: string;
let session = 9000;

function loopbackBridge(): ProjectFilesBridge {
  const files = createProjectFiles(async () => project);
  const send = (channel: string, args: unknown[]) => files.handle(1, channel, args);
  const calls = PROJECT_FILES_OPS.map((op) => [op, (request: object) => send(PROJECT_FILES_CHANNEL[op], [request])] as const);
  return { chooseFolder: () => send(PROJECT_FILES_CHANNEL.chooseFolder, []), ...Object.fromEntries(calls) } as ProjectFilesBridge;
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'zplc-visual-roundtrip-')));
  project = path.join(sandbox, 'plant');
  mkdirSync(path.join(project, 'src'), { recursive: true });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electronAPI: { isElectron: true, projectFiles: loopbackBridge() } },
  });
  writeFileSync(path.join(project, 'zplc.json'), JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'plant' }));
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  rmSync(sandbox, { recursive: true, force: true });
});

const projects = path.join(import.meta.dir, '../../projects');
const committed = (relative: string) => readFileSync(path.join(projects, relative), 'utf8');

const FILES: Array<[string, string, string]> = [
  ['an LD file as committed', 'main.ld.json', committed('blinky/src/main.ld.json')],
  ['an FBD file as committed', 'main.fbd.json', committed('blinky_fbd/src/main.fbd.json')],
  ['an SFC file as committed', 'main.sfc.json', committed('blinky_sfc/src/main.sfc.json')],
  ['an LD file in the layout of another tool', 'tool.ld.json', JSON.stringify(JSON.parse(committed('motor_control/src/main.ld.json')))],
  [
    'a file with CRLF line ends, a tab and no newline at the end',
    'crlf.sfc.json',
    committed('blinky_sfc/src/main.sfc.json').replace(/\n/g, '\r\n').replace(/\n$/, '').replace('  ', '\t'),
  ],
];

describe('LNG-014 open and save without an edit', () => {
  it.each(FILES)('leaves %s byte for byte as it was', async (_label, name, text) => {
    writeFileSync(path.join(project, 'src', name), text);
    const directoryHandle = (await openDirectoryPicker())!;
    const fileTree = await readDirectoryRecursive(directoryHandle);
    session += 1;
    useIDEStore.setState({
      isProjectOpen: true,
      projectSession: session,
      directoryHandle,
      fileTree,
      loadedFiles: new Map(),
      openTabs: [],
      activeFileId: null,
    });

    await useIDEStore.getState().openFile(`file:src/${name}`);
    const opened = useIDEStore.getState().loadedFiles.get(`file:src/${name}`);
    expect(opened?.content).toBe(text);
    expect(await useIDEStore.getState().saveFile(`file:src/${name}`, { quiet: true })).toBe(true);

    expect(readFileSync(path.join(project, 'src', name), 'utf8')).toBe(text);
  });
});
