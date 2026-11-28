import type { App } from './journeyApp';
import { formatShortcut, type Platform } from '../src/commands/shortcuts';

const EDIT_COMMANDS: Record<string, string> = { A: 'selectAll', C: 'copy', V: 'paste', X: 'cut', Z: 'undo' };

/**
 * The CDP key event of a chord such as `Ctrl+Shift+Z`. `Ctrl` stands for the primary modifier of the platform: Control, or Meta
 * (Cmd) on macOS, where the editing commands travel with the key as Chromium's own keyboard map would send them.
 */
export function chordEvent(
  platform: NodeJS.Platform,
  chord: string,
): { key: string; code: string; keyCode: number; modifiers: number; commands?: string[] } {
  const parts = chord.split('+');
  const name = parts.pop()!;
  const mac = platform === 'darwin';
  const shift = parts.includes('Shift');
  const modifiers = (parts.includes('Alt') ? 1 : 0) | (parts.includes('Ctrl') ? (mac ? 4 : 2) : 0) | (shift ? 8 : 0);
  const letter = name.toUpperCase();
  const command = mac && parts.includes('Ctrl') ? (letter === 'Z' && shift ? 'redo' : EDIT_COMMANDS[letter]) : undefined;
  return {
    key: name.toLowerCase(),
    code: `Key${letter}`,
    keyCode: letter.charCodeAt(0),
    modifiers,
    ...(command ? { commands: [command] } : {}),
  };
}

/** Sends an editing chord (select all, undo, paste, save) with the primary modifier of the platform; other platforms send it unchanged. */
export async function pressMod(app: App, chord: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform !== 'darwin') return app.press(chord);
  const event = chordEvent(platform, chord);
  const { commands, ...base } = event;
  await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', ...base, windowsVirtualKeyCode: event.keyCode, commands });
  await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', ...base, windowsVirtualKeyCode: event.keyCode });
}

/** A shortcut as the app names it on this platform (`Shift+F5`, or `⇧F5` on macOS). */
export function shortcutText(shortcut: string, platform: NodeJS.Platform = process.platform): string {
  return formatShortcut(shortcut, platform as Platform);
}

/** The accessible name of a control that carries its shortcut: `Stop (Shift+F5)`. */
export function shortcutName(label: string, shortcut: string, platform: NodeJS.Platform = process.platform): string {
  return `${label} (${shortcutText(shortcut, platform)})`;
}

/**
 * Chooses the option at `index` of the native select the expression `element` yields, through the element: it is set and told the way a
 * choice from the popup tells React.
 */
export async function setSelectIndex(app: Pick<App, 'eval'>, element: string, index: number): Promise<void> {
  await app.eval(
    `(() => { const select = ${element}; select.focus(); select.selectedIndex = ${index}; ` +
      `select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
}

export const KEYBOARD_CHOOSING_NOT_MEASURED = 'keyboard choosing of a native select is not measured on macOS';
const told = new WeakSet<object>();

/**
 * Chooses an option of a native select by keyboard. `pressKeys` is the key presses the journey has always sent, and they are what
 * linux and win32 get. On macOS the arrow keys, End and Home only open the popup of a closed select, so the option is set through the
 * element instead, and the journey says once that the keyboard choosing was not measured there.
 */
export async function chooseByKeys(
  app: Pick<App, 'eval'> & Partial<Pick<App, 'note'>>,
  element: string,
  index: number,
  pressKeys: () => Promise<void>,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform !== 'darwin') return pressKeys();
  await setSelectIndex(app, element, index);
  if (!told.has(app)) {
    told.add(app);
    app.note?.(KEYBOARD_CHOOSING_NOT_MEASURED);
    console.log(KEYBOARD_CHOOSING_NOT_MEASURED);
  }
}

async function optionState(app: Pick<App, 'eval'>, selector: string, label: string) {
  const element = `document.querySelector(${JSON.stringify(selector)})`;
  const state = () =>
    app.eval<{ labels: string[]; index: number }>(
      `(() => { const select = ${element}; return { labels: [...select.options].map((option) => option.textContent), ` +
        `index: select.selectedIndex }; })()`,
    );
  const { labels, index } = await state();
  const wanted = labels.indexOf(label);
  if (wanted < 0) throw new Error(`${selector} offers ${JSON.stringify(labels)}, not ${label}`);
  return { element, state, index, wanted };
}

/**
 * Chooses the option with this text in the native select by keyboard, strictly: if the arrow keys do not move the select to it, the
 * journey fails. On macOS, where the keys only open the popup, it sets the option through the element and says so once.
 */
export async function chooseOption(
  app: Pick<App, 'eval' | 'until' | 'press'> & Partial<Pick<App, 'note'>>,
  selector: string,
  label: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const { element, state, index, wanted } = await optionState(app, selector, label);
  await chooseByKeys(
    app,
    element,
    wanted,
    async () => {
      await app.eval(`${element}.focus()`);
      for (let step = 0; step < Math.abs(wanted - index); step++) await app.press(wanted > index ? 'ArrowDown' : 'ArrowUp');
    },
    platform,
  );
  await app.until(`${selector} to show ${label}`, async () => (await state()).index === wanted || undefined);
}

/**
 * Chooses the option with this text in the native select; fails when the select does not offer it or does not end on it. It walks the
 * select with the arrow keys and, if the select did not move (macOS), sets the option through the element.
 */
export async function selectOption(
  app: Pick<App, 'eval' | 'until' | 'press'>,
  selector: string,
  label: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const { element, state, index, wanted } = await optionState(app, selector, label);
  if (platform === 'darwin') await setSelectIndex(app, element, wanted);
  else {
    await app.eval(`${element}.focus()`);
    for (let step = 0; step < Math.abs(wanted - index); step++) await app.press(wanted > index ? 'ArrowDown' : 'ArrowUp');
    // a select that did not move with the keys is set through the element, as before
    if ((await state()).index !== wanted) await setSelectIndex(app, element, wanted);
  }
  await app.until(`${selector} to show ${label}`, async () => (await state()).index === wanted || undefined);
}

/** Monaco's Tab focus mode: Ctrl+M, and Ctrl+Shift+M on macOS (toggleTabFocusMode.js). */
export async function toggleTabFocus(app: Pick<App, 'press'>, platform: NodeJS.Platform = process.platform): Promise<void> {
  await app.press(platform === 'darwin' ? 'Ctrl+Shift+M' : 'Ctrl+M');
}
