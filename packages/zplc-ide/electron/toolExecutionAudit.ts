import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const CAPACITY = 100;
const MAX_FILE_BYTES = 64 * 1024;
const FILE_NAME = 'tool-execution-audit.v1.json';
const DOCUMENT_KEYS = ['schemaVersion', 'executions'] as const;
const ENVELOPE_KEYS = ['schemaVersion', 'jobId', 'actor', 'permission', 'operation', 'outcome', 'startedAt', 'finishedAt'] as const;
const STORAGE_ERROR = 'Tool execution audit unavailable';

export type ToolExecutionAuditValidator = (value: unknown) => boolean;
type ToolExecutionAuditEnvelope = Record<(typeof ENVELOPE_KEYS)[number], unknown>;
type AuditDocument = { schemaVersion: 1; executions: ToolExecutionAuditEnvelope[] };

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) return null;
    const record = value as Record<string, unknown>;
    const names = Object.getOwnPropertyNames(record);
    if (names.length !== keys.length || !keys.every((key) => names.includes(key))) return null;
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    }
    return record;
  } catch { return null; }
}

function copyEnvelope(value: ToolExecutionAuditEnvelope): ToolExecutionAuditEnvelope { return { ...value }; }

function unsupportedDirectorySync(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EINVAL' || code === 'ENOTSUP' || code === 'EOPNOTSUPP' || code === 'EISDIR';
}

function auditDocument(value: unknown, validate: ToolExecutionAuditValidator): AuditDocument | null {
  const document = exactRecord(value, DOCUMENT_KEYS);
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.executions)
    || document.executions.length > CAPACITY) return null;
  const executions: ToolExecutionAuditEnvelope[] = [];
  for (const execution of document.executions) {
    const envelope = exactRecord(execution, ENVELOPE_KEYS);
    if (!envelope || !validate(envelope)) return null;
    executions.push(copyEnvelope(envelope as ToolExecutionAuditEnvelope));
  }
  return { schemaVersion: 1, executions };
}

/** Metadata-only, fail-closed evidence; Tool API supplies the canonical validator at startup. */
export function createToolExecutionAudit() {
  let completed: ToolExecutionAuditEnvelope[] = [];
  let storageRoot = '';
  let storageUntrusted = false;
  let opened = false;
  let openStarted = false;
  let validate: ToolExecutionAuditValidator | null = null;
  let writes: Promise<void> = Promise.resolve();
  const filePath = (): string => path.join(storageRoot, FILE_NAME);

  async function readDocument(): Promise<AuditDocument | null> {
    let handle;
    try {
      handle = await open(filePath(), constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error: unknown) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { schemaVersion: 1, executions: [] } : null;
    }
    try {
      const status = await handle.stat();
      if (!status.isFile() || status.size > MAX_FILE_BYTES || !validate) return null;
      const content = await handle.readFile();
      return content.byteLength <= MAX_FILE_BYTES ? auditDocument(JSON.parse(content.toString('utf8')), validate) : null;
    } catch { return null; } finally { await handle.close().catch(() => undefined); }
  }

  async function publish(next: ToolExecutionAuditEnvelope[]): Promise<void> {
    if (storageUntrusted || !storageRoot) throw new Error(STORAGE_ERROR);
    const temporary = path.join(storageRoot, `.${FILE_NAME}.${randomUUID()}.tmp`);
    const encoded = Buffer.from(JSON.stringify({ schemaVersion: 1, executions: next }));
    if (encoded.byteLength > MAX_FILE_BYTES) {
      storageUntrusted = true;
      throw new Error(STORAGE_ERROR);
    }
    try {
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try { await handle.writeFile(encoded); await handle.sync(); } finally { await handle.close(); }
      await chmod(temporary, 0o600);
      await rename(temporary, filePath());
      await chmod(filePath(), 0o600).catch(() => undefined);
      // Windows has no portable directory fsync through Node; the temp file is still synced before rename.
      if (process.platform !== 'win32') {
        let directory;
        try {
          directory = await open(storageRoot, constants.O_RDONLY);
          await directory.sync();
        } catch (error: unknown) {
          if (!unsupportedDirectorySync(error)) throw error;
        } finally { await directory?.close().catch(() => undefined); }
      }
    } catch {
      storageUntrusted = true;
      await unlink(temporary).catch(() => undefined);
      throw new Error(STORAGE_ERROR);
    }
  }

  return {
    async open(userDataPath: string, envelopeValidator: ToolExecutionAuditValidator): Promise<void> {
      if (openStarted) throw new Error(STORAGE_ERROR);
      openStarted = true;
      storageRoot = userDataPath;
      validate = envelopeValidator;
      opened = true;
      try {
        let root = await lstat(storageRoot).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        });
        if (!root) {
          await mkdir(storageRoot, { recursive: true, mode: 0o700 });
          root = await lstat(storageRoot);
        }
        if (!root.isDirectory() || root.isSymbolicLink()) { storageUntrusted = true; completed = []; return; }
        await chmod(storageRoot, 0o700);
        const status = await lstat(filePath()).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        });
        if (status && (!status.isFile() || status.isSymbolicLink())) { storageUntrusted = true; completed = []; return; }
        const document = await readDocument();
        if (!document) { storageUntrusted = true; completed = []; return; }
        completed = document.executions;
      } catch { storageUntrusted = true; completed = []; }
    },

    async add(envelope: unknown): Promise<void> {
      if (!opened || !validate || !exactRecord(envelope, ENVELOPE_KEYS) || !validate(envelope)) throw new Error(STORAGE_ERROR);
      const entry = copyEnvelope(envelope as ToolExecutionAuditEnvelope);
      const write = writes.then(async () => {
        if (storageUntrusted) throw new Error(STORAGE_ERROR);
        const next = [...completed, entry].slice(-CAPACITY);
        await publish(next);
        completed = next;
      });
      writes = write.catch(() => undefined);
      return write;
    },

    list(): AuditDocument { return { schemaVersion: 1, executions: completed.map(copyEnvelope) }; },
  };
}
