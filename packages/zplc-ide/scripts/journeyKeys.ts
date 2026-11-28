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
 * Chooses the option at `index` of the native select the expression `element` yields. The arrow keys cannot do it: on macOS they open the
 * popup of a closed select and choose nothing. The element is set and told the way a choice from the popup tells React.
 */
export async function setSelectIndex(app: Pick<App, 'eval'>, element: string, index: number): Promise<void> {
  await app.eval(
    `(() => { const select = ${element}; select.focus(); select.selectedIndex = ${index}; ` +
      `select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
}

/** Chooses the option with this text in the native select; fails when the select does not offer it or does not end on it. */
export async function selectOption(app: Pick<App, 'eval' | 'until'>, selector: string, label: string): Promise<void> {
  const element = `document.querySelector(${JSON.stringify(selector)})`;
  const state = () =>
    app.eval<{ labels: string[]; index: number }>(
      `(() => { const select = ${element}; return { labels: [...select.options].map((option) => option.textContent), ` +
        `index: select.selectedIndex }; })()`,
    );
  const wanted = (await state()).labels.indexOf(label);
  if (wanted < 0) throw new Error(`${selector} offers ${JSON.stringify((await state()).labels)}, not ${label}`);
  await setSelectIndex(app, element, wanted);
  await app.until(`${selector} to show ${label}`, async () => (await state()).index === wanted || undefined);
}
