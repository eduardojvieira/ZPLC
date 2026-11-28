import type { App } from './journeyApp';

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
export function shortcutText(shortcut: string, _platform: NodeJS.Platform = process.platform): string {
  return shortcut.replace('Mod', 'Ctrl');
}

/** The accessible name of a control that carries its shortcut: `Stop (Shift+F5)`. */
export function shortcutName(label: string, shortcut: string, platform: NodeJS.Platform = process.platform): string {
  return `${label} (${shortcutText(shortcut, platform)})`;
}
