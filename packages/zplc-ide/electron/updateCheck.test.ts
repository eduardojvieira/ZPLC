import { describe, expect, it } from 'bun:test';

import {
  UPDATE_CHECK_LIMITS,
  UPDATE_CHECK_URL,
  checkForUpdate,
  compareVersions,
  parseLatestRelease,
  type UpdateFetch,
} from './updateCheck';
import { parseUpdateCheckResult } from './updateCheckProtocol';

const answer =
  (body: unknown, init: { ok?: boolean; status?: number } = {}): UpdateFetch =>
  async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
const release = (tag: string, url = `https://github.com/eduardojvieira/ZPLC/releases/tag/${tag}`) => ({
  tag_name: tag,
  html_url: url,
  prerelease: false,
});

describe('version order (IDE-010)', () => {
  it('orders releases and release candidates the way semantic versioning does', () => {
    expect(compareVersions('2.0.1', '2.0.0')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
    expect(compareVersions('2.0.0-rc.3', '2.0.0')).toBe(-1);
    expect(compareVersions('2.0.0-rc.10', '2.0.0-rc.9')).toBe(1);
    expect(compareVersions('2.0.0-rc.3', '2.0.0-beta.9')).toBe(1);
    expect(compareVersions('v2.1.0', '2.0.9')).toBe(1);
  });
});

describe('latest release (IDE-010)', () => {
  it("takes a version tag and a link into this project's releases, and nothing else from the answer", () => {
    expect(parseLatestRelease(release('v2.0.1'))).toEqual({
      version: '2.0.1',
      url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.1',
    });
    for (const bad of [
      null,
      'x',
      {},
      release('latest'),
      release('v2.0'),
      release('v2.0.1', 'https://evil.example/releases/tag/v2.0.1'),
      release('v2.0.1', 'javascript:alert(1)'),
      { tag_name: 5, html_url: 'x' },
    ]) {
      expect(parseLatestRelease(bad)).toBeNull();
    }
  });
});

describe('update check (IDE-010)', () => {
  it('asks one fixed address with a time limit and sends nothing about the user', async () => {
    let seen: { url: string; init: { headers?: Record<string, string>; signal?: AbortSignal } } | undefined;
    await checkForUpdate({
      currentVersion: '2.0.0',
      fetch: async (url, init) => {
        seen = { url, init };
        return { ok: true, status: 200, text: async () => JSON.stringify(release('v2.0.0')) };
      },
    });
    expect(seen?.url).toBe(UPDATE_CHECK_URL);
    expect(UPDATE_CHECK_URL).toBe('https://api.github.com/repos/eduardojvieira/ZPLC/releases/latest');
    expect(Object.keys(seen?.init.headers ?? {}).sort()).toEqual(['Accept']);
    expect(seen?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('says a newer release is available, with its version and link', async () => {
    const result = await checkForUpdate({ currentVersion: '2.0.0-rc.3', fetch: answer(release('v2.0.0')) });
    expect(result).toEqual({
      status: 'available',
      current: '2.0.0-rc.3',
      latest: '2.0.0',
      url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.0',
    });
  });

  it('says the build is current when it is the latest or newer', async () => {
    await expect(checkForUpdate({ currentVersion: '2.0.0', fetch: answer(release('v2.0.0')) })).resolves.toEqual({
      status: 'current',
      current: '2.0.0',
      latest: '2.0.0',
    });
    await expect(checkForUpdate({ currentVersion: '2.1.0-rc.1', fetch: answer(release('v2.0.0')) })).resolves.toMatchObject({
      status: 'current',
    });
  });

  it('says it could not tell when the network, the server or the answer fails, and never throws', async () => {
    const down: UpdateFetch = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(checkForUpdate({ currentVersion: '2.0.0', fetch: down })).resolves.toEqual({ status: 'unavailable', current: '2.0.0' });
    await expect(checkForUpdate({ currentVersion: '2.0.0', fetch: answer({}, { ok: false, status: 403 }) })).resolves.toMatchObject({
      status: 'unavailable',
    });
    await expect(checkForUpdate({ currentVersion: '2.0.0', fetch: answer('{ not json') })).resolves.toMatchObject({
      status: 'unavailable',
    });
    await expect(
      checkForUpdate({ currentVersion: '2.0.0', fetch: answer(release('v3.0.0', 'https://evil.example/x')) }),
    ).resolves.toMatchObject({ status: 'unavailable' });
    await expect(
      checkForUpdate({ currentVersion: '2.0.0', fetch: answer(`${' '.repeat(UPDATE_CHECK_LIMITS.maxBytes)}{}`) }),
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('is validated again by whoever receives the answer', () => {
    expect(parseUpdateCheckResult({ status: 'current', current: '2.0.0', latest: '2.0.0' })).not.toBeNull();
    expect(
      parseUpdateCheckResult({
        status: 'available',
        current: '2.0.0',
        latest: '2.0.1',
        url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.1',
      }),
    ).not.toBeNull();
    expect(parseUpdateCheckResult({ status: 'available', current: '2.0.0', latest: '2.0.1', url: 'https://evil.example/' })).toBeNull();
    expect(parseUpdateCheckResult({ status: 'unavailable', current: '2.0.0' })).not.toBeNull();
    expect(parseUpdateCheckResult({ status: 'other' })).toBeNull();
    expect(parseUpdateCheckResult(null)).toBeNull();
  });
});
