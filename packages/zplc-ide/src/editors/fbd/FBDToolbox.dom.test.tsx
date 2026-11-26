import { describe, expect, it } from 'bun:test';
import { CONVERSION_TYPES, FUNCTION_DOCS } from '@zplc/compiler';
import { setupDom, stubProjectLoader } from '../../test/dom';

// LNG-030: the FBD palette lists every compiler function, the conversions in one group found by name.
const dom = await setupDom();
await stubProjectLoader();
const { default: FBDToolbox } = await import('./FBDToolbox');

const EXPECTED = CONVERSION_TYPES.flatMap((from) => CONVERSION_TYPES.filter((to) => to !== from).map((to) => `${from}_TO_${to}`));
const names = (root: ParentNode): string[] =>
  [...root.querySelectorAll('[data-fbd-toolbox-item]')].map((e) => e.getAttribute('data-fbd-toolbox-item')!);
const group = (name: string) => document.querySelector(`[data-fbd-group="${name}"]`);

describe('the FBD palette of the compiler functions (LNG-030)', () => {
  it('has a Conversions group of the 240 conversions, ordered by source type', async () => {
    const { user } = dom.render(<FBDToolbox onInsert={() => undefined} />);
    expect(group('Conversions')!.querySelectorAll('[data-fbd-toolbox-item]')).toHaveLength(0); // a collapsed group renders no entries
    await user.click(dom.screen.getByRole('button', { name: 'Conversions' }));
    expect(names(group('Conversions')!)).toEqual(EXPECTED);
    expect(EXPECTED).toHaveLength(240);
  });

  it('finds INT_TO_REAL by name', async () => {
    const { user } = dom.render(<FBDToolbox onInsert={() => undefined} />);
    await user.type(dom.screen.getByRole('searchbox'), 'INT_TO_REAL');
    expect(names(document.body)).toContain('INT_TO_REAL');
  });

  it('names the group in English and in Spanish', () => {
    dom.render(<FBDToolbox />);
    expect(dom.screen.getByRole('button', { name: 'Conversions' })).toBeTruthy();
    dom.render(<FBDToolbox />, { locale: 'es' });
    expect(dom.screen.getByRole('button', { name: 'Conversiones' })).toBeTruthy();
  });

  it('describes a function from FUNCTION_DOCS and a conversion with one message, in English and in Spanish', async () => {
    for (const locale of ['en', 'es'] as const) {
      const { user, unmount } = dom.render(<FBDToolbox />, { locale });
      await user.type(dom.screen.getByRole('searchbox'), 'CONCAT');
      const concat = document.querySelector('[data-fbd-toolbox-item="CONCAT"]') as HTMLElement;
      await dom.act(async () => concat.focus());
      expect((await dom.screen.findByRole('tooltip')).textContent).toBe(FUNCTION_DOCS.CONCAT![locale]);
      await dom.act(async () => concat.blur());
      await user.clear(dom.screen.getByRole('searchbox'));
      await user.type(dom.screen.getByRole('searchbox'), 'INT_TO_REAL');
      const conv = document.querySelector('[data-fbd-toolbox-item="INT_TO_REAL"]') as HTMLElement;
      await dom.act(async () => conv.focus());
      const text = (await dom.screen.findByRole('tooltip')).textContent!;
      expect(text).toContain('INT');
      expect(text).toContain('REAL');
      expect(text).toBe(dom.tFor(locale)('fbd.conversionDescription', { from: 'INT', to: 'REAL' }));
      unmount();
    }
  });

  it('keeps TON, and places it', async () => {
    const placed: string[] = [];
    const { user } = dom.render(<FBDToolbox onInsert={(type) => placed.push(type)} />);
    const ton = document.querySelector('[data-fbd-toolbox-item="TON"]') as HTMLElement;
    expect(ton.getAttribute('draggable')).toBe('true');
    await user.click(ton);
    expect(placed).toEqual(['TON']);
  });
});
