import { describe, expect, test } from 'bun:test';
import { translatorFor } from '../i18n';
import { webContentSecurityPolicy } from './webCsp';
import { WEB_INSTALL_URL, WEB_MISSING_FEATURES, deviceLinkRefusal, isWebBuild, webMissingFeatures } from './webCapabilities';

describe('the web build states what it lacks (REL-037)', () => {
  test('REL-037: every missing feature has a title and a reason in English and in Spanish, from the one table', () => {
    for (const locale of ['en', 'es'] as const) {
      const listed = webMissingFeatures(translatorFor(locale));
      expect(listed.map((entry) => entry.id)).toEqual([...WEB_MISSING_FEATURES]);
      for (const entry of listed) {
        expect(entry.title.length).toBeGreaterThan(8);
        expect(entry.reason.length).toBeGreaterThan(20);
        expect(entry.title).not.toMatch(/^web\./);
        expect(entry.reason).not.toMatch(/^web\./);
      }
    }
  });

  test('REL-037: the list names the device link, the native simulation and the firmware builds, and the Spanish uses usted', () => {
    expect(WEB_MISSING_FEATURES).toEqual(expect.arrayContaining(['deviceLink', 'nativeSimulation', 'firmwareBuilds', 'mcpCli', 'updateCheck', 'profileStore']));
    const spanish = webMissingFeatures(translatorFor('es')).map((entry) => `${entry.title} ${entry.reason}`).join(' ');
    expect(spanish).not.toMatch(/\b(usá|tenés|podés|elegí|vos)\b/i);
  });

  test('REL-037: a device connection is refused with a reason in the web build and left alone in the desktop app', () => {
    expect(isWebBuild()).toBe(false);
    expect(deviceLinkRefusal(false, translatorFor('en'))).toBeNull();
    expect(deviceLinkRefusal(true, translatorFor('en'))).toContain('desktop app');
    expect(deviceLinkRefusal(true, translatorFor('es'))).toContain('aplicación de escritorio');
  });

  test('REL-037: the install page is the docs page, and the policy keeps a static site closed', () => {
    expect(WEB_INSTALL_URL).toBe('https://eduardojvieira.github.io/ZPLC/docs/getting-started/install/');
    const policy = webContentSecurityPolicy();
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/https?:/);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});
