/**
 * The handler of every invoke channel of `ipcContract.ts` (IDE-017), as one table.
 *
 * Each entry says two things: which argument lists the channel accepts (`accepts`, the schema of the message) and what
 * it does for a trusted sender (`run`). `ipcRegistry.ts` is the only code that turns an entry into an `ipcMain`
 * handler, and it checks the sender and the message before `run` and the freshness of the document after it, so a
 * handler written here cannot skip either. Everything the handlers act on arrives in `IpcDeps`; this module imports no
 * Electron, so the whole table runs under a test with stand-ins for the window, the dialogs and the stores.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

import type { CloseGuard, GuardedAction } from './closeGuard.js';
import type { AiRequest, createAiProvider } from './aiProvider.js';
import type { createFirmwareBuildGateway } from './firmwareBuildGateway.js';
import type { createLearnProgressStore } from './learnProgressStore.js';
import type { createProjectFiles } from './projectFiles.js';
import type { RecoveryStore } from './recoveryStore.js';
import type { SerialPortBroker } from './serialPortBroker.js';
import { isSerialPortChoice, isSerialPortListRequest, type SerialPortChoice, type SerialPortListRequest } from './serialPortProtocol.js';
import type { SessionStore } from './sessionStore.js';
import type { createToolExecutionAudit } from './toolExecutionAudit.js';
import type { createWorkspaceTestGateway } from './workspaceTestGateway.js';
import {
  AI_PROVIDER_CHANNEL,
  APP_INFO_CHANNEL,
  CANDIDATE_CHANGE_SET_CHANNEL,
  CLOSE_GUARD_CHANNEL,
  FIRMWARE_BUILD_CHANNEL,
  FIRMWARE_IMAGES_CHANNEL,
  NATIVE_SIMULATION_CHANNEL,
  PROJECT_FILES_CHANNEL,
  RECOVERY_CHANNEL,
  PORT_CHOICE_CHANNEL,
  SESSION_CHANNEL,
  TOOLCHAIN_CHANNEL,
  TOOL_EXECUTION_AUDIT_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  WORKSPACE_TESTS_CHANNEL,
} from './ipcContract.js';
import { IPC_DENIED, type IpcHandler, type IpcHandlerTable } from './ipcRegistry.js';
import { isLessonCheckRequest, lessonCheckAnswer } from './lessonCheckProtocol.js';
import { createLearnProgressHandlers } from './learnProgressIpc.js';
import type { NativeSimulationRequest } from './nativeSimulationIpc.js';
import {
  isAllowedAiProviderConfig,
  isAllowedAiProviderKey,
  isAllowedAiProviderRequest,
  isAllowedCandidateChangeSetReviewRequest,
  isAllowedCloseGuardDirty,
  isAllowedFirmwareBuildRequest,
  isAllowedNativeSimulationRequest,
  isAllowedRecoveryDiscardRequest,
  isAllowedRecoveryListRequest,
  isAllowedRecoveryWriteRequest,
  isAllowedSessionLoadRequest,
  isAllowedSessionSaveRequest,
  isAllowedWorkspaceOperationRequest,
  isAllowedWorkspaceRootRequest,
  isAllowedWorkspaceTestRunRequest,
  sanitizeCandidateChangeSetReview,
  sanitizeWorkspaceSafetyCheck,
} from './security.js';
import { ToolWorkerError } from './toolWorkerHost.js';
import type { ToolWorkerRequest } from './toolWorkerProtocol.js';
import { record, workspaceCompileFailure } from './workspaceCompileFailure.js';

/** The renderer document that owns the window: its web contents and the epoch of the document it loaded. */
export interface RendererOwner { ownerId: number; epoch: number }

type ExecutionStart = { jobId: string; actor: 'human-studio' | 'agent'; permission: string; operation: string; startedAt: string };

/** What the main process uses of the bundled Tool API; each operation is checked for presence where it is used. */
export interface ToolApiModule {
  startToolExecution(actor: 'human-studio' | 'agent', permission: string, operation: string): { jobId: string; startedAt: string };
  finishToolExecution(start: ExecutionStart, value: unknown): unknown;
  isToolExecutionEnvelope(value: unknown): boolean;
  toolchainInspect?: (repositoryRoot: string) => Promise<unknown>;
  firmwareBuild?: (repositoryRoot: string, ideId: string, options: { signal: AbortSignal }) => Promise<unknown>;
}

