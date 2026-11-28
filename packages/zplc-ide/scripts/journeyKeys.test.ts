import { expect, test } from 'bun:test';
import { chordEvent, shortcutName, shortcutText, selectOption } from './journeyKeys';

for (const platform of ['linux', 'win32'] as const) {
  test(`on ${platform} Ctrl is the Control modifier (2)`, () => {
    expect(chordEvent(platform, 'Ctrl+A')).toEqual({ key: 'a', code: 'KeyA', keyCode: 65, modifiers: 2 });
    expect(chordEvent(platform, 'Ctrl+Shift+Z').modifiers).toBe(10);
    expect(chordEvent(platform, 'Ctrl+Z').commands).toBeUndefined();
  });
}

test('on darwin Ctrl is the Meta modifier (4) and the editing command goes with the key', () => {
  expect(chordEvent('darwin', 'Ctrl+A')).toEqual({ key: 'a', code: 'KeyA', keyCode: 65, modifiers: 4, commands: ['selectAll'] });
  expect(chordEvent('darwin', 'Ctrl+Z').commands).toEqual(['undo']);
  expect(chordEvent('darwin', 'Ctrl+Shift+Z')).toMatchObject({ modifiers: 12, commands: ['redo'] });
  expect(chordEvent('darwin', 'Ctrl+V').commands).toEqual(['paste']);
  expect(chordEvent('darwin', 'Ctrl+S')).toMatchObject({ modifiers: 4 });
});

test('pressMod on darwin sends one Meta key down and up through the page, and on linux the unchanged chord through press', async () => {
  const sent: unknown[] = [];
  const app = {
    press: async (chord: string) => void sent.push(['press', chord]),
    cdp: { command: async (method: string, params: { type: string; modifiers: number }) => void sent.push([method, params.type, params.modifiers]) },
  } as never;
  const { pressMod } = await import('./journeyKeys');
  await pressMod(app, 'Ctrl+A', 'darwin');
  await pressMod(app, 'Ctrl+A', 'linux');
  expect(sent).toEqual([
    ['Input.dispatchKeyEvent', 'keyDown', 4],
    ['Input.dispatchKeyEvent', 'keyUp', 4],
    ['press', 'Ctrl+A'],
  ]);
});

test('the Stop button is named as the app names it on each platform', () => {
  expect(shortcutName('Stop', 'Shift+F5', 'linux')).toBe('Stop (Shift+F5)');
  expect(shortcutName('Stop', 'Shift+F5', 'win32')).toBe('Stop (Shift+F5)');
  expect(shortcutName('Stop', 'Shift+F5', 'darwin')).toBe('Stop (⇧F5)');
});

test('the shortcut reference shows Mod+S as Ctrl+S, or ⌘S on macOS', () => {
  expect(shortcutText('Mod+S', 'linux')).toBe('Ctrl+S');
  expect(shortcutText('Mod+S', 'win32')).toBe('Ctrl+S');
  expect(shortcutText('Mod+S', 'darwin')).toBe('⌘S');
});

/** A native select as it behaves on macOS: the arrow keys open its popup and choose nothing. */
function macSelect(labels: string[]) {
  const events: string[] = [];
  const select = {
    options: labels.map((textContent) => ({ textContent })),
    selectedIndex: 0,
    focus: () => undefined,
    dispatchEvent: (event: { type: string }) => void events.push(event.type),
  };
  const pressed: string[] = [];
  const app = {
    eval: async (expression: string) =>
      new Function('document', 'Event', `return ${expression}`)({ querySelector: () => select }, class { constructor(public type: string) {} }),
    until: async (_what: string, check: () => Promise<unknown>) => check(),
    press: async (chord: string) => void pressed.push(chord),
  };
  return { app, select, events, pressed };
}

test('selectOption sets the option through the element on every platform, without the arrow keys', async () => {
  const { app, select, events, pressed } = macSelect(['', 'High contrast', 'Dark']);
  await selectOption(app as never, '#theme', 'Dark');
  expect(select.selectedIndex).toBe(2);
  expect(events).toEqual(['input', 'change']);
  expect(pressed).toEqual([]);
});

test('selectOption names the offered options when the label is not among them', async () => {
  const { app } = macSelect(['', 'Dark']);
  await expect(selectOption(app as never, '#theme', 'Light')).rejects.toThrow('#theme offers ["","Dark"], not Light');
});
