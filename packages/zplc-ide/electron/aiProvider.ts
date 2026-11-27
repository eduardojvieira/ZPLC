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
import { parseProposals, type AiProposal } from '../src/ai/proposals.js';
import { manifestForAssistant, manifestSensitivePaths } from '../src/ai/manifestPrivacy.js';
import { buildProjectContext, capContext, type ContextDiagnostic, type FailedScenario } from '../src/ai/projectContext.js';
import { canonicalAiEndpoint, isLoopbackAiEndpoint } from '../src/ai/providerEndpoint.js';

export type AiErrorCode =
  | 'AI_UNCONFIGURED'
  | 'AI_VAULT_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_CANCELLED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROVIDER_AUTH'
  | 'AI_PROVIDER_MODEL'
  | 'AI_PROVIDER_RATE_LIMIT'
  | 'AI_PROVIDER_SERVER'
  | 'AI_PROVIDER_UNREACHABLE'
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
  diagnostics?: Array<{ code: string; message?: string; path?: string; line?: number; column?: number; element?: string }>;
  trace?: Array<{ atMs: number; signal: string; value: boolean | number }>;
  /** From the latest run in Studio (AIX-001): the failed expectations and the plant facts. */
  failedScenarios?: FailedScenario[];
  facts?: Record<string, boolean | number>;
  selection?: { startLine: number; endLine: number; text: string } | { element: string };
  /** The lesson the person is in; whether its solutions are hidden is read here from `<userData>`, never taken from this. */
  lessonContext?: { lessonId: string; stage?: string };
  locale?: 'en' | 'es';
  /** The last exchanges of this conversation (AI-18), oldest first; dropped first when the body is too large. */
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}
export type AiConnectionResult = { ok: true; latencyMs: number } | { ok: false; code: AiErrorCode; retryAfter?: number };
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
const MAX_SCENARIO_FILES = 16;
const MAX_SCENARIO_FILE = 64 * 1024;
const CONTEXT_FILE_LIMIT = 128 * 1024;
const ROOT_FILES = new Set(['zplc.json', 'scene.json', 'plant-map.json']);
const PROBE_TIMEOUT_MS = 10_000;
const HIDDEN_RULE = 'Solutions are hidden by the classroom setting. Give guidance and hints only; NEVER write a complete solution program.';
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const KNOWN_SECRET_PATTERNS = [
  /(?:api|client|access|refresh)[_. -]?(?:key|secret|token)\b|(?:aws[_. -]?)?secret(?:[_. -]?access)?[_. -]?key\b/i,
  /(?:authorization|bearer|password|passphrase|private[_. -]?key)\b/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
];
export const SYSTEM_POLICY =
  'You are ZPLC Assistant. Provide an explanation, or an explanation with one inert proposed change set. Never claim ' +
  'hardware action, never request tools, and never initiate flash, deploy, force, RUN, STOP, recovery, serial, shell, or ' +
  'filesystem operations. An AI assistant or MCP never initiates them on hardware or on a session a person runs: it never ' +
  'forces I/O, changes RUN/STOP, flashes, deploys or opens a serial port there. It may set inputs and step a simulator ' +
  'that is private to it, one the MCP server starts for that agent alone (D-31, AIX-014). Reply in the language of ' +
  '"locale" ("en" or "es"). Use the terms of ZPLC: rung, coil, contact, function block, step, transition, scan, scenario, ' +
  'plant map, Check. The request carries "context": the plant, the scenarios, the failed checks of the last run, the ' +
  'diagnostics with their place, and in a lesson its goal and stage. Inside a lesson (when "context" has a "lesson"), ' +
  'give a hint first, pointing at the concept, the signal or the element; give a solution only when the person asks for ' +
  'it plainly and lesson.solutionsHidden is false; never give a solution when lesson.solutionsHidden is true; never say ' +
  'that a lesson is passed; only the Check control marks it. ' +
  'To propose a change answer with JSON only: {"answer": "...", "changes": [{"path": "...", "content": "..."}]} with the whole new text ' +
  'of each file ' +
  `and at most ${CANDIDATE_CHANGE_CAP} files. A path is src/<name>.st, .il, .ld.json, .fbd.json or .sfc.json, or zplc.json. ` +
  'A new program file needs a task of its own in a zplc.json change in the same set (a task runs exactly one program). Ladder, FBD and ' +
  'SFC files are the JSON documents of their editors. ' +
  'You may also add "proposals" (at most 6): {"type":"openFile","path"}, {"type":"goToLine","path","line"}, ' +
  '{"type":"selectElement","path","element"} ' +
  'with element rung:<id>, block:<id>, step:<id> or transition:<id>, {"type":"compile"}, {"type":"generateSt"}, ' +
  '{"type":"startSimulation"} (switch to the simulator), or ' +
  '{"type":"setting","name":"theme|language|density|editorFontSize|editorTabSize","value"}; each is a button the person may click. ' +
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
const FORBIDDEN_TOOL_KEYS = new Set(['tool_calls', 'function_call', 'tool_call']);
const MAX_INSPECT_DEPTH = 32;
const MAX_JSON_SCAN_STEPS = MAX_RESPONSE * 4;
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function hasForbiddenToolKey(value: unknown, depth = 0): boolean {
  if (depth > MAX_INSPECT_DEPTH) return true;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenToolKey(item, depth + 1));
  if (typeof value !== 'object' || value === null) return false;
  for (const key of Object.keys(value)) {
    const field = (value as Record<string, unknown>)[key];
    if (FORBIDDEN_TOOL_KEYS.has(key) && field !== undefined) return true;
    if (hasForbiddenToolKey(field, depth + 1)) return true;
  }
  return false;
}
function hasForbiddenPayloadKey(value: Record<string, unknown>): boolean {
  return Object.hasOwn(value, 'replacement') || hasForbiddenToolKey(value);
}
function isStructuredCandidate(value: Record<string, unknown>): boolean {
  return Object.hasOwn(value, 'answer') || Object.hasOwn(value, 'changes') || Object.hasOwn(value, 'proposals');
}
function extractMessageText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const parts: string[] = [];
  for (const part of content) {
    if (!isPlainObject(part) || hasForbiddenToolKey(part)) return null;
    if (part.type !== 'text' || typeof part.text !== 'string') return null;
    parts.push(part.text);
  }
  return parts.join('\n');
}
function scanJsonObjectEnd(text: string, openIndex: number, budget: number): { end: number; steps: number } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let steps = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    steps += 1;
    if (steps > budget) return { end: -1, steps };
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { end: i + 1, steps };
    }
  }
  return { end: -1, steps };
}
type ExtractedAnswer = { kind: 'none' } | { kind: 'invalid' } | { kind: 'structured'; value: Record<string, unknown>; prose: string };
function remainingProse(text: string, start: number, end: number): string {
  return [text.slice(0, start).trim(), text.slice(end).trim()].filter(Boolean).join('\n').trim();
}
function scanBareJsonObjects(
  text: string,
): { invalid: true } | { invalid: false; candidates: Array<{ value: Record<string, unknown>; start: number; end: number }> } {
  const lastClose = text.lastIndexOf('}');
  if (lastClose === -1) return { invalid: false, candidates: [] };
  const candidates: Array<{ value: Record<string, unknown>; start: number; end: number }> = [];
  let pos = 0;
  let budget = MAX_JSON_SCAN_STEPS;
  while (pos < lastClose && budget > 0) {
    const open = text.indexOf('{', pos);
    if (open === -1 || open >= lastClose) break;
    const scanned = scanJsonObjectEnd(text, open, budget);
    budget -= scanned.steps;
    if (scanned.end === -1) {
      pos = open + 1;
      continue;
    }
    try {
      const parsed = JSON.parse(text.slice(open, scanned.end)) as unknown;
      if (isPlainObject(parsed)) {
        if (hasForbiddenPayloadKey(parsed)) return { invalid: true };
        if (isStructuredCandidate(parsed)) candidates.push({ value: parsed, start: open, end: scanned.end });
        pos = scanned.end;
        continue;
      }
    } catch {
      /* not valid JSON; continue scanning after this brace */
    }
    pos = open + 1;
  }
  return { invalid: false, candidates };
}
function extractStructuredAnswer(message: string): ExtractedAnswer {
  const trimmed = message.trim();
  if (trimmed.length === 0) return { kind: 'invalid' };
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isPlainObject(parsed)) {
        if (hasForbiddenPayloadKey(parsed) || !isStructuredCandidate(parsed)) return { kind: 'invalid' };
        return { kind: 'structured', value: parsed, prose: '' };
      }
    } catch {
      /* not a single raw JSON object; continue to fenced and prose+JSON extraction */
    }
  }
  const fenceOpen = /^([ \t]*)(`{3,})([a-zA-Z0-9_-]*)[ \t]*\r?\n/gm;
  const fencedCandidates: Array<{ value: Record<string, unknown>; start: number; end: number }> = [];
  let fenceMatch: RegExpExecArray | null;
  let budget = MAX_JSON_SCAN_STEPS;
  while ((fenceMatch = fenceOpen.exec(message)) !== null && budget > 0) {
    const lang = fenceMatch[3]!.toLowerCase();
    if (lang !== '' && lang !== 'json') continue;
    const ticks = fenceMatch[2]!;
    let objStart = fenceMatch.index + fenceMatch[0].length;
    while (objStart < message.length && /\s/.test(message[objStart]!)) objStart += 1;
    if (message[objStart] !== '{') continue;
    const scanned = scanJsonObjectEnd(message, objStart, budget);
    budget -= scanned.steps;
    if (scanned.end === -1) continue;
    let closeStart = scanned.end;
    while (closeStart < message.length && /\s/.test(message[closeStart]!)) closeStart += 1;
    if (!message.startsWith(ticks, closeStart)) continue;
    let closeEnd = closeStart + ticks.length;
    while (closeEnd < message.length && message[closeEnd] === '`') closeEnd += 1;
    while (closeEnd < message.length && (message[closeEnd] === ' ' || message[closeEnd] === '\t')) closeEnd += 1;
    if (closeEnd < message.length) {
      if (message[closeEnd] === '\r' && message[closeEnd + 1] === '\n') closeEnd += 2;
      else if (message[closeEnd] === '\n') closeEnd += 1;
      else continue;
    }
    try {
      const parsed = JSON.parse(message.slice(objStart, scanned.end)) as unknown;
      if (isPlainObject(parsed)) {
        if (hasForbiddenPayloadKey(parsed)) return { kind: 'invalid' };
        if (isStructuredCandidate(parsed)) fencedCandidates.push({ value: parsed, start: fenceMatch.index, end: closeEnd });
        fenceOpen.lastIndex = closeEnd;
      }
    } catch {
      /* non-JSON fenced block */
    }
  }
  if (fencedCandidates.length > 1) return { kind: 'invalid' };
  if (fencedCandidates.length === 1) {
    const [found] = fencedCandidates;
    const prose = remainingProse(message, found!.start, found!.end);
    const trailing = scanBareJsonObjects(prose);
    if (trailing.invalid || trailing.candidates.length > 0) return { kind: 'invalid' };
    return { kind: 'structured', value: found!.value, prose };
  }
  const bare = scanBareJsonObjects(message);
  if (bare.invalid || bare.candidates.length > 1) return { kind: 'invalid' };
  if (bare.candidates.length === 1) {
    const [found] = bare.candidates;
    return { kind: 'structured', value: found!.value, prose: remainingProse(message, found!.start, found!.end) };
  }
  return { kind: 'none' };
}
function code(code: AiErrorCode, retryAfter?: number): { ok: false; code: AiErrorCode; retryAfter?: number } {
  return { ok: false, code, ...(retryAfter ? { retryAfter } : {}) };
}
/** The provider's status says the cause; only the status and a Retry-After number leave here, never its text (AI-16). */
function httpFailure(response: Response): { ok: false; code: AiErrorCode; retryAfter?: number } {
  const { status } = response;
  if (status === 401 || status === 403) return code('AI_PROVIDER_AUTH');
  if (status === 404) return code('AI_PROVIDER_MODEL');
  if (status >= 500) return code('AI_PROVIDER_SERVER');
  if (status !== 429) return code('AI_PROVIDER_UNAVAILABLE');
  const header = response.headers.get('Retry-After')?.trim() ?? '';
  const seconds = /^\d{1,6}$/.test(header) ? Number(header) : 0;
  return code('AI_PROVIDER_RATE_LIMIT', seconds >= 1 && seconds <= 86_400 ? seconds : undefined);
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
function normalizedConfig(value: unknown): AiProviderConfig | null {
  if (
    !exact(value, ['enabled', 'endpoint', 'model']) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.model !== 'string' ||
    !MODEL.test(value.model)
  )
    return null;
  const endpoint = canonicalAiEndpoint(value.endpoint);
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
  const endpoint = canonicalAiEndpoint(value.endpoint);
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
  if (typeof value !== 'string') return null;
  return value.trim().length > 0 && Buffer.byteLength(value) <= MAX_ANSWER ? value : null;
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

export interface AiProviderOptions {
  userDataPath: string;
  vault: SafeStorageLike;
  fetch?: FetchLike;
  /** Whether the classroom setting hides lesson solutions (`electron/learnPolicy.ts`); a failure, or no reader, means hidden. */
  solutionsHidden?: () => Promise<boolean>;
  /** The lesson's entry of `LESSON_INDEX` and its text in the interface locale, for the lesson a request names. */
  lessonOf?: (
    lessonId: string,
    locale: 'en' | 'es',
  ) => { manifest: unknown; text: unknown } | undefined | Promise<{ manifest: unknown; text: unknown } | undefined>;
  /** The limit of the connection test, in ms; 10 s unless a test says otherwise. */
  probeTimeoutMs?: number;
}

export function createAiProvider(options: AiProviderOptions) {
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
  async function sourceFolderIsReal(root: string, folder = 'src'): Promise<boolean> {
    try {
      const sourceDirectory = join(root, folder);
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
      if (!ROOT_FILES.has(path) && !(await sourceFolderIsReal(root, path.split('/')[0]))) return null;
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
  async function readJsonFile(root: string, path: string, limit: number): Promise<unknown> {
    const text = await readProjectFile(root, path, limit);
    try {
      return text === null ? undefined : (JSON.parse(text) as unknown);
    } catch {
      return undefined;
    }
  }
  /** The scenario files of `tests`, as many and as large as the limits allow; whatever is unreadable is left out. */
  async function readScenarios(root: string): Promise<Array<{ path: string; input: unknown }>> {
    try {
      if (!(await sourceFolderIsReal(root, 'tests'))) return [];
      const names = (await readdir(join(root, 'tests'), { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.scenario\.json$/.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .slice(0, MAX_SCENARIO_FILES);
      const found: Array<{ path: string; input: unknown }> = [];
      for (const name of names) {
        const input = await readJsonFile(root, `tests/${name}`, MAX_SCENARIO_FILE);
        if (input !== undefined) found.push({ path: `tests/${name}`, input });
      }
      return found;
    } catch {
      return [];
    }
  }
  /** The one project context (`src/ai/projectContext.ts`): from the saved files, the last run the renderer reports and the lesson. */
  async function projectContext(root: string, request: AiRequest) {
    let solutionsHidden = true;
    try {
      if (options.solutionsHidden) solutionsHidden = (await options.solutionsHidden()) !== false;
    } catch {
      /* unreadable: hidden */
    }
    const lessonEntry = request.lessonContext
      ? await options.lessonOf?.(request.lessonContext.lessonId, request.locale ?? 'en')
      : undefined;
    const context = buildProjectContext(
      {
        scene: await readJsonFile(root, 'scene.json', CONTEXT_FILE_LIMIT),
        plantMap: await readJsonFile(root, 'plant-map.json', CONTEXT_FILE_LIMIT),
        scenarios: await readScenarios(root),
        ...(request.failedScenarios ? { failedScenarios: request.failedScenarios } : {}),
        ...(request.facts ? { facts: request.facts } : {}),
        diagnostics: (request.diagnostics ?? []).map(
          (diagnostic) => ({ ...diagnostic, message: diagnostic.message ?? '' }) as ContextDiagnostic,
        ),
        ...(lessonEntry ? { lesson: { ...lessonEntry, stage: request.lessonContext?.stage } } : {}),
      },
      { solutionsHidden },
    );
    return { context: capContext(context) as typeof context, solutionsHidden };
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
  async function programEntries(root: string): Promise<Map<string, 'file' | 'link' | 'other'> | null> {
    try {
      if (!(await sourceFolderIsReal(root))) return null;
      const found = new Map<string, 'file' | 'link' | 'other'>();
      for (const entry of await readdir(join(root, 'src'), { withFileTypes: true }))
        if (isCandidateSourcePathPattern.test(`src/${entry.name}`))
          found.set(`src/${entry.name}`, entry.isSymbolicLink() ? 'link' : entry.isFile() ? 'file' : 'other');
      return found;
    } catch {
      return null;
    }
  }
  async function resolveChanges(
    root: string,
    value: unknown,
  ): Promise<Array<{ path: string; kind: 'modify' | 'create'; content: string; baselineSha256?: string }> | null> {
    if (!Array.isArray(value) || value.length < 1 || value.length > CANDIDATE_CHANGE_CAP) return null;
    // what is on the disk decides modify or create, not the capped list of the summary; a link counts as taken and is never replaced
    const entries = await programEntries(root);
    if (!entries) return null;
    const taken = new Set([...entries.keys()].map(sourceKey));
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
      } else if (entries.has(path)) {
        if (entries.get(path) !== 'file') return null;
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
        configured: config !== null && (isLoopbackAiEndpoint(config.endpoint) || (await key()) !== null),
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
    /** One minimal request to the configured provider, with no project data: what is wrong, or how long it took. */
    async testConnection(): Promise<AiConnectionResult> {
      const config = await publicConfig();
      if (!config) return code('AI_UNCONFIGURED');
      const secret = await key();
      if (!secret && !isLoopbackAiEndpoint(config.endpoint))
        return code(vaultState(options.vault).usable ? 'AI_UNCONFIGURED' : 'AI_VAULT_UNAVAILABLE');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.probeTimeoutMs ?? PROBE_TIMEOUT_MS);
      const started = Date.now();
      try {
        const response = await fetcher(`${config.endpoint}/v1/chat/completions`, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.model, stream: false, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        });
        if (!response.ok) return httpFailure(response);
        await response.body?.cancel().catch(() => undefined);
        return { ok: true, latencyMs: Date.now() - started };
      } catch {
        return code(controller.signal.aborted ? 'AI_TIMEOUT' : 'AI_PROVIDER_UNREACHABLE');
      } finally {
        clearTimeout(timeout);
      }
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
        request.trace?.some(({ signal }) => hasKnownSecretPattern(signal)) ||
        hasKnownSecretPattern(
          JSON.stringify([request.diagnostics?.map(({ message }) => message), request.selection, request.failedScenarios, request.facts]),
        )
      )
        return code('AI_CONTEXT_REJECTED');
      const config = await publicConfig();
      const secret = await key();
      if (gatewaySignal.aborted) return code('AI_CANCELLED');
      const keyFree = config !== null && isLoopbackAiEndpoint(config.endpoint);
      if (!config?.enabled || (!secret && !keyFree))
        return code(vaultState(options.vault).usable ? 'AI_UNCONFIGURED' : 'AI_VAULT_UNAVAILABLE');
      let source: Awaited<ReturnType<typeof readActiveSource>> | undefined;
      if (request.mode === 'edit' && !request.activeFile) return code('AI_CONTEXT_REJECTED');
      if (request.activeFile) {
        // a proposal needs its baseline, so edit mode refuses a file it may not send; the other modes simply go without it
        const activeSource = await readActiveSource(root, request.activeFile);
        if (gatewaySignal.aborted) return code('AI_CANCELLED');
        if (activeSource) source = activeSource;
        else if (request.mode === 'edit') return code('AI_CONTEXT_REJECTED');
      }
      // the project summary and the context are not requirements: they are reduced, in this order, before a request is refused for its size
      const summary = await readProjectSummary(root, true);
      const { context, solutionsHidden } = await projectContext(root, request);
      if (gatewaySignal.aborted) return code('AI_CANCELLED');
      const state = {
        project: summary as Record<string, unknown> | undefined,
        context,
        trace: request.trace ?? [],
        // an earlier answer that holds something key-like is not sent back: the follow-up goes without it, not refused
        history: request.history?.some(({ text }) => hasKnownSecretPattern(text)) ? [] : (request.history ?? []),
      };
      const contextBody = () =>
        JSON.stringify({
          model: config.model,
          stream: false,
          messages: [
            { role: 'system', content: request.lessonContext && solutionsHidden ? `${SYSTEM_POLICY}\n${HIDDEN_RULE}` : SYSTEM_POLICY },
            ...state.history.map(({ role, text }) => ({ role, content: text })),
            {
              role: 'user',
              content: JSON.stringify({
                mode: request.mode,
                prompt: request.prompt,
                locale: request.locale ?? 'en',
                ...(request.selection ? { selection: request.selection } : {}),
                ...(source ? { activeFile: { path: request.activeFile!.path, language: source.language, source: source.source } } : {}),
                ...(state.project ? { project: state.project } : {}),
                context: state.context,
                ...(request.mode === 'debug' ? { trace: state.trace } : {}),
              }),
            },
          ],
        });
      const shedding: Array<() => void> = [
        () => (state.history = []),
        () => state.project && delete state.project.manifest,
        () => (state.context = { ...state.context, scenarios: [] }),
        () => {
          const scene = state.context.plant?.scene;
          if (scene) state.context = { ...state.context, plant: { ...state.context.plant!, scene: { ...scene, parts: [] } } };
        },
        () => (state.trace = state.trace.slice(-8)),
        () => (state.project = state.project && { programs: state.project.programs }),
        () => (state.project = undefined),
      ];
      let body = contextBody();
      for (const shed of shedding) {
        if (Buffer.byteLength(body) <= MAX_BODY) break;
        shed();
        body = contextBody();
      }
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
          headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), 'Content-Type': 'application/json' },
          body,
        });
        if (!response.ok) return httpFailure(response);
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
          (payload as Record<string, unknown>).tool_call !== undefined ||
          typeof choice !== 'object' ||
          choice === null ||
          Array.isArray(choice) ||
          (choice as Record<string, unknown>).tool_calls !== undefined ||
          (choice as Record<string, unknown>).function_call !== undefined ||
          (choice as Record<string, unknown>).tool_call !== undefined
        )
          return code('AI_RESPONSE_INVALID');
        const messageObject = (choice as Record<string, unknown>).message;
        if (
          typeof messageObject !== 'object' ||
          messageObject === null ||
          Array.isArray(messageObject) ||
          (messageObject as Record<string, unknown>).tool_calls !== undefined ||
          (messageObject as Record<string, unknown>).function_call !== undefined ||
          (messageObject as Record<string, unknown>).tool_call !== undefined
        )
          return code('AI_RESPONSE_INVALID');
        const message = extractMessageText((messageObject as Record<string, unknown>).content);
        if (message === null) return code('AI_RESPONSE_INVALID');
        const extracted = extractStructuredAnswer(message);
        if (extracted.kind === 'invalid') return code('AI_RESPONSE_INVALID');
        let answer: string | null = null;
        let changes: Awaited<ReturnType<typeof resolveChanges>> | undefined;
        let proposals: AiProposal[] | undefined;
        if (extracted.kind === 'structured') {
          const parsed = extracted.value;
          if (Object.hasOwn(parsed, 'answer')) {
            if (typeof parsed.answer !== 'string') return code('AI_RESPONSE_INVALID');
            answer = compact(parsed.answer);
            if (answer === null && parsed.answer.trim().length === 0 && extracted.prose.length > 0) answer = compact(extracted.prose);
          } else if (extracted.prose.length > 0) {
            answer = compact(extracted.prose);
          }
          if (Object.hasOwn(parsed, 'proposals')) {
            // editor actions and display settings from a closed list; a person clicks each one, nothing here runs it
            proposals = parseProposals(parsed.proposals) ?? undefined;
            if (!proposals) return code('AI_RESPONSE_INVALID');
          }
          if (Object.hasOwn(parsed, 'changes')) {
            // a change set is a proposal for the person to review, and only an edit request asks for one
            if (request.mode !== 'edit' || !source) return code('AI_RESPONSE_INVALID');
            changes = await resolveChanges(root, parsed.changes);
            if (gatewaySignal.aborted) return code('AI_CANCELLED');
            if (!changes) return code('AI_RESPONSE_INVALID');
          }
        } else {
          answer = compact(message);
        }
        if (answer === null) return code('AI_RESPONSE_INVALID');
        return {
          ok: true,
          answer,
          ...(changes ? { changes } : {}),
          ...(proposals ? { proposals } : {}),
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
            : 'AI_PROVIDER_UNREACHABLE',
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
