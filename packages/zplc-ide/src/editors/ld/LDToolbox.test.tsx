import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { getToolboxItems } from '../../models/ld';
import { LD_FUNCTIONS } from '../../models/ldSupport';
import { projectLoaderStub } from '../../test/projectLoaderStub';

// The project blocks come from the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../../utils/projectLoader', () => projectLoaderStub());
const { default: LDToolbox } = await import('./LDToolbox');

describe('the Ladder toolbox (LNG-012) on the component kit', () => {
  const html = renderToStaticMarkup(<LDToolbox onInsert={() => undefined} />);

  it('keeps one draggable, named button per item, with the attribute the editor and the journeys select on', () => {
    const items = [...getToolboxItems(), ...Object.keys(LD_FUNCTIONS)];
    expect(html).toContain('data-ld-toolbox');
    expect(html.match(/data-ld-toolbox-item=/g)).toHaveLength(items.length);
    for (const item of items) expect(html).toContain(`aria-label="Insert ${typeof item === 'string' ? item : item.label}"`);
    expect(html.match(/<button[^>]*draggable="true"/g)).toHaveLength(items.length);
    expect(html).toContain('<h2');
    expect(html).toContain('>Toolbox<');
  });

  it('LNG-028 LNG-012 has a Functions group with one draggable button for each function, with its name to drag', () => {
    expect(html).toContain('>Functions<');
    for (const name of Object.keys(LD_FUNCTIONS)) expect(html).toContain(`data-ld-toolbox-item="function:${name}"`);
  });

  it('has a named search box of the kit, and uses no title tooltip, focus override or text under 11px', () => {
    expect(html).toMatch(
      /<input[^>]*type="search"[^>]*aria-label="Search the toolbox"|<input[^>]*aria-label="Search the toolbox"[^>]*type="search"/,
    );
    expect(html).toMatch(/<input[^>]*class="[^"]*ui-input/);
    expect(html).not.toMatch(/ title=|focus:|focus-visible:|text-\[(?:9|10)px\]/);
  });
});
