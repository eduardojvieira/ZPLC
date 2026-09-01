import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { isAllowedFirmwareBuildRequest } from './security.js';

interface RootIdentity { dev: string; ino: string; }
interface Selection { owner: number; root: string; identity: RootIdentity; boards: Set<string>; }
interface Lease { owner: number; epoch: number; }
export interface FirmwareBuildRunOptions { signal: AbortSignal; jobId: string; startedAt: string; }
type Inspect = (root: string) => Promise<unknown>;
type Build = (root: string, ideId: string, options: FirmwareBuildRunOptions) => Promise<unknown>;
type Approve = () => Promise<boolean>;

const UNAVAILABLE = 'Firmware build unavailable';
const unavailable = (): Error => new Error(UNAVAILABLE);
const validOwner = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const identityOf = (status: { dev: number; ino: number }): RootIdentity => ({ dev: String(status.dev), ino: String(status.ino) });
const sameIdentity = (left: RootIdentity, right: RootIdentity): boolean => left.dev === right.dev && left.ino === right.ino;
const plain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

async function inspectRoot(candidate: unknown): Promise<Pick<Selection, 'root' | 'identity'>> {
  if (typeof candidate !== 'string' || !isAbsolute(candidate)) throw unavailable();
  try {
    const selected = await lstat(candidate);
    if (selected.isSymbolicLink() || !selected.isDirectory()) throw unavailable();
    const root = await realpath(candidate);
    const canonical = await lstat(root);
    if (canonical.isSymbolicLink() || !canonical.isDirectory()) throw unavailable();
    return { root, identity: identityOf(canonical) };
  } catch { throw unavailable(); }
}

async function sameRoot(selection: Selection): Promise<boolean> {
  try {
    if (await realpath(selection.root) !== selection.root) return false;
    const status = await lstat(selection.root);
    return !status.isSymbolicLink() && status.isDirectory() && sameIdentity(selection.identity, identityOf(status));
  } catch { return false; }
}

function readyBoards(result: unknown): Set<string> | undefined {
  if (!plain(result) || result.ok !== true || !plain(result.summary) || result.summary.ready !== true || !Array.isArray(result.summary.boards)) return undefined;
  const boards = new Set<string>();
  for (const board of result.summary.boards) {
    if (!plain(board) || typeof board.ideId !== 'string' || !/^[a-z0-9][a-z0-9_]{0,63}$/.test(board.ideId) || boards.has(board.ideId)) return undefined;
    boards.add(board.ideId);
  }
  return boards.size > 0 ? boards : undefined;
}

/** Keeps the selected checkout private to Electron main while one local build is admitted at a time. */
export function createFirmwareBuildGateway(options: { platform?: NodeJS.Platform } = {}) {
  const platform = options.platform ?? process.platform;
  let selection: Selection | undefined;
  let epoch = 0;
  let lease: Lease | undefined;
  let active: (Lease & { controller: AbortController; jobId: string; startedAt: string }) | undefined;

  const acquire = (owner: number): Lease => {
    if (lease) throw unavailable();
    const next = { owner, epoch: ++epoch };
    lease = next;
    return next;
  };
  const current = (candidate: Lease): boolean => lease === candidate && epoch === candidate.epoch;
  const release = (candidate: Lease): void => { if (lease === candidate) lease = undefined; };
  const cancelled = (candidate: Lease, controller: AbortController): boolean => !current(candidate) || controller.signal.aborted;

  const inspect = async (owner: number, candidate: string, toolchainInspect: Inspect): Promise<unknown> => {
    if ((platform !== 'darwin' && platform !== 'linux') || !validOwner(owner)) throw unavailable();
    const pending = acquire(owner);
    selection = undefined;
    try {
      const candidateSelection = await inspectRoot(candidate);
      if (!current(pending)) throw unavailable();
      let result: unknown;
      try { result = await toolchainInspect(candidateSelection.root); } catch { throw unavailable(); }
      if (!current(pending)) throw unavailable();
      const boards = readyBoards(result);
      if (!boards || !(await sameRoot({ owner, ...candidateSelection, boards }))) return result;
      if (!current(pending)) throw unavailable();
      selection = { owner, ...candidateSelection, boards };
      return result;
    } finally { release(pending); }
  };

  const start = async (owner: number, request: unknown, toolchainInspect: Inspect, approve: Approve, firmwareBuild: Build): Promise<unknown | null> => {
    if ((platform !== 'darwin' && platform !== 'linux') || !validOwner(owner) || !isAllowedFirmwareBuildRequest(request) || !selection || selection.owner !== owner) throw unavailable();
    const operation = acquire(owner);
    const controller = new AbortController();
    const execution = { ...operation, controller, jobId: randomUUID(), startedAt: new Date().toISOString() };
    active = execution;
    const admitted = selection;
    try {
      if (cancelled(operation, controller)) return null;
      if (!(await sameRoot(admitted))) throw unavailable();
      if (cancelled(operation, controller) || selection !== admitted) return null;
      let preflight: unknown;
      try { preflight = await toolchainInspect(admitted.root); } catch { throw unavailable(); }
      if (cancelled(operation, controller) || selection !== admitted) return null;
      const boards = readyBoards(preflight);
      if (!boards?.has(request.ideId) || !(await sameRoot(admitted))) throw unavailable();
      if (cancelled(operation, controller) || selection !== admitted) return null;
      let approved: boolean;
      try { approved = await approve(); } catch { throw unavailable(); }
      if (cancelled(operation, controller) || selection !== admitted || !approved) return null;
      if (!(await sameRoot(admitted))) throw unavailable();
      if (cancelled(operation, controller) || selection !== admitted) return null;
      try { return await firmwareBuild(admitted.root, request.ideId, { signal: controller.signal, jobId: execution.jobId, startedAt: execution.startedAt }); }
      catch { throw unavailable(); }
    } finally {
      if (active?.epoch === operation.epoch) active = undefined;
      release(operation);
    }
  };

  return {
    inspect,
    start,
    cancel(owner: number): { requested: boolean } {
      if (!validOwner(owner) || active?.owner !== owner) return { requested: false };
      active.controller.abort();
      return { requested: true };
    },
    revokeOwner(owner: number): boolean {
      if (!validOwner(owner)) return false;
      let revoked = false;
      if (selection?.owner === owner) { selection = undefined; revoked = true; }
      if (lease?.owner === owner) { epoch += 1; revoked = true; }
      if (active?.owner === owner) { active.controller.abort(); revoked = true; }
      return revoked;
    },
  };
}
