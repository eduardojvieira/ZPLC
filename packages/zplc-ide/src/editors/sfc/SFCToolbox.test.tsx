import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SFC_PALETTE } from '../../models/sfcSupport';
import SFCToolbox from './SFCToolbox';

describe('the SFC toolbox (LNG-012) on the component kit', () => {
  const html = renderToStaticMarkup(<SFCToolbox onInsert={() => undefined} />);

  it('keeps the shared toolbox wrapper and one draggable, named button per element', () => {
    expect(html).toContain('zplc-visual-toolbox');
    expect(html.match(/data-sfc-toolbox-item=/g)).toHaveLength(SFC_PALETTE.length);
    for (const element of SFC_PALETTE) expect(html).toContain(`aria-label="Insert ${element.label}"`);
    expect(html.match(/<button[^>]*draggable="true"/g)).toHaveLength(SFC_PALETTE.length);
  });

  it('has a named search box of the kit, and uses no title tooltip, focus override or text under 11px', () => {
    expect(html).toMatch(
      /<input[^>]*type="search"[^>]*aria-label="Search the elements"|<input[^>]*aria-label="Search the elements"[^>]*type="search"/,
    );
    expect(html).toMatch(/<input[^>]*class="[^"]*ui-input/);
    expect(html).not.toMatch(/ title=|focus:|focus-visible:|text-\[(?:9|10)px\]/);
  });
});
