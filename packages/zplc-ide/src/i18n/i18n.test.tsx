import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SerialPortDialog } from '../components/SerialPortDialog';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { UpdateNoticeView } from '../components/UpdateNotice';
import { updateSteps } from '../ipc/updateNotice';
import { useNotifications } from '../store/notifications';
import { useAppSettings } from '../store/useAppSettings';
import { announcementsSnapshot, resetAnnouncements } from '../utils/announce';
import { en } from './en';
import { es } from './es';
import { currentLocale, t, tn, translatorFor, useT } from './index';
import { resolveLanguage } from './locale';
import { format, translate } from './translate';

// The theme control reaches the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
const { AppPreferences } = await import('../components/settings/AppPreferences');

const setLanguage = (language: 'auto' | 'en' | 'es') => useAppSettings.getState().update({ language });
const setSystemLanguage = (value: string | undefined) => Object.defineProperty(globalThis.navigator, 'language', { value, configurable: true });

// bunfig.toml pins the system language of every test to English; each test restores it.
afterEach(() => { setLanguage('auto'); setSystemLanguage('en-US'); });

describe('UX-016 DOC-017 the catalogs call the application ZPLC (decision D-03)', () => {
  it('UX-016 names it neither "ZPLC Studio", "ZPLC IDE" nor "Studio", in English or in Spanish', () => {
    const naming = (catalog: Record<string, string>) => Object.entries(catalog).filter(([, text]) => /\bStudio\b|ZPLC IDE/.test(text)).map(([key]) => key);
    expect({ en: naming(en), es: naming(es) }).toEqual({ en: [], es: [] });
  });
});

describe('UX-029 translation: interpolation, plural and fallback', () => {
  it('UX-029 interpolates {name} values and leaves an unsupplied one visible', () => {
    expect(format('ZPLC {version} is available', { version: '2.1.0' })).toBe('ZPLC 2.1.0 is available');
    expect(format('{a} and {a} and {b}', { a: 1 })).toBe('1 and 1 and {b}');
    expect(translate('es', 'updateNotice.available', { version: '2.1.0' })).toBe('ZPLC 2.1.0 está disponible');
  });

  it('UX-029 picks the plural form of the language with Intl.PluralRules', () => {
    const english = translatorFor('en');
    const spanish = translatorFor('es');
    expect([1, 0, 4].map((count) => english.tn('preferences.tabSizeOption', count))).toEqual(['1 space', '0 spaces', '4 spaces']);
    expect([1, 0, 1000000].map((count) => spanish.tn('preferences.tabSizeOption', count))).toEqual(['1 espacio', '0 espacios', '1000000 espacios']);
  });

  it('UX-029 falls back to English for a key a catalog lacks, and never renders the raw key silently', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(translate('es', 'only.in.english.once')).toBe('only.in.english.once');
      expect(translate('es', 'only.in.english.once')).toBe('only.in.english.once');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('only.in.english.once');
    } finally { warn.mockRestore(); }
  });
});

describe('UX-029 the language setting: auto, en and es', () => {
  it('UX-029 resolves auto from the language of the system and falls back to English', () => {
    const resolved = ['es-AR', 'es', 'es-419', 'ES-mx', 'en-US', 'pt-BR', 'fr', '', undefined].map((system) => resolveLanguage('auto', system));
    expect(resolved).toEqual(['es', 'es', 'es', 'es', 'en', 'en', 'en', 'en', 'en']);
    expect(resolveLanguage('en', 'es-AR')).toBe('en');
    expect(resolveLanguage('es', 'en-US')).toBe('es');
  });

  it('UX-029 reads navigator.language when the setting is auto, and is English where there is none', () => {
    expect(currentLocale()).toBe('en');
    setSystemLanguage(undefined);
    expect(currentLocale()).toBe('en');
    setSystemLanguage('es-AR');
    expect(t('preferences.heading')).toBe('Preferencias');
    setSystemLanguage('pt-BR');
    expect(t('preferences.heading')).toBe('Preferences');
  });

  it('UX-029 switches at runtime without a restart: the same non-React t and hook answer in the new language', () => {
    const Heading = () => <h1>{useT().t('preferences.heading')}</h1>;
    setLanguage('en');
    expect(t('preferences.heading')).toBe('Preferences');
    expect(renderToStaticMarkup(<Heading />)).toBe('<h1>Preferences</h1>');
    setLanguage('es');
    expect(t('preferences.heading')).toBe('Preferencias');
    expect(tn('preferences.tabSizeOption', 2)).toBe('2 espacios');
    expect(renderToStaticMarkup(<Heading />)).toBe('<h1>Preferencias</h1>');
  });
});

describe('UX-029 the catalogs', () => {
  it('UX-029 hold the same keys and the same {placeholders} in English and Spanish', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect({ key, placeholders: placeholders(es[key]) }).toEqual({ key, placeholders: placeholders(en[key]) });
  });
});

