/**
 * A static file server that mounts the web build where the docs site mounts it: the folder of the build is
 * `/ZPLC/app/` on the server (REL-037). It serves nothing outside that folder and nothing above that prefix.
 */
import { existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';

export const APP_PREFIX = '/ZPLC/app/';

/** The file for a request path, or null when the path is outside the prefix, leaves the folder, or names no file. */
export function appFile(appDir: string, pathname: string): string | null {
  if (!pathname.startsWith(APP_PREFIX)) return null;
  let relative: string;
  try { relative = decodeURIComponent(pathname.slice(APP_PREFIX.length)); } catch { return null; }
  const file = normalize(join(appDir, relative === '' ? 'index.html' : relative));
  if (file !== appDir && !file.startsWith(appDir + sep)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

export function serveWebSite(appDir: string, port: number, host = '127.0.0.1'): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname: host,
    port,
    fetch(request) {
      const file = appFile(appDir, new URL(request.url).pathname);
      return file === null ? new Response('Not found', { status: 404 }) : new Response(Bun.file(file));
    },
  });
}
