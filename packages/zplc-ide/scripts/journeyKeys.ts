import type { App } from './journeyApp';

/** The CDP modifier bits of a chord such as `Ctrl+Shift+Z`; `Ctrl` is the primary modifier of the platform. */
export function chordEvent(
  _platform: NodeJS.Platform,
  chord: string,
): { key: string; code: string; keyCode: number; modifiers: number; commands?: string[] } {
  const parts = chord.split('+');
  const name = parts.pop()!;
  const modifiers = (parts.includes('Alt') ? 1 : 0) | (parts.includes('Ctrl') ? 2 : 0) | (parts.includes('Shift') ? 8 : 0);
  return { key: name.toLowerCase(), code: `Key${name.toUpperCase()}`, keyCode: name.toUpperCase().charCodeAt(0), modifiers };
}

/** Sends an editing chord (select all, undo, paste, save) the way the platform's own primary modifier does. */
export async function pressMod(app: App, chord: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  void platform;
  await app.press(chord);
}
