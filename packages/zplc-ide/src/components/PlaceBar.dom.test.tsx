import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useProjectSources } = await import('../store/projectSources');
const { useShellLayout } = await import('../store/useShellLayout');
const { useNavigatorReveal } = await import('../store/useNavigationHistory');
const { PlaceBar } = await import('./PlaceBar');

const file = { id: 'file:src/Main.st', path: 'src/Main.st', name: 'Main.st', language: 'ST', content: '' };
const declarations = [{ file: 'src/Main.st', declarations: [{ name: 'Main', kind: 'PROGRAM', file: 'src/Main.st', line: 3, column: 9 }] }];

const original = {
  ide: useIDEStore.getState(),
  sources: useProjectSources.getState(),
  shell: useShellLayout.getState(),
};
afterEach(() => {
  useIDEStore.setState({ projectName: original.ide.projectName, loadedFiles: original.ide.loadedFiles });
  useProjectSources.setState({ declarations: original.sources.declarations });
  useShellLayout.setState({ activityView: original.shell.activityView, navigatorMode: original.shell.navigatorMode });
  useNavigatorReveal.setState({ group: null, item: null });
});

const arrange = () => {
  dom.patchStore(useIDEStore, { projectName: 'Plant', loadedFiles: new Map([[file.id, file]]) as never });
  dom.patchStore(useProjectSources, { declarations: declarations as never });
};

describe('FND-007 the place bar', () => {
  it('FND-007 the place bar shows project, group and object for a program', () => {
    arrange();
    dom.render(<PlaceBar viewId={file.id} />);
    const bar = dom.screen.getByRole('navigation', { name: dom.t('placeBar.label') });
    expect(bar.textContent).toBe(`Plant${dom.t('navigator.group.programs')}Main`);
    expect([...bar.querySelectorAll('button')].map((button) => button.getAttribute('data-command'))).toEqual([
      'view.showProject',
      'view.showProject',
      'view.showProject',
    ]);
  });

  it('FND-007 a step opens the navigator with that group expanded', async () => {
    arrange();
    useShellLayout.setState({ activityView: 'search', navigatorMode: 'files' });
    const { user } = dom.render(<PlaceBar viewId={file.id} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('placeBar.step', { name: 'Main' }) }));
    expect(useShellLayout.getState().activityView).toBe('project');
    expect(useShellLayout.getState().navigatorMode).toBe('objects');
    expect(useNavigatorReveal.getState().group).toBe('programs');
    expect(useNavigatorReveal.getState().item).toBe('PROGRAM:src/Main.st:Main');
    await user.click(dom.screen.getByRole('button', { name: dom.t('placeBar.step', { name: dom.t('navigator.group.programs') }) }));
    expect(useNavigatorReveal.getState().item).toBeNull();
    expect(useNavigatorReveal.getState().group).toBe('programs');
  });

  it('FND-007 the place bar is not a tab stop trap', async () => {
    arrange();
    const { user } = dom.render(
      <>
        <button>before</button>
        <PlaceBar viewId={file.id} />
        <button>after</button>
      </>,
    );
    await user.click(dom.screen.getByRole('button', { name: 'before' }));
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await user.tab();
      order.push(document.activeElement?.textContent ?? '');
    }
    expect(order).toEqual(['Plant', dom.t('navigator.group.programs'), 'Main', 'after']);
  });
});
