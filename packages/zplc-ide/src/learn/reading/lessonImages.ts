/**
 * The images of the lesson reading pages (LRN-040), resolved by Vite as `?url` assets so they load from the app itself
 * (CSP `img-src 'self'`). Outside Vite (bun tests) the glob does not exist and no image resolves.
 */
let urls: Record<string, string> = {};
try {
  urls = import.meta.glob<string>('/lessons/*/images/*.{svg,png}', { query: '?url', import: 'default', eager: true });
} catch {
  // not running under Vite
}

const byKey = new Map(Object.entries(urls).map(([path, url]) => [path.slice('/lessons/'.length), url]));

/** The URL of `<lessonId>/images/<file>`, or undefined when the lesson does not ship that image. */
export const lessonImageUrl = (lessonId: string, src: string): string | undefined => byKey.get(`${lessonId}/${src}`);