describe('UX-029 migrated components render in the language of the setting', () => {
  const dialog = () => renderToStaticMarkup(
    <SerialPortDialog rows={[{ portId: 'a', name: 'Pico', usbId: '2E8A:000A', serialNumber: 'E661', boards: ['Raspberry Pi Pico (RP2040)'], ambiguous: false, vendor: null, kind: 'known-board' }]} selectedPortId="a" refreshing={false} onSelect={() => undefined} onChoose={() => undefined} onRefresh={() => undefined} onCancel={() => undefined} />,
  );

  it('UX-029 draws the serial port dialog in English by default and in Spanish when the setting is es', () => {
    const english = dialog();
    expect(english).toContain('Choose a serial port');
    expect(english).toContain('USB 2E8A:000A · serial number E661');
    expect(english).toContain('Known board: Raspberry Pi Pico (RP2040)');
    setLanguage('es');
    const spanish = dialog();
    expect(spanish).toContain('Elegir un puerto serie');
    expect(spanish).toContain('USB 2E8A:000A · número de serie E661');
    expect(spanish).toContain('Placa conocida: Raspberry Pi Pico (RP2040)');
    expect(spanish).toContain('>Actualizar<');
    expect(spanish).toContain('>Cancelar<');
    expect(spanish).not.toContain('Choose a serial port');
  });

  it('UX-029 draws the update notice, its steps and the preferences in Spanish, with the plural of the tab size', () => {
    setLanguage('es');
    const notice = renderToStaticMarkup(<UpdateNoticeView notice={{ current: '2.0.0', latest: '2.1.0', releaseUrl: 'https://example.invalid/r', steps: updateSteps('darwin', t) }} onDismiss={() => undefined} />);
    expect(notice).toContain('aria-label="Hay una versión más reciente de ZPLC disponible"');
    expect(notice).toContain('ZPLC 2.1.0 está disponible');
    expect(notice).toContain('Descargue el nuevo archivo');
    const preferences = renderToStaticMarkup(<AppPreferences includeTheme={false} />);
    expect(preferences).toContain('>Preferencias<');
    expect(preferences).toContain('Tamaño de tabulación');
    expect(preferences).toContain('>4 espacios<');
    expect(preferences).toContain('>Automático (idioma del sistema)<');
    expect(preferences).not.toContain('Tab size');
  });

  it('UX-029 offers the three language choices, and the English default leaves the preferences in English', () => {
    const preferences = renderToStaticMarkup(<AppPreferences includeTheme={false} />);
    expect(preferences).toContain('>Preferences<');
    expect(preferences).toMatch(/data-setting="language"[\s\S]*?<option value="auto"[^>]*>Automatic \(system language\)<\/option><option value="en"[^>]*>English<\/option><option value="es"[^>]*>Español<\/option>/);
  });

  it('UX-029 draws the unsaved changes dialog with its default buttons in each language, and keeps the labels a caller passes', () => {
    const draw = (extra: { saveLabel?: string } = {}) => renderToStaticMarkup(<UnsavedChangesDialog title="T" items={['Motor.st']} onChoice={() => undefined} {...extra} />);
    expect(draw()).toContain('>Cancel<');
    expect(draw()).toContain('>Discard<');
    expect(draw()).toContain('>Save<');
    setLanguage('es');
    const spanish = draw();
    expect(spanish).toContain('Estos elementos tienen cambios sin guardar:');
    expect(spanish).toContain('>Cancelar<');
    expect(spanish).toContain('>Descartar<');
    expect(spanish).toContain('>Guardar<');
    expect(draw({ saveLabel: 'Guardar todo y cerrar' })).toContain('>Guardar todo y cerrar<');
  });
});

describe('UX-029 the announcer says the result in the language of the setting', () => {
  const report = (status: 'success' | 'error') => useNotifications.getState().report(status === 'success'
    ? { kind: 'build', status, title: t('toolbarMsg.buildSucceeded'), details: 'output' }
    : { kind: 'build', status, title: t('toolbarMsg.buildFailed'), detail: t('toolbarMsg.theCompilerCouldNot'), details: 'problems' });
  // The notification store is shared by every test file of the run: leave it as it was found.
  afterEach(() => { resetAnnouncements(); useNotifications.setState({ items: [] }); });

  it('UX-029 announces a build result in English by default and in Spanish when the setting is es', () => {
    resetAnnouncements();
    report('success');
    expect(announcementsSnapshot().polite.message).toBe('Build succeeded');
    setLanguage('es');
    report('success');
    expect(announcementsSnapshot().polite.message).toBe('Compilación correcta');
    report('error');
    expect(announcementsSnapshot().assertive.message).toBe('La compilación falló. El compilador no pudo terminar. El panel de problemas contiene lo que informó.');
  });
});
