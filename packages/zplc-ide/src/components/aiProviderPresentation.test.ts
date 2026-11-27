import { describe, expect, it } from 'bun:test';
import { translatorFor } from '../i18n';
import { presentAiProviderConfig, presentAiProviderMutation, presentAiProviderStatus, providerErrorText } from './aiProviderPresentation';

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

  it('AIX-005 a configured, enabled endpoint with no key is ready although the OS vault is unavailable', () => {
    const noVault = { vaultAvailable: false, vaultReason: 'unavailable' as const };
    expect(presentAiProviderStatus({ configured: true, enabled: true, keyStored: false, ...noVault })).toMatchObject({
      kind: 'ready',
      keyStored: false,
    });
    // nothing configured, or switched off: as before
    expect(presentAiProviderStatus({ configured: false, enabled: true, keyStored: false, ...noVault })).toMatchObject({
      kind: 'unavailable',
    });
    expect(presentAiProviderStatus({ configured: true, enabled: false, keyStored: false, ...noVault })).toMatchObject({
      kind: 'unavailable',
    });
    // a key stored with no vault cannot be read: as before
    expect(presentAiProviderStatus({ configured: true, enabled: true, keyStored: true, ...noVault })).toMatchObject({
      kind: 'unavailable',
    });
    // with a vault every state is ready, as before
    expect(presentAiProviderStatus({ configured: false, enabled: false, keyStored: false, vaultAvailable: true })).toMatchObject({
      kind: 'ready',
    });
  });

  it('presents provider mutations only from their exact public result', () => {
    expect(presentAiProviderMutation({ ok: true })).toEqual({ kind: 'ok' });
    expect(presentAiProviderMutation({ ok: false, code: 'AI_VAULT_UNAVAILABLE' })).toEqual({ kind: 'error', code: 'AI_VAULT_UNAVAILABLE' });
    expect(presentAiProviderMutation({ ok: true, secret: 'no' })).toEqual({ kind: 'invalid' });
  });
});

describe('a provider failure says its cause and the next step (AI-16)', () => {
  const en = translatorFor('en');
  const es = translatorFor('es');
  it('has one sentence per code, in English and Spanish', () => {
    expect(providerErrorText(en, 'AI_PROVIDER_AUTH')).toBe('The provider refused the key. Check the key in "Preferences" → "Assistant".');
    expect(providerErrorText(en, 'AI_PROVIDER_MODEL')).toBe(
      'The provider does not know this model. Choose another model in "Preferences" → "Assistant".',
    );
    expect(providerErrorText(en, 'AI_PROVIDER_SERVER')).toBe('The provider had an error. Try again later.');
    expect(providerErrorText(en, 'AI_PROVIDER_UNREACHABLE')).toBe(
      'The provider could not be reached. Check the network or the provider address.',
    );
    expect(providerErrorText(es, 'AI_PROVIDER_AUTH')).toContain('"Preferencias" → "Asistente"');
    expect(providerErrorText(es, 'AI_PROVIDER_MODEL')).toContain('"Preferencias" → "Asistente"');
  });
  it('says when to try again after a rate limit, or "in a minute" without a number', () => {
    expect(providerErrorText(en, 'AI_PROVIDER_RATE_LIMIT', 30)).toBe('The provider is limiting requests. Try again in 30 s.');
    expect(providerErrorText(en, 'AI_PROVIDER_RATE_LIMIT')).toBe('The provider is limiting requests. Try again in a minute.');
    expect(providerErrorText(es, 'AI_PROVIDER_RATE_LIMIT', 30)).toContain('30 s');
    expect(providerErrorText(es, 'AI_PROVIDER_RATE_LIMIT')).toContain('un minuto');
  });
  it('keeps the old line for the other codes', () => {
    expect(providerErrorText(en, 'AI_TIMEOUT')).toBe('Provider request failed: AI_TIMEOUT.');
  });
});
