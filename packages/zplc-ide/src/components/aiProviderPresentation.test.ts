import { describe, expect, it } from 'bun:test';
import { presentAiProviderConfig, presentAiProviderMutation, presentAiProviderStatus } from './aiProviderPresentation';

describe('AI provider presenters (IDE-030)', () => {
  it('projects public configuration and status without keys or opaque storage fields', () => {
    expect(presentAiProviderStatus({ configured: true, enabled: true, keyStored: true, vaultAvailable: true })).toMatchObject({
      kind: 'ready',
    });
    expect(
      presentAiProviderStatus({
        configured: false,
        enabled: true,
        keyStored: false,
        vaultAvailable: false,
        vaultReason: 'insecure-backend',
      }),
    ).toMatchObject({ kind: 'unavailable' });
    expect(presentAiProviderConfig({ enabled: true, endpoint: 'https://example.test', model: 'gpt-test' })).toEqual({
      enabled: true,
      endpoint: 'https://example.test',
      model: 'gpt-test',
    });
    expect(presentAiProviderConfig({ enabled: true, endpoint: 'https://example.test', model: 'gpt-test', keyCiphertext: 'no' })).toBeNull();
  });

  it('presents provider mutations only from their exact public result', () => {
    expect(presentAiProviderMutation({ ok: true })).toEqual({ kind: 'ok' });
    expect(presentAiProviderMutation({ ok: false, code: 'AI_VAULT_UNAVAILABLE' })).toEqual({ kind: 'error', code: 'AI_VAULT_UNAVAILABLE' });
    expect(presentAiProviderMutation({ ok: true, secret: 'no' })).toEqual({ kind: 'invalid' });
  });
});
