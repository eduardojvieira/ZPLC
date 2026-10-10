/**
 * IDE-017 by behaviour: the real handler table runs behind the real registry against stand-ins for Electron, the
 * stores and the tool API. What is proven here is what the renderer can observe on each channel, not how main.ts is
 * written: no call reaches a dependency unless the sender is the trusted document and the message fits the schema of
 * its channel, and no handler exists for a channel that the contract does not name.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createProjectFiles } from './projectFiles';
import { IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS, PROJECT_FILES_CHANNEL } from './ipcContract';
import { createIpcHandlers, type IpcDeps, type RendererOwner, type ToolApiModule } from './ipcHandlers';
import { IPC_DENIED, ipcTableMismatch, registerIpcHandlers, type IpcMainLike } from './ipcRegistry';

const OWNER: RendererOwner = { ownerId: 7, epoch: 1 };
const TRUSTED = { sender: 'trusted-document' };
const UNTRUSTED = { sender: 'some-other-frame' };
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';

interface Harness {
  deps: IpcDeps;
  /** Every call that reached a dependency, as `name` or `name:detail`. */
  touched: string[];
  invoke(channel: string, event: unknown, ...args: unknown[]): Promise<unknown>;
  setCurrent(value: boolean): void;
  folder: string;
  rootId: string;
}

const scratches: string[] = [];
afterEach(() => { for (const directory of scratches.splice(0)) rmSync(directory, { recursive: true, force: true }); });

