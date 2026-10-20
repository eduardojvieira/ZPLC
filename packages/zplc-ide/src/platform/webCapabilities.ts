/**
 * What the web build lacks (REL-037, decision D-07), written once. The in-app notice, the refusals of the toolbar and the
 * docs page "ZPLC in the browser" (tools/docs/web-capabilities.ts writes it, in both languages) all read this table, so
 * they cannot drift. The text of each entry is `web.feature.<id>.title` and `.reason` in the catalogs.
 */
import type { Translator } from '../i18n';

declare const __ZPLC_WEB_BUILD__: boolean | undefined;

/** True in the bundle that `bun run build:web` makes: no Electron preload, browser services only. */
export const isWebBuild = (): boolean => typeof __ZPLC_WEB_BUILD__ !== 'undefined' && __ZPLC_WEB_BUILD__ === true;

export const WEB_MISSING_FEATURES = ['nativeSimulation', 'deviceLink', 'firmwareBuilds', 'hostTests', 'mcpCli', 'updateCheck', 'profileStore', 'aiAssistant'] as const;
export type WebMissingFeature = (typeof WEB_MISSING_FEATURES)[number];

const SITE = 'https://eduardojvieira.github.io/ZPLC';
export const WEB_INSTALL_URL = `${SITE}/docs/getting-started/install/`;
export const WEB_PAGE_URL = `${SITE}/docs/ide/browser/`;

/** The docs address in the language of the interface: the Spanish site is under /es/. */
export const webDocsUrl = (url: string, locale: string): string => (locale === 'es' ? url.replace(SITE, `${SITE}/es`) : url);

export function webMissingFeatures(translator: Pick<Translator, 't'>): Array<{ id: WebMissingFeature; title: string; reason: string }> {
  return WEB_MISSING_FEATURES.map((id) => ({ id, title: translator.t(`web.feature.${id}.title`), reason: translator.t(`web.feature.${id}.reason`) }));
}

/** Why a device connection is refused in the web build (AGENTS.md rule 7: the browser never reaches a device); null where it is allowed. */
export function deviceLinkRefusal(web: boolean, translator: Pick<Translator, 't'>): string | null {
  return web ? translator.t('web.hardware.refused') : null;
}
