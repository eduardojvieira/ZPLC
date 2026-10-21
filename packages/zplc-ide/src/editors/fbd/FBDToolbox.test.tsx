import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FBD_VALUE_BLOCKS } from './palette';
import { projectLoaderStub } from '../../test/projectLoaderStub';

// The project blocks come from the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../../utils/projectLoader', () => projectLoaderStub());
const { default: FBDToolbox } = await import('./FBDToolbox');

describe('the FBD toolbox (LNG-012) on the component kit', () => {
  const html = renderToStaticMarkup(<FBDToolbox onInsert={() => undefined} />);

  it('keeps the shared toolbox wrapper, a draggable named button per value block and one per block of an expanded category', () => {
    expect(html).toContain('zplc-visual-toolbox');
    for (const block of FBD_VALUE_BLOCKS) {
      expect(html).toContain(`data-fbd-toolbox-item="${block}"`);
      expect(html).toContain(`aria-label="Insert ${block}"`);
    }
    // the categories open by default list their blocks as draggable buttons
    expect(html.match(/<button[^>]*draggable="true"/g)!.length).toBeGreaterThan(FBD_VALUE_BLOCKS.length);
    expect(html).toContain('>Timers<');
  });

  it('has a named search box of the kit, and uses no title tooltip, focus override or text under 11px', () => {
    expect(html).toMatch(
      /<input[^>]*type="search"[^>]*aria-label="Search the blocks"|<input[^>]*aria-label="Search the blocks"[^>]*type="search"/,
    );
    expect(html).toMatch(/<input[^>]*class="[^"]*ui-input/);
    expect(html).not.toMatch(/ title=|focus:|focus-visible:|text-\[(?:9|10)px\]/);
  });
});
