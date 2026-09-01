import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';

import { isAllowedWorkspaceTestRequest } from './security.js';

export interface WorkspaceTestToken {
  workspaceId: string;
}

interface WorkspaceIdentity {
  dev: string;
  ino: string;
  ctimeNs: string;
}

interface RegisteredWorkspace extends WorkspaceTestToken {
  ownerWebContentsId: number;
  canonicalRoot: string;
  identity: WorkspaceIdentity;
}

interface PendingRegistration {
  ownerWebContentsId: number;
  generation: number;
}

export interface WorkspaceTestRunOptions {
  signal: AbortSignal;
  /** Opaque execution identity allocated after the workspace request is admitted. */
  jobId: string;
  startedAt: string;
}

const UNAVAILABLE = 'Workspace is unavailable';

function unavailable(): Error {
  return new Error(UNAVAILABLE);
}

function validOwner(ownerWebContentsId: unknown): ownerWebContentsId is number {
  return typeof ownerWebContentsId === 'number'
    && Number.isSafeInteger(ownerWebContentsId)
    && ownerWebContentsId > 0;
}

function identityOf(status: { dev: bigint; ino: bigint; ctimeNs: bigint }): WorkspaceIdentity {
  return { dev: String(status.dev), ino: String(status.ino), ctimeNs: String(status.ctimeNs) };
}

function sameIdentity(left: WorkspaceIdentity, right: WorkspaceIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.ctimeNs === right.ctimeNs;
}

async function inspectRoot(candidateRoot: unknown): Promise<Pick<RegisteredWorkspace, 'canonicalRoot' | 'identity'>> {
  if (typeof candidateRoot !== 'string' || !isAbsolute(candidateRoot)) throw unavailable();
  try {
    const selected = await lstat(candidateRoot, { bigint: true });
    if (selected.isSymbolicLink() || !selected.isDirectory()) throw unavailable();

    const canonicalRoot = await realpath(candidateRoot);
    const canonical = await lstat(canonicalRoot, { bigint: true });
    if (canonical.isSymbolicLink() || !canonical.isDirectory()) throw unavailable();
    return { canonicalRoot, identity: identityOf(canonical) };
  } catch {
    throw unavailable();
  }
}

async function inspectProjectManifest(candidatePath: unknown): Promise<Pick<RegisteredWorkspace, 'canonicalRoot' | 'identity'>> {
  if (typeof candidatePath !== 'string' || !isAbsolute(candidatePath) || basename(candidatePath) !== 'zplc.json') throw unavailable();
  try {
    const manifest = await lstat(candidatePath, { bigint: true });
    if (manifest.isSymbolicLink() || !manifest.isFile()) throw unavailable();
    const inspected = await inspectRoot(dirname(candidatePath));
    const canonicalManifest = await realpath(candidatePath);
    if (canonicalManifest !== join(inspected.canonicalRoot, 'zplc.json')) throw unavailable();
    const canonical = await lstat(canonicalManifest, { bigint: true });
    if (canonical.isSymbolicLink() || !canonical.isFile()) throw unavailable();
    return inspected;
  } catch {
    throw unavailable();
  }
}

async function revalidateRoot(workspace: RegisteredWorkspace): Promise<boolean> {
  try {
    const currentCanonicalRoot = await realpath(workspace.canonicalRoot);
    if (currentCanonicalRoot !== workspace.canonicalRoot) return false;
    const status = await lstat(workspace.canonicalRoot, { bigint: true });
    return !status.isSymbolicLink()
      && status.isDirectory()
      && sameIdentity(workspace.identity, identityOf(status));
  } catch {
    return false;
  }
}

/**
 * Keeps the sole desktop test workspace opaque to the renderer until a future,
 * separately reviewed IPC boundary is wired to it.
 */
export function createWorkspaceTestGateway() {
  let workspace: RegisteredWorkspace | undefined;
  let pendingRegistration: PendingRegistration | undefined;
  let registrationGeneration = 0;
  let busy = false;
  let active: { owner: number; controller: AbortController; jobId: string; startedAt: string } | undefined;

  const register = async (
    ownerWebContentsId: number,
    inspect: () => Promise<Pick<RegisteredWorkspace, 'canonicalRoot' | 'identity'>>,
  ): Promise<WorkspaceTestToken> => {
      if (!validOwner(ownerWebContentsId) || busy) throw unavailable();
      busy = true;
      const generation = ++registrationGeneration;
      pendingRegistration = { ownerWebContentsId, generation };
      try {
        const inspected = await inspect();
        if (pendingRegistration?.generation !== generation) throw unavailable();
        workspace = {
          workspaceId: randomUUID(),
          ownerWebContentsId,
          ...inspected,
        };
        return { workspaceId: workspace.workspaceId };
      } finally {
        if (pendingRegistration?.generation === generation) pendingRegistration = undefined;
        busy = false;
      }
  };

  return {
    register(ownerWebContentsId: number, candidateRoot: string): Promise<WorkspaceTestToken> {
      return register(ownerWebContentsId, () => inspectRoot(candidateRoot));
    },

    registerProjectManifest(ownerWebContentsId: number, candidateManifest: string): Promise<WorkspaceTestToken> {
      return register(ownerWebContentsId, () => inspectProjectManifest(candidateManifest));
    },

    async run<T>(
      ownerWebContentsId: number,
      request: unknown,
      runner: (canonicalRoot: string, options: WorkspaceTestRunOptions) => Promise<T> | T,
    ): Promise<T> {
      if (!validOwner(ownerWebContentsId)
        || busy
        || !isAllowedWorkspaceTestRequest(request)
        || !workspace) throw unavailable();

      const admittedWorkspace = workspace;
      if (admittedWorkspace.ownerWebContentsId !== ownerWebContentsId
        || admittedWorkspace.workspaceId !== request.workspaceId) throw unavailable();

      busy = true;
      const controller = new AbortController();
      const execution = { owner: ownerWebContentsId, controller, jobId: randomUUID(), startedAt: new Date().toISOString() };
      active = execution;
      try {
        if (!await revalidateRoot(admittedWorkspace)) throw unavailable();
        try {
          return await runner(admittedWorkspace.canonicalRoot, { signal: controller.signal, jobId: execution.jobId, startedAt: execution.startedAt });
        } catch {
          throw unavailable();
        }
      } finally {
        if (active?.controller === controller) active = undefined;
        busy = false;
      }
    },

    cancel(ownerWebContentsId: number): { requested: boolean } {
      if (!validOwner(ownerWebContentsId) || active?.owner !== ownerWebContentsId) return { requested: false };
      active.controller.abort();
      return { requested: true };
    },

    revokeOwner(ownerWebContentsId: number): boolean {
      if (!validOwner(ownerWebContentsId)) return false;
      let revoked = false;
      if (pendingRegistration?.ownerWebContentsId === ownerWebContentsId) {
        pendingRegistration = undefined;
        revoked = true;
      }
      if (workspace?.ownerWebContentsId === ownerWebContentsId) {
        workspace = undefined;
        revoked = true;
      }
      if (active?.owner === ownerWebContentsId) {
        active.controller.abort();
        revoked = true;
      }
      return revoked;
    },
  };
}
