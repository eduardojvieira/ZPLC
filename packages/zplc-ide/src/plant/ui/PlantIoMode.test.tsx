import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { PlantIoMode } = await import('./PlantIoMode');
const { bindIoModeLink, createFakeIoModeLink, getIoModeStatus, requestFeedBoard } = await import('../../store/ioModeStatus');

let unbind: (() => void) | undefined;
afterEach(() => unbind?.());
const feed = () => dom.t('command.plant.feedBoard');

describe('plant I/O mode in the plant document (PLS-008, LNK-008, LNK-010)', () => {
  it('PLS-008 the action is offered only while a board is connected', () => {
    unbind = bindIoModeLink(createFakeIoModeLink());
    const off = dom.render(<PlantIoMode boardConnected={false} />);
    expect(dom.screen.queryByRole('button', { name: feed() })).toBeNull();
    off.unmount();
    dom.render(<PlantIoMode boardConnected />);
    expect(dom.screen.getByRole('button', { name: feed() })).toBeTruthy();
  });

  it('PLS-008 the dialog confirms before the mode starts and Cancel changes nothing', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    const { user } = dom.render(<PlantIoMode boardConnected />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    const dialog = dom.screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain(dom.t('plant.ioMode.dialog.description'));
    expect(link.calls).toEqual([]);
    expect(document.activeElement).toBe(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.cancel') }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.cancel') }));
    expect(link.calls).toEqual([]);
    expect(dom.screen.queryByRole('alertdialog')).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    expect(link.calls).toEqual(['start']);
  });

  it('LNK-010 mirroring is off by default and a person turns it on', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    const { user } = dom.render(<PlantIoMode boardConnected />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    const box = (await dom.screen.findByRole('checkbox', { name: dom.t('plant.ioMode.mirror') })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(link.calls).toEqual(['start', 'mirror:true']);
    expect(getIoModeStatus().mirroring).toBe(true);
  });

  it('PLS-008 a failed start is a located message', async () => {
    unbind = bindIoModeLink(createFakeIoModeLink({ failStart: 'the board did not answer the entry' }));
    const { user } = dom.render(<PlantIoMode boardConnected />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    const alert = await dom.screen.findByRole('alert');
    expect(alert.textContent).toContain('the board did not answer the entry');
    expect(alert.textContent).toContain(dom.t('plant.ioMode.failedStaysBoard'));
  });

  it('LNK-008 the command asks the same question and starts nothing by itself', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    dom.render(<PlantIoMode boardConnected />);
    requestFeedBoard(true);
    await dom.screen.findByRole('alertdialog');
    expect(link.calls).toEqual([]);
  });
});
