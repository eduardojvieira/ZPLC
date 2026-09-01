export type AiProviderMode = 'ask' | 'plan' | 'edit' | 'debug';

export type AiProviderStatusPresentation =
  | { kind: 'ready'; configured: boolean; enabled: boolean; keyStored: boolean; vaultAvailable: boolean }
  | { kind: 'unavailable'; configured: boolean; enabled: boolean; keyStored: boolean; vaultAvailable: boolean; vaultReason?: 'unavailable' | 'insecure-backend' }
  | { kind: 'invalid' };

export type AiProviderResponsePresentation =
  | { kind: 'answer'; answer: string; replacement?: { path: string; content: string } }
  | { kind: 'error'; code: string }
  | { kind: 'invalid' };

export type AiProviderMutationPresentation = { kind: 'ok' } | { kind: 'error'; code: string } | { kind: 'invalid' };

type ExpectedEdit = { workspaceId: string; fileId: string; path: string; baselineSha256: string };
const ERROR_CODES = new Set(['AI_UNCONFIGURED', 'AI_VAULT_UNAVAILABLE', 'AI_TIMEOUT', 'AI_CANCELLED', 'AI_PROVIDER_UNAVAILABLE', 'AI_RESPONSE_INVALID', 'AI_RESPONSE_LIMIT', 'AI_CONTEXT_REJECTED']);
const SHA256 = /^[a-f0-9]{64}$/;

function record(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.values(descriptors).every((descriptor) => 'value' in descriptor) ? Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])) : null;
  } catch { return null; }
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const item = record(value);
  return item && Object.keys(item).length === keys.length && keys.every((key) => Object.hasOwn(item, key)) ? item : null;
}

function text(value: unknown, maximum: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }

export function presentAiProviderStatus(value: unknown): AiProviderStatusPresentation {
  const item = record(value);
  if (!item || !['configured', 'enabled', 'keyStored', 'vaultAvailable'].every((key) => typeof item[key] === 'boolean')
    || !Object.keys(item).every((key) => key === 'configured' || key === 'enabled' || key === 'keyStored' || key === 'vaultAvailable' || key === 'vaultReason')
    || (item.vaultReason !== undefined && item.vaultReason !== 'unavailable' && item.vaultReason !== 'insecure-backend')) return { kind: 'invalid' };
  const publicState = { configured: item.configured as boolean, enabled: item.enabled as boolean, keyStored: item.keyStored as boolean, vaultAvailable: item.vaultAvailable as boolean };
  return publicState.vaultAvailable ? { kind: 'ready', ...publicState } : { kind: 'unavailable', ...publicState, ...(item.vaultReason ? { vaultReason: item.vaultReason as 'unavailable' | 'insecure-backend' } : {}) };
}

export function presentAiProviderConfig(value: unknown): { enabled: boolean; endpoint: string; model: string } | null {
  const item = exact(value, ['enabled', 'endpoint', 'model']);
  return item && typeof item.enabled === 'boolean' && text(item.endpoint, 1024) && text(item.model, 128) ? { enabled: item.enabled, endpoint: item.endpoint, model: item.model } : null;
}

export function presentAiProviderResponse(value: unknown, expected?: ExpectedEdit): AiProviderResponsePresentation {
  const item = record(value);
  if (!item) return { kind: 'invalid' };
  if (item.ok === false && Object.keys(item).length === 2 && typeof item.code === 'string' && ERROR_CODES.has(item.code)) return { kind: 'error', code: item.code };
  const responseKeys = expected ? ['ok', 'answer', 'workspaceId', 'fileId', 'path', 'baselineSha256'] : ['ok', 'answer'];
  const withReplacement = expected ? [...responseKeys, 'replacement'] : responseKeys;
  if (item.ok !== true || !text(item.answer, 16 * 1024) || !((Object.keys(item).length === responseKeys.length && responseKeys.every((key) => Object.hasOwn(item, key))) || (Object.keys(item).length === withReplacement.length && withReplacement.every((key) => Object.hasOwn(item, key))))) return { kind: 'invalid' };
  if (!expected) return { kind: 'answer', answer: item.answer };
  if (item.workspaceId !== expected.workspaceId || item.fileId !== expected.fileId || item.path !== expected.path || item.baselineSha256 !== expected.baselineSha256 || !SHA256.test(expected.baselineSha256)) return { kind: 'invalid' };
  if (item.replacement === undefined) return { kind: 'answer', answer: item.answer };
  const replacement = exact(item.replacement, ['path', 'content']);
  return replacement && replacement.path === expected.path && text(replacement.content, 256 * 1024)
    ? { kind: 'answer', answer: item.answer, replacement: { path: replacement.path, content: replacement.content } }
    : { kind: 'invalid' };
}

export function presentAiProviderMutation(value: unknown): AiProviderMutationPresentation {
  const item = record(value);
  if (!item) return { kind: 'invalid' };
  if (item.ok === true && Object.keys(item).length === 1) return { kind: 'ok' };
  return item.ok === false && Object.keys(item).length === 2 && typeof item.code === 'string' && ERROR_CODES.has(item.code)
    ? { kind: 'error', code: item.code }
    : { kind: 'invalid' };
}
