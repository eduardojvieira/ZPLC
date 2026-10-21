import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';
import { SectionHost } from '../../test/SectionHost';
import type { ZPLCProjectConfig } from '../../types';

const dom = await setupDom();
await stubProjectLoader();
const { TargetSection } = await import('./TargetSection');
const { BOARD_OPTIONS } = await import('../../config/boardProfiles');

const firstBoard = BOARD_OPTIONS.find((option) => option.value && option.value !== 'custom')!.value;

describe('Target selection (UX-013, IO-012) in a DOM', () => {
  it('names the board choice and lists the boards of the manifest, then reports the chosen one', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(<SectionHost Section={TargetSection} onConfig={(config) => { last = config; }} />);
    const board = dom.screen.getByRole('combobox', { name: dom.t('settings.target.board') });
    expect(dom.screen.getAllByRole('option').length).toBe(BOARD_OPTIONS.length);
    await user.selectOptions(board, firstBoard);
    expect(last?.target?.board).toBe(firstBoard);
  });

  it('shows the evidence tier of a chosen board as a named group of text', async () => {
    const { user } = dom.render(<SectionHost Section={TargetSection} />);
    await user.selectOptions(dom.screen.getByRole('combobox', { name: dom.t('settings.target.board') }), firstBoard);
    expect(dom.screen.getByLabelText(dom.t('settings.target.tierLabel'))).toBeTruthy();
  });

  it('Custom switches to a text field and the list button switches back', async () => {
    const { user } = dom.render(<SectionHost Section={TargetSection} />);
    await user.selectOptions(dom.screen.getByRole('combobox', { name: dom.t('settings.target.board') }), 'custom');
    expect(dom.screen.getByRole('textbox', { name: dom.t('settings.target.board') })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('settings.target.useList') }));
    expect(dom.screen.getByRole('combobox', { name: dom.t('settings.target.board') })).toBeTruthy();
  });

  it('the CPU and clock fields are named and keep what is typed', async () => {
    const { user } = dom.render(<SectionHost Section={TargetSection} initial={{ target: { board: firstBoard } as ZPLCProjectConfig['target'] }} />);
    const cpu = dom.screen.getByRole('textbox', { name: dom.t('settings.target.cpu') });
    await user.type(cpu, 'Cortex-M7');
    expect((cpu as HTMLInputElement).value).toBe('Cortex-M7');
    expect(dom.screen.getByRole('spinbutton', { name: (name) => name.includes(dom.t('settings.target.clock')) })).toBeTruthy();
  });
});
