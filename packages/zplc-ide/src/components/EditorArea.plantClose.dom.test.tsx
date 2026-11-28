/** FLW-005: closing the plant document asks about a scene that was edited and not saved, as closing a modified program does. */
import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const realCodeEditor = { ...(await import('./CodeEditor')) };
await mock.module('./CodeEditor', () => ({ ...realCodeEditor, CodeEditor: () => null }));
// the plant document itself is not under test: the tab is
await mock.module('../shell/PlantDocument', () => ({ PlantDocument: () => null }));
afterAll(async () => {
  await mock.module('./CodeEditor', () => realCodeEditor);
});
await import('../plant/core/plantCore'); // registers the shipped parts, as the application does
const { useIDEStore } = await import('../store/useIDEStore');
const { usePlantDocument } = await import('../store/usePlantDocument');
const { usePlantEdit } = await import('../plant/editSession');
const { useEditorGroups } = await import('../store/useEditorGroups');
const { ONE_GROUP } = await import('../layout/editorGroups');
const { resetCommandsForTest } = await import('../commands/bus');
const { EditorArea } = await import('./EditorArea');

afterEach(() => {
  usePlantEdit.getState().end();
  usePlantEdit.setState({ unsaved: {} });
  usePlantDocument.setState({ open: false, active: false });
});

function prepare() {
  resetCommandsForTest();
  dom.patchStore(useIDEStore, { loadedFiles: new Map(), openTabs: [], activeFileId: null, showSettings: false, projectSession: 1 } as never);
  dom.patchStore(useEditorGroups, { groups: ONE_GROUP, activeFirst: null, pendingFor: -1 } as never);
  usePlantDocument.setState({ open: true, active: true });
}
const edited = () => {
  const edit = usePlantEdit.getState;
  edit().begin({ scene: { schemaVersion: 1, name: 'Edited floor', parts: [], cameras: [] }, map: null }, 'empty');
  edit().editor!.place('belt-x', 'belt', [4, 0, 4]);
};
const close = () => dom.screen.getByRole('button', { name: dom.t('studio.plant.close') });
const asked = () => document.querySelector('[data-unsaved-changes-dialog]');

describe('closing the plant document with an unsaved scene (FLW-005)', () => {
  it('FLW-005 closing the plant document asks about a scene edited and not saved, and Cancel keeps it open', async () => {
    prepare();
    edited();
    const view = dom.render(<EditorArea />);
    await dom.settle();
    await view.user.click(close());
    expect(asked()?.textContent).toContain('Edited floor');
    await view.user.click(dom.screen.getByRole('button', { name: dom.t('common.cancel') }));
    expect(asked()).toBeNull();
    expect(usePlantDocument.getState().open).toBe(true);
    expect(usePlantEdit.getState().editor).not.toBeNull();
  });

  it('FLW-005 Discard closes the plant document and drops the scene; a plant document with nothing unsaved closes at once', async () => {
    prepare();
    edited();
    const view = dom.render(<EditorArea />);
    await dom.settle();
    await view.user.click(close());
    await view.user.click(dom.screen.getByRole('button', { name: 'Discard and close' }));
    expect(usePlantDocument.getState().open).toBe(false);
    expect(usePlantEdit.getState().editor).toBeNull();
    expect(usePlantEdit.getState().unsaved).toEqual({});
    usePlantDocument.setState({ open: true, active: true });
    await dom.settle();
    await view.user.click(close());
    expect(asked()).toBeNull();
    expect(usePlantDocument.getState().open).toBe(false);
  });
});
