import { useMemo, useSyncExternalStore } from 'react';
import { useAppSettings } from '../store/useAppSettings';
import type { MessageKey } from './en';
import { resolveLanguage, systemLanguage, type Locale } from './locale';
import { translate, translatePlural, type PluralArgs, type PluralKey, type TArgs } from './translate';

export { LANGUAGE_SETTINGS, LOCALES, resolveLanguage, type LanguageSetting, type Locale } from './locale';
export type { MessageKey } from './en';

/** The language the interface is in now: the setting, with `auto` resolved from the language of the system. */
export function currentLocale(): Locale {
  return resolveLanguage(useAppSettings.getState().settings.language, systemLanguage());
}

export interface Translator {
  locale: Locale;
  t<K extends MessageKey>(key: K, ...args: TArgs<K>): string;
  tn<B extends PluralKey>(key: B, count: number, ...args: PluralArgs<B>): string;
}

export const translatorFor = (locale: Locale): Translator => ({
  locale,
  t: (key, ...args) => translate(locale, key, args[0]),
  tn: (key, count, ...args) => translatePlural(locale, key, count, args[0]),
});

/** For code outside components (menus, dialogs, errors): the string in the language of the moment. */
export const t: Translator['t'] = (key, ...args) => translate(currentLocale(), key, args[0]);
export const tn: Translator['tn'] = (key, count, ...args) => translatePlural(currentLocale(), key, count, args[0]);

/** For components: re-renders when the language setting changes. */
export function useT(): Translator {
  const locale = useSyncExternalStore(useAppSettings.subscribe, currentLocale, currentLocale);
  return useMemo(() => translatorFor(locale), [locale]);
}