export interface IpcDeps {
  appInfo(): { version: string; platform: string; arch: string; isPackaged: boolean };
  /** Whether the document that made a call still owns the window (the registry asks it after every handler). */
  isCurrent(owner: RendererOwner): boolean;
  closeGuard: Pick<CloseGuard, 'setDirty' | 'confirm'>;
  /** The user answered save or discard: reload or close the window. */
  completeGuardedAction(action: GuardedAction): void;
  projectFiles: Pick<ReturnType<typeof createProjectFiles>, 'handle' | 'rootOf' | 'currentRoot'>;
  recoveryStore(): RecoveryStore | null;
  sessionStore(): SessionStore | null;
  /** The serial-port questions of the windows (IDE-018): the answer and the refresh of the dialog. */
  serialPorts: Pick<SerialPortBroker, 'choose' | 'list'>;
  learnProgress(): ReturnType<typeof createLearnProgressStore> | null;
  aiProvider(): ReturnType<typeof createAiProvider> | null;
  toolExecutionAudit: Pick<ReturnType<typeof createToolExecutionAudit>, 'list' | 'add'>;
  workspaceGateway: Pick<ReturnType<typeof createWorkspaceTestGateway>, 'registerProjectManifest' | 'run' | 'cancel'>;
  firmwareGateway: Pick<ReturnType<typeof createFirmwareBuildGateway>, 'inspect' | 'start' | 'cancel' | 'revokeOwner'>;
  loadToolApi(): Promise<ToolApiModule>;
  /** Compile, safety check, scenario runs and candidate review run in a process of their own, never in the main process (IDE-012). */
  toolWorker: { run(request: ToolWorkerRequest, signal: AbortSignal): Promise<unknown> };
  nativeSimulation: {
    start(owner: RendererOwner): Promise<unknown>;
    stop(owner: RendererOwner): Promise<void>;
    request(owner: RendererOwner, request: NativeSimulationRequest): Promise<unknown>;
  };
  /** The native folder dialog for a firmware checkout: its path, or null when the user cancelled. */
  pickToolchainRepository(): Promise<string | null>;
  /** The native confirmation before a local firmware build: true only when the user chose to build. */
  confirmFirmwareBuild(ideId: string): Promise<boolean>;
  checkForUpdate(): Promise<unknown>;
  /** The firmware images of this installation (REL-025): read-only, with no argument from the renderer. */
  firmwareImages(): Promise<unknown>;
}

const WORKSPACE_FAILED = 'Workspace operation failed';

const noArguments = (args: readonly unknown[]): boolean => args.length === 0;
const oneArgument = (check: (value: unknown) => boolean) => (args: readonly unknown[]): boolean => args.length === 1 && check(args[0]);

/** Turns private Tool API fields into the sole structured-clone payload accepted by Toolbar. */
export function toWorkspaceCompileEnvelope(value: unknown, execution?: unknown): unknown {
  const result = record(value);
  if (!result || result.ok !== true) return { ...workspaceCompileFailure(value), ...(execution ? { execution } : {}) };
  const summary = record(result.summary);
  const debugMap = record(result.debugMap);
  const taskCount = summary?.taskCount;
  const codeSize = summary?.codeSize;
  if (!summary || typeof summary.name !== 'string' || summary.name.length === 0 || summary.name.length > 256
    || typeof taskCount !== 'number' || !Number.isSafeInteger(taskCount) || taskCount < 1
    || typeof codeSize !== 'number' || !Number.isSafeInteger(codeSize) || codeSize < 0
    || !(result.zplcFile instanceof Uint8Array) || result.zplcFile.byteLength === 0
    || !(result.bytecode instanceof Uint8Array) || result.bytecode.byteLength === 0
    || typeof result.assembly !== 'string'
    || !debugMap || !record(debugMap.pou) || !record(debugMap.memoryLayout)) return workspaceCompileFailure(undefined);
  return {
    ok: true,
    summary: { name: summary.name, taskCount, codeSize },
    artifact: {
      zplcFile: result.zplcFile,
      bytecode: result.bytecode,
      assembly: result.assembly,
      debugMap,
    },
    zplcEvidence: {
      sha256: createHash('sha256').update(result.zplcFile).digest('hex'),
      byteLength: result.zplcFile.byteLength,
    },
    ...(execution ? { execution } : {}),
  };
}