async function harness(options: { toolApi?: Partial<ToolApiModule>; failToolApi?: boolean } = {}): Promise<Harness> {
  const folder = realpathSync(mkdtempSync(path.join(tmpdir(), 'zplc-ipc-registry-')));
  scratches.push(folder);
  mkdirSync(path.join(folder, 'project'));
  const projectRoot = path.join(folder, 'project');
  writeFileSync(path.join(projectRoot, 'zplc.json'), '{}');
  const touched: string[] = [];
  const note = (entry: string) => { touched.push(entry); };
  let current = true;
  const files = createProjectFiles(async () => projectRoot);
  const chosen = await files.handle(OWNER.ownerId, PROJECT_FILES_CHANNEL.chooseFolder, []);
  if (!chosen.ok || chosen.value === null) throw new Error('the folder was not chosen');
  const rootId = (chosen.value as { rootId: string }).rootId;
  const projectFiles = {
    handle: (ownerId: number, channel: string, args: readonly unknown[]) => { note(`projectFiles.handle:${channel}`); return files.handle(ownerId, channel, args); },
    rootOf: files.rootOf,
    currentRoot: files.currentRoot,
  };
  const store = (name: string, extra: Record<string, unknown> = {}) => new Proxy(extra, {
    get: (target, property) => typeof property === 'string' && !(property in target)
      ? (...args: unknown[]) => { note(`${name}.${property}:${JSON.stringify(args.filter((arg) => typeof arg === 'string'))}`); return Promise.resolve(null); }
      : target[property as string],
  });
  const toolApi: ToolApiModule = {
    startToolExecution: () => ({ jobId: EXECUTION_ID, startedAt: '2026-10-10T00:00:00.000Z' }),
    // The real envelope carries metadata only: who, what, when and the outcome, never the value.
    finishToolExecution: (start) => ({ schemaVersion: 1, jobId: start.jobId, actor: start.actor, permission: start.permission, operation: start.operation, outcome: 'passed', startedAt: start.startedAt, finishedAt: '2026-10-10T00:00:01.000Z' }),
    isToolExecutionEnvelope: () => !options.failToolApi,
    testsRun: async () => { note('toolApi.testsRun'); return { ok: true }; },
    scenarioRun: async (_root, scenario) => { note(`toolApi.scenarioRun:${scenario}`); return { ok: true }; },
    compilerCompile: async () => { note('toolApi.compilerCompile'); return { ok: false, evidence: { diagnostics: [{ code: 'COMPILATION_FAILED', message: 'bad /home/secret/x.st', path: 'src/Main.st', line: 3 }] } }; },
    safetyCheck: async () => { note('toolApi.safetyCheck'); return { ok: false }; },
    toolchainInspect: async () => ({ ok: true }),
    firmwareBuild: async (_root, ideId) => { note(`toolApi.firmwareBuild:${ideId}`); return { ok: true }; },
    createCandidateChangeSet: async () => { note('toolApi.createCandidateChangeSet'); throw new Error('boom'); },
    ...options.toolApi,
  };
  const gateway = {
    registerProjectManifest: async (owner: number, manifest: string, expectedRoot: string | null) => { note(`gateway.register:${manifest.replace(folder, '<scratch>')}@${expectedRoot === projectRoot ? 'window-folder' : String(expectedRoot)}`); void owner; return { workspaceId: WORKSPACE_ID }; },
    run: async <T,>(owner: number, request: unknown, runner: (root: string, options: { signal: AbortSignal; jobId: string; startedAt: string }) => Promise<T> | T, expectedRoot: string | null): Promise<T> => {
      note(`gateway.run:${JSON.stringify(request)}@${expectedRoot === projectRoot ? 'window-folder' : String(expectedRoot)}`); void owner;
      return runner(projectRoot, { signal: new AbortController().signal, jobId: EXECUTION_ID, startedAt: '2026-10-10T00:00:00.000Z' });
    },
    cancel: (owner: number) => { note('gateway.cancel'); void owner; return { requested: true }; },
  };
  const deps: IpcDeps = {
    appInfo: () => ({ version: '9.9.9', platform: 'linux', arch: 'x64', isPackaged: true }),
    isCurrent: () => current,
    closeGuard: { setDirty: (dirty) => note(`closeGuard.setDirty:${dirty}`), confirm: () => { note('closeGuard.confirm'); return 'close'; } },
    completeGuardedAction: (action) => note(`window.${action}`),
    projectFiles,
    recoveryStore: () => store('recovery') as never,
    sessionStore: () => store('session') as never,
    learnProgress: () => store('learn', { read: async () => new Set(['a']), merge: async (ids: string[]) => new Set(ids) }) as never,
    aiProvider: () => store('ai', { cancel: () => ({ requested: false }), request: async () => ({ ok: true }) }) as never,
    toolExecutionAudit: { list: () => ({ schemaVersion: 1, executions: [] }), add: async (envelope: unknown) => { note(`audit.add:${JSON.stringify(envelope)}`); } } as never,
    workspaceGateway: gateway as never,
    firmwareGateway: {
      inspect: async (_owner: number, selected: string) => { note(`firmware.inspect:${selected}`); return { ok: true }; },
      start: async (_owner: number, request: { ideId: string }, _inspect: unknown, approve: () => Promise<boolean>, build: (root: string, ideId: string, options: { signal: AbortSignal; jobId: string; startedAt: string }) => Promise<unknown>) => {
        note('firmware.start');
        return await approve() ? build('/checkout', request.ideId, { signal: new AbortController().signal, jobId: EXECUTION_ID, startedAt: '2026-10-10T00:00:00.000Z' }) : null;
      },
      cancel: () => { note('firmware.cancel'); return { requested: false }; },
      revokeOwner: () => { note('firmware.revokeOwner'); return false; },
    } as never,
    loadToolApi: async () => toolApi,
    nativeSimulation: {
      start: async () => { note('native.start'); return {}; },
      stop: async () => { note('native.stop'); },
      request: async (_owner, request) => { note(`native.request:${request.method}`); return {}; },
    },
    pickToolchainRepository: async () => { note('dialog.toolchain'); return null; },
    confirmFirmwareBuild: async () => { note('dialog.firmwareBuild'); return false; },
    checkForUpdate: async () => { note('update.check'); return { status: 'unavailable', current: '9.9.9' }; },
  };
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const ipc: IpcMainLike = { handle: (channel, listener) => { if (listeners.has(channel)) throw new Error(`registered twice: ${channel}`); listeners.set(channel, listener); } };
  registerIpcHandlers(ipc, createIpcHandlers(deps), {
    authorize: (event) => (event === TRUSTED ? OWNER : null),
    isCurrent: () => current,
  });
  return {
    deps,
    touched,
    invoke: async (channel, event, ...args) => {
      const listener = listeners.get(channel);
      if (!listener) throw new Error(`no handler for ${channel}`);
      return listener(event, ...args);
    },
    setCurrent: (value) => { current = value; },
    folder: projectRoot,
    rootId,
  };
}

