import type { MessageKey } from '../../i18n';
import type { AppSettings } from '../../utils/appSettings';
import type { PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';

/** One entry for each field of the application settings; a test fails when a field is added without one. */
export const PREFERENCE_ENTRIES: ReadonlyArray<{ key: keyof AppSettings; titleKey: MessageKey }> = [
  { key: 'editorFontSize', titleKey: 'preferences.fontSize' },
  { key: 'editorTabSize', titleKey: 'preferences.tabSize' },
  { key: 'density', titleKey: 'preferences.density' },
  { key: 'language', titleKey: 'preferences.language' },
  { key: 'autosaveSeconds', titleKey: 'preferences.autosave' },
  { key: 'checkForUpdates', titleKey: 'preferences.updates.check' },
  { key: 'unlockAllLessons', titleKey: 'learn.home.unlockAll' },
  { key: 'hideSolutions', titleKey: 'learn.home.hideSolutions' },
  { key: 'saveBeforeRun', titleKey: 'studio.flow.saveBeforeRun' },
  { key: 'plantQuality', titleKey: 'plant.quality.label' },
];

export const preferencesProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'preferences',
  titleKey: 'palette.group.preferences',
  items: () =>
    PREFERENCE_ENTRIES.map((entry) => ({
      key: `preference:${entry.key}`,
      group: 'preferences' as const,
      title: snapshot.t(entry.titleKey),
      run: () => snapshot.open.preference(entry.key),
    })),
});
