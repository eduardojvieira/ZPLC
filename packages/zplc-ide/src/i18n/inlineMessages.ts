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

/**
 * For the same tests, the source laid out by a formatter (VF-017) read as the one-line form their assertions state: runs of
 * white space are one space, a trailing comma before a closing bracket is gone, and a space stays inside braces only.
 */
export function compactSource(source: string): string {
  return source
    .replace(/(['"`])\s*\+\s*\1/g, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*([)\]])/g, '$1')
    .replace(/,\s*\}/g, ' }')
    .replace(/([([])\s+/g, '$1')
    .replace(/\s+([)\]])/g, '$1');
}