const settle = async (call: Promise<unknown>): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> => {
  try { return { ok: true, value: await call }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
};

describe('the contract and the handler table (IDE-017)', () => {
  it('answer exactly the same channels, and the registry refuses a table that differs', async () => {
    const { deps } = await harness();
    const table = createIpcHandlers(deps);
    expect(ipcTableMismatch(table)).toEqual({ missing: [], extra: [] });
    expect(Object.keys(table).sort()).toEqual([...IPC_INVOKE_CHANNELS].sort());
    const ipc: IpcMainLike = { handle: () => undefined };
    const guard = { authorize: () => OWNER, isCurrent: () => true };
    const { [IPC_INVOKE_CHANNELS[0]!]: _dropped, ...withoutOne } = table;
    void _dropped;
    expect(() => registerIpcHandlers(ipc, withoutOne, guard)).toThrow(`missing [${IPC_INVOKE_CHANNELS[0]}]`);
    expect(() => registerIpcHandlers(ipc, { ...table, 'rogue:channel': table[IPC_INVOKE_CHANNELS[0]!]! }, guard)).toThrow('not in the contract [rogue:channel]');
  });

  it('keeps events apart from invoke channels, and names no physical operation', () => {
    expect(IPC_INVOKE_CHANNELS.filter((channel) => IPC_EVENT_CHANNELS.includes(channel))).toEqual([]);
    expect(new Set(IPC_INVOKE_CHANNELS).size).toBe(IPC_INVOKE_CHANNELS.length);
    for (const channel of IPC_INVOKE_CHANNELS) {
      expect(channel).toMatch(/^[a-z-]+(?::[a-z-]+)?$/);
      expect(channel).not.toMatch(/flash|deploy|serial|shell|:force|:run-?program|:stop$/);
    }
  });
});

describe('every invoke channel (IDE-017)', () => {
  it('denies a sender that is not the trusted document, and touches nothing', async () => {
    const h = await harness();
    for (const channel of IPC_INVOKE_CHANNELS) {
      const answer = await settle(h.invoke(channel, UNTRUSTED, { rootId: h.rootId }));
      expect(answer).toEqual({ ok: false, message: IPC_DENIED });
      expect(await settle(h.invoke(channel, undefined))).toEqual({ ok: false, message: IPC_DENIED });
    }
    expect(h.touched).toEqual([]);
  });

  it('denies a message that does not fit its schema, and touches nothing', async () => {
    const h = await harness();
    const hostile: unknown[][] = [[{ unexpected: true }], [42], [Symbol('x')], [null], ['a', 'b'], [{ rootId: h.rootId, extra: 1, path: '../x' }]];
    for (const channel of IPC_INVOKE_CHANNELS) {
      for (const args of hostile) {
        const answer = await settle(h.invoke(channel, TRUSTED, ...args));
        if (Object.values(PROJECT_FILES_CHANNEL).includes(channel as never)) {
          // The shared project handler validates the message itself and answers a typed refusal, never a result.
          if (answer.ok) expect(answer.value).toMatchObject({ ok: false });
        } else {
          expect(answer).toEqual({ ok: false, message: IPC_DENIED });
        }
      }
    }
    // The project operations reached the shared handler (which refused them) and nothing else was touched.
    expect(h.touched.filter((entry) => !entry.startsWith('projectFiles.handle:'))).toEqual([]);
  });

  it('answers a call with no argument on the channels that take none, and the no-argument channels refuse one', async () => {
    const h = await harness();
    expect(await h.invoke('get-app-info', TRUSTED)).toEqual({ version: '9.9.9', platform: 'linux', arch: 'x64', isPackaged: true });
    expect(await settle(h.invoke('get-app-info', TRUSTED, 'x'))).toEqual({ ok: false, message: IPC_DENIED });
    expect(await h.invoke('update-check:run', TRUSTED)).toEqual({ status: 'unavailable', current: '9.9.9' });
    expect(await settle(h.invoke('update-check:run', TRUSTED, 'https://example.invalid/'))).toEqual({ ok: false, message: IPC_DENIED });
    expect(h.touched).toEqual(['update.check']);
  });

  it('does not release an answer once the document that asked is no longer the window owner', async () => {
    const h = await harness();
    h.setCurrent(false);
    expect(await settle(h.invoke('get-app-info', TRUSTED))).toEqual({ ok: false, message: IPC_DENIED });
    expect(await settle(h.invoke('update-check:run', TRUSTED))).toEqual({ ok: false, message: IPC_DENIED });
    expect(await settle(h.invoke(PROJECT_FILES_CHANNEL.chooseFolder, TRUSTED))).toEqual({ ok: false, message: IPC_DENIED });
  });

  it('tells the renderer one fixed message when a handler fails, never the text of the internal error', async () => {
    const h = await harness({ toolApi: { compilerCompile: async () => { throw new Error('/home/secret/projects/x.st: token abc123'); } } });
    const answer = await settle(h.invoke('workspace-tests:compile', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: h.rootId }));
    expect(answer).toEqual({ ok: false, message: 'Workspace operation failed' });
  });
});

