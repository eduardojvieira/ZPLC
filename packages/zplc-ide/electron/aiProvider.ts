import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type AiErrorCode = 'AI_UNCONFIGURED' | 'AI_VAULT_UNAVAILABLE' | 'AI_TIMEOUT' | 'AI_CANCELLED' | 'AI_PROVIDER_UNAVAILABLE' | 'AI_RESPONSE_INVALID' | 'AI_RESPONSE_LIMIT' | 'AI_CONTEXT_REJECTED';
export type AiMode = 'ask' | 'plan' | 'edit' | 'debug';

export interface AiProviderConfig { enabled: boolean; endpoint: string; model: string; }
export interface AiProviderStatus { configured: boolean; enabled: boolean; vaultAvailable: boolean; keyStored: boolean; vaultReason?: 'unavailable' | 'insecure-backend'; }
export interface AiRequest {
  workspaceId: string; mode: AiMode; prompt: string;
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
const ST_PATH = /^src\/[^/\\\0\r\n]+\.st$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const KNOWN_SECRET_PATTERNS = [
  /(?:api|client|access|refresh)[_. -]?(?:key|secret|token)\b|(?:aws[_. -]?)?secret(?:[_. -]?access)?[_. -]?key\b/i,
  /(?:authorization|bearer|password|passphrase|private[_. -]?key)\b/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
];
const SYSTEM_POLICY = 'You are ZPLC Agent. Provide explanation or one inert Structured Text proposal only. Never claim hardware action, never request tools, and never initiate flash, deploy, force, RUN, STOP, recovery, serial, shell, or filesystem operations.';

function code(code: AiErrorCode): { ok: false; code: AiErrorCode } { return { ok: false, code }; }
function hasKnownSecretPattern(value: string): boolean { return KNOWN_SECRET_PATTERNS.some((pattern) => pattern.test(value)); }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function canonicalEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return null;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) return null;
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${pathname}`;
  } catch { return null; }
}
function normalizedConfig(value: unknown): AiProviderConfig | null {
  if (!exact(value, ['enabled', 'endpoint', 'model']) || typeof value.enabled !== 'boolean' || typeof value.model !== 'string' || !MODEL.test(value.model)) return null;
  const endpoint = canonicalEndpoint(value.endpoint);
  return endpoint ? { enabled: value.enabled, endpoint, model: value.model } : null;
}
function vaultState(vault: SafeStorageLike): { usable: boolean; reason?: 'unavailable' | 'insecure-backend' } {
  try {
    if (!vault.isEncryptionAvailable()) return { usable: false, reason: 'unavailable' };
    if (process.platform !== 'linux') return { usable: true };
    return ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(vault.getSelectedStorageBackend?.() ?? '') ? { usable: true } : { usable: false, reason: 'insecure-backend' };
  } catch { return { usable: false, reason: 'unavailable' }; }
}
function validKey(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= MAX_KEY && !/\s/.test(value) && !Array.from(value).some((character) => { const code = character.codePointAt(0) ?? 0; return code < 0x20 || code === 0x7F; }); }
function parseStored(value: unknown): Stored | null {
  if (!exact(value, ['schemaVersion', 'enabled', 'endpoint', 'model']) && !exact(value, ['schemaVersion', 'enabled', 'endpoint', 'model', 'keyCiphertext'])) return null;
  if (value.schemaVersion !== 1 || typeof value.enabled !== 'boolean' || typeof value.model !== 'string' || !MODEL.test(value.model)) return null;
  const endpoint = canonicalEndpoint(value.endpoint);
  if (!endpoint || (Object.hasOwn(value, 'keyCiphertext') && (typeof value.keyCiphertext !== 'string' || value.keyCiphertext.length > MAX_FILE))) return null;
  return Object.hasOwn(value, 'keyCiphertext') ? { schemaVersion: 1, enabled: value.enabled, endpoint, model: value.model, keyCiphertext: value.keyCiphertext as string } : { schemaVersion: 1, enabled: value.enabled, endpoint, model: value.model };
}
function compact(value: unknown): string | null { return typeof value === 'string' && Buffer.byteLength(value) <= MAX_ANSWER ? value : null; }
async function boundedBody(response: Response, signal: AbortSignal): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
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
      const info = await lstat(file); if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_FILE) return null;
      const content = await readFile(file, 'utf8'); if (Buffer.byteLength(content) > MAX_FILE) return null;
      return parseStored(JSON.parse(content));
    } catch { return null; }
  }
  async function save(value: Stored): Promise<boolean> {
    let temporary: string | undefined;
    try {
      await mkdir(options.userDataPath, { recursive: true, mode: 0o700 });
      const dir = await lstat(options.userDataPath); if (dir.isSymbolicLink() || !dir.isDirectory()) return false;
      const target = await stored(); if (target === null) { try { await lstat(file); return false; } catch { /* absent file may be created */ } }
      temporary = `${file}.${randomBytes(16).toString('hex')}.tmp`;
      await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, file); temporary = undefined; return true;
    } catch { return false; } finally { if (temporary) await unlink(temporary).catch(() => undefined); }
  }
  async function publicConfig(): Promise<AiProviderConfig | null> { const value = await stored(); return value ? { enabled: value.enabled, endpoint: value.endpoint, model: value.model } : null; }
  async function key(): Promise<string | null> {
    const value = await stored(); if (!value?.keyCiphertext || !vaultState(options.vault).usable) return null;
    try { const decrypted = options.vault.decryptString(Buffer.from(value.keyCiphertext, 'base64')); return validKey(decrypted) ? decrypted : null; } catch { return null; }
  }
  async function readActiveSource(root: string, activeFile: NonNullable<AiRequest['activeFile']>): Promise<{ source: string; baselineSha256: string } | null> {
    if (!ST_PATH.test(activeFile.path) || activeFile.fileId !== `file:${activeFile.path}`) return null;
    const candidate = resolve(root, activeFile.path); if (candidate !== join(root, activeFile.path)) return null;
    try {
      const sourceDirectory = join(root, 'src');
      const sourceDirectoryStatus = await lstat(sourceDirectory);
      if (sourceDirectoryStatus.isSymbolicLink() || !sourceDirectoryStatus.isDirectory() || await realpath(sourceDirectory) !== sourceDirectory) return null;
      const status = await lstat(candidate); if (status.isSymbolicLink() || !status.isFile() || status.size > MAX_SOURCE) return null;
      if (await realpath(candidate) !== candidate) return null;
      const source = await readFile(candidate, 'utf8');
      if (Buffer.byteLength(source) > MAX_SOURCE || hasKnownSecretPattern(source)) return null;
      return { source, baselineSha256: createHash('sha256').update(source).digest('hex') };
    } catch { return null; }
  }
  return {
    async getStatus(): Promise<AiProviderStatus> {
      const config = await publicConfig(); const storedKey = (await stored())?.keyCiphertext !== undefined; const vault = vaultState(options.vault);
      return { configured: config !== null && (await key()) !== null, enabled: config?.enabled ?? false, keyStored: storedKey, vaultAvailable: vault.usable, ...(vault.reason ? { vaultReason: vault.reason } : {}) };
    },
    async getConfig(): Promise<AiProviderConfig | null> { return publicConfig(); },
    async saveConfig(input: unknown): Promise<{ ok: boolean; code?: AiErrorCode }> {
      const config = normalizedConfig(input); if (!config) return code('AI_CONTEXT_REJECTED');
      const current = await stored(); if (!await save({ schemaVersion: 1, ...config, ...(current?.keyCiphertext ? { keyCiphertext: current.keyCiphertext } : {}) })) return code('AI_VAULT_UNAVAILABLE');
      return { ok: true };
    },
    async storeKey(input: unknown): Promise<{ ok: boolean; code?: AiErrorCode }> {
      if (!validKey(input)) return code('AI_CONTEXT_REJECTED');
      const current = await stored(); if (!current || !vaultState(options.vault).usable) return code('AI_VAULT_UNAVAILABLE');
      try { return await save({ ...current, keyCiphertext: options.vault.encryptString(input).toString('base64') }) ? { ok: true } : code('AI_VAULT_UNAVAILABLE'); } catch { return code('AI_VAULT_UNAVAILABLE'); }
    },
    async clearKey(): Promise<{ ok: boolean; code?: AiErrorCode }> { const current = await stored(); return current && await save({ schemaVersion: 1, enabled: current.enabled, endpoint: current.endpoint, model: current.model }) ? { ok: true } : code('AI_UNCONFIGURED'); },
    cancel(): { requested: boolean } { if (!active) return { requested: false }; activeCancelled = true; active.abort(); return { requested: true }; },
    async request(root: string, request: AiRequest, gatewaySignal: AbortSignal): Promise<unknown> {
      if (gatewaySignal.aborted) return code('AI_CANCELLED');
      if (hasKnownSecretPattern(request.prompt)
        || request.diagnostics?.some(({ code, path }) => hasKnownSecretPattern(code) || (path !== undefined && hasKnownSecretPattern(path)))
        || request.trace?.some(({ signal }) => hasKnownSecretPattern(signal))) return code('AI_CONTEXT_REJECTED');
      const config = await publicConfig(); const secret = await key();
      if (gatewaySignal.aborted) return code('AI_CANCELLED');
      if (!config?.enabled || !secret) return code(vaultState(options.vault).usable ? 'AI_UNCONFIGURED' : 'AI_VAULT_UNAVAILABLE');
      let source: { source: string; baselineSha256: string } | undefined;
      if (request.mode === 'edit') {
        if (!request.activeFile) return code('AI_CONTEXT_REJECTED');
        const activeSource = await readActiveSource(root, request.activeFile);
        if (gatewaySignal.aborted) return code('AI_CANCELLED');
        if (!activeSource) return code('AI_CONTEXT_REJECTED');
        source = activeSource;
      }
      const context = { mode: request.mode, prompt: request.prompt, ...(source ? { activeFile: { path: request.activeFile!.path, source: source.source } } : {}), ...(request.mode === 'debug' ? { diagnostics: request.diagnostics ?? [], trace: request.trace ?? [] } : {}) };
      const body = JSON.stringify({ model: config.model, stream: false, messages: [{ role: 'system', content: SYSTEM_POLICY }, { role: 'user', content: JSON.stringify(context) }] });
      if (Buffer.byteLength(body) > 128 * 1024) return code('AI_CONTEXT_REJECTED');
      const controller = new AbortController(); active = controller; activeCancelled = false;
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const abort = () => controller.abort(); gatewaySignal.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetcher(`${config.endpoint}/v1/chat/completions`, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body });
        if (!response.ok) return code('AI_PROVIDER_UNAVAILABLE');
        const raw = await boundedBody(response, controller.signal); if (raw === null) return code(controller.signal.aborted ? ((gatewaySignal.aborted || activeCancelled) ? 'AI_CANCELLED' : 'AI_TIMEOUT') : 'AI_RESPONSE_LIMIT');
        let payload: unknown; try { payload = JSON.parse(raw); } catch { return code('AI_RESPONSE_INVALID'); }
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || !Object.hasOwn(payload, 'choices') || !Array.isArray((payload as { choices: unknown }).choices)) return code('AI_RESPONSE_INVALID');
        const choice = (payload as { choices: unknown[] }).choices[0];
        if ((payload as Record<string, unknown>).tool_calls !== undefined || (payload as Record<string, unknown>).function_call !== undefined || typeof choice !== 'object' || choice === null || Array.isArray(choice) || (choice as Record<string, unknown>).tool_calls !== undefined || (choice as Record<string, unknown>).function_call !== undefined) return code('AI_RESPONSE_INVALID');
        const messageObject = (choice as Record<string, unknown>).message;
        if (typeof messageObject !== 'object' || messageObject === null || Array.isArray(messageObject) || (messageObject as Record<string, unknown>).tool_calls !== undefined || (messageObject as Record<string, unknown>).function_call !== undefined || typeof (messageObject as Record<string, unknown>).content !== 'string') return code('AI_RESPONSE_INVALID');
        const message = (messageObject as Record<string, unknown>).content as string;
        let answer = compact(message); let replacement: { path: string; content: string } | undefined;
        try {
          const parsed = JSON.parse(message) as unknown;
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && !(exact(parsed, ['answer']) || exact(parsed, ['answer', 'replacement']))) return code('AI_RESPONSE_INVALID');
          if (exact(parsed, ['answer']) || exact(parsed, ['answer', 'replacement'])) {
            answer = compact(parsed.answer);
            if (Object.hasOwn(parsed, 'replacement')) {
              const candidate = parsed.replacement;
              if (!source || !request.activeFile || !exact(candidate, ['path', 'content']) || candidate.path !== request.activeFile.path || typeof candidate.content !== 'string' || candidate.content.length === 0 || Buffer.byteLength(candidate.content) > MAX_REPLACEMENT || candidate.content === source.source) return code('AI_RESPONSE_INVALID');
              replacement = { path: candidate.path, content: candidate.content };
            }
          }
        } catch { /* plain text is an allowed inert answer */ }
        if (answer === null) return code('AI_RESPONSE_INVALID');
        return { ok: true, answer, ...(replacement ? { replacement } : {}), ...(source && request.activeFile ? { workspaceId: request.workspaceId, fileId: request.activeFile.fileId, path: request.activeFile.path, baselineSha256: source.baselineSha256 } : {}) };
      } catch {
        return code(controller.signal.aborted ? ((gatewaySignal.aborted || activeCancelled) ? 'AI_CANCELLED' : 'AI_TIMEOUT') : 'AI_PROVIDER_UNAVAILABLE');
      } finally { clearTimeout(timeout); gatewaySignal.removeEventListener('abort', abort); if (active === controller) { active = undefined; activeCancelled = false; } }
    },
  };
}
