import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { useLearnUi } = await import('../learn/learnUi');
const { useShellLayout } = await import('../store/useShellLayout');
const { usePreferencesDocument } = await import('../store/usePreferencesDocument');
const commandBus = await import('../commands/bus');
const { useAssistantCommands } = await import('../commands/bind/assistant');
const { PrimarySidebar, SecondarySidebar } = await import('./Sidebars');
const { useAssistantProvider, useSecondaryView, usePublishSelectedElement, useSelection } = await import('./useSelection');

const setWidth = (width: number) => {
  window.innerWidth = width;
  window.dispatchEvent(new window.Event('resize'));
};

afterEach(() => {
  setWidth(1400);
  useAssistantProvider.setState({ available: false, refresh: async () => {} });
  useSecondaryView.setState({ choice: null, inPrimary: false });
  useLearnUi.setState({ workspace: null });
  useSelection.getState().clear();
  useShellLayout.setState({ activityView: 'project' });
});

const available = (on: boolean) => useAssistantProvider.setState({ available: on, refresh: async () => {} });
const switchOf = () => dom.screen.queryByRole('group', { name: dom.t('shell.secondary.view') });

describe('the secondary sidebar (SHL-008)', () => {
  it('SHL-008 the secondary sidebar shows one view and a switch between the available ones', async () => {
    available(true);
    const { user } = dom.render(<SecondarySidebar />);
    expect(switchOf()).toBeTruthy();
    expect(dom.screen.getByRole('complementary', { name: dom.t('workbench.inspector.region') })).toBeTruthy();
    expect(dom.screen.queryByRole('region', { name: dom.t('assistant.region') })).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: dom.t('shell.secondary.assistant') }));
    expect(await dom.screen.findByRole('region', { name: dom.t('assistant.region') })).toBeTruthy();
    expect(dom.screen.queryByRole('complementary', { name: dom.t('workbench.inspector.region') })).toBeNull();
  });

  it('SHL-008 the Assistant is not offered without an AI provider', () => {
    available(false);
    dom.render(<SecondarySidebar />);
    expect(switchOf()).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('shell.secondary.assistant') })).toBeNull();
    expect(dom.screen.getByRole('complementary', { name: dom.t('workbench.inspector.region') })).toBeTruthy();
  });

  it('SHL-008 a view does not move to the other sidebar when the rail changes', async () => {
    available(true);
    useSecondaryView.getState().show('assistant');
    dom.render(
      <>
        <PrimarySidebar />
        <SecondarySidebar />
      </>,
    );
    const secondary = () => dom.screen.getByRole('complementary', { name: dom.t('shell.secondary.label') });
    expect(dom.within(secondary()).getByRole('region', { name: dom.t('assistant.region') })).toBeTruthy();
    await dom.act(async () => useShellLayout.getState().showActivity('search'));
    expect(dom.within(secondary()).getByRole('region', { name: dom.t('assistant.region') })).toBeTruthy();
    expect(dom.screen.getAllByRole('region', { name: dom.t('assistant.region') })).toHaveLength(1);
  });

  it('SHL-008 in the compact shell the current view is offered in the primary sidebar', async () => {
    setWidth(900);
    available(true);
    useSecondaryView.getState().show('assistant');
    const { user } = dom.render(<PrimarySidebar />);
    expect(dom.screen.queryByRole('region', { name: dom.t('assistant.region') })).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: dom.t('shell.secondary.assistant') }));
    expect(dom.screen.getByRole('region', { name: dom.t('assistant.region') })).toBeTruthy();
  });

  it('SHL-008 the Lesson view is offered beside the Inspector while a lesson workspace is open', () => {
    const session = useIDEStore.getState().projectSession;
    useLearnUi.setState({ workspace: { lessonId: 'x', session } } as never);
    dom.render(<SecondarySidebar />);
    expect(dom.screen.getByRole('button', { name: dom.t('shell.secondary.lesson') })).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: dom.t('shell.secondary.inspector') })).toBeTruthy();
  });
});

describe('the editors publish their selection (SHL-009)', () => {
  function Publisher({ element }: { element: string | null }) {
    usePublishSelectedElement(element as never, ['Start']);
    return null;
  }
  it('SHL-009 the publishing hook sets the selected element of the active file, follows it and clears it on unmount', async () => {
    dom.patchStore(useIDEStore, {
      activeFileId: 'a',
      loadedFiles: new Map([['a', { id: 'a', path: 'src/a.ld.json', content: '' }]]),
    } as never);
    const view = dom.render(<Publisher element="rung:rung_1/element:c1" />);
    expect(useSelection.getState().element).toEqual({ file: 'src/a.ld.json', element: 'rung:rung_1/element:c1', names: ['Start'] });
    view.rerender(<Publisher element={null} />);
    expect(useSelection.getState().element).toBeNull();
    view.rerender(<Publisher element="block:b1" />);
    expect(useSelection.getState().element?.element).toBe('block:b1');
    view.unmount();
    expect(useSelection.getState().element).toBeNull();
  });
});

describe('the commands of the views (SHL-008)', () => {
  const { runCommand } = commandBus;
  function Host() {
    useAssistantCommands();
    return null;
  }
  it('SHL-008 view.showInspector shows the Inspector in the secondary sidebar', async () => {
    useSecondaryView.getState().show('assistant');
    useShellLayout.setState({ secondaryVisible: false });
    dom.render(<Host />);
    await dom.act(async () => void runCommand('view.showInspector'));
    expect(useSecondaryView.getState().choice?.view).toBe('inspector');
    expect(useShellLayout.getState().secondaryVisible).toBe(true);
  });

  it('SHL-008 view.agent shows the Assistant when a provider is configured', async () => {
    available(true);
    dom.render(<Host />);
    await dom.act(async () => void runCommand('view.agent'));
    expect(useSecondaryView.getState().choice?.view).toBe('assistant');
  });

  it('SHL-008 view.agent without a provider opens Preferences at the Assistant section', async () => {
    available(false);
    usePreferencesDocument.setState({ open: false, active: false, anchor: null });
    dom.render(<Host />);
    await dom.act(async () => void runCommand('view.agent'));
    expect(usePreferencesDocument.getState()).toMatchObject({ open: true, active: true, anchor: 'assistant' });
    usePreferencesDocument.setState({ open: false, active: false, anchor: null });
  });
});
