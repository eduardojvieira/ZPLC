import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createProjectFiles } from '../../electron/projectFiles';
import { PROJECT_FILES_CHANNEL, PROJECT_FILES_OPS, type ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import type { FileTreeNode } from '../types';
import { listSceneFiles, openDirectoryPicker, readDirectoryRecursive } from './fileSystem';

/** The scenes of a project as the palette lists them, read through the project-files module of the main process. */
let sandbox: string;
let project: string;

function loopbackBridge(): ProjectFilesBridge {
  const files = createProjectFiles(async () => project);
  const send = (channel: string, args: unknown[]) => files.handle(1, channel, args);
  const calls = PROJECT_FILES_OPS.map((op) => [op, (request: object) => send(PROJECT_FILES_CHANNEL[op], [request])] as const);
  return { chooseFolder: () => send(PROJECT_FILES_CHANNEL.chooseFolder, []), ...Object.fromEntries(calls) } as ProjectFilesBridge;
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'zplc-scene-files-')));
  project = path.join(sandbox, 'plant');
  mkdirSync(project);
  writeFileSync(path.join(project, 'zplc.json'), '{}');
  mkdirSync(path.join(project, 'src'));
  writeFileSync(path.join(project, 'src', 'main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electronAPI: { isElectron: true, projectFiles: loopbackBridge() } },
  });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  rmSync(sandbox, { recursive: true, force: true });
});

const paths = (node: FileTreeNode): string[] => [...(node.type === 'file' ? [node.path] : []), ...(node.children ?? []).flatMap(paths)];

describe('the scene files of a project (FND-001)', () => {
  it('FND-001 the scenes of a project are listed by path: scene.json at its root, then scenes/*.scene.json by name', async () => {
    writeFileSync(path.join(project, 'scene.json'), '{}');
    mkdirSync(path.join(project, 'scenes'));
    for (const name of ['station.scene.json', 'line.scene.json', 'station.plant-map.json', 'notes.txt'])
      writeFileSync(path.join(project, 'scenes', name), '{}');
    const root = (await openDirectoryPicker())!;
    expect(await listSceneFiles(root)).toEqual(['scene.json', 'scenes/line.scene.json', 'scenes/station.scene.json']);
    // the file tree keeps its own rule: programs, global lists and tests, no scene
    expect(paths(await readDirectoryRecursive(root))).toEqual(['src/main.st']);
  });

  it('FND-001 a project without a scene lists none', async () => {
    expect(await listSceneFiles((await openDirectoryPicker())!)).toEqual([]);
  });
});
