import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CANDIDATE_CHANGE_CAP,
  candidateLanguageOf,
  isCandidateChangePath,
  isCandidateSourcePathPattern,
  type CandidateLanguage,
} from '../src/ai/candidatePaths.js';
import { manifestForAssistant, manifestSensitivePaths } from '../src/ai/manifestPrivacy.js';

export type AiErrorCode =
  | 'AI_UNCONFIGURED'
  | 'AI_VAULT_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_CANCELLED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_RESPONSE_INVALID'
  | 'AI_RESPONSE_LIMIT'
  | 'AI_CONTEXT_REJECTED';
export type AiMode = 'ask' | 'plan' | 'edit' | 'debug';

export interface AiProviderConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
}
export interface AiProviderStatus {
  configured: boolean;
  enabled: boolean;
  vaultAvailable: boolean;
  keyStored: boolean;
  vaultReason?: 'unavailable' | 'insecure-backend';
}
export interface AiRequest {
  workspaceId: string;
  mode: AiMode;
  prompt: string;
  /** The program the person has open, in any of the five languages; edit mode needs it as the baseline of a proposal. */
  activeFile?: { fileId: string; path: string };
  diagnostics?: Array<{ code: string; path?: string; line?: number; column?: number }>;
  trace?: Array<{ atMs: number; signal: string; value: boolean | number }>;
}
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

type Stored = { schemaVersion: 1; enabled: boolean; endpoint: string; model: string; keyCiphertext?: string };
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
const FILE = 'ai-provider.json';
const MAX_FILE = 64 * 1024;
const MAX_KEY = 16 * 1024;
const MAX_SOURCE = 64 * 1024;
const MAX_RESPONSE = 256 * 1024;
const MAX_ANSWER = 16 * 1024;
const MAX_REPLACEMENT = 256 * 1024;
const MAX_MANIFEST = 128 * 1024;
const MAX_MANIFEST_SUMMARY = 24 * 1024;
const MAX_PROGRAMS = 128;
const MAX_REPLACE_BASE = 256 * 1024;
const MAX_SOURCE_FILE = 256 * 1024;
const MAX_BODY = 128 * 1024;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const KNOWN_SECRET_PATTERNS = [
  /(?:api|client|access|refresh)[_. -]?(?:key|secret|token)\b|(?:aws[_. -]?)?secret(?:[_. -]?access)?[_. -]?key\b/i,
  /(?:authorization|bearer|password|passphrase|private[_. -]?key)\b/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
];
const SYSTEM_POLICY =
  'You are ZPLC Agent. Provide an explanation, or an explanation with one inert proposed change set. Never claim hardware action, never ' +
  'request tools, ' +
  'and never initiate flash, deploy, force, RUN, STOP, recovery, serial, shell, or filesystem operations. ' +
  'To propose a change answer with JSON only: {"answer": "...", "changes": [{"path": "...", "content": "..."}]} with the whole new text ' +
  'of each file ' +
  `and at most ${CANDIDATE_CHANGE_CAP} files. A path is src/<name>.st, .il, .ld.json, .fbd.json or .sfc.json, or zplc.json. ` +
  'A new program file needs a task of its own in a zplc.json change in the same set (a task runs exactly one program). Ladder, FBD and ' +
  'SFC files are the JSON documents of their editors. ' +
  'Never put credentials, keys or passwords in any file. A person reviews every difference and saves it; nothing you propose takes ' +
  'effect before that.';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