export function createIpcHandlers(deps: IpcDeps): IpcHandlerTable<RendererOwner> {
  const denied = (): Error => new Error(IPC_DENIED);

  /** Records one finished Studio operation in the audit log and returns its envelope. */
  const finishStudioExecution = async (
    toolApi: ToolApiModule,
    start: { jobId: string; startedAt: string },
    permission: string,
    operation: string,
    value: unknown,
  ): Promise<unknown> => {
    const execution = toolApi.finishToolExecution({ jobId: start.jobId, startedAt: start.startedAt, actor: 'human-studio', permission, operation }, value);
    if (!toolApi.isToolExecutionEnvelope(execution)) throw new Error(WORKSPACE_FAILED);
    await deps.toolExecutionAudit.add(execution);
    return execution;
  };

  /**
   * Runs one operation in the tool worker and records how it ended (the audit log keeps who, what, when and the outcome):
   * a cancelled or timed-out run is recorded as such and the failure is passed on.
   */
  const inWorker = async (
    toolApi: ToolApiModule,
    options: { signal: AbortSignal; jobId: string; startedAt: string },
    request: ToolWorkerRequest,
    permission: string,
    operation: string,
  ): Promise<{ value: unknown; execution: unknown }> => {
    let value: unknown;
    try {
      value = await deps.toolWorker.run(request, options.signal);
    } catch (error) {
      const cancelled = error instanceof ToolWorkerError ? error.reason === 'cancelled' : options.signal.aborted;
      const ended = { evidence: { outcome: 'failed', diagnostics: cancelled ? [{ code: 'TOOL_CANCELLED' }] : [] } };
      await finishStudioExecution(toolApi, options, permission, operation, ended).catch(() => undefined);
      throw error;
    }
    return { value, execution: await finishStudioExecution(toolApi, options, permission, operation, value) };
  };

  const finishAgentReviewExecution = async (toolApi: ToolApiModule, start: { jobId: string; startedAt: string }, value: unknown): Promise<void> => {
    const execution = toolApi.finishToolExecution({ jobId: start.jobId, startedAt: start.startedAt, actor: 'agent', permission: 'tests:run', operation: 'change-set-review' }, value);
    if (!toolApi.isToolExecutionEnvelope(execution)) throw new Error(WORKSPACE_FAILED);
    await deps.toolExecutionAudit.add(execution);
  };

  const provider = (): ReturnType<typeof createAiProvider> => {
    const active = deps.aiProvider();
    if (!active) throw denied();
    return active;
  };

  /** The real path that the main process holds for the window's folder, or a refusal for a folder id it does not hold. */
  const folderOf = (owner: RendererOwner, rootId: string): string => {
    const root = deps.projectFiles.rootOf(owner.ownerId, rootId);
    if (root === null) throw denied();
    return root;
  };

  const handler = <Args extends readonly unknown[]>(
    accepts: IpcHandler<RendererOwner>['accepts'],
    run: (owner: RendererOwner, args: Args) => unknown,
    failure?: string,
  ): IpcHandler<RendererOwner> => ({ accepts, run: (owner, args) => run(owner, args as unknown as Args), ...(failure ? { failure } : {}) });

  const projectFileHandler = (channel: string) => handler(
    // The shared handler validates the message against the schema of the operation and answers a typed refusal.
    () => true,
    (owner, args) => deps.projectFiles.handle(owner.ownerId, channel, args),
  );

  const table: Record<string, IpcHandler<RendererOwner>> = {
    [APP_INFO_CHANNEL.GET]: handler(noArguments, () => deps.appInfo()),

    [CLOSE_GUARD_CHANNEL.SET_DIRTY]: handler(oneArgument(isAllowedCloseGuardDirty), (_owner, [dirty]: [boolean]) => { deps.closeGuard.setDirty(dirty); }),
    [CLOSE_GUARD_CHANNEL.CLOSE_NOW]: handler(noArguments, async (owner) => {
      const action = deps.closeGuard.confirm();
      // The user answered save or discard: nothing is left to recover, so the next start offers nothing (IDE-006).
      const root = action ? deps.projectFiles.currentRoot(owner.ownerId) : null;
      const recovery = deps.recoveryStore();
      if (root !== null && recovery) await recovery.discard(root, null).catch(() => undefined);
      if (action) deps.completeGuardedAction(action);
    }),

    [TOOL_EXECUTION_AUDIT_CHANNEL.LIST]: handler(noArguments, () => deps.toolExecutionAudit.list()),

    ...createLearnProgressHandlers<RendererOwner>(deps.learnProgress),

    // Per-project session (IDE-008): the renderer names the window's folder by its opaque id; the main process finds the
    // real path, validates the document and keeps it under the user-data directory, never inside the project.
    [SESSION_CHANNEL.LOAD]: handler(oneArgument(isAllowedSessionLoadRequest), async (owner, [request]: [{ rootId: string }]) => {
      const store = deps.sessionStore();
      if (!store) throw denied();
      return store.load(folderOf(owner, request.rootId));
    }),
    [SESSION_CHANNEL.SAVE]: handler(oneArgument(isAllowedSessionSaveRequest), async (owner, [request]: [{ rootId: string; state: unknown }]) => {
      const store = deps.sessionStore();
      if (!store) throw denied();
      await store.save(folderOf(owner, request.rootId), request.state);
      return null;
    }),

    // The serial port the user chose in the dialog of the window (IDE-018): a request id and a port id of the offer, or a cancel.
    // The broker answers Electron's one-time callback and ignores an answer that is not from the window that was asked.
    [PORT_CHOICE_CHANNEL.CHOOSE]: handler(oneArgument(isSerialPortChoice), (owner, [choice]: [SerialPortChoice]) => {
      deps.serialPorts.choose(owner.ownerId, choice.requestId, choice.portId);
      return null;
    }),
    [PORT_CHOICE_CHANNEL.LIST]: handler(oneArgument(isSerialPortListRequest), (owner, [request]: [SerialPortListRequest]) => (
      deps.serialPorts.list(owner.ownerId, request.requestId)
    )),

    // Update check (IDE-010): one fixed address, no argument from the renderer.
    [UPDATE_CHECK_CHANNEL.RUN]: handler(noArguments, () => deps.checkForUpdate()),

    // Firmware images (REL-025): the manifest and files of this installation. Listing only: Studio never flashes a board.
    [FIRMWARE_IMAGES_CHANNEL.LIST]: handler(noArguments, () => deps.firmwareImages()),

    // Recovery of modified files (IDE-006): kept under the user-data directory, named by the real path of the window's folder.
    [RECOVERY_CHANNEL.WRITE]: handler(oneArgument(isAllowedRecoveryWriteRequest), async (owner, [request]: [{ rootId: string; path: string; content: string }]) => {
      const store = deps.recoveryStore();
      if (!store) throw denied();
      await store.write(folderOf(owner, request.rootId), request.path, request.content);
      return null;
    }),
    [RECOVERY_CHANNEL.LIST]: handler(oneArgument(isAllowedRecoveryListRequest), async (owner, [request]: [{ rootId: string }]) => {
      const store = deps.recoveryStore();
      if (!store) throw denied();
      return store.list(folderOf(owner, request.rootId));
    }),
    [RECOVERY_CHANNEL.DISCARD]: handler(oneArgument(isAllowedRecoveryDiscardRequest), async (owner, [request]: [{ rootId: string; path: string | null }]) => {
      const store = deps.recoveryStore();
      if (!store) throw denied();
      await store.discard(folderOf(owner, request.rootId), request.path);
      return null;
    }),

    [NATIVE_SIMULATION_CHANNEL.START_SESSION]: handler(noArguments, (owner) => deps.nativeSimulation.start(owner)),
    [NATIVE_SIMULATION_CHANNEL.STOP_SESSION]: handler(noArguments, (owner) => deps.nativeSimulation.stop(owner)),
    [NATIVE_SIMULATION_CHANNEL.REQUEST]: handler(oneArgument(isAllowedNativeSimulationRequest), (owner, [request]: [NativeSimulationRequest]) => deps.nativeSimulation.request(owner, request)),

    [WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_FILE]: handler(
      oneArgument((manifestPath) => typeof manifestPath === 'string'),
      async (owner, [manifestPath]: [string]) => deps.workspaceGateway.registerProjectManifest(owner.ownerId, manifestPath, deps.projectFiles.currentRoot(owner.ownerId)),
      WORKSPACE_FAILED,
    ),
    // The project folder the window chose is the workspace of Build, Tests and Simulate: the renderer sends the id of
    // that folder, never a path, and no zplc.json has to be chosen again (IDE-001).
    [WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_ROOT]: handler(
      oneArgument(isAllowedWorkspaceRootRequest),
      async (owner, [request]: [{ rootId: string }]) => {
        const root = folderOf(owner, request.rootId);
        return deps.workspaceGateway.registerProjectManifest(owner.ownerId, path.join(root, 'zplc.json'), root);
      },
      WORKSPACE_FAILED,
    ),
    [WORKSPACE_TESTS_CHANNEL.RUN]: handler(
      oneArgument(isAllowedWorkspaceTestRunRequest),
      (owner, [request]: [{ workspaceId: string; rootId: string; scenarioId?: string }]) => deps.workspaceGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, async (root, options) => {
        const toolApi = await deps.loadToolApi();
        const { value, execution } = request.scenarioId === undefined
          ? await inWorker(toolApi, options, { operation: 'test', root }, 'tests:run', 'test')
          : await inWorker(toolApi, options, { operation: 'scenario-run', root, scenarioId: request.scenarioId }, 'tests:run', 'scenario-run');
        return { ...(value as object), execution };
      }, folderOf(owner, request.rootId)),
      WORKSPACE_FAILED,
    ),
    [WORKSPACE_TESTS_CHANNEL.CANCEL]: handler(noArguments, (owner) => deps.workspaceGateway.cancel(owner.ownerId)),
    [WORKSPACE_TESTS_CHANNEL.COMPILE]: handler(
      oneArgument(isAllowedWorkspaceOperationRequest),
      (owner, [request]: [{ workspaceId: string; rootId: string }]) => deps.workspaceGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, async (root, options) => {
        const toolApi = await deps.loadToolApi();
        const { value, execution } = await inWorker(toolApi, options, { operation: 'compile', root }, 'compiler:check', 'compile');
        return toWorkspaceCompileEnvelope(value, execution);
      }, folderOf(owner, request.rootId)),
      WORKSPACE_FAILED,
    ),
    [WORKSPACE_TESTS_CHANNEL.SAFETY_CHECK]: handler(
      oneArgument(isAllowedWorkspaceOperationRequest),
      async (owner, [request]: [{ workspaceId: string; rootId: string }]) => {
        const result = await deps.workspaceGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, async (root, options) => {
          const toolApi = await deps.loadToolApi();
          const { value, execution } = await inWorker(toolApi, options, { operation: 'safety-check', root }, 'safety:check', 'safety-check');
          return { ...(value as object), execution };
        }, folderOf(owner, request.rootId));
        const safe = sanitizeWorkspaceSafetyCheck(result);
        if (!safe) throw new Error(WORKSPACE_FAILED);
        return safe;
      },
      WORKSPACE_FAILED,
    ),

    // The lesson check (LRN-022): the program of the folder the window shows is graded against the scenario of the lesson
    // package, in the tool worker like a scenario run (cancellable, one run at a time, bound to that folder). The renderer
    // names a lesson, never a scenario; what it receives is a grade record or a fixed reason.
    [WORKSPACE_TESTS_CHANNEL.LESSON_CHECK]: handler(
      oneArgument(isLessonCheckRequest),
      async (owner, [request]: [{ workspaceId: string; rootId: string; lessonId: string }]) => {
        const answer = await deps.workspaceGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, async (root, options) => {
          const toolApi = await deps.loadToolApi();
          const { value, execution } = await inWorker(toolApi, options, { operation: 'lesson-check', root, lessonId: request.lessonId }, 'tests:run', 'scenario-run');
          return lessonCheckAnswer(value, execution);
        }, folderOf(owner, request.rootId));
        if (!answer) throw new Error(WORKSPACE_FAILED);
        return answer;
      },
      WORKSPACE_FAILED,
    ),

    [CANDIDATE_CHANGE_SET_CHANNEL.REVIEW]: handler(
      oneArgument(isAllowedCandidateChangeSetReviewRequest),
      async (owner, [request]: [{ workspaceId: string; edit: { path: string; content: string } }]) => {
        const result = await deps.workspaceGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, async (root, options) => {
          const toolApi = await deps.loadToolApi();
          let value: unknown;
          try {
            value = await deps.toolWorker.run({ operation: 'change-set-review', root, edits: [{ path: request.edit.path, content: request.edit.content }] }, options.signal);
          } catch {
            await finishAgentReviewExecution(toolApi, options, { evidence: { outcome: 'failed' } });
            throw new Error(WORKSPACE_FAILED);
          }
          await finishAgentReviewExecution(toolApi, options, value);
          return value;
        }, deps.projectFiles.currentRoot(owner.ownerId));
        const safe = sanitizeCandidateChangeSetReview(result, request.edit.path);
        if (!safe) throw new Error(WORKSPACE_FAILED);
        return safe;
      },
      WORKSPACE_FAILED,
    ),

    [AI_PROVIDER_CHANNEL.GET_STATUS]: handler(noArguments, () => provider().getStatus()),
    [AI_PROVIDER_CHANNEL.GET_CONFIG]: handler(noArguments, () => provider().getConfig()),
    [AI_PROVIDER_CHANNEL.SAVE_CONFIG]: handler(oneArgument(isAllowedAiProviderConfig), (_owner, [config]: [{ enabled: boolean; endpoint: string; model: string }]) => provider().saveConfig(config)),
    [AI_PROVIDER_CHANNEL.STORE_KEY]: handler(oneArgument(isAllowedAiProviderKey), (_owner, [key]: [string]) => provider().storeKey(key)),
    [AI_PROVIDER_CHANNEL.CLEAR_KEY]: handler(noArguments, () => provider().clearKey()),
    [AI_PROVIDER_CHANNEL.REQUEST]: handler(oneArgument(isAllowedAiProviderRequest), (owner, [request]: [AiRequest]) => {
      const active = provider();
      return deps.workspaceGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, (root, options) => active.request(root, request, options.signal), deps.projectFiles.currentRoot(owner.ownerId));
    }),
    [AI_PROVIDER_CHANNEL.CANCEL]: handler(noArguments, (owner) => {
      const fromProvider = provider().cancel();
      const fromWorkspace = deps.workspaceGateway.cancel(owner.ownerId);
      return { requested: fromProvider.requested || fromWorkspace.requested };
    }),

    [TOOLCHAIN_CHANNEL.INSPECT]: handler(noArguments, async (owner) => {
      const selected = await deps.pickToolchainRepository();
      if (!deps.isCurrent(owner)) throw denied();
      if (selected === null) {
        deps.firmwareGateway.revokeOwner(owner.ownerId);
        return null;
      }
      const toolApi = await deps.loadToolApi();
      const inspect = toolApi.toolchainInspect;
      if (typeof inspect !== 'function') throw new Error('Toolchain inspection failed');
      if (!deps.isCurrent(owner)) throw denied();
      const start = toolApi.startToolExecution('human-studio', 'toolchain:inspect', 'toolchain-inspect');
      const value = await deps.firmwareGateway.inspect(owner.ownerId, selected, inspect);
      return { ...(value as object), execution: await finishStudioExecution(toolApi, start, 'toolchain:inspect', 'toolchain-inspect', value) };
    }, 'Toolchain inspection failed'),

    [FIRMWARE_BUILD_CHANNEL.START]: handler(oneArgument(isAllowedFirmwareBuildRequest), async (owner, [request]: [{ ideId: string }]) => {
      const toolApi = await deps.loadToolApi();
      const inspect = toolApi.toolchainInspect;
      const build = toolApi.firmwareBuild;
      if (typeof inspect !== 'function' || typeof build !== 'function') throw new Error('Firmware build failed');
      if (!deps.isCurrent(owner)) throw denied();
      return deps.firmwareGateway.start(owner.ownerId, request, inspect, async () => {
        const approved = await deps.confirmFirmwareBuild(request.ideId);
        if (!deps.isCurrent(owner)) throw denied();
        return approved;
      }, async (root, ideId, options) => {
        const value = await build(root, ideId, options);
        return { ...(value as object), execution: await finishStudioExecution(toolApi, options, 'firmware:build', 'firmware-build', value) };
      });
    }, 'Firmware build failed'),
    [FIRMWARE_BUILD_CHANNEL.CANCEL]: handler(noArguments, (owner) => deps.firmwareGateway.cancel(owner.ownerId)),
  };

  for (const channel of Object.values(PROJECT_FILES_CHANNEL)) table[channel] = projectFileHandler(channel);
  return table;
}