describe('project files over the IPC boundary (IDE-001, IDE-016)', () => {
  it('answer a typed refusal for a path with .., an absolute path and a folder id that is not the window folder', async () => {
    const h = await harness();
    writeFileSync(path.join(h.folder, 'a.st'), 'x');
    for (const request of [
      { rootId: h.rootId, path: '../outside.txt' },
      { rootId: h.rootId, path: '/etc/passwd' },
      { rootId: 'not-the-window-folder', path: 'a.st' },
    ]) {
      const answer = await h.invoke(PROJECT_FILES_CHANNEL.read, TRUSTED, request) as { ok: boolean; code?: string };
      expect(answer.ok).toBe(false);
      expect(['invalid-path', 'no-folder']).toContain(answer.code!);
    }
    const ok = await h.invoke(PROJECT_FILES_CHANNEL.read, TRUSTED, { rootId: h.rootId, path: 'a.st' }) as { ok: boolean };
    expect(ok.ok).toBe(true);
  });
});

describe('recovery and session over the IPC boundary (IDE-006, IDE-008)', () => {
  it('key the store by the real path that the main process holds, never by what the renderer sends, and check the folder id first', async () => {
    const h = await harness();
    await h.invoke('recovery:write', TRUSTED, { rootId: h.rootId, path: 'src/Main.st', content: 'x' });
    await h.invoke('recovery:list', TRUSTED, { rootId: h.rootId });
    await h.invoke('recovery:discard', TRUSTED, { rootId: h.rootId, path: null });
    await h.invoke('session:load', TRUSTED, { rootId: h.rootId });
    expect(h.touched).toEqual([
      `recovery.write:${JSON.stringify([h.folder, 'src/Main.st', 'x'])}`,
      `recovery.list:${JSON.stringify([h.folder])}`,
      `recovery.discard:${JSON.stringify([h.folder])}`,
      `session.load:${JSON.stringify([h.folder])}`,
    ]);
    const before = h.touched.length;
    expect(await settle(h.invoke('recovery:write', TRUSTED, { rootId: 'another-folder', path: 'src/Main.st', content: 'x' }))).toEqual({ ok: false, message: IPC_DENIED });
    expect(await settle(h.invoke('session:load', TRUSTED, { rootId: 'another-folder' }))).toEqual({ ok: false, message: IPC_DENIED });
    expect(h.touched.length).toBe(before);
  });

  it('drops the recovery files of the window folder when the user answers a close, before the window goes', async () => {
    const h = await harness();
    await h.invoke('close-guard:close-now', TRUSTED);
    expect(h.touched).toEqual(['closeGuard.confirm', `recovery.discard:${JSON.stringify([h.folder])}`, 'window.close']);
  });
});

