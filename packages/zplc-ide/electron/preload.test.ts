/**
 * The preload by behaviour (IDE-017): it is run against a stand-in for Electron, every method it exposes is called, and
 * what reached `ipcRenderer` is compared with the contract. Nothing generic can pass: the stand-in has `invoke`, `on`
 * and `removeListener` and no `send`, `sendSync` or `postMessage`, so a method that used another would throw here.
 */
import { beforeAll, describe, expect, it, mock } from 'bun:test';
import path from 'node:path';

import { IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS, PROJECT_FILES_CHANNEL } from './ipcContract';
import { PROJECT_ARCHIVE_OPS } from './projectArchiveProtocol';
import { PROJECT_FILES_OPS, PROJECT_RECENT_OPS, PROJECT_WATCH_OPS } from './projectFilesProtocol';

type Api = Record<string, unknown>;
const invoked: Array<{ channel: string; args: unknown[] }> = [];
const listened: string[] = [];
const removed: string[] = [];
const exposed: Array<{ name: string; api: Api }> = [];

void mock.module('electron', () => ({
  contextBridge: { exposeInMainWorld: (name: string, api: Api) => { exposed.push({ name, api }); } },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => { invoked.push({ channel, args }); return Promise.resolve(null); },
    on: (channel: string) => { listened.push(channel); },
    removeListener: (channel: string) => { removed.push(channel); },
  },
  webUtils: { getPathForFile: () => '/projects/demo/zplc.json' },
}));

const unsubscribers: Array<() => void> = [];
/** Calls every function of the exposed object: a method with a probe argument, an `on...` subscription with a callback. */
async function exercise(api: Api, trail = ''): Promise<void> {
  for (const [name, member] of Object.entries(api)) {
    if (typeof member === 'function') {
      if (/^on[A-Z]/.test(name)) {
        const unsubscribe = (member as (callback: () => void) => unknown)(() => undefined);
        expect(typeof unsubscribe).toBe('function');
        unsubscribers.push(unsubscribe as () => void);
      } else {
        const argument = name === 'registerProjectFile' ? new File(['{}'], 'zplc.json') : { probe: trail + name };
        await (member as (value: unknown) => Promise<unknown>)(argument).catch(() => undefined);
      }
    } else if (typeof member === 'object' && member !== null) {
      await exercise(member as Api, `${trail}${name}.`);
    }
  }
}

const PRELOAD = path.join(import.meta.dir, 'preload.ts');

let api: Api;
beforeAll(async () => {
  // A computed specifier: preload.ts declares window.electronAPI for its own program (tsconfig.preload.json) and must not join this one.
  await import(PRELOAD);
  expect(exposed.map((entry) => entry.name)).toEqual(['electronAPI']);
  api = exposed[0]!.api;
  await exercise(api);
});

describe('preload bridge (IDE-017)', () => {
  it('exposes the same top-level objects as the packaged smoke expects, and nothing else', () => {
    expect(Object.keys(api).sort()).toEqual([
      'aiProvider', 'candidateChangeSet', 'closeGuard', 'firmwareBuild', 'getAppInfo', 'isElectron', 'learnProgress',
      'nativeSimulation', 'platform', 'projectFiles', 'recovery', 'session', 'toolExecutionAudit', 'toolchain',
      'updateCheck', 'workspaceTests',
    ]);
  });

  it('exposes narrow objects: one method per operation of each group, nothing generic', () => {
    const methods = (name: string) => Object.keys(api[name] as Api);
    // The project-files bridge: the folder dialog, the file operations, the recent projects, the watch (IDE-004), the
    // archives (IDE-022) and the one event; each operation has its channel in PROJECT_FILES_CHANNEL under its own name.
    expect(methods('projectFiles')).toEqual([
      'chooseFolder', ...PROJECT_FILES_OPS, ...PROJECT_RECENT_OPS, ...PROJECT_WATCH_OPS, ...PROJECT_ARCHIVE_OPS, 'onChanged',
    ]);
    expect(methods('projectFiles').filter((name) => name !== 'onChanged').sort()).toEqual(Object.keys(PROJECT_FILES_CHANNEL).sort());
    expect(methods('recovery')).toEqual(['write', 'list', 'discard']);
    expect(methods('session')).toEqual(['load', 'save']);
    expect(methods('updateCheck')).toEqual(['run']);
    expect(methods('closeGuard')).toEqual(['setDirty', 'closeNow', 'onCloseRequested']);
    expect(methods('workspaceTests')).toEqual(['registerProjectFile', 'registerProjectRoot', 'run', 'cancel', 'compile', 'safetyCheck']);
    expect(methods('candidateChangeSet')).toEqual(['review']);
    expect(methods('toolchain')).toEqual(['inspect']);
    expect(methods('firmwareBuild')).toEqual(['start', 'cancel']);
    expect(methods('toolExecutionAudit')).toEqual(['list']);
    expect(methods('aiProvider')).toEqual(['getStatus', 'getConfig', 'saveConfig', 'storeKey', 'clearKey', 'request', 'cancel']);
    expect(methods('nativeSimulation')).toEqual(['startSession', 'stopSession', 'request', 'onEvent']);
    expect(methods('learnProgress')).toEqual(['read', 'merge']);
  });

  it('invokes every channel of the contract, and only those', () => {
    expect([...new Set(invoked.map((call) => call.channel))].sort()).toEqual([...IPC_INVOKE_CHANNELS].sort());
  });

  it('subscribes only to the event channels of the contract, and each unsubscribe removes its own listener', () => {
    expect([...new Set(listened)].sort()).toEqual([...IPC_EVENT_CHANNELS].sort());
    for (const unsubscribe of unsubscribers) unsubscribe();
    expect([...new Set(removed)].sort()).toEqual([...IPC_EVENT_CHANNELS].sort());
  });

  it('hands the main process a path only for the one operation that has a real File, and never a path from the page', () => {
    const withPath = invoked.filter((call) => call.args.some((argument) => typeof argument === 'string' && argument.includes('/')));
    expect(withPath.map((call) => call.channel)).toEqual(['workspace-tests:register-project-file']);
    expect(withPath[0]!.args).toEqual(['/projects/demo/zplc.json']);
  });

  it('refuses a registration whose file is not the project manifest, before anything is sent', async () => {
    const workspaceTests = api.workspaceTests as { registerProjectFile(file: unknown): Promise<unknown> };
    const before = invoked.length;
    await expect(workspaceTests.registerProjectFile(new File(['x'], 'evil.json'))).rejects.toThrow('Workspace operation failed');
    await expect(workspaceTests.registerProjectFile({ name: 'zplc.json', size: 5 })).rejects.toThrow('Workspace operation failed');
    expect(invoked.length).toBe(before);
  });

  it('is one script that requires nothing but electron, the only module a sandboxed preload may load', async () => {
    const built = await Bun.build({ entrypoints: [PRELOAD], target: 'node', format: 'cjs', external: ['electron'] });
    expect(built.success).toBe(true);
    const text = await built.outputs[0]!.text();
    const required = [...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
    expect([...new Set(required)]).toEqual(['electron']);
  });
});
