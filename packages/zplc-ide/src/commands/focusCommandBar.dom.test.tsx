import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { resetCommandsForTest } = await import('./bus');
const { useCommandShortcuts } = await import('./useCommandHost');
const { useGuideCommands } = await import('./bind/guide');

function Harness() {
  useCommandShortcuts();
  useGuideCommands();
  return (
    <>
      <div role="toolbar" aria-label="Command bar">
        <button type="button">Build</button>
        <button type="button">Run</button>
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
    const first = dom.screen.getByRole('button', { name: 'Build' });
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
});

