import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import SearchList from './SearchList';

const render = () =>
  renderToStaticMarkup(
    <SearchList
      title="Choose a variable"
      items={[
        { id: 'Hold', label: 'Hold', detail: 'BOOL' },
        { id: 'Run', label: 'Run' },
      ]}
      onChoose={() => undefined}
      onCancel={() => undefined}
    />,
  );

describe('the search list of the visual editors (LNG-012) on the component kit', () => {
  it('keeps the dialog, the named combobox and the options the journeys select on', () => {
    const html = render();
    expect(html).toContain('data-keyboard-picker');
    expect(html).toMatch(/role="dialog"[^>]*aria-label="Choose a variable"|aria-label="Choose a variable"[^>]*role="dialog"/);
    expect(html).toMatch(
      /<input[^>]*role="combobox"[^>]*aria-label="Choose a variable"|<input[^>]*aria-label="Choose a variable"[^>]*role="combobox"/,
    );
    expect(html).toContain('data-picker-item="Hold"');
    expect(html).toContain('data-picker-item="Run"');
    expect(html.match(/role="option"/g)).toHaveLength(2);
  });

  it('draws the search box with the kit input and no shadow, no focus override and no text under 11px', () => {
    const html = render();
    expect(html).toMatch(/<input[^>]*class="[^"]*ui-input/);
    expect(html).not.toMatch(/shadow|focus:|focus-visible:|text-\[(?:9|10)px\]/);
  });
});
