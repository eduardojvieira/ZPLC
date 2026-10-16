import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { getToolboxItems } from '../../models/ld';

// The project blocks come from the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../../utils/projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
const { default: LDToolbox } = await import('./LDToolbox');

describe('the Ladder toolbox (LNG-012) on the component kit', () => {
  const html = renderToStaticMarkup(<LDToolbox onInsert={() => undefined} />);

  it('keeps one draggable, named button per item, with the attribute the editor and the journeys select on', () => {
    const items = getToolboxItems();
    expect(html).toContain('data-ld-toolbox');
    expect(html.match(/data-ld-toolbox-item=/g)).toHaveLength(items.length);
    for (const item of items) expect(html).toContain(`aria-label="Insert ${item.label}"`);
    expect(html.match(/<button[^>]*draggable="true"/g)).toHaveLength(items.length);
    expect(html).toContain('<h2');
    expect(html).toContain('>Toolbox<');
  });

  it('has a named search box of the kit, and uses no title tooltip, focus override or text under 11px', () => {
    expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search the toolbox"|<input[^>]*aria-label="Search the toolbox"[^>]*type="search"/);
    expect(html).toMatch(/<input[^>]*class="[^"]*ui-input/);
    expect(html).not.toMatch(/ title=|focus:|focus-visible:|text-\[(?:9|10)px\]/);
  });
});
