import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
// The scene session reaches the store, whose example loader only exists under Vite: stub it before the first import.
await stubProjectLoader();
const { SceneChooser } = await import('./SceneChooser');
const { refFromValue, refValue } = await import('./usePlantSession');

describe('the scene chooser (SCN-001, SCN-006, SCN-016)', () => {
  it('SCN-006 every kind of scene source round-trips through the value of its option', () => {
    for (const ref of [
      { kind: 'project' },
      { kind: 'empty' },
      { kind: 'file', name: 'my line' },
      { kind: 'shipped', id: 'merge-lines' },
    ] as const)
      expect(refFromValue(refValue(ref))).toEqual(ref);
  });

  it('SCN-016 the project group appears only when the project has scenes, and the templates always', () => {
    const none = dom.render(<SceneChooser value="empty" rootScene={false} saved={[]} onChoose={() => undefined} />);
    expect(none.container.querySelectorAll('optgroup').length).toBe(1);
    none.unmount();
    const some = dom.render(<SceneChooser value="project" rootScene saved={['a']} onChoose={() => undefined} />);
    expect(some.container.querySelectorAll('optgroup').length).toBe(2);
  });

  it('SCN-001 a choice is reached with the keyboard on a native select and reports its reference', async () => {
    const chosen: unknown[] = [];
    dom.render(<SceneChooser value="empty" rootScene={false} saved={['a']} onChoose={(ref) => chosen.push(ref)} />);
    const select = dom.screen.getByLabelText(dom.t('plant.panel.scene')) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    dom.fireEvent.change(select, { target: { value: 'file:a' } });
    expect(chosen).toEqual([{ kind: 'file', name: 'a' }]);
  });
});
