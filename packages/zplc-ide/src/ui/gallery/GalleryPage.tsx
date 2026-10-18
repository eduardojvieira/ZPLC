/**
 * The component gallery (UX-004): every kit component in every theme and density, on one page. It exists in development
 * builds only: main.tsx reaches it through `import.meta.env.DEV` and the `#ui-gallery` hash, a condition the production
 * build replaces with `false`, so this module and its stylesheet are not in the installer (scripts/galleryBundle.test.ts).
 * Each panel scopes its theme and density with `data-ui-theme` and `data-ui-density`.
 */
import { useEffect, useId } from 'react';
import { applyThemeToDOM, useIDEStore, type Theme } from '../../store/useIDEStore';
import { useAppSettings } from '../../store/useAppSettings';
import { DENSITY_CHOICES, type Density } from '../../utils/appSettings';
import { PRODUCT_NAME } from '../../productName';
import { THEME_IDS, type ThemeId } from '../../theme/tokens';
import { Select } from '..';
import { Specimens } from './Specimens';
import './scopes.generated.css';
import './gallery.css';

const THEME_NAMES: Record<ThemeId, string> = { light: 'Light', dark: 'Dark', 'high-contrast': 'High contrast' };
const DENSITY_NAMES: Record<Density, string> = { comfortable: 'Comfortable', compact: 'Compact' };

export function GalleryPage() {
  const theme = useIDEStore((state) => state.theme);
  const density = useAppSettings((state) => state.settings.density);
  const update = useAppSettings((state) => state.update);
  const headingId = useId();

  useEffect(() => { applyThemeToDOM(theme); }, [theme]);

  return (
    <main className="ui-gallery" aria-labelledby={headingId}>
      <header className="ui-gallery-header">
        <h1 id={headingId}>{PRODUCT_NAME} component gallery</h1>
        <p>Development build only. Each panel shows every kit component in one theme and density.</p>
        <div className="ui-gallery-controls">
          <Select label="Page theme" value={theme} onChange={(event) => useIDEStore.getState().setTheme(event.target.value as Theme)}>
            <option value="system">System</option>
            {THEME_IDS.map((id) => <option key={id} value={id}>{THEME_NAMES[id]}</option>)}
          </Select>
          <Select label="Page density" value={density} onChange={(event) => update({ density: event.target.value as Density })}>
            {DENSITY_CHOICES.map((id) => <option key={id} value={id}>{DENSITY_NAMES[id]}</option>)}
          </Select>
        </div>
      </header>
      {THEME_IDS.flatMap((themeId) => DENSITY_CHOICES.map((densityId) => (
        <section key={`${themeId}-${densityId}`} className="ui-gallery-panel" data-ui-theme={themeId} data-ui-density={densityId} aria-label={`${THEME_NAMES[themeId]}, ${DENSITY_NAMES[densityId]}`}>
          <h2 className="ui-gallery-panel-title">{THEME_NAMES[themeId]}, {DENSITY_NAMES[densityId].toLowerCase()}</h2>
          <Specimens />
        </section>
      )))}
    </main>
  );
}
