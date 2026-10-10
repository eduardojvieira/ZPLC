/**
 * The update check (IDE-010), run by the main process when the user turns it on or presses "Check now". It asks the
 * releases of this project for the latest published release and compares it with the running version. It downloads
 * nothing and installs nothing: the answer is a version and a link. Off by default; a failure of any kind (no
 * network, a refusal, an answer that is not a release) is "could not tell", never an error for the user.
 */
import { isReleaseUrl, isVersion, type UpdateCheckResult } from './updateCheckProtocol.js';

export const UPDATE_CHECK_URL = 'https://api.github.com/repos/eduardojvieira/ZPLC/releases/latest';
export const UPDATE_CHECK_LIMITS = { timeoutMs: 8_000, maxBytes: 128 * 1024 } as const;

/** The part of `fetch` the check uses, so that a test supplies the answer. */
export type UpdateFetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parts(version: string): { core: number[]; pre: string[] } {
  const match = SEMVER.exec(version);
  if (!match) return { core: [0, 0, 0], pre: [] };
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] };
}

/** -1, 0 or 1 by semantic-versioning precedence: a release candidate is older than its release. */
export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < 3; index++) {
    if (a.core[index]! !== b.core[index]!) return a.core[index]! < b.core[index]! ? -1 : 1;
  }
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === b.pre.length ? 0 : a.pre.length === 0 ? 1 : -1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {
    const x = a.pre[index];
    const y = b.pre[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return Number(x) < Number(y) ? -1 : 1;
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** The version and link of a release answer, or null when it is not a version tag with a link into this project's releases. */
export function parseLatestRelease(body: unknown): { version: string; url: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { tag_name: tag, html_url: url } = body as Record<string, unknown>;
  if (typeof tag !== 'string') return null;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  return isVersion(version) && isReleaseUrl(url) ? { version, url } : null;
}

export async function checkForUpdate({ currentVersion, fetch }: { currentVersion: string; fetch: UpdateFetch }): Promise<UpdateCheckResult> {
  const unavailable: UpdateCheckResult = { status: 'unavailable', current: currentVersion };
  try {
    const response = await fetch(UPDATE_CHECK_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(UPDATE_CHECK_LIMITS.timeoutMs),
    });
    if (!response.ok) return unavailable;
    const text = await response.text();
    if (text.length > UPDATE_CHECK_LIMITS.maxBytes) return unavailable;
    const latest = parseLatestRelease(JSON.parse(text));
    if (!latest) return unavailable;
    return compareVersions(latest.version, currentVersion) > 0
      ? { status: 'available', current: currentVersion, latest: latest.version, url: latest.url }
      : { status: 'current', current: currentVersion, latest: latest.version };
  } catch {
    return unavailable;
  }
}
