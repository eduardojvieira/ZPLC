import { en, type MessageKey } from './en';

const text = (key: string): string => en[key as MessageKey] ?? en[`${key}.other` as MessageKey] ?? key;

/**
 * For the tests that pin a component's source because it has no renderer (VF-006 lists them): the source with every
 * `t('key')` / `tn('key', ...)` call replaced by the English catalog text, so the assertions state what the user reads and
 * keep their meaning after the strings moved to src/i18n. `attr={t('key')}` becomes `attr="text"`, a child `{t('key')}` becomes
 * the bare text, and the `{name}` markers of a text with values stay in it.
 */
export function withEnglishMessages(source: string): string {
  return source
    .replace(/=\{t\('([\w.]+)'(?:, \{[^}]*\})?\)\}/g, (_, key: string) => `="${text(key)}"`)
    .replace(/\{tn?\('([\w.]+)'[^()]*(?:\([^()]*\)[^()]*)*\)\}/g, (_, key: string) => text(key))
    .replace(/\btn?\('([\w.]+)'(?:, [^()]*(?:\([^()]*\)[^()]*)*)?\)/g, (_, key: string) => text(key));
}
