import { describe, expect, it } from 'bun:test';
import { presentAiProviderConfig, presentAiProviderMutation, presentAiProviderResponse, presentAiProviderStatus } from './aiProviderPresentation';

describe('AI provider presenters', () => {
  it('accepts only a bounded inert answer and a replacement bound to the active saved ST file', () => {
    const expected = { workspaceId: 'workspace-1', fileId: 'file:src/Main.st', path: 'src/Main.st', baselineSha256: 'a'.repeat(64) };
    expect(presentAiProviderResponse({ ok: true, answer: 'Explain the timer.', replacement: { path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM' }, ...expected }, expected))
      .toEqual({ kind: 'answer', answer: 'Explain the timer.', replacement: { path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM' } });
    expect(presentAiProviderResponse({ ok: true, answer: 'Explain the timer.' })).toEqual({ kind: 'answer', answer: 'Explain the timer.' });
  });

  it('fails closed for stale, malformed, extra, and accessor-backed responses', () => {
    const expected = { workspaceId: 'workspace-1', fileId: 'file:src/Main.st', path: 'src/Main.st', baselineSha256: 'a'.repeat(64) };
    const accessor = Object.defineProperty({}, 'ok', { enumerable: true, get: () => { throw new Error('secret'); } });
    const proxy = Proxy.revocable({ ok: true, answer: 'x' }, {}); proxy.revoke();
    for (const value of [
      accessor,
      proxy.proxy,
      { ok: true, answer: 'x', ...expected, extra: true },
      { ok: true, answer: 'x', ...expected, baselineSha256: 'b'.repeat(64) },
      { ok: true, answer: 'x', replacement: { path: 'src/Other.st', content: 'x' }, ...expected },
      { ok: false, code: 'UNKNOWN_SECRET' },
    ]) expect(presentAiProviderResponse(value, expected).kind).toBe('invalid');
  });

  it('projects public configuration and status without keys or opaque storage fields', () => {
    expect(presentAiProviderStatus({ configured: true, enabled: true, keyStored: true, vaultAvailable: true })).toMatchObject({ kind: 'ready' });
    expect(presentAiProviderStatus({ configured: false, enabled: true, keyStored: false, vaultAvailable: false, vaultReason: 'insecure-backend' })).toMatchObject({ kind: 'unavailable' });
    expect(presentAiProviderConfig({ enabled: true, endpoint: 'https://example.test', model: 'gpt-test' })).toEqual({ enabled: true, endpoint: 'https://example.test', model: 'gpt-test' });
    expect(presentAiProviderConfig({ enabled: true, endpoint: 'https://example.test', model: 'gpt-test', keyCiphertext: 'no' })).toBeNull();
  });

  it('presents provider mutations only from their exact public result', () => {
    expect(presentAiProviderMutation({ ok: true })).toEqual({ kind: 'ok' });
    expect(presentAiProviderMutation({ ok: false, code: 'AI_VAULT_UNAVAILABLE' })).toEqual({ kind: 'error', code: 'AI_VAULT_UNAVAILABLE' });
    expect(presentAiProviderMutation({ ok: true, secret: 'no' })).toEqual({ kind: 'invalid' });
  });
});
