import { describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../../store/useIDEStore');
const { InstanceMonitor } = await import('./InstanceMonitor');

describe('Function-block instance monitor (UX-001, UX-025) in a DOM', () => {
  it('is a modal dialog named by the block and described by the instance, with focus moved inside', () => {
    dom.render(<InstanceMonitor instanceName="Timer1" blockType="TON" onClose={() => undefined} />);
    const dialog = dom.screen.getByRole('dialog', { name: 'TON' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('lists the inputs and outputs of the block as named groups of values', () => {
    dom.render(<InstanceMonitor instanceName="Timer1" blockType="TON" onClose={() => undefined} />);
    expect(dom.screen.getByRole('heading', { level: 3, name: dom.t('editors.fbd.inputs') })).toBeTruthy();
    expect(dom.screen.getByRole('heading', { level: 3, name: dom.t('editors.fbd.outputs') })).toBeTruthy();
    expect(dom.screen.getByText('IN')).toBeTruthy();
    expect(dom.screen.getByText('Q')).toBeTruthy();
  });

  it('adds every port of the instance to the watch list', () => {
    const addWatchVariable = mock<(path: string) => void>(() => undefined);
    dom.patchStore(useIDEStore, { addWatchVariable } as never);
    dom.render(<InstanceMonitor instanceName="Timer1" blockType="TON" onClose={() => undefined} />);
    expect(addWatchVariable).toHaveBeenCalledWith('Timer1.IN');
    expect(addWatchVariable).toHaveBeenCalledWith('Timer1.Q');
  });

  it('the close button is named and closes it, and so does Escape', async () => {
    const onClose = mock(() => undefined);
    const { user } = dom.render(<InstanceMonitor instanceName="Timer1" blockType="TON" onClose={onClose} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('a11y.fbd.closeMonitor') }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside the dialog and says whether the values are live', async () => {
    dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, mode: 'none' } } as never);
    const { user } = dom.render(<InstanceMonitor instanceName="Timer1" blockType="TON" onClose={() => undefined} />);
    const dialog = dom.screen.getByRole('dialog');
    for (let step = 0; step < 4; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(dom.screen.getByText(dom.t('editors.fbd.offline'))).toBeTruthy();
    expect(isFocused(document.body)).toBe(false);
  });
});
