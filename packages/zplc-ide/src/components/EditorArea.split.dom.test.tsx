import { afterAll, describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
// Monaco needs a browser engine; a text view is a plain element here. The real module comes back when this file is done.
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
const { useEditorGroups, restoreEditorGroups } = await import('../store/useEditorGroups');
const { useShellLayout, toggleMaximise } = await import('../store/useShellLayout');
const { ONE_GROUP } = await import('../layout/editorGroups');
const { resetCommandsForTest, runCommand } = await import('../commands/bus');
const { EditorArea } = await import('./EditorArea');
const { WorkbenchShell } = await import('../shell/WorkbenchShell');

const file = (name: string) => ({
  id: `file:src/${name}`,
  name,
  path: `src/${name}`,
  parentPath: 'src',
  language: 'ST' as const,
  content: `// ${name}`,
  isModified: false,
});

function prepare(width = 1400) {
  resetCommandsForTest();
  window.innerWidth = width;
  const files = [file('Motor.st'), file('Pump.st'), file('Valve.st')];
  dom.patchStore(useIDEStore, {
    loadedFiles: new Map(files.map((f) => [f.id, f])),
    openTabs: files.map((f) => f.id),
    activeFileId: files[0]!.id,
    showSettings: false,
    projectSession: 1,
  } as never);
  dom.patchStore(useEditorGroups, { groups: ONE_GROUP, activeFirst: null, pendingFor: -1 } as never);
  // another file of the same process may have left the review document or a configuration editor open: they are tabs of the editor area
  dom.patchStore(useReviewDocument, { open: false, active: false } as never);
  dom.patchStore(useConfigEditors, { open: [], active: null } as never);
  return files;
}

const tab = (name: string) => dom.screen.getByRole('tab', { name: new RegExp(name) });
const group = (key: 'first' | 'second') => dom.screen.getByRole('group', { name: dom.t(`studio.document.group.${key}`) });

describe('the editor area with two groups (SHL-006, SHL-007)', () => {
  it('SHL-006 a view moves to the other group by its command and by the keyboard, and the focus follows it', async () => {
    const files = prepare();
    dom.render(<EditorArea />);
    await dom.settle();
    // one group: the tab bar of 2.0, and no group landmark
    expect(dom.screen.queryByRole('group', { name: dom.t('studio.document.group.second') })).toBeNull();

    // by the command (palette, menu, shortcut)
    await dom.act(async () => {
      runCommand('view.splitRight');
    });
    await dom.settle();
    expect(dom.within(group('second')).getByRole('tab', { name: /Motor/ })).toBeTruthy();
    expect(dom.within(group('first')).getByRole('tab', { name: /Pump/ })).toBeTruthy();
    expect(useEditorGroups.getState().groups.focused).toBe('second');
    await dom.waitFor(() => expect(isFocused(tab('Motor'))).toBe(true));

    // by the keyboard: Tab to the labelled button of the group and press Enter
    const move = dom.within(group('second')).getByRole('button', { name: dom.t('studio.document.moveToOther') });
    move.focus();
    await dom.act(async () => {
      move.click();
    });
    await dom.settle();
    expect(dom.screen.queryByRole('group', { name: dom.t('studio.document.group.second') })).toBeNull();
    expect(useEditorGroups.getState().groups.second).toEqual([]);
    expect(useIDEStore.getState().activeFileId).toBe(files[0]!.id);
  });

  it('SHL-006 the other group is focused by its command, and its view becomes the active one', async () => {
    const files = prepare();
    dom.render(<EditorArea />);
    await dom.settle();
    await dom.act(async () => {
      runCommand('view.splitRight');
    });
    await dom.settle();
    await dom.act(async () => {
      runCommand('view.focusOtherGroup');
    });
    await dom.settle();
    expect(useIDEStore.getState().activeFileId).toBe(files[2]!.id);
    expect(useEditorGroups.getState().groups.focused).toBe('first');
    await dom.act(async () => {
      runCommand('view.focusOtherGroup');
    });
    await dom.settle();
    expect(useIDEStore.getState().activeFileId).toBe(files[0]!.id);
  });

  it('SHL-006 below the compact width the two groups are tabs of one, and widening the window brings the split back', async () => {
    prepare();
    dom.render(<EditorArea />);
    await dom.settle();
    await dom.act(async () => {
      runCommand('view.splitRight');
    });
    await dom.settle();
    await dom.act(async () => {
      window.innerWidth = 900;
      window.dispatchEvent(new window.Event('resize'));
    });
    expect(dom.screen.queryByRole('group', { name: dom.t('studio.document.group.second') })).toBeNull();
    expect(dom.screen.getAllByRole('tab')).toHaveLength(3);
    expect(useEditorGroups.getState().groups.second).toHaveLength(1);
    await dom.act(async () => {
      window.innerWidth = 1400;
      window.dispatchEvent(new window.Event('resize'));
    });
    expect(group('second')).toBeTruthy();
  });

  it(
    'SHL-006 the saved split comes back with the tabs, a session saved by 2.0 comes back as one group, a bad one as one ' + 'group',
    async () => {
      const files = prepare();
      const tabs = files.map((f) => ({ path: f.path, line: 1, column: 1, scrollTop: 0 }));
      const base = { schemaVersion: 1 as const, tabs, activePath: files[0]!.path, panels: null };
      const run = async (read: () => Promise<unknown>) => {
        await restoreEditorGroups({
          projectSession: 7,
          directoryHandle: null,
          openTabs: files.map((f) => f.id),
          files: new Map(files.map((f) => [f.id, f])),
          read: read as never,
        });
        return useEditorGroups.getState();
      };
      const split = await run(async () => ({ ...base, split: { second: [files[1]!.path], activeSecond: files[1]!.path, ratio: 0.3 } }));
      expect(split.groups).toMatchObject({ second: [files[1]!.id], activeSecond: files[1]!.id, ratio: 0.3 });
      expect(split.pendingFor).toBe(-1);
      expect((await run(async () => base)).groups).toEqual(ONE_GROUP);
      expect((await run(async () => null)).groups).toEqual(ONE_GROUP);
      expect((await run(async () => Promise.reject(new Error('unreadable')))).groups).toEqual(ONE_GROUP);
    },
  );

  it('UX-017 the separator between the groups is operable by keyboard', async () => {
    prepare();
    dom.render(<EditorArea />);
    await dom.settle();
    await dom.act(async () => {
      runCommand('view.splitRight');
    });
    await dom.settle();
    const separator = dom.screen.getByRole('separator', { name: dom.t('studio.document.separator') });
    expect(separator.getAttribute('tabindex')).toBe('0');
    separator.focus();
    expect(isFocused(separator)).toBe(true);
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('SHL-007 maximise hides the sidebars and the results panel, and the same command restores them as they were', async () => {
    prepare();
    dom.patchStore(useShellLayout, { primaryVisible: true, secondaryVisible: false, maximised: false, restoreTo: null } as never);
    dom.patchStore(useIDEStore, { isConsoleCollapsed: false } as never);
    dom.render(<WorkbenchShell EditorArea={EditorArea} Console={() => null} debugController={{} as never} />);
    await dom.settle();
    await dom.act(async () => {
      runCommand('view.maximiseDocument');
    });
    expect(useShellLayout.getState()).toMatchObject({ maximised: true, primaryVisible: false, secondaryVisible: false });
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(true);
    expect(dom.screen.getByRole('status', { name: '' }).textContent).toBe(dom.t('studio.document.maximised'));
    // the same command brings back what was shown: the primary sidebar and the results panel, not the hidden secondary one
    await dom.act(async () => {
      runCommand('view.maximiseDocument');
    });
    expect(useShellLayout.getState()).toMatchObject({ maximised: false, primaryVisible: true, secondaryVisible: false });
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(false);
  });

  it('SHL-007 a results panel that was collapsed stays collapsed after maximise', async () => {
    prepare();
    dom.patchStore(useShellLayout, { primaryVisible: true, secondaryVisible: true, maximised: false, restoreTo: null } as never);
    dom.patchStore(useIDEStore, { isConsoleCollapsed: true } as never);
    await dom.act(async () => {
      toggleMaximise();
      toggleMaximise();
    });
    expect(useShellLayout.getState()).toMatchObject({ maximised: false, primaryVisible: true, secondaryVisible: true });
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(true);
  });

  it('SHL-007 Escape leaves maximise only when no dialog is open', async () => {
    prepare();
    dom.patchStore(useShellLayout, { primaryVisible: true, secondaryVisible: false, maximised: false, restoreTo: null } as never);
    dom.render(<WorkbenchShell EditorArea={EditorArea} Console={() => null} debugController={{} as never} />);
    await dom.settle();
    await dom.act(async () => {
      runCommand('view.maximiseDocument');
    });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    await dom.act(async () => {
      dom.fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(useShellLayout.getState().maximised).toBe(true);
    dialog.remove();
    await dom.act(async () => {
      dom.fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(useShellLayout.getState().maximised).toBe(false);
    expect(useShellLayout.getState().primaryVisible).toBe(true);
  });
});
