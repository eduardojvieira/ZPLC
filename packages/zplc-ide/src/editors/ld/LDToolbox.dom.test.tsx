import { describe, expect, it } from 'bun:test';
import { CONVERSION_TYPES, FUNCTION_DOCS } from '@zplc/compiler';
import { setupDom, stubProjectLoader } from '../../test/dom';

// LNG-030: the Ladder palette lists every compiler function, the conversions in one group found by name.
const dom = await setupDom();
await stubProjectLoader();
const { default: LDToolbox } = await import('./LDToolbox');

const EXPECTED = CONVERSION_TYPES.flatMap((from) => CONVERSION_TYPES.filter((to) => to !== from).map((to) => `function:${from}_TO_${to}`));
const names = (root: ParentNode): string[] =>
  [...root.querySelectorAll('[data-ld-toolbox-item]')].map((e) => e.getAttribute('data-ld-toolbox-item')!);
const group = (name: string) => document.querySelector(`[data-ld-group="${name}"]`);

describe('the Ladder palette of the compiler functions (LNG-030)', () => {
  it('has a Conversions group of the 240 conversions, ordered by source type', async () => {
    const { user } = dom.render(<LDToolbox onInsert={() => undefined} />);
    expect(group('Conversions')!.querySelectorAll('[data-ld-toolbox-item]')).toHaveLength(0); // a collapsed group renders no entries
    await user.click(dom.screen.getByRole('button', { name: 'Conversions' }));
    expect(names(group('Conversions')!)).toEqual(EXPECTED);
    expect(EXPECTED).toHaveLength(240);
  });

  it('gives each entry of an open group its own row, so a long name such as SINT_TO_USINT does not break', async () => {
    const { user } = dom.render(<LDToolbox onInsert={() => undefined} />);
    await user.click(dom.screen.getByRole('button', { name: 'Conversions' }));
    const grid = group('Conversions')!.querySelector('[data-ld-toolbox-item="function:SINT_TO_USINT"]')!.parentElement!;
    expect(grid.classList.contains('grid-cols-1')).toBe(true);
    expect(grid.classList.contains('grid-cols-2')).toBe(false);
  });

  it('finds INT_TO_REAL by name', async () => {
    const { user } = dom.render(<LDToolbox onInsert={() => undefined} />);
    await user.type(dom.screen.getByRole('searchbox'), 'INT_TO_REAL');
    expect(names(document.body)).toContain('function:INT_TO_REAL');
  });

  it('names the group in English and in Spanish', () => {
    dom.render(<LDToolbox />);
    expect(dom.screen.getByRole('button', { name: 'Conversions' })).toBeTruthy();
    dom.render(<LDToolbox />, { locale: 'es' });
    expect(dom.screen.getByRole('button', { name: 'Conversiones' })).toBeTruthy();
  });

  it('describes a function from FUNCTION_DOCS and a conversion with one message, in English and in Spanish', async () => {
    for (const locale of ['en', 'es'] as const) {
      const { user, unmount } = dom.render(<LDToolbox />, { locale });
      await user.type(dom.screen.getByRole('searchbox'), 'CONCAT');
      const concat = document.querySelector('[data-ld-toolbox-item="function:CONCAT"]') as HTMLElement;
      await dom.act(async () => concat.focus());
      expect((await dom.screen.findByRole('tooltip')).textContent).toBe(FUNCTION_DOCS.CONCAT![locale]);
      await dom.act(async () => concat.blur());
      await user.clear(dom.screen.getByRole('searchbox'));
      await user.type(dom.screen.getByRole('searchbox'), 'INT_TO_REAL');
      const conv = document.querySelector('[data-ld-toolbox-item="function:INT_TO_REAL"]') as HTMLElement;
      await dom.act(async () => conv.focus());
      expect((await dom.screen.findByRole('tooltip')).textContent).toBe(
        dom.tFor(locale)('fbd.conversionDescription', { from: 'INT', to: 'REAL' }),
      );
      unmount();
    }
  });

  it('keeps the contacts, and places one', async () => {
    const placed: string[] = [];
    const { user } = dom.render(<LDToolbox onInsert={(item) => placed.push(item.type)} />);
    const contact = document.querySelector('[data-ld-toolbox-item^="contact"]') as HTMLElement;
    expect(contact.getAttribute('draggable')).toBe('true');
    await user.click(contact);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toStartWith('contact');
  });
});
