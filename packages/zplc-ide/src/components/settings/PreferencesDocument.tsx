/**
 * The Preferences document (SHL-011, SHL-012): the user's own fields on one page, open with or without a project. It carries the one
 * theme control of the product, the other preferences and the assistant provider form, and it scrolls to the setting the palette
 * chose. The project's fields are in Project settings, a document of their own.
 */
import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { usePreferencesDocument, MCP_SECTION_ID } from '../../store/usePreferencesDocument';
import { AppPreferences } from './AppPreferences';
import { AssistantSettings, ASSISTANT_SECTION_ID } from './AssistantSettings';
import { McpConnectionSettings } from './McpConnectionSettings';

export function PreferencesDocument() {
  const { t } = useT();
  const requests = usePreferencesDocument((state) => state.requests);
  const page = useRef<HTMLDivElement>(null);

  // The setting asked for is brought into view and takes the focus; without one the heading does.
  useEffect(() => {
    const anchor = usePreferencesDocument.getState().anchor;
    const target =
      anchor === ASSISTANT_SECTION_ID || anchor === MCP_SECTION_ID
        ? page.current?.querySelector<HTMLElement>(`#${anchor} input, #${anchor} button, #${anchor} h2`)
        : anchor
          ? page.current?.querySelector<HTMLElement>(`[data-setting="${anchor}"]`)
          : null;
    const element = target ?? page.current?.querySelector<HTMLElement>('h1');
    element?.scrollIntoView?.({ block: 'center' });
    element?.focus();
  }, [requests]);

  return (
    <div ref={page} data-preferences-document className="h-full overflow-auto bg-[var(--color-surface-900)] p-6">
      <div className="mx-auto max-w-3xl">
        <h1 tabIndex={-1} className="mb-4 text-xl font-bold text-[var(--color-surface-100)]">
          {t('preferences.title')}
        </h1>
        <AppPreferences />
        <AssistantSettings />
        <McpConnectionSettings />
      </div>
    </div>
  );
}
