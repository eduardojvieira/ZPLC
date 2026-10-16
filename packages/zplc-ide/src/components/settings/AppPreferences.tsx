/**
 * The application preferences of the user (IDE-007, IDE-010): theme, editor font size and tab size, density,
 * language, autosave and the update check. They belong to the person, not to a project, so they sit in front of the
 * project settings and on the Welcome screen, and persist per user (`useAppSettings`). Every control is a native one:
 * keyboard operable, with its label.
 */
import { useState } from 'react';
import { Button, Checkbox, Select } from '../../ui';
import { ThemeControl } from '../ThemeControl';
import { useAppSettings } from '../../store/useAppSettings';
import { AUTOSAVE_CHOICES, DENSITY_CHOICES, LANGUAGE_CHOICES, TAB_SIZE_CHOICES, type AppSettings } from '../../utils/appSettings';
import { describeUpdateCheck, runUpdateCheck } from '../../ipc/updateCheckBridge';
import { ZPLC_REPO_VERSION } from '../../version';
import type { UpdateCheckResult } from '../../../electron/updateCheckProtocol';
import { useUpdateNotice } from '../../store/updateNotice';

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32] as const;
const LANGUAGE_NAMES = { en: 'English', es: 'Español' } as const;
const DENSITY_NAMES = { comfortable: 'Comfortable', compact: 'Compact' } as const;
const autosaveName = (seconds: number) => (seconds === 0 ? 'Off' : `After ${seconds} seconds without typing`);

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
  const checkForUpdates = useAppSettings((state) => state.settings.checkForUpdates);
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
      <h2 id="app-preferences-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Preferences</h2>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">They apply to every project and are kept for your user account.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {includeTheme && <ThemeControl />}
        <Choice label="Editor font size" field="editorFontSize" options={FONT_SIZES} name={(size) => `${size} px`} />
        <Choice label="Tab size" field="editorTabSize" options={TAB_SIZE_CHOICES} name={(size) => `${size} spaces`} />
        <Choice label="Density" field="density" options={DENSITY_CHOICES} name={(density) => DENSITY_NAMES[density]} />
        <Choice label="Language" field="language" options={LANGUAGE_CHOICES} name={(language) => LANGUAGE_NAMES[language]} />
        <Choice label="Autosave" field="autosaveSeconds" options={AUTOSAVE_CHOICES} name={autosaveName} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-surface-600)] pt-3">
        <Checkbox label="Check for a newer release when Studio starts" checked={checkForUpdates} onChange={(event) => update({ checkForUpdates: event.target.checked })} data-setting="checkForUpdates" />
        <Button onClick={checkNow} disabled={checking}>
          {checking ? 'Checking…' : 'Check now'}
        </Button>
        {result && <p role="status" className="text-xs text-[var(--text-secondary)]">{describeUpdateCheck(result)}</p>}
      </div>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">The check asks the GitHub releases of this project for the latest version. It sends nothing about you, downloads nothing and is off until you turn it on.</p>
    </section>
  );
}
