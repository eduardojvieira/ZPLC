/** The preference the palette asked for: the preferences document scrolls to it when it opens (read once, then cleared). */
import type { AppSettings } from '../utils/appSettings';

let anchor: keyof AppSettings | null = null;

export const setPreferenceAnchor = (key: keyof AppSettings | null): void => {
  anchor = key;
};
export function takePreferenceAnchor(): keyof AppSettings | null {
  const taken = anchor;
  anchor = null;
  return taken;
}