describe('workspace tests, candidate review and the AI provider (IDE-001, IDE-017)', () => {
  it('register the folder of the window by its id alone, as <folder>/zplc.json, and refuse any other id (IDE-001)', async () => {
    const h = await harness();
    expect(await h.invoke('workspace-tests:register-project-root', TRUSTED, { rootId: h.rootId })).toEqual({ workspaceId: WORKSPACE_ID });
    expect(h.touched).toEqual([`gateway.register:${h.folder.replace(path.dirname(h.folder), '<scratch>')}/zplc.json@window-folder`]);
    expect(await settle(h.invoke('workspace-tests:register-project-root', TRUSTED, { rootId: 'other' }))).toEqual({ ok: false, message: 'Workspace operation failed' });
    expect(await settle(h.invoke('workspace-tests:register-project-root', TRUSTED, { path: '/tmp' }))).toEqual({ ok: false, message: IPC_DENIED });
  });

  it('compile a workspace through the owner-bound gateway and record who did it, without leaking a path into the envelope', async () => {
    const h = await harness();
    const answer = await h.invoke('workspace-tests:compile', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: h.rootId }) as { ok: boolean; evidence: { diagnostics: Array<{ message?: string; path?: string }> }; execution: unknown };
    expect(answer.ok).toBe(false);
    expect(JSON.stringify(answer)).not.toContain('/home/secret');
    expect(answer.evidence.diagnostics[0]).toMatchObject({ path: 'src/Main.st' });
    const audit = h.touched.find((entry) => entry.startsWith('audit.add:'))!;
    expect(JSON.parse(audit.slice('audit.add:'.length))).toMatchObject({ actor: 'human-studio', permission: 'compiler:check', operation: 'compile' });
    expect(audit).not.toContain('signal');
  });

  it('run a named scenario only for a well-formed scenario id', async () => {
    const h = await harness();
    await h.invoke('workspace-tests:run', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: h.rootId, scenarioId: 'start-stop' });
    expect(h.touched).toContain('toolApi.scenarioRun:start-stop');
    expect(await settle(h.invoke('workspace-tests:run', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: h.rootId, scenarioId: '../../etc' }))).toEqual({ ok: false, message: IPC_DENIED });
  });

  it('records a candidate review as an agent test, even when the review itself failed, and never applies an edit', async () => {
    const h = await harness();
    const request = { workspaceId: WORKSPACE_ID, edit: { path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM' } };
    expect(await settle(h.invoke('candidate-change-set:review', TRUSTED, request))).toEqual({ ok: false, message: 'Workspace operation failed' });
    const audit = h.touched.find((entry) => entry.startsWith('audit.add:'))!;
    expect(JSON.parse(audit.slice('audit.add:'.length))).toMatchObject({ actor: 'agent', permission: 'tests:run', operation: 'change-set-review' });
    expect(await settle(h.invoke('candidate-change-set:review', TRUSTED, { ...request, edit: { path: '../x.st', content: '' } }))).toEqual({ ok: false, message: IPC_DENIED });
  });

  it('send an AI request through the workspace gateway and cancel both the provider and the workspace run', async () => {
    const h = await harness();
    await h.invoke('ai-provider:request', TRUSTED, { workspaceId: WORKSPACE_ID, mode: 'ask', prompt: 'why' });
    expect(h.touched).toEqual([`gateway.run:${JSON.stringify({ workspaceId: WORKSPACE_ID })}@window-folder`]);
    expect(await h.invoke('ai-provider:cancel', TRUSTED)).toEqual({ requested: true });
    expect(await settle(h.invoke('ai-provider:request', TRUSTED, { workspaceId: WORKSPACE_ID, mode: 'ask', prompt: 'x', provider: 'https://evil.invalid' }))).toEqual({ ok: false, message: IPC_DENIED });
  });
});

