import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { WorkbenchInspector } = await import('./WorkbenchInspector');

const { useSelection } = await import('../shell/useSelection');
const { useProjectTests } = await import('../projectTests/useProjectTests');

describe('Inspector (UX-011, SHL-009) in a DOM', () => {
  it('is a labelled complementary region with a heading per section', () => {
    dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByRole('complementary', { name: dom.t('workbench.inspector.region') })).toBeTruthy();
    expect(dom.screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      dom.t('inspector.document'),
      dom.t('inspector.element'),
    ]);
  });

  it('without an active file offers the next step, which shows the explorer', async () => {
    dom.patchStore(useIDEStore, { activeConsoleTab: 'output', activeFileId: null });
    const { user } = dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByRole('heading', { level: 3, name: dom.t('panel.inspector.empty.title') })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('panel.inspector.empty.action') }));
    expect(useIDEStore.getState().activeConsoleTab).toBe('explorer');
  });

  it('SHL-009 the Inspector shows the active document: language, declared programs, size and state', () => {
    dom.patchStore(useIDEStore, {
      activeFileId: 'a',
      loadedFiles: new Map([
        ['a', { id: 'a', path: 'src/Main.st', name: 'Main.st', language: 'ST', content: 'PROGRAM Main\nEND_PROGRAM', isModified: true }],
      ]),
    } as never);
    dom.render(<WorkbenchInspector />);
    const value = (label: string) => dom.screen.getByText(label).nextElementSibling?.textContent;
    expect(value(dom.t('inspector.documentPous'))).toBe('Main');
    expect(value(dom.t('inspector.documentLanguage'))).toBe('ST');
    expect(value(dom.t('inspector.documentSaved'))).toBe(dom.t('inspector.documentSavedNo'));
  });

  it('SHL-009 the Inspector shows the selected element of a Ladder editor', async () => {
    dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByText(dom.t('inspector.noElement'))).toBeTruthy();
    await dom.act(async () =>
      useSelection.getState().setElement({ file: 'src/SealIn.ld.json', element: 'rung:rung_1/element:c1', names: ['StopPB'] }),
    );
    expect(dom.screen.getByText(dom.t('inspector.elementNames')).nextElementSibling?.textContent).toBe('StopPB');
    expect(dom.screen.getByText("LD rung 'rung_1', element 'c1'")).toBeTruthy();
    await dom.act(async () => useSelection.getState().clear());
  });

  it('SHL-009 the Inspector shows the selected test and its last result', async () => {
    useProjectTests.setState({
      tests: [{ path: 'tests/a.scenario.json', id: 'a', expectations: [{ index: 0, kind: 'AT' }], valid: true }],
      records: {},
    });
    dom.render(<WorkbenchInspector />);
    await dom.act(async () => useSelection.getState().setTest('tests/a.scenario.json'));
    expect(dom.screen.getByText(dom.t('inspector.testStatus.notRun'))).toBeTruthy();
    expect(dom.screen.getByText('a')).toBeTruthy();
    await dom.act(async () => useSelection.getState().clear());
  });

  it('SHL-009 the Inspector does not repeat the status rail', () => {
    dom.patchStore(useIDEStore, { projectName: 'Boiler line' });
    dom.render(<WorkbenchInspector />);
    for (const key of [
      'workbench.inspector.project',
      'workbench.inspector.target',
      'workbench.inspector.device',
      'workbench.inspector.diagnostics',
    ] as const)
      expect(dom.screen.queryByText(dom.t(key))).toBeNull();
    expect(dom.screen.queryByText('Boiler line')).toBeNull();
  });

  it('SHL-009 the Inspector shows the connected board', () => {
    dom.patchStore(useIDEStore, { connection: { status: 'connected' }, controllerInfo: { board: 'native_sim' } } as never);
    dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByRole('region', { name: dom.t('workbench.inspector.controller') })).toBeTruthy();
    dom.patchStore(useIDEStore, { connection: { status: 'disconnected' }, controllerInfo: null } as never);
  });
});
