import { describe, expect, it, mock } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();

const { EditorGroup } = await import('./EditorGroup');
const { PLANT_VIEW_ID, SETTINGS_VIEW_ID } = await import('../layout/documentKinds');
const { PREFERENCES_VIEW_ID } = await import('../store/usePreferencesDocument');
const { REVIEW_VIEW_ID } = await import('../store/useReviewDocument');
const { configEditorViewId } = await import('../navigator/configEditors');
await import('../plant/core/plantCore'); // registers the shipped parts, as the application does
const { usePlantEdit, discardEditedScenes } = await import('../plant/editSession');

const FILE = {
  id: 'file:src/Main.st',
  name: 'Main.st',
  path: 'src/Main.st',
  parentPath: 'src',
  language: 'ST' as const,
  content: 'PROGRAM Main\nEND_PROGRAM\n',
  isModified: false,
};

const CONFIG_ID = configEditorViewId('tasks');

function renderGroup(activeViewId: string) {
  const onSelect = mock(() => undefined);
  const onClose = mock(() => undefined);
  const views = [SETTINGS_VIEW_ID, CONFIG_ID, PLANT_VIEW_ID, PREFERENCES_VIEW_ID, REVIEW_VIEW_ID, FILE.id];
  const rendered = dom.render(
    <EditorGroup
      views={views}
      activeViewId={activeViewId}
      files={new Map([[FILE.id, FILE]])}
      panelId="editor-panel-first"
      focused
      onFocusGroup={() => undefined}
      onSelect={onSelect}
      onClose={onClose}
      onTextChange={() => undefined}
      onVisualChange={() => undefined}
      historyOf={() => ({ canUndo: false, canRedo: false })}
      onHistory={() => undefined}
      onHistoryShortcut={() => undefined}
      onMove={() => undefined}
      moveLabel="Split right"
      onMaximise={() => undefined}
      maximised={false}
      canMove
    />,
  );
  return { ...rendered, onSelect, onClose };
}

function tabParts(viewId: string) {
  const tabButton = document.getElementById(`editor-tab-${viewId}`) as HTMLButtonElement;
  const wrapper = tabButton.parentElement as HTMLElement;
  const label = tabButton.querySelector('span') as HTMLSpanElement;
  const closeButton = wrapper.querySelectorAll('button')[1] as HTMLButtonElement;
  return { tabButton, wrapper, label, closeButton };
}

describe('UXF-4 editor tab strip consistency', () => {
  it('gives ConfigEditorTab and file tabs the same font class, close-glyph rule, and inactive styling', () => {
    renderGroup(FILE.id);

    const fileTab = tabParts(FILE.id);
    const configTab = tabParts(CONFIG_ID);
    const settingsTab = tabParts(SETTINGS_VIEW_ID);
    const plantTab = tabParts(PLANT_VIEW_ID);
    const preferencesTab = tabParts(PREFERENCES_VIEW_ID);
    const reviewTab = tabParts(REVIEW_VIEW_ID);

    // Same label font across file and ConfigEditorTab.
    expect(fileTab.label.classList.contains('text-sm')).toBe(true);
    expect(configTab.label.classList.contains('text-sm')).toBe(true);

    // Active file tab: active fill, close glyph always visible.
    expect(fileTab.wrapper.classList.contains('bg-[var(--color-surface-700)]')).toBe(true);
    expect(fileTab.closeButton.classList.contains('opacity-100')).toBe(true);
    expect(fileTab.closeButton.classList.contains('opacity-0')).toBe(false);

    // Inactive tabs (ConfigEditorTab + non-file tabs): inactive fill, close glyph only on hover/focus.
    for (const inactive of [configTab, settingsTab, plantTab, preferencesTab, reviewTab]) {
      expect(inactive.wrapper.classList.contains('bg-[var(--color-surface-800)]')).toBe(true);
      expect(inactive.wrapper.classList.contains('bg-[var(--color-surface-700)]')).toBe(false);
      expect(inactive.closeButton.classList.contains('opacity-0')).toBe(true);
      expect(inactive.closeButton.classList.contains('group-hover:opacity-100')).toBe(true);
      expect(inactive.closeButton.classList.contains('group-focus-within:opacity-100')).toBe(true);
      expect(inactive.closeButton.classList.contains('focus-visible:opacity-100')).toBe(true);
    }

    // Unobtrusive overflow scrollbar class on the tablist.
    const tablist = dom.screen.getByRole('tablist');
    expect(tablist.classList.contains('editor-tab-strip')).toBe(true);
  });

  it('keeps active tab selection, always-visible close glyph on active non-file tabs, and close actions working', async () => {
    const { user, onSelect, onClose } = renderGroup(CONFIG_ID);

    const configTab = tabParts(CONFIG_ID);
    const fileTab = tabParts(FILE.id);

    expect(configTab.tabButton.getAttribute('aria-selected')).toBe('true');
    expect(configTab.wrapper.classList.contains('bg-[var(--color-surface-700)]')).toBe(true);
    expect(configTab.closeButton.classList.contains('opacity-100')).toBe(true);
    expect(configTab.closeButton.classList.contains('opacity-0')).toBe(false);

    await user.click(fileTab.tabButton);
    expect(onSelect).toHaveBeenCalledWith(FILE.id);

    await user.click(configTab.closeButton);
    expect(onClose).toHaveBeenCalledWith(CONFIG_ID);
  });
});

describe('the modified mark of the plant tab (FLW-005)', () => {
  it('FLW-005 the plant tab shows the modified mark while a scene is edited and not saved, and not once it is discarded', () => {
    renderGroup(PREFERENCES_VIEW_ID);
    const mark = () => tabParts(PLANT_VIEW_ID).tabButton.textContent?.includes('*');
    expect(mark()).toBe(false);
    dom.act(() =>
      usePlantEdit.getState().begin({ scene: { schemaVersion: 1, name: 'Floor', parts: [], cameras: [] }, map: null }, 'empty'),
    );
    expect(mark()).toBe(false); // opened, not changed
    dom.act(() => void usePlantEdit.getState().editor!.place('belt-x', 'belt', [4, 0, 4]));
    expect(mark()).toBe(true); // being edited
    dom.act(() => void usePlantEdit.getState().end());
    expect(mark()).toBe(true); // closed with Done, not saved
    dom.act(() => discardEditedScenes());
    expect(mark()).toBe(false);
  });
});
