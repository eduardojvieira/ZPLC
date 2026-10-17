/**
 * How a shortcut is shown to the person (UX-015): in a tooltip, in the palette and in the shortcut reference, written for
 * the platform (Ctrl+S, or ⌘S on macOS) with the key names of the interface language. The registry holds the shortcut;
 * nothing else spells one out.
 */
import { t } from '../i18n';
import { commandById, type CommandId } from './registry';
import { formatShortcut, type Platform } from './shortcuts';

export function currentPlatform(): Platform {
  const reported = typeof window === 'undefined' ? undefined : window.electronAPI?.platform;
  if (reported === 'darwin' || reported === 'win32' || reported === 'linux') return reported;
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Mac/.test(agent) ? 'darwin' : /Windows/.test(agent) ? 'win32' : 'linux';
}

/** The shortcut of a command as text, or null when it has none. */
export function shortcutText(id: CommandId, platform: Platform = currentPlatform()): string | null {
  const shortcut = commandById(id).shortcut;
  return shortcut ? formatShortcut(shortcut, platform, { ctrl: t('shortcut.key.ctrl'), shift: t('shortcut.key.shift'), alt: t('shortcut.key.alt') }) : null;
}

/** A name with the shortcut after it, for a tooltip or an accessible name: `Run (F5)`; the name alone when there is none. */
export function withShortcut(name: string, id: CommandId): string {
  const text = shortcutText(id);
  return text ? `${name} (${text})` : name;
}
