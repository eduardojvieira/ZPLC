import { describe, expect, it } from 'bun:test';

import { WEB_MISSING_FEATURES } from '../../packages/zplc-ide/src/platform/webCapabilities.ts';
import { webBuildEn, webBuildEs } from '../../packages/zplc-ide/src/i18n/catalog/webBuild.ts';
import { GENERATOR, PAGES, browserBody } from './generate_web_capabilities';
import { LANGS, outputsOf, prose, staleOutputs } from './reference-lib';

describe('REL-037 the page ZPLC in the browser: generated from the table of the web build', () => {
  it('REL-037: lists every missing feature of the table, with the reason the notice shows, in both languages', () => {
    for (const lang of LANGS) {
      const body = browserBody(lang);
      const catalog = lang === 'en' ? webBuildEn : webBuildEs;
      for (const id of WEB_MISSING_FEATURES) {
        const title = catalog[`web.feature.${id}.title`];
        const reason = catalog[`web.feature.${id}.reason`];
        expect([lang, id, body.includes(`| **${prose(title)}** | ${prose(reason)} |`)]).toEqual([lang, id, true]);
      }
    }
  });

  it('REL-037: names the address of the hosted build and says that it never reaches a device', () => {
    expect(browserBody('en')).toContain('https://eduardojvieira.github.io/ZPLC/app/');
    expect(browserBody('en')).toContain('never connects to, flashes, deploys to, forces');
    expect(browserBody('es')).toContain('nunca se conecta a un dispositivo');
    expect(browserBody('es')).not.toMatch(/\b(usá|tenés|podés|elegí|vos)\b/i);
  });

  it('REL-037: the committed pages are what the generator writes', () => {
    expect(staleOutputs(outputsOf(GENERATOR, PAGES))).toEqual([]);
  });
});
