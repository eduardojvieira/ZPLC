import { describe, expect, it } from 'bun:test';
import { isFocused, setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { Console } = await import('./Console');

function open(tab: string, over: Record<string, unknown> = {}) {
  dom.patchStore(useIDEStore, {
    isConsoleCollapsed: false,
    activeConsoleTab: tab as never,
    consoleEntries: [],
    compilerMessages: [],
    compilerMessagesChecked: false,
    isProjectOpen: true,
    ...over,
  } as never);
}

describe('Output, Problems and Tests tabs (IDE-020, IDE-031) in a DOM', () => {
  it('collapsed, it offers a named button that expands the panel', async () => {
    open('output', { isConsoleCollapsed: true });
    const { user } = dom.render(<Console />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('console.expandWorkbenchPanel') }));
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(false);
  });

  it('is a named tab list with one selected tab that owns the tab panel', () => {
    open('output');
    dom.render(<Console />);
    expect(dom.screen.getByRole('tablist', { name: dom.t('console.workbenchPanels') })).toBeTruthy();
    const selected = dom.screen.getAllByRole('tab').filter((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(dom.screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(selected[0]!.id);
    expect(selected[0]!.tabIndex).toBe(0);
  });

  it('the arrows, Home and End move the selection and the focus between tabs', async () => {
    open('output');
    const { user } = dom.render(<Console />);
    const tabs = dom.screen.getAllByRole('tab');
    const first = tabs[0]!;
    first.focus();
    await dom.act(async () => {
      useIDEStore.setState({ activeConsoleTab: first.id.replace('console-tab-', '') as never });
    });
    await user.keyboard('{ArrowRight}');
    const second = dom.screen.getAllByRole('tab')[1]!;
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(isFocused(second)).toBe(true);
    await user.keyboard('{End}');
    const all = dom.screen.getAllByRole('tab');
    expect(all.at(-1)!.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(dom.screen.getAllByRole('tab')[0]!.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowLeft}');
    expect(dom.screen.getAllByRole('tab').at(-1)!.getAttribute('aria-selected')).toBe('true');
  });

  it('Output with no message shows an empty state; with messages lists them and Clear empties the list', async () => {
    open('output');
    const { user } = dom.render(<Console />);
    expect(dom.screen.getByText(dom.t('panel.output.empty.title'))).toBeTruthy();
    await dom.act(async () => {
      useIDEStore.getState().addConsoleEntry({ type: 'info', message: 'Build finished', source: 'compiler' });
    });
    expect(dom.screen.getByText('Build finished')).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: /^Clear/i }));
    expect(dom.screen.queryByText('Build finished')).toBeNull();
  });

  it('Problems shows the message with its location and Clear empties it', async () => {
    open('problems', {
      compilerMessages: [{ id: 'm1', severity: 'error', message: 'Undeclared variable Speed', file: 'src/main.st', line: 4, column: 3 }],
      compilerMessagesChecked: true,
    });
    const { user } = dom.render(<Console />);
    expect(document.getElementById('console-tab-problems')?.getAttribute('aria-selected')).toBe('true');
    await dom.waitFor(() => expect(document.body.textContent).toContain('Undeclared variable Speed'));
    await user.click(dom.screen.getByRole('button', { name: /^Clear/i }));
    expect(useIDEStore.getState().compilerMessages).toHaveLength(0);
  });

  it('Tests says what it needs when no saved workspace is linked, as a status', () => {
    open('tests');
    dom.render(<Console />);
    expect(dom.screen.getByRole('tabpanel')).toBeTruthy();
    expect(dom.screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('Changes, Agent and Trace each open a tab panel that is labelled by its tab', () => {
    for (const id of ['changes', 'agent', 'trace']) {
      open(id);
      const { unmount } = dom.render(<Console />);
      expect(document.getElementById(`console-tab-${id}`)?.getAttribute('aria-selected')).toBe('true');
      expect(dom.screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(`console-tab-${id}`);
      unmount();
    }
  });

  it('Agent offers its modes as a named radio group with exactly one checked', () => {
    open('agent');
    dom.render(<Console />);
    const group = dom.screen.getByRole('radiogroup', { name: dom.t('console.agentMode') });
    const radios = dom.within(group).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios.filter((radio) => radio.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('Changes says what it needs before a review can start, as a status', () => {
    open('changes');
    dom.render(<Console />);
    expect(dom.within(dom.screen.getByRole('tabpanel')).getAllByRole('status').length).toBeGreaterThan(0);
  });
});
