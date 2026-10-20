/**
 * The languages of ZPLC and how the language setting becomes one of them (UX-029). Pure: no store and no React, so
 * the settings module can use it without a cycle.
 */
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
/** What the user chooses: a language, or `auto` to follow the operating system. */
export const LANGUAGE_SETTINGS = ['auto', ...LOCALES] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** The setting as a language: `auto` takes the primary subtag of the system language (`es-AR` is `es`) and falls back to English. */
export function resolveLanguage(setting: LanguageSetting, systemLanguage: string | undefined): Locale {
  if (setting !== 'auto') return setting;
  const primary = systemLanguage?.split(/[-_]/)[0]?.toLowerCase();
  return LOCALES.find((locale) => locale === primary) ?? 'en';
}

/** The language of the operating system as the renderer sees it (`navigator.language`); none outside a browser. */
export function systemLanguage(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language;
}
