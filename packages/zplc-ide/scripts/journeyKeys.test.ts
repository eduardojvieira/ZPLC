import { expect, test } from 'bun:test';
import { chordEvent, pressMod, shortcutName, shortcutText, selectOption, chooseByKeys, chooseOption, toggleTabFocus } from './journeyKeys';

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
    cdp: {
      command: async (method: string, params: { type: string; modifiers: number }) =>
        void sent.push([method, params.type, params.modifiers]),
    },
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

/** A native select; `arrows` says whether the arrow keys move it (linux, win32) or only open its popup (macOS). */
function fakeSelect(labels: string[], arrows: boolean) {
  const events: string[] = [];
  const select = {
    options: labels.map((textContent) => ({ textContent })),
    selectedIndex: 0,
    focus: () => undefined,
    dispatchEvent: (event: { type: string }) => void events.push(event.type),
  };
  const pressed: string[] = [];
  const notes: string[] = [];
  const app = {
    eval: async (expression: string) =>
      new Function('document', 'Event', `return ${expression}`)(
        { querySelector: () => select, activeElement: select },
        class {
          constructor(public type: string) {}
        },
      ),
    until: async (what: string, check: () => Promise<unknown>) => {
      const value = await check();
      if (value === undefined || value === false) throw new Error(`Timed out waiting for ${what}`);
      return value;
    },
    press: async (chord: string) => {
      pressed.push(chord);
      if (arrows) select.selectedIndex += chord === 'ArrowDown' ? 1 : -1;
    },
    note: (text: string) => void notes.push(text),
  };
  return { app, select, events, pressed, notes };
}

for (const platform of ['linux', 'win32'] as const) {
  test(`on ${platform} selectOption walks the select with the arrow keys and sets nothing through the element`, async () => {
    const { app, select, events, pressed } = fakeSelect(['', 'High contrast', 'Dark'], true);
    await selectOption(app as never, '#theme', 'Dark', platform);
    expect(pressed).toEqual(['ArrowDown', 'ArrowDown']);
    expect(select.selectedIndex).toBe(2);
    expect(events).toEqual([]);
  });

  test(`on ${platform} chooseByKeys sends the journey's own keys and says nothing`, async () => {
    const { app, select, events, pressed, notes } = fakeSelect(['', 'a', 'b'], true);
    await chooseByKeys(
      app as never,
      'document.activeElement',
      2,
      async () => {
        await app.press('ArrowDown');
        await app.press('ArrowDown');
      },
      platform,
    );
    expect(pressed).toEqual(['ArrowDown', 'ArrowDown']);
    expect(select.selectedIndex).toBe(2);
    expect(events).toEqual([]);
    expect(notes).toEqual([]);
  });
}

test('on darwin selectOption sets the option through the element without the arrow keys', async () => {
  const { app, select, events, pressed } = fakeSelect(['', 'High contrast', 'Dark'], false);
  await selectOption(app as never, '#theme', 'Dark', 'darwin');
  expect(select.selectedIndex).toBe(2);
  expect(events).toEqual(['input', 'change']);
  expect(pressed).toEqual([]);
});

test('on darwin chooseByKeys sets the option through the element, sends no key and says so once', async () => {
  const { app, select, events, pressed, notes } = fakeSelect(['', 'a', 'b'], false);
  const keys = async () => void (await app.press('ArrowDown'));
  await chooseByKeys(app as never, 'document.activeElement', 2, keys, 'darwin');
  await chooseByKeys(app as never, 'document.activeElement', 1, keys, 'darwin');
  expect(select.selectedIndex).toBe(1);
  expect(events).toEqual(['input', 'change', 'input', 'change']);
  expect(pressed).toEqual([]);
  expect(notes).toEqual(['keyboard choosing of a native select is not measured on macOS']);
});

test('selectOption names the offered options when the label is not among them', async () => {
  const { app } = fakeSelect(['', 'Dark'], false);
  await expect(selectOption(app as never, '#theme', 'Light', 'linux')).rejects.toThrow('#theme offers ["","Dark"], not Light');
});

for (const platform of ['linux', 'win32'] as const) {
  test(`on ${platform} chooseOption fails when the arrow keys do not move the select, with no fallback`, async () => {
    const { app, select, events, pressed } = fakeSelect(['', 'High contrast', 'Dark'], false);
    await expect(chooseOption(app as never, '#theme', 'Dark', platform)).rejects.toThrow();
    expect(pressed).toEqual(['ArrowDown', 'ArrowDown']);
    expect(select.selectedIndex).toBe(0);
    expect(events).toEqual([]);
  });

  test(`on ${platform} chooseOption walks the select with the arrow keys`, async () => {
    const { app, select, pressed, notes } = fakeSelect(['', 'High contrast', 'Dark'], true);
    await chooseOption(app as never, '#theme', 'Dark', platform);
    expect(pressed).toEqual(['ArrowDown', 'ArrowDown']);
    expect(select.selectedIndex).toBe(2);
    expect(notes).toEqual([]);
  });

  test(`on ${platform} toggleTabFocus presses Ctrl+M and pressMod sends the chord unchanged`, async () => {
    const sent: string[] = [];
    const app = { press: async (chord: string) => void sent.push(chord), cdp: { command: async () => sent.push('cdp') } } as never;
    await toggleTabFocus(app, platform);
    await pressMod(app, 'Ctrl+A', platform);
    expect(sent).toEqual(['Ctrl+M', 'Ctrl+A']);
  });
}

test('on darwin chooseOption sets the option, sends no key and notes once that keyboard choosing is not measured', async () => {
  const { app, select, events, pressed, notes } = fakeSelect(['', 'High contrast', 'Dark'], false);
  await chooseOption(app as never, '#theme', 'Dark', 'darwin');
  await chooseOption(app as never, '#theme', 'High contrast', 'darwin');
  expect(select.selectedIndex).toBe(1);
  expect(events).toEqual(['input', 'change', 'input', 'change']);
  expect(pressed).toEqual([]);
  expect(notes).toEqual(['keyboard choosing of a native select is not measured on macOS']);
});

test('chooseOption names the offered options when the label is not among them', async () => {
  const { app } = fakeSelect(['', 'Dark'], true);
  await expect(chooseOption(app as never, '#theme', 'Light', 'linux')).rejects.toThrow('#theme offers ["","Dark"], not Light');
});

test('on darwin Monaco toggles Tab focus with Ctrl+Shift+M', async () => {
  const sent: string[] = [];
  await toggleTabFocus({ press: async (chord: string) => void sent.push(chord) } as never, 'darwin');
  expect(sent).toEqual(['Ctrl+Shift+M']);
});
