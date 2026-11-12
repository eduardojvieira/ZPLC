import { describe, expect, it, mock } from 'bun:test';
import { setupDom } from '../test/dom';

const dom = await setupDom();
const { TargetSelector } = await import('./TargetSelector');

const selector = (over: Partial<Parameters<typeof TargetSelector>[0]> = {}) => {
  const onChange = mock<(mode: string) => void>(() => undefined);
  const onChangeBoard = mock(() => undefined);
  const view = dom.render(
    <TargetSelector
      mode="simulate"
      boardName="rpi_pico"
      degraded={false}
      onChange={onChange as never}
      onChangeBoard={onChangeBoard}
      {...over}
    />,
  );
  return { ...view, onChange, onChangeBoard };
};

describe('Target selector (FLW-007) in a DOM', () => {
  it('FLW-007 names the target in its accessible name and shows it once', () => {
    selector();
    const trigger = dom.screen.getByRole('button', {
      name: dom.t('studio.flow.target.title', { target: dom.t('studio.flow.target.simulation') }),
    });
    expect(trigger.textContent).toContain(dom.t('studio.flow.target.simulation'));
    expect(dom.screen.getAllByRole('button')).toHaveLength(1);
  });

  it('FLW-007 shows the name of the board when the board is the target', () => {
    selector({ mode: 'hardware' });
    expect(dom.screen.getByRole('button', { name: /rpi_pico/ })).toBeTruthy();
  });

  it('FLW-007 opens by keyboard, offers Simulation, the board and Change the board, and reports the choice', async () => {
    const { user, onChange, onChangeBoard } = selector();
    const trigger = dom.screen.getByRole('button');
    trigger.focus();
    await user.keyboard('{Enter}');
    const items = dom.screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([dom.t('studio.flow.target.simulation'), 'rpi_pico', dom.t('studio.flow.target.change')]);
    await user.click(dom.screen.getByRole('menuitem', { name: 'rpi_pico' }));
    expect(onChange).toHaveBeenCalledWith('hardware');
    await user.keyboard('{Enter}');
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('studio.flow.target.change') }));
    expect(onChangeBoard).toHaveBeenCalledTimes(1);
  });

  it('FLW-007 a project with no board cannot choose a board, and says why', async () => {
    const { user, onChange } = selector({ boardName: undefined });
    await user.click(dom.screen.getByRole('button'));
    const board = dom.screen.getByRole('menuitem', { name: new RegExp(dom.t('studio.flow.target.board')) });
    expect(board.getAttribute('aria-disabled')).toBe('true');
    expect(board.textContent).toContain(dom.t('studio.flow.target.noBoard'));
    await user.click(board);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('IDE-025 the degraded label of the WASM runtime shows in the selector', () => {
    selector({ degraded: true });
    expect(dom.screen.getByRole('button').textContent).toContain(dom.t('studio.flow.target.degraded'));
  });
});
