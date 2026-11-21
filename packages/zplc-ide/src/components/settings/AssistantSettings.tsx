/**
 * The assistant provider form, a section of Preferences (SHL-011): enabled, endpoint, model and the API key. The key is write-only:
 * it is typed into a password field, handed to the desktop bridge's `storeKey` and cleared from the field; nothing here reads it
 * back, renders it or logs it. The bridge and its storage are the ones the Agent tab used; only where the form sits has moved.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, TextField } from '../../ui';
import { useT } from '../../i18n';
import { useAssistantProvider } from '../../shell/useSelection';
import { presentAiProviderConfig, presentAiProviderMutation } from '../aiProviderPresentation';

export const ASSISTANT_SECTION_ID = 'assistant';

export function AssistantSettings() {
  const { t } = useT();
  const aiProvider = window.electronAPI?.aiProvider;
  const refreshAvailability = useAssistantProvider((state) => state.refresh);
  const [config, setConfig] = useState({ enabled: false, endpoint: '', model: '' });
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const read = useCallback(async () => {
    await Promise.resolve();
    if (!aiProvider) return;
    try {
      const next = presentAiProviderConfig(await aiProvider.getConfig());
      if (next) setConfig(next);
    } catch {
      /* the form keeps what it shows; the next save says what happened */
    }
  }, [aiProvider]);
  useEffect(() => {
    const timer = window.setTimeout(() => void read(), 0);
    return () => window.clearTimeout(timer);
  }, [read]);

  /** One change of the provider's settings: runs it, says what happened, and reads the status again. */
  const mutate = async (
    act: () => Promise<unknown>,
    say: { ok: string; failed: (code: string) => string; untrusted: string; thrown: string },
    clearKey = false,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = presentAiProviderMutation(await act());
      if (result.kind !== 'ok') {
        setMessage(result.kind === 'error' ? say.failed(result.code) : say.untrusted);
        return;
      }
      if (clearKey) setKey('');
      await read();
      void refreshAvailability();
      setMessage(say.ok);
    } catch {
      setMessage(say.thrown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id={ASSISTANT_SECTION_ID}
      aria-labelledby="assistant-preferences-heading"
      data-assistant-settings
      className="mb-6 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-4"
    >
      <h2 id="assistant-preferences-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
        {t('preferences.assistant.heading')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('preferences.assistant.intro')}</p>
      <fieldset disabled={busy} className="mt-3 disabled:opacity-60">
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox
            checked={config.enabled}
            onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))}
            label={t('console.enabled2')}
          />
          <TextField
            value={config.endpoint}
            onChange={(event) => setConfig((current) => ({ ...current, endpoint: event.target.value }))}
            className="mt-1 block w-full"
            label={t('console.endpoint')}
          />
          <TextField
            value={config.model}
            onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
            className="mt-1 block w-full"
            label={t('console.model')}
          />
          <TextField
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="new-password"
            className="mt-1 block w-full"
            label={t('console.apiKey')}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!aiProvider}
            onClick={() => {
              if (!aiProvider) return;
              void mutate(() => aiProvider.saveConfig(config), {
                ok: t('assistant.configSaved'),
                failed: (code) => t('assistant.configNotSaved', { code }),
                untrusted: t('assistant.configUntrusted'),
                thrown: t('assistant.configNotSavedThrown'),
              });
            }}
          >
            {t('configEditor.save')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!aiProvider || !key}
            onClick={() => {
              if (!aiProvider || !key) return;
              void mutate(
                () => aiProvider.storeKey(key),
                {
                  ok: t('assistant.keyStored'),
                  failed: (code) => t('assistant.keyNotStored', { code }),
                  untrusted: t('assistant.keyStoreUntrusted'),
                  thrown: t('assistant.keyNotStoredThrown'),
                },
                true,
              );
            }}
          >
            {t('console.storeKey')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!aiProvider}
            onClick={() => {
              if (!aiProvider) return;
              void mutate(() => aiProvider.clearKey(), {
                ok: t('assistant.keyCleared'),
                failed: (code) => t('assistant.keyNotCleared', { code }),
                untrusted: t('assistant.keyClearUntrusted'),
                thrown: t('assistant.keyNotClearedThrown'),
              });
            }}
          >
            {t('console.clearKey')}
          </Button>
        </div>
      </fieldset>
      {message && (
        <p role="status" className="mt-2 text-xs text-[var(--color-surface-300)]">
          {message}
        </p>
      )}
    </section>
  );
}