describe('toolchain inspection and firmware build (IDE-017, IDE-027)', () => {
  it('open the native dialog first, and forget the checkout of the window when the user cancels', async () => {
    const h = await harness();
    expect(await h.invoke('toolchain:inspect', TRUSTED)).toBeNull();
    expect(h.touched).toEqual(['dialog.toolchain', 'firmware.revokeOwner']);
  });

  it('inspect only the folder the user chose, and answer nothing when the document was replaced during the dialog', async () => {
    const h = await harness();
    h.deps.pickToolchainRepository = async () => '/home/user/zplc';
    const inspected = await h.invoke('toolchain:inspect', TRUSTED) as { ok: boolean; execution: unknown };
    expect(inspected.ok).toBe(true);
    expect(h.touched).toContain('firmware.inspect:/home/user/zplc');
    const before = h.touched.length;
    h.deps.pickToolchainRepository = async () => { h.setCurrent(false); return '/home/user/zplc'; };
    expect(await settle(h.invoke('toolchain:inspect', TRUSTED))).toEqual({ ok: false, message: IPC_DENIED });
    expect(h.touched.length).toBe(before);
  });

  it('start a build only from a board id, after a native confirmation, and never from a root, a command or an argument', async () => {
    const h = await harness();
    for (const request of [{ ideId: 'rpi_pico_rp2040', root: '/etc' }, { ideId: 'x; rm -rf /' }, { ideId: '../board' }, { ideId: 'UPPER' }, { command: 'west', ideId: 'x' }, {}]) {
      expect(await settle(h.invoke('firmware-build:start', TRUSTED, request))).toEqual({ ok: false, message: IPC_DENIED });
    }
    expect(h.touched).toEqual([]);
    // The user declines the confirmation: nothing is built.
    expect(await h.invoke('firmware-build:start', TRUSTED, { ideId: 'rpi_pico_rp2040' })).toBeNull();
    expect(h.touched).toEqual(['firmware.start', 'dialog.firmwareBuild']);
    // The user confirms: the build runs for exactly that board.
    h.deps.confirmFirmwareBuild = async (ideId) => { h.touched.push(`confirmed:${ideId}`); return true; };
    await h.invoke('firmware-build:start', TRUSTED, { ideId: 'rpi_pico_rp2040' });
    expect(h.touched).toContain('confirmed:rpi_pico_rp2040');
    expect(h.touched).toContain('toolApi.firmwareBuild:rpi_pico_rp2040');
    expect(await h.invoke('firmware-build:cancel', TRUSTED)).toEqual({ requested: false });
  });
});

describe('safety check over the IPC boundary (IDE-017)', () => {
  it('releases only the bounded interlock report: anything else is a failed operation', async () => {
    const h = await harness();
    expect(await settle(h.invoke('workspace-tests:safety-check', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: h.rootId }))).toEqual({ ok: false, message: 'Workspace operation failed' });
    const evidence = { schemaVersion: 1, operation: 'safety-check', outcome: 'passed', diagnostics: [], artifacts: [] };
    const good = await harness({ toolApi: { safetyCheck: async () => ({ ok: true, summary: { configured: false, declared: [], covered: [], uncovered: [] }, evidence }) } });
    const answer = await good.invoke('workspace-tests:safety-check', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: good.rootId }) as { ok: boolean; execution?: unknown };
    expect(answer.ok).toBe(true);
    expect(answer.execution).toMatchObject({ actor: 'human-studio', operation: 'safety-check' });
  });
});

describe('a build, a test run and a review act only on the project of the editor (IDE-002)', () => {
  it('name the folder of the window, and are refused for a folder id that is not the window folder before the gateway is asked', async () => {
    const h = await harness();
    for (const channel of ['workspace-tests:compile', 'workspace-tests:safety-check', 'workspace-tests:run']) {
      expect(await settle(h.invoke(channel, TRUSTED, { workspaceId: WORKSPACE_ID, rootId: 'a-folder-that-is-closed' }))).toEqual({ ok: false, message: 'Workspace operation failed' });
      expect(await settle(h.invoke(channel, TRUSTED, { workspaceId: WORKSPACE_ID }))).toEqual({ ok: false, message: IPC_DENIED });
    }
    expect(h.touched.filter((entry) => entry.startsWith('gateway.'))).toEqual([]);
  });

  it('hand the gateway the folder that the window shows now, for the build, the run, the review and the AI request alike', async () => {
    const h = await harness();
    await h.invoke('workspace-tests:compile', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: h.rootId });
    await h.invoke('workspace-tests:run', TRUSTED, { workspaceId: WORKSPACE_ID, rootId: h.rootId });
    await settle(h.invoke('candidate-change-set:review', TRUSTED, { workspaceId: WORKSPACE_ID, edit: { path: 'src/Main.st', content: 'x' } }));
    await h.invoke('ai-provider:request', TRUSTED, { workspaceId: WORKSPACE_ID, mode: 'ask', prompt: 'why' });
    const runs = h.touched.filter((entry) => entry.startsWith('gateway.run:'));
    expect(runs).toHaveLength(4);
    for (const run of runs) expect(run.endsWith('@window-folder')).toBe(true);
  });

  it('register a manifest only against the folder that the window shows', async () => {
    const h = await harness();
    await h.invoke('workspace-tests:register-project-file', TRUSTED, '/anywhere/zplc.json');
    expect(h.touched).toEqual(['gateway.register:/anywhere/zplc.json@window-folder']);
  });
});
