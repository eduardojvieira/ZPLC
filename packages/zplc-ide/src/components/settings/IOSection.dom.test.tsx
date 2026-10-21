import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';
import { SectionHost } from '../../test/SectionHost';
import type { ZPLCProjectConfig } from '../../types';

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
});
