/**
 * The application preferences of the user (IDE-007, IDE-010): theme, editor font size and tab size, density,
 * language, autosave and the update check. They belong to the person, not to a project, so they sit in front of the
 * project settings and on the Welcome screen, and persist per user (`useAppSettings`). Every control is a native one:
 * keyboard operable, with its label.
 */
import { useState } from 'react';
import { Button, Checkbox, Select } from '../../ui';
import { useT, type MessageKey } from '../../i18n';
import { ThemeControl } from '../ThemeControl';
import { useAppSettings } from '../../store/useAppSettings';
import { useEditorView } from '../../store/editorViewSettings';
import { AUTOSAVE_CHOICES, DENSITY_CHOICES, LANGUAGE_CHOICES, TAB_SIZE_CHOICES, type AppSettings, type Density, type Language } from '../../utils/appSettings';
import { describeUpdateCheck, runUpdateCheck } from '../../ipc/updateCheckBridge';
import { ZPLC_REPO_VERSION } from '../../version';
import type { UpdateCheckResult } from '../../../electron/updateCheckProtocol';
import { useUpdateNotice } from '../../store/updateNotice';

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32] as const;
const LANGUAGE_NAMES = { auto: 'preferences.language.auto', en: 'preferences.language.en', es: 'preferences.language.es' } as const satisfies Record<Language, MessageKey>;
const DENSITY_NAMES = { comfortable: 'preferences.density.comfortable', compact: 'preferences.density.compact' } as const satisfies Record<Density, MessageKey>;

function Choice<K extends keyof AppSettings>({ label, field, options, name }: {
  label: string;
  field: K;
  options: readonly AppSettings[K][];
  name: (option: AppSettings[K]) => string;
}) {
  const value = useAppSettings((state) => state.settings[field]);
  const update = useAppSettings((state) => state.update);
  return (
    <Select
      label={label}
      value={String(value)}
      onChange={(event) => update({ [field]: options.find((option) => String(option) === event.target.value) } as Partial<AppSettings>)}
      data-setting={field}
    >
      {options.map((option) => <option key={String(option)} value={String(option)}>{name(option)}</option>)}
    </Select>
  );
}

/** `includeTheme` is off where the page already has the one theme control (the Welcome screen header). */
export function AppPreferences({ includeTheme = true }: { includeTheme?: boolean }) {
  const { t, tn } = useT();
  const checkForUpdates = useAppSettings((state) => state.settings.checkForUpdates);
  const minimap = useEditorView((state) => state.minimap);
  const setMinimap = useEditorView((state) => state.setMinimap);
  const update = useAppSettings((state) => state.update);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  const checkNow = () => {
    setChecking(true);
    void runUpdateCheck(window.electronAPI?.updateCheck, ZPLC_REPO_VERSION).then((answer) => {
      setResult(answer);
      setChecking(false);
      // a check on request raises the notice too, so that the release and the step are one click away from here
      useUpdateNotice.getState().report(answer);
    });
  };

  return (
    <section aria-labelledby="app-preferences-heading" data-app-preferences className="mb-6 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-4">
      <h2 id="app-preferences-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{t('preferences.heading')}</h2>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('preferences.intro')}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {includeTheme && <ThemeControl />}
        <Choice label={t('preferences.fontSize')} field="editorFontSize" options={FONT_SIZES} name={(size) => t('preferences.fontSizeOption', { size })} />
        <Choice label={t('preferences.tabSize')} field="editorTabSize" options={TAB_SIZE_CHOICES} name={(size) => tn('preferences.tabSizeOption', size)} />
        <Choice label={t('preferences.density')} field="density" options={DENSITY_CHOICES} name={(density) => t(DENSITY_NAMES[density])} />
        <Choice label={t('preferences.language')} field="language" options={LANGUAGE_CHOICES} name={(language) => t(LANGUAGE_NAMES[language])} />
        <Choice label={t('preferences.autosave')} field="autosaveSeconds" options={AUTOSAVE_CHOICES} name={(seconds) => (seconds === 0 ? t('preferences.autosave.off') : tn('preferences.autosave.after', seconds))} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-surface-600)] pt-3">
        <Checkbox label={t('preferences.minimap')} checked={minimap} onChange={(event) => setMinimap(event.target.checked)} data-setting="editorMinimap" />
        <Checkbox label={t('preferences.updates.check')} checked={checkForUpdates} onChange={(event) => update({ checkForUpdates: event.target.checked })} data-setting="checkForUpdates" />
        <Button onClick={checkNow} disabled={checking}>
          {checking ? t('preferences.updates.checking') : t('preferences.updates.now')}
        </Button>
        {result && <p role="status" className="text-xs text-[var(--text-secondary)]">{describeUpdateCheck(result, t)}</p>}
      </div>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">{t('preferences.updates.note')}</p>
    </section>
  );
}
