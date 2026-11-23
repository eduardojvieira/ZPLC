import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createProjectFiles } from '../../electron/projectFiles';
import { PROJECT_FILES_CHANNEL, PROJECT_FILES_OPS, type ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { projectLoaderStub } from '../test/projectLoaderStub';
import { DEFAULT_ZPLC_CONFIG } from '../types';

await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { useIDEStore } = await import('./useIDEStore');
const { createTest } = await import('../projectTests/newTest');
const { newTestContext } = await import('../projectTests/useProjectTests');

const BLINK = readFileSync(join(import.meta.dir, '../../projects/first_blink/src/FirstBlink.st'), 'utf8');

describe('New test on a real project folder (TST-009)', () => {
  let sandbox: string;
  let folder: string;
  const before = { ...useIDEStore.getState() };

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'zplc-new-test-')));
    folder = join(sandbox, 'plant');
    mkdirSync(join(folder, 'src'), { recursive: true });
    writeFileSync(
      join(folder, 'zplc.json'),
      JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'plant', tasks: [{ ...DEFAULT_ZPLC_CONFIG.tasks[0], programs: ['FirstBlink.st'] }] }),
    );
    writeFileSync(join(folder, 'src', 'FirstBlink.st'), BLINK);
    const files = createProjectFiles(async () => folder);
    const send = (channel: string, args: unknown[]) => files.handle(1, channel, args);
    const calls = PROJECT_FILES_OPS.map((op) => [op, (request: object) => send(PROJECT_FILES_CHANNEL[op], [request])] as const);
    const bridge = { chooseFolder: () => send(PROJECT_FILES_CHANNEL.chooseFolder, []), ...Object.fromEntries(calls) } as ProjectFilesBridge;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { isElectron: true, projectFiles: bridge } } });
  });

  afterEach(() => {
    // the store outlives this file in the one test process: close what the test opened
    useIDEStore.getState().closeProject();
    useIDEStore.setState({ loadedFiles: before.loadedFiles, fileTree: before.fileTree, directoryHandle: before.directoryHandle });
    delete (globalThis as { window?: unknown }).window;
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('TST-009 writes the test in the tests folder, makes the folder, opens it, and never writes over a test', async () => {
    await useIDEStore.getState().openProjectFromFolder();
    const first = await createTest(newTestContext());
    expect(first).toMatchObject({ ok: true, path: 'tests/FirstBlink.scenario.json' });
    expect(readdirSync(join(folder, 'tests'))).toEqual(['FirstBlink.scenario.json']);
    const text = readFileSync(join(folder, 'tests', 'FirstBlink.scenario.json'), 'utf8');
    expect(JSON.parse(text).expectations[0].condition).toEqual({ 'FirstBlink.Lamp': false });
    const state = useIDEStore.getState();
    expect(state.activeFileId).toBe('file:tests/FirstBlink.scenario.json');
    expect(state.loadedFiles.get('file:tests/FirstBlink.scenario.json')).toMatchObject({ language: 'SCENARIO', isModified: false });
    expect(state.openTabs).toContain('file:tests/FirstBlink.scenario.json');

    // a second test takes a number; the first is as it was written, and nothing else in the project changed
    writeFileSync(join(folder, 'tests', 'FirstBlink.scenario.json'), 'MINE');
    const second = await createTest(newTestContext());
    expect(second).toMatchObject({ ok: true, path: 'tests/FirstBlink_2.scenario.json' });
    expect(readFileSync(join(folder, 'tests', 'FirstBlink.scenario.json'), 'utf8')).toBe('MINE');
    expect(readdirSync(join(folder, 'tests')).sort()).toEqual(['FirstBlink.scenario.json', 'FirstBlink_2.scenario.json']);
    expect(readdirSync(folder).sort()).toEqual(['src', 'tests', 'zplc.json']);
    expect(readdirSync(join(folder, 'src'))).toEqual(['FirstBlink.st']);
  });
});
