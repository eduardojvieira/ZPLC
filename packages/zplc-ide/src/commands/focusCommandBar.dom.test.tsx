import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { resetCommandsForTest } = await import('./bus');
const { useCommandShortcuts } = await import('./useCommandHost');
const { useGuideCommands } = await import('./bind/guide');
const { IconButton } = await import('../ui/Button');
const { BuildMenu } = await import('../components/ToolbarBuildMenu');
const { ThemeMenu } = await import('../components/ToolbarThemeMenu');
const { useDropdownMenu } = await import('../components/useDropdownMenu');

const noop = () => {};

function RealBuildMenu() {
  const menu = useDropdownMenu();
  return (
    <BuildMenu
      menu={menu}
      onCompile={noop}
      onGenerateSt={undefined}
      onDownloadBytecode={noop}
      onViewAssembly={noop}
      hasCurrentCompileResult
    />
  );
}

function Harness() {
  useCommandShortcuts();
  useGuideCommands();
  return (
    <>
      <div role="toolbar" data-command-bar aria-label="Command bar">
        {/* The bar's first control shows its tooltip on focus, and the tooltip stops Escape from bubbling (UX-001). */}
        <IconButton label="Save" icon="S" />
        <button type="button">Build</button>
        {/* The real inline menus of the bar: their items render inside the bar, not in a portal. */}
        <RealBuildMenu />
        <ThemeMenu />
      </div>
      <main>
        <textarea aria-label="Code editor" />
      </main>
    </>
  );
}

const press = (target: Element, init: KeyboardEventInit) =>
  dom.act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
const chord = { key: 'c', code: 'KeyC', ctrlKey: true, altKey: true } as const;

afterEach(() => resetCommandsForTest());

describe('view.focusCommandBar', () => {
  it('FND-002 view.focusCommandBar moves focus to the command bar from a document and back', async () => {
    dom.render(<Harness />);
    const editor = dom.screen.getByLabelText('Code editor');
    const first = dom.screen.getByRole('button', { name: 'Save' });
    editor.focus();
    press(editor, chord);
    await dom.waitFor(() => expect(document.activeElement).toBe(first));
    press(first, chord);
    await dom.waitFor(() => expect(document.activeElement).toBe(editor));
    press(editor, chord);
    await dom.waitFor(() => expect(document.activeElement).toBe(first));
    press(first, { key: 'Escape', code: 'Escape' });
    await dom.waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('UX-025 view.focusCommandBar works inside the code editor without Ctrl+M', async () => {
    dom.render(<Harness />);
    const editor = dom.screen.getByLabelText('Code editor');
    editor.focus();
    expect(editor.tagName).toBe('TEXTAREA'); // Monaco takes the keyboard in a textarea
    press(editor, chord);
    await dom.waitFor(() => expect(dom.screen.getByRole('toolbar').contains(document.activeElement)).toBe(true));
  });

  it('UX-025 Escape gives the focus back though the tooltip of the focused control stops the key', async () => {
    dom.render(<Harness />);
    const editor = dom.screen.getByLabelText('Code editor');
    const save = dom.screen.getByRole('button', { name: 'Save' });
    editor.focus();
    press(editor, chord);
    await dom.waitFor(() => expect(document.activeElement).toBe(save));
    await dom.waitFor(() => expect(dom.screen.getByRole('tooltip')).toBeTruthy()); // open at once on keyboard focus
    press(save, { key: 'Escape', code: 'Escape' });
    await dom.waitFor(() => expect(document.activeElement).toBe(editor));
  });

  for (const [name, controls] of [
    ['Build', 'toolbar-build-menu'],
    ['Theme', 'toolbar-theme-menu'],
  ] as const) {
    it(`UX-025 Escape in the ${name} menu of the bar closes the menu and keeps the way back to the editor`, async () => {
      dom.render(<Harness />);
      const editor = dom.screen.getByLabelText('Code editor');
      const save = dom.screen.getByRole('button', { name: 'Save' });
      const trigger = document.querySelector<HTMLElement>(`[aria-controls="${controls}"]`)!;
      editor.focus();
      press(editor, chord);
      await dom.waitFor(() => expect(document.activeElement).toBe(save));
      trigger.focus();
      dom.act(() => trigger.click());
      await dom.waitFor(() => expect(document.getElementById(controls)?.contains(document.activeElement)).toBe(true));
      press(document.activeElement!, { key: 'Escape', code: 'Escape' });
      await dom.waitFor(() => expect(document.getElementById(controls)).toBeNull());
      await dom.waitFor(() => expect(document.activeElement).toBe(trigger));
      press(trigger, { key: 'Escape', code: 'Escape' });
      await dom.waitFor(() => expect(document.activeElement).toBe(editor));
    });
  }
});
