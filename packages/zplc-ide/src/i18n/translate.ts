import { en, type MessageKey } from './en';
import { es } from './es';
import type { Locale } from './locale';

export type ParamNames<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | ParamNames<Rest> : never;
export type Values = Record<string, string | number>;
export type PluralKey = { [K in MessageKey]: K extends `${infer B}.one` ? B : never }[MessageKey];
/** The arguments after the key: none for a text without markers, the values for the markers otherwise (a union of keys takes either). */
export type TArgs<K extends MessageKey> = K extends MessageKey
  ? [ParamNames<(typeof en)[K]>] extends [never] ? [] : [values: Record<ParamNames<(typeof en)[K]>, string | number>]
  : never;
export type PluralArgs<B extends PluralKey> = [Exclude<ParamNames<(typeof en)[`${B}.other` & MessageKey]>, 'count'>] extends [never]
  ? [] : [values: Record<Exclude<ParamNames<(typeof en)[`${B}.other` & MessageKey]>, 'count'>, string | number>];

const CATALOGS: Record<Locale, Readonly<Record<string, string>>> = { en, es };
const PLURAL_RULES: Partial<Record<Locale, Intl.PluralRules>> = {};
const warned = new Set<string>();

/** Fills the `{name}` markers of a template; a marker with no value stays visible rather than becoming "undefined". */
export function format(template: string, values?: Values): string {
  return values ? template.replace(/\{(\w+)\}/g, (marker, name: string) => (name in values ? String(values[name]) : marker)) : template;
}

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`i18n: ${message}`);
}

/** The string of a key in a language; English when that language lacks the key, and the key itself (logged once) when no catalog has it. */
export function translate(locale: Locale, key: string, values?: Values): string {
  const own = CATALOGS[locale][key];
  if (own !== undefined) return format(own, values);
  const fallback = CATALOGS.en[key];
  warnOnce(fallback === undefined ? `no catalog has the key "${key}"` : `the ${locale} catalog lacks the key "${key}"; English is shown`);
  return format(fallback ?? key, values);
}

/** The `.one` or `.other` form of a key for a count (`Intl.PluralRules`); `{count}` is filled with the count. */
export function translatePlural(locale: Locale, key: string, count: number, values?: Values): string {
  const rules = (PLURAL_RULES[locale] ??= new Intl.PluralRules(locale));
  return translate(locale, `${key}.${rules.select(count) === 'one' ? 'one' : 'other'}`, { ...values, count });
}
