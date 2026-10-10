/**
 * The update check (IDE-010): the channel name and the answer, shared by the main process (`updateCheck.ts`,
 * `main.ts`) and the renderer. Pure TypeScript with no Electron or Node import, so both programs can import it. The
 * channel name is defined once, in `ipcContract.ts`.
 *
 * The check names no address and carries nothing from the renderer: the main process asks one fixed address and
 * answers with a version and a link into this project's releases, or says it could not tell.
 */

export { UPDATE_CHECK_CHANNEL } from './ipcContract.js';

/** The only place a link in the answer may point to: the releases of this project. */
export const RELEASE_URL_PREFIX = 'https://github.com/eduardojvieira/ZPLC/releases/';

export type UpdateCheckResult =
  | { status: 'available'; current: string; latest: string; url: string }
  | { status: 'current'; current: string; latest: string }
  | { status: 'unavailable'; current: string };

/** What the preload exposes: one call, no arguments. */
export interface UpdateCheckBridge {
  run(): Promise<unknown>;
}

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

const isVersion = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && VERSION.test(value);
const isReleaseUrl = (value: unknown): value is string => typeof value === 'string' && value.length <= 512 && value.startsWith(RELEASE_URL_PREFIX);

/** A fresh, validated answer, or null for anything that is not exactly one. */
export function parseUpdateCheckResult(value: unknown): UpdateCheckResult | null {
  if (!isPlainObject(value) || typeof value.current !== 'string' || value.current.length > 64) return null;
  const keys = Object.keys(value).sort().join();
  if (value.status === 'unavailable' && keys === 'current,status') return { status: 'unavailable', current: value.current };
  if (value.status === 'current' && keys === 'current,latest,status' && isVersion(value.latest)) return { status: 'current', current: value.current, latest: value.latest };
  if (value.status === 'available' && keys === 'current,latest,status,url' && isVersion(value.latest) && isReleaseUrl(value.url)) {
    return { status: 'available', current: value.current, latest: value.latest, url: value.url };
  }
  return null;
}

export { isReleaseUrl, isVersion };
