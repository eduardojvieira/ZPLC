import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { WorkbenchInspector } = await import('./WorkbenchInspector');

describe('Inspector (UX-011) in a DOM', () => {
  it('is a labelled complementary region with a heading per section', () => {
    dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByRole('complementary', { name: dom.t('workbench.inspector.region') })).toBeTruthy();
    expect(dom.screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      dom.t('workbench.inspector.activeFile'), dom.t('workbench.inspector.project'), dom.t('workbench.inspector.evidence'),
    ]);
  });

  it('without an active file offers the next step, which shows the explorer', async () => {
    dom.patchStore(useIDEStore, { activeConsoleTab: 'output' });
    const { user } = dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByRole('heading', { level: 3, name: dom.t('panel.inspector.empty.title') })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('panel.inspector.empty.action') }));
    expect(useIDEStore.getState().activeConsoleTab).toBe('explorer');
  });

  it('reads the project facts as term and value pairs, and follows the store', async () => {
    dom.patchStore(useIDEStore, { projectName: 'Boiler line' });
    dom.render(<WorkbenchInspector />);
    const term = dom.screen.getAllByText(dom.t('workbench.inspector.project')).find((node) => node.tagName === 'DT')!;
    expect(term.nextElementSibling?.textContent).toBe('Boiler line');
    await dom.act(async () => { useIDEStore.setState({ projectName: 'Pump station' }); });
    expect(term.nextElementSibling?.textContent).toBe('Pump station');
  });

  it('shows a note that says where the trace comes from', () => {
    dom.render(<WorkbenchInspector />);
    expect(dom.screen.getByText(dom.t('workbench.inspector.hostTrace'))).toBeTruthy();
  });
});
