/**
 * A static file server that mounts the web build where the docs site mounts it: the folder of the build is
 * `/ZPLC/app/` on the server (REL-037). It serves nothing outside that folder and nothing above that prefix.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

// Shapes of credentials that have no business in a static site: private keys and the tokens of the services the project uses.
// (A key id such as AKIA... is not listed: base64 data in a bundle matches it by chance.)
const SECRET_SHAPES: Array<[string, RegExp]> = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['API key of a model provider', /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['bearer credential', /\bBearer [A-Za-z0-9._~+/-]{24,}=*/],
];

/** The files of the build that hold something shaped like a credential, as `path: shape`. */
export function secretsIn(directory: string): string[] {
  const found: string[] = [];
  const walk = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) { walk(path, `${prefix}${entry.name}/`); continue; }
      if (!/\.(js|mjs|html|json|css|svg|txt)$/i.test(entry.name)) continue;
      const text = readFileSync(path, 'latin1');
      for (const [shape, pattern] of SECRET_SHAPES) if (pattern.test(text)) found.push(`${prefix}${entry.name}: ${shape}`);
    }
  };
  walk(directory, '');
  return found;
}
