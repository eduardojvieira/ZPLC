import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';
import { SectionHost } from '../../test/SectionHost';
import type { ZPLCProjectConfig } from '../../types';
import { contrastRatio } from '../../theme/color';
import { resolveTokens } from '../../theme/tokens';

const dom = await setupDom();
await stubProjectLoader();
const { IOSection } = await import('./IOSection');
const { BOARD_OPTIONS } = await import('../../config/boardProfiles');

const board = BOARD_OPTIONS.find((option) => option.value && option.value !== 'custom')!.value;
const withBoard = { target: { board } as ZPLCProjectConfig['target'] };

describe('I/O mapping (UX-013, IO-003) in a DOM', () => {
  it('names the input and output sections and says what to do while a section is empty', () => {
    dom.render(<SectionHost Section={IOSection} initial={withBoard} />);
    expect(dom.screen.getByText(dom.t('io.noInputsConfiguredAdd'))).toBeTruthy();
    expect(dom.screen.getByText(dom.t('io.noOutputsConfiguredAdd'))).toBeTruthy();
  });

  it('adds a digital input, names its row for assistive technology, and renames it', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(
      <SectionHost
        Section={IOSection}
        initial={withBoard}
        onConfig={(config) => {
          last = config;
        }}
      />,
    );
    await user.click(dom.screen.getAllByRole('button', { name: dom.t('io.digital') })[0]!);
    expect(last?.io?.inputs).toHaveLength(1);
    const name = dom.screen.getByRole('textbox', { name: dom.t('a11y.io.name', { row: 1 }) }) as HTMLInputElement;
    await user.tripleClick(name);
    await user.keyboard('Start_PB');
    expect(last?.io?.inputs?.[0]?.name).toBe('Start_PB');
  });

  it('removes a row with its named button', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(
      <SectionHost
        Section={IOSection}
        initial={withBoard}
        onConfig={(config) => {
          last = config;
        }}
      />,
    );
    await user.click(dom.screen.getAllByRole('button', { name: dom.t('io.digital') })[0]!);
    await user.click(dom.screen.getByRole('button', { name: dom.t('io.remove') }));
    expect(last?.io?.inputs ?? []).toHaveLength(0);
    expect(dom.screen.getByText(dom.t('io.noInputsConfiguredAdd'))).toBeTruthy();
  });

  it('adds an output in its own section', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(
      <SectionHost
        Section={IOSection}
        initial={withBoard}
        onConfig={(config) => {
          last = config;
        }}
      />,
    );
    const digital = dom.screen.getAllByRole('button', { name: dom.t('io.digital') });
    await user.click(digital[1]!);
    expect(last?.io?.outputs).toHaveLength(1);
    expect(last?.io?.inputs ?? []).toHaveLength(0);
  });

  it('UXV-004 keeps the add buttons, the table header and every row control readable in the high-contrast theme', async () => {
    const hc = resolveTokens('high-contrast');
    // The resting fill and ink of an element, read from its token classes (a hover: or placeholder: variant is not the rest state).
    const tokenOf = (element: Element, utility: 'bg' | 'text'): string | undefined =>
      new RegExp(`(?:^|\\s)${utility}-\\[var\\((--[\\w-]+)\\)\\]`).exec(element.getAttribute('class') ?? '')?.[1];
    const { user } = dom.render(<SectionHost Section={IOSection} initial={withBoard} />);
    const digital = dom.screen.getAllByRole('button', { name: dom.t('io.digital') });
    await user.click(digital[0]!);
    await user.click(digital[1]!);
    const header = dom.screen.getAllByText(dom.t('io.address'))[0]!.parentElement!;
    const elements = [
      ...dom.screen.getAllByRole('button', { name: dom.t('io.digital') }),
      ...dom.screen.getAllByRole('button', { name: dom.t('io.analog') }),
      header,
      ...dom.screen.getAllByRole('textbox', { name: dom.t('a11y.io.name', { row: 1 }) }),
      ...dom.screen.getAllByRole('combobox', { name: dom.t('a11y.io.type', { row: 1 }) }),
    ];
    const failures = elements.flatMap((element) => {
      const fg = tokenOf(element, 'text');
      const bg = tokenOf(element, 'bg');
      if (fg === undefined || bg === undefined) return [`${element.textContent}: no token pair`];
      const ratio = contrastRatio(hc[fg]!, hc[bg]!);
      return ratio >= 4.5 ? [] : [`${element.tagName} ${element.textContent?.trim()}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`];
    });
    expect(failures).toEqual([]);
  });
});