/** The name the build reads a program under: case does not tell two programs apart, and main.ld is main.ld.json. */
function sourceKey(path: string): string {
  return path.toLowerCase().replace(/\.(ld|fbd|sfc)$/, '$&.json');
}
function manifestIsAllowed(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && manifestSensitivePaths(parsed).length === 0;
  } catch {
    return false;
  }
}
function code(code: AiErrorCode): { ok: false; code: AiErrorCode } {
  return { ok: false, code };
}
function hasKnownSecretPattern(value: string): boolean {
  return KNOWN_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function canonicalEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return null;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash)
      return null;
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${pathname}`;
  } catch {
    return null;
  }
}
function normalizedConfig(value: unknown): AiProviderConfig | null {
  if (
    !exact(value, ['enabled', 'endpoint', 'model']) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.model !== 'string' ||
    !MODEL.test(value.model)
  )
    return null;
  const endpoint = canonicalEndpoint(value.endpoint);
  return endpoint ? { enabled: value.enabled, endpoint, model: value.model } : null;
}
function vaultState(vault: SafeStorageLike): { usable: boolean; reason?: 'unavailable' | 'insecure-backend' } {
  try {
    if (!vault.isEncryptionAvailable()) return { usable: false, reason: 'unavailable' };
    if (process.platform !== 'linux') return { usable: true };
    return ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(vault.getSelectedStorageBackend?.() ?? '')
      ? { usable: true }
      : { usable: false, reason: 'insecure-backend' };
  } catch {
    return { usable: false, reason: 'unavailable' };
  }
}
function validKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value) <= MAX_KEY &&
    !/\s/.test(value) &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f;
    })
  );
}
function parseStored(value: unknown): Stored | null {
  if (
    !exact(value, ['schemaVersion', 'enabled', 'endpoint', 'model']) &&
    !exact(value, ['schemaVersion', 'enabled', 'endpoint', 'model', 'keyCiphertext'])
  )
    return null;
  if (value.schemaVersion !== 1 || typeof value.enabled !== 'boolean' || typeof value.model !== 'string' || !MODEL.test(value.model))
    return null;
  const endpoint = canonicalEndpoint(value.endpoint);
  if (
    !endpoint ||
    (Object.hasOwn(value, 'keyCiphertext') && (typeof value.keyCiphertext !== 'string' || value.keyCiphertext.length > MAX_FILE))
  )
    return null;
  return Object.hasOwn(value, 'keyCiphertext')
    ? { schemaVersion: 1, enabled: value.enabled, endpoint, model: value.model, keyCiphertext: value.keyCiphertext as string }
    : { schemaVersion: 1, enabled: value.enabled, endpoint, model: value.model };
}
function compact(value: unknown): string | null {
  return typeof value === 'string' && Buffer.byteLength(value) <= MAX_ANSWER ? value : null;
}
async function boundedBody(response: Response, signal: AbortSignal): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  let complete = false;
  try {
    while (true) {
      if (signal.aborted) return null;
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE) return null;
      chunks.push(next.value);
    }
    complete = true;
    return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createAiProvider(options: { userDataPath: string; vault: SafeStorageLike; fetch?: FetchLike }) {
  const file = join(options.userDataPath, FILE);
  const fetcher = options.fetch ?? fetch;
  let active: AbortController | undefined;
  let activeCancelled = false;
  async function stored(): Promise<Stored | null> {
    try {
      const info = await lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_FILE) return null;
      const content = await readFile(file, 'utf8');
      if (Buffer.byteLength(content) > MAX_FILE) return null;
      return parseStored(JSON.parse(content));
    } catch {
      return null;
    }
  }
  async function save(value: Stored): Promise<boolean> {
    let temporary: string | undefined;
    try {
      await mkdir(options.userDataPath, { recursive: true, mode: 0o700 });
      const dir = await lstat(options.userDataPath);
      if (dir.isSymbolicLink() || !dir.isDirectory()) return false;
      const target = await stored();
      if (target === null) {
        try {
          await lstat(file);
          return false;
        } catch {
          /* absent file may be created */
        }
      }
      temporary = `${file}.${randomBytes(16).toString('hex')}.tmp`;
      await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
      temporary = undefined;
      return true;
    } catch {
      return false;
    } finally {
      if (temporary) await unlink(temporary).catch(() => undefined);
    }
  }
  async function publicConfig(): Promise<AiProviderConfig | null> {
    const value = await stored();
    return value ? { enabled: value.enabled, endpoint: value.endpoint, model: value.model } : null;
  }
  async function key(): Promise<string | null> {
    const value = await stored();
    if (!value?.keyCiphertext || !vaultState(options.vault).usable) return null;
    try {
      const decrypted = options.vault.decryptString(Buffer.from(value.keyCiphertext, 'base64'));
      return validKey(decrypted) ? decrypted : null;
    } catch {
      return null;
    }
  }
  /** True when `src` is a real folder of the project, not a link out of it. */
  async function sourceFolderIsReal(root: string): Promise<boolean> {
    try {
      const sourceDirectory = join(root, 'src');
      const status = await lstat(sourceDirectory);
      return !status.isSymbolicLink() && status.isDirectory() && (await realpath(sourceDirectory)) === sourceDirectory;
    } catch {
      return false;
    }
  }
  /** The text of one project file, read without following a link, or null; the manifest and a program have their own limits. */
  async function readProjectFile(root: string, path: string, limit: number): Promise<string | null> {
    const candidate = resolve(root, path);
    if (candidate !== join(root, path)) return null;
    try {
      if (path !== 'zplc.json' && !(await sourceFolderIsReal(root))) return null;
      const status = await lstat(candidate);
      if (status.isSymbolicLink() || !status.isFile() || status.size > limit) return null;
      if ((await realpath(candidate)) !== candidate) return null;
      const text = await readFile(candidate, 'utf8');
      return Buffer.byteLength(text) > limit ? null : text;
    } catch {
      return null;
    }
  }
  async function readActiveSource(
    root: string,
    activeFile: NonNullable<AiRequest['activeFile']>,
  ): Promise<{ source: string; baselineSha256: string; language: CandidateLanguage } | null> {
    const language = candidateLanguageOf(activeFile.path);
    if (!language || activeFile.fileId !== `file:${activeFile.path}`) return null;
    const source = await readProjectFile(root, activeFile.path, MAX_SOURCE);
    if (source === null || hasKnownSecretPattern(source)) return null;
    return { source, baselineSha256: sha256(source), language };
  }
  /**
   * The programs of `src`, the tasks and the manifest without any credential, within the size limits; whatever is unreadable is left out.
   */
  async function readProjectSummary(root: string, withManifest: boolean): Promise<Record<string, unknown> | undefined> {
    const names = await listPrograms(root);
    if (!names) return undefined;
    const programs = names.map((path) => ({ path, language: candidateLanguageOf(path) }));
    const summary: Record<string, unknown> = { programs };
    const text = await readProjectFile(root, 'zplc.json', MAX_MANIFEST);
    let manifest: unknown;
    try {
      manifest = text === null ? undefined : manifestForAssistant(JSON.parse(text));
    } catch {
      manifest = undefined;
    }
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return summary;
    const tasks = (manifest as Record<string, unknown>).tasks;
    const tasksText = JSON.stringify(tasks ?? null);
    if (Array.isArray(tasks) && Buffer.byteLength(tasksText) <= MAX_MANIFEST_SUMMARY && !hasKnownSecretPattern(tasksText))
      summary.tasks = tasks;
    const manifestText = JSON.stringify(manifest);
    if (withManifest && Buffer.byteLength(manifestText) <= MAX_MANIFEST_SUMMARY && !hasKnownSecretPattern(manifestText))
      summary.manifest = manifest;
    return summary;
  }
  async function listPrograms(root: string): Promise<string[] | null> {
    try {
      if (!(await sourceFolderIsReal(root))) return null;
      const entries = await readdir(join(root, 'src'), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && isCandidateSourcePathPattern.test(`src/${entry.name}`))
        .map((entry) => `src/${entry.name}`)
        .sort()
        .slice(0, MAX_PROGRAMS);
    } catch {
      return null;
    }
  }
  /** Where the proposed files stand: the sha256 of the one each replaces, or that it is new; null when the set cannot be one. */
  async function resolveChanges(
    root: string,
    value: unknown,
  ): Promise<Array<{ path: string; kind: 'modify' | 'create'; content: string; baselineSha256?: string }> | null> {
    if (!Array.isArray(value) || value.length < 1 || value.length > CANDIDATE_CHANGE_CAP) return null;
    const existing = await listPrograms(root);
    if (!existing) return null;
    const taken = new Set(existing.map(sourceKey));
    const seen = new Set<string>();
    const resolved: Array<{ path: string; kind: 'modify' | 'create'; content: string; baselineSha256?: string }> = [];
    for (const item of value as unknown[]) {
      if (!exact(item, ['path', 'content'])) return null;
      const { path, content } = item;
      if (
        !isCandidateChangePath(path) ||
        typeof content !== 'string' ||
        content.length === 0 ||
        Buffer.byteLength(content) > MAX_REPLACEMENT
      )
        return null;
      const key = sourceKey(path);
      if (seen.has(key)) return null;
      seen.add(key);
      if (path === 'zplc.json') {
        if (!manifestIsAllowed(content)) return null;
        const before = await readProjectFile(root, path, MAX_MANIFEST);
        if (before === null || before === content) return null;
        resolved.push({ path, kind: 'modify', content, baselineSha256: sha256(before) });
      } else if (existing.includes(path)) {
        const before = await readProjectFile(root, path, MAX_REPLACE_BASE);
        if (before === null || before === content) return null;
        resolved.push({ path, kind: 'modify', content, baselineSha256: sha256(before) });
      } else {
        if (taken.has(key) || Buffer.byteLength(content) > MAX_SOURCE_FILE) return null;
        resolved.push({ path, kind: 'create', content });
      }
    }
    return resolved;
  }
  return {
    async getStatus(): Promise<AiProviderStatus> {
      const config = await publicConfig();
      const storedKey = (await stored())?.keyCiphertext !== undefined;
      const vault = vaultState(options.vault);
      return {
        configured: config !== null && (await key()) !== null,
        enabled: config?.enabled ?? false,
        keyStored: storedKey,
        vaultAvailable: vault.usable,
        ...(vault.reason ? { vaultReason: vault.reason } : {}),
      };
    },
    async getConfig(): Promise<AiProviderConfig | null> {
      return publicConfig();
    },
    async saveConfig(input: unknown): Promise<{ ok: boolean; code?: AiErrorCode }> {
      const config = normalizedConfig(input);
      if (!config) return code('AI_CONTEXT_REJECTED');
      const current = await stored();
      if (!(await save({ schemaVersion: 1, ...config, ...(current?.keyCiphertext ? { keyCiphertext: current.keyCiphertext } : {}) })))
        return code('AI_VAULT_UNAVAILABLE');
      return { ok: true };
    },
    async storeKey(input: unknown): Promise<{ ok: boolean; code?: AiErrorCode }> {
      if (!validKey(input)) return code('AI_CONTEXT_REJECTED');
      const current = await stored();
      if (!current || !vaultState(options.vault).usable) return code('AI_VAULT_UNAVAILABLE');
      try {
        return (await save({ ...current, keyCiphertext: options.vault.encryptString(input).toString('base64') }))
          ? { ok: true }
          : code('AI_VAULT_UNAVAILABLE');
      } catch {
        return code('AI_VAULT_UNAVAILABLE');
      }
    },
    async clearKey(): Promise<{ ok: boolean; code?: AiErrorCode }> {
      const current = await stored();
      return current && (await save({ schemaVersion: 1, enabled: current.enabled, endpoint: current.endpoint, model: current.model }))
        ? { ok: true }
        : code('AI_UNCONFIGURED');
    },
    cancel(): { requested: boolean } {
      if (!active) return { requested: false };
      activeCancelled = true;
      active.abort();
      return { requested: true };
    },
    async request(root: string, request: AiRequest, gatewaySignal: AbortSignal): Promise<unknown> {
      if (gatewaySignal.aborted) return code('AI_CANCELLED');
      if (
        hasKnownSecretPattern(request.prompt) ||
        request.diagnostics?.some(({ code, path }) => hasKnownSecretPattern(code) || (path !== undefined && hasKnownSecretPattern(path))) ||
        request.trace?.some(({ signal }) => hasKnownSecretPattern(signal))
      )
        return code('AI_CONTEXT_REJECTED');
      const config = await publicConfig();
      const secret = await key();
      if (gatewaySignal.aborted) return code('AI_CANCELLED');
      if (!config?.enabled || !secret) return code(vaultState(options.vault).usable ? 'AI_UNCONFIGURED' : 'AI_VAULT_UNAVAILABLE');
      let source: Awaited<ReturnType<typeof readActiveSource>> | undefined;
      if (request.mode === 'edit' && !request.activeFile) return code('AI_CONTEXT_REJECTED');
      if (request.activeFile) {
        // a proposal needs its baseline, so edit mode refuses a file it may not send; the other modes simply go without it
        const activeSource = await readActiveSource(root, request.activeFile);
        if (gatewaySignal.aborted) return code('AI_CANCELLED');
        if (activeSource) source = activeSource;
        else if (request.mode === 'edit') return code('AI_CONTEXT_REJECTED');
      }
      const contextBody = (project: Record<string, unknown> | undefined) =>
        JSON.stringify({
          model: config.model,
          stream: false,
          messages: [
            { role: 'system', content: SYSTEM_POLICY },
            {
              role: 'user',
              content: JSON.stringify({
                mode: request.mode,
                prompt: request.prompt,
                ...(source ? { activeFile: { path: request.activeFile!.path, language: source.language, source: source.source } } : {}),
                ...(project ? { project } : {}),
                ...(request.mode === 'debug' ? { diagnostics: request.diagnostics ?? [], trace: request.trace ?? [] } : {}),
              }),
            },
          ],
        });
      // the project summary is context, not a requirement: it is reduced before a request is refused for its size
      const summary = await readProjectSummary(root, true);
      if (gatewaySignal.aborted) return code('AI_CANCELLED');
      let body = contextBody(summary);
      if (Buffer.byteLength(body) > MAX_BODY && summary) body = contextBody(await readProjectSummary(root, false));
      if (Buffer.byteLength(body) > MAX_BODY && summary) body = contextBody({ programs: summary.programs });
      if (Buffer.byteLength(body) > MAX_BODY) body = contextBody(undefined);
      if (Buffer.byteLength(body) > MAX_BODY) return code('AI_CONTEXT_REJECTED');
      const controller = new AbortController();
      active = controller;
      activeCancelled = false;
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const abort = () => controller.abort();
      gatewaySignal.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetcher(`${config.endpoint}/v1/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body,
        });
        if (!response.ok) return code('AI_PROVIDER_UNAVAILABLE');
        const raw = await boundedBody(response, controller.signal);
        if (raw === null)
          return code(
            controller.signal.aborted ? (gatewaySignal.aborted || activeCancelled ? 'AI_CANCELLED' : 'AI_TIMEOUT') : 'AI_RESPONSE_LIMIT',
          );
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return code('AI_RESPONSE_INVALID');
        }
        if (
          typeof payload !== 'object' ||
          payload === null ||
          Array.isArray(payload) ||
          !Object.hasOwn(payload, 'choices') ||
          !Array.isArray((payload as { choices: unknown }).choices)
        )
          return code('AI_RESPONSE_INVALID');
        const choice = (payload as { choices: unknown[] }).choices[0];
        if (
          (payload as Record<string, unknown>).tool_calls !== undefined ||
          (payload as Record<string, unknown>).function_call !== undefined ||
          typeof choice !== 'object' ||
          choice === null ||
          Array.isArray(choice) ||
          (choice as Record<string, unknown>).tool_calls !== undefined ||
          (choice as Record<string, unknown>).function_call !== undefined
        )
          return code('AI_RESPONSE_INVALID');
        const messageObject = (choice as Record<string, unknown>).message;
        if (
          typeof messageObject !== 'object' ||
          messageObject === null ||
          Array.isArray(messageObject) ||
          (messageObject as Record<string, unknown>).tool_calls !== undefined ||
          (messageObject as Record<string, unknown>).function_call !== undefined ||
          typeof (messageObject as Record<string, unknown>).content !== 'string'
        )
          return code('AI_RESPONSE_INVALID');
        const message = (messageObject as Record<string, unknown>).content as string;
        let answer = compact(message);
        let changes: Awaited<ReturnType<typeof resolveChanges>> | undefined;
        try {
          const parsed = JSON.parse(message) as unknown;
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            !(exact(parsed, ['answer']) || exact(parsed, ['answer', 'changes']))
          )
            return code('AI_RESPONSE_INVALID');
          if (exact(parsed, ['answer']) || exact(parsed, ['answer', 'changes'])) {
            answer = compact(parsed.answer);
            if (Object.hasOwn(parsed, 'changes')) {
              // a change set is a proposal for the person to review, and only an edit request asks for one
              if (request.mode !== 'edit' || !source) return code('AI_RESPONSE_INVALID');
              changes = await resolveChanges(root, parsed.changes);
              if (gatewaySignal.aborted) return code('AI_CANCELLED');
              if (!changes) return code('AI_RESPONSE_INVALID');
            }
          }
        } catch {
          /* plain text is an allowed inert answer */
        }
        if (answer === null) return code('AI_RESPONSE_INVALID');
        return {
          ok: true,
          answer,
          ...(changes ? { changes } : {}),
          ...(source && request.activeFile
            ? {
                workspaceId: request.workspaceId,
                fileId: request.activeFile.fileId,
                path: request.activeFile.path,
                baselineSha256: source.baselineSha256,
              }
            : {}),
        };
      } catch {
        return code(
          controller.signal.aborted
            ? gatewaySignal.aborted || activeCancelled
              ? 'AI_CANCELLED'
              : 'AI_TIMEOUT'
            : 'AI_PROVIDER_UNAVAILABLE',
        );
      } finally {
        clearTimeout(timeout);
        gatewaySignal.removeEventListener('abort', abort);
        if (active === controller) {
          active = undefined;
          activeCancelled = false;
        }
      }
    },
  };
}
