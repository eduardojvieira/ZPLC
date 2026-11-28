/** UX-013: closing a view of zplc.json asks about unsaved edits only when no other view of zplc.json stays open. */
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const realCodeEditor = { ...(await import('./CodeEditor')) };
await mock.module('./CodeEditor', () => ({
  ...realCodeEditor,
  CodeEditor: ({ fileId }: { fileId: string }) => <div data-code-editor={fileId} />,
}));
afterAll(async () => {
  await mock.module('./CodeEditor', () => realCodeEditor);
});
const { useIDEStore } = await import('../store/useIDEStore');
const { useReviewDocument } = await import('../store/useReviewDocument');
const { useConfigEditors } = await import('../store/useConfigEditors');
const { useEditorGroups } = await import('../store/useEditorGroups');
const { ONE_GROUP } = await import('../layout/editorGroups');
const { resetCommandsForTest } = await import('../commands/bus');
const { EditorArea } = await import('./EditorArea');

const motor = {
  id: 'file:src/Motor.st',
  name: 'Motor.st',
  path: 'src/Motor.st',
  parentPath: 'src',
  language: 'ST' as const,
  content: '',
  isModified: false,
};

function prepare(open: string[]) {
  resetCommandsForTest();
  dom.patchStore(useIDEStore, {
    loadedFiles: new Map([[motor.id, motor]]),
    openTabs: [motor.id],
    activeFileId: motor.id,
    showSettings: false,
    projectSession: 1,
    projectConfigDirty: true,
  } as never);
  dom.patchStore(useEditorGroups, { groups: ONE_GROUP, activeFirst: null, pendingFor: -1 } as never);
  dom.patchStore(useReviewDocument, { open: false, active: false } as never);
  dom.patchStore(useConfigEditors, { open, active: open[0] ?? null } as never);
}

const close = (kind: 'io' | 'tasks' | 'plantMap') =>
  dom.screen.getByRole('button', { name: dom.t('configEditor.close', { title: dom.t(`configEditor.${kind}.title` as never) }) });
const asked = () => dom.screen.queryByText(dom.t('configEditor.closeDialogTitle')) !== null;

describe('closing a configuration tab with unsaved zplc.json edits (UX-013)', () => {
  it('the plant map does not show zplc.json: closing the last I/O tab still asks while it is open', async () => {
    prepare(['io', 'plantMap']);
    const view = dom.render(<EditorArea />);
    await dom.settle();
    await view.user.click(close('io'));
    expect(asked()).toBe(true);
  });

  it('two views of zplc.json: closing one does not ask, the last one asks', async () => {
    prepare(['io', 'tasks']);
    const view = dom.render(<EditorArea />);
    await dom.settle();
    await view.user.click(close('io'));
    expect(asked()).toBe(false);
    await view.user.click(close('tasks'));
    expect(asked()).toBe(true);
  });

  it('closing the plant map never asks: it holds no zplc.json edit', async () => {
    prepare(['plantMap']);
    const view = dom.render(<EditorArea />);
    await dom.settle();
    await view.user.click(close('plantMap'));
    expect(asked()).toBe(false);
  });
});
