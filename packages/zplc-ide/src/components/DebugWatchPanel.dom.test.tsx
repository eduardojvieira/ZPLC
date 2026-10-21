import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { DebugWatchPanel } = await import('./DebugWatchPanel');

function prepare(debug: Record<string, unknown> = {}) {
  dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, mode: 'none', watchVariables: [], forcedValues: new Map(), forcesUnconfirmed: false, ...debug } } as never);
}

describe('Watch and force (CMP-054, IDE-019, UX-009) in a DOM', () => {
  it('without a watched variable shows the empty state, whose action opens the add form', async () => {
    prepare();
    const { user } = dom.render(<DebugWatchPanel />);
    expect(dom.screen.getByText(dom.t('panel.watch.empty.title'))).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('panel.watch.empty.action') }));
    expect(dom.screen.getByRole('combobox', { name: (_name, element) => element.tagName === 'INPUT' })).toBeTruthy();
  });

  it('adds a variable by typing its path and pressing Enter, lists it in a table, and removes it by its named button', async () => {
    prepare();
    const { user } = dom.render(<DebugWatchPanel />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.watch.addVariable') }));
    const path = dom.screen.getByRole('combobox', { name: (_name, element) => element.tagName === 'INPUT' });
    expect(document.activeElement === path).toBe(true);
    await user.keyboard('Main.counter{Enter}');
    expect(useIDEStore.getState().debug.watchVariables).toEqual(['Main.counter']);
    expect(dom.screen.getByRole('cell', { name: 'Main.counter' })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.watch.remove') }));
    expect(useIDEStore.getState().debug.watchVariables).toEqual([]);
  });

  it('closes the add form with its named button and clears it', async () => {
    prepare();
    const { user } = dom.render(<DebugWatchPanel />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.watch.addVariable') }));
    await user.keyboard('abc');
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.watch.closeForm') }));
    expect(dom.screen.queryByRole('combobox', { name: (_name, element) => element.tagName === 'INPUT' })).toBeNull();
  });

  it('names its columns, sorts by a column header button and says so in aria-sort', async () => {
    prepare({ watchVariables: ['Zeta', 'Alpha'] });
    const { user } = dom.render(<DebugWatchPanel />);
    const nameHeader = dom.screen.getAllByRole('columnheader')[0]!;
    expect(nameHeader.getAttribute('aria-sort')).toBe('none');
    await user.click(dom.screen.getByRole('button', { name: dom.t('panel.watch.sort', { column: dom.t('panel.watch.col.name') }) }));
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    const names = dom.screen.getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent);
    expect(names).toEqual(['Alpha', 'Zeta']);
  });

  it('clear all empties the watch list', async () => {
    prepare({ watchVariables: ['A', 'B'] });
    const { user } = dom.render(<DebugWatchPanel />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.watch.clearAll') }));
    expect(useIDEStore.getState().debug.watchVariables).toEqual([]);
  });

  it('keeps the force checkbox of a row named and off the tab order of a row that cannot be forced', () => {
    prepare({ watchVariables: ['A'] });
    dom.render(<DebugWatchPanel />);
    const force = dom.screen.getByRole('checkbox', { name: dom.t('workbench.watch.forcePath', { path: 'A' }) }) as HTMLInputElement;
    expect(force.disabled).toBe(true);
  });

  it('tells the person to start debugging when no session is attached', () => {
    prepare({ watchVariables: ['A'], mode: 'none' });
    dom.render(<DebugWatchPanel />);
    expect(dom.screen.getByText(dom.t('workbench.watch.startDebugging'))).toBeTruthy();
  });

  it('announces unconfirmed forces as an alert', () => {
    prepare({ watchVariables: ['A'], mode: 'running', forcesUnconfirmed: true });
    dom.render(<DebugWatchPanel hasActiveSerialSession />);
    expect(dom.screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('the format choice is a named select', async () => {
    prepare({ watchVariables: ['A'] });
    const { user } = dom.render(<DebugWatchPanel />);
    const format = dom.screen.getByRole('combobox', { name: dom.t('panel.watch.format') }) as HTMLSelectElement;
    const other = [...format.options].find((option) => option.value !== format.value)!;
    await user.selectOptions(format, other.value);
    expect(format.value).toBe(other.value);
  });
});
