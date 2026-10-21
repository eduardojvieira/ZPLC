// REL-021: Studio checks the latest release on start and on request, and shows a dismissible notice that links to the
// release and to the update step of the user's system. The check is optional (off by default), silent when offline, and
// downloads and installs nothing. The network here is a fake `fetch`.
import { describe, expect, it } from 'bun:test';

import { checkForUpdate, UPDATE_CHECK_URL, type UpdateFetch } from '../../electron/updateCheck';
import { DEFAULT_SETTINGS } from '../utils/appSettings';
import { createUpdateNoticeStore } from '../store/updateNotice';
import { DISMISSED_STORAGE_KEY, readDismissed, updateNotice, updateSteps, writeDismissed } from './updateNotice';
import { runUpdateCheck } from './updateCheckBridge';

const URL = 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.0';
const release =
  (tag = 'v2.0.0', url = URL): UpdateFetch =>
  async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ tag_name: tag, html_url: url }) });
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
};

describe('the check is optional, and says nothing when it cannot tell (REL-021)', () => {
  it('is off until the user turns it on', () => {
    expect(DEFAULT_SETTINGS.checkForUpdates).toBe(false);
  });

  it('asks the releases of this project once, with a fake network, and sends nothing about the user', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const fake: UpdateFetch = async (url, init) => {
      seen.push({ url, headers: init.headers });
      return release()(url, init);
    };
    const answer = await checkForUpdate({ currentVersion: '2.0.0-rc.4', fetch: fake });
    expect(answer).toEqual({ status: 'available', current: '2.0.0-rc.4', latest: '2.0.0', url: URL });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(UPDATE_CHECK_URL);
    expect(Object.keys(seen[0]!.headers)).toEqual(['Accept']);
  });

  it('shows no notice when the network is down, the server refuses or the answer is not a release of this project', async () => {
    const down: UpdateFetch = async () => {
      throw new Error('ENOTFOUND');
    };
    const refused: UpdateFetch = async () => ({ ok: false, status: 403, text: async () => '{}' });
    for (const fetch of [down, refused, release('v2.0.0', 'https://evil.example/releases/tag/v2.0.0')]) {
      const answer = await runUpdateCheck({ run: () => checkForUpdate({ currentVersion: '2.0.0-rc.4', fetch }) }, '2.0.0-rc.4');
      expect(answer.status).toBe('unavailable');
      expect(updateNotice(answer, 'linux', null)).toBeNull();
    }
  });

  it('shows no notice for the version it runs or for an older release', async () => {
    for (const current of ['2.0.0', '2.1.0-rc.1']) {
      const answer = await checkForUpdate({ currentVersion: current, fetch: release() });
      expect(updateNotice(answer, 'linux', null)).toBeNull();
    }
  });
});

describe('the notice (REL-021)', () => {
  const available = { status: 'available', current: '2.0.0-rc.4', latest: '2.0.0', url: URL } as const;

  it('names the release, links to it and gives the update step of each system', () => {
    for (const [platform, mentions] of [
      ['win32', ['setup-unsigned.exe', 'portable-unsigned.exe']],
      ['darwin', ['.dmg', 'Applications']],
      ['linux', ['sudo apt install', 'sudo dnf install', 'AppImage']],
    ] as const) {
      const notice = updateNotice(available, platform, null)!;
      expect(notice).toMatchObject({ current: '2.0.0-rc.4', latest: '2.0.0', releaseUrl: URL });
      for (const mention of mentions) expect(notice.steps.join('\n')).toContain(mention);
      expect(notice.steps.join('\n')).toContain('checksum');
    }
    expect(updateSteps('freebsd')).toHaveLength(1);
  });

  it('is dismissed for that release only, and a newer release shows again', () => {
    expect(updateNotice(available, 'linux', '2.0.0')).toBeNull();
    expect(updateNotice({ ...available, latest: '2.0.1' }, 'linux', '2.0.0')).not.toBeNull();
  });

  it(
    'remembers a dismissal in the storage of the user, and reads a storage that is missing, broken or holds junk as nothing ' + 'dismissed',
    () => {
      const storage = memory();
      const store = createUpdateNoticeStore(storage);
      store.getState().report(available);
      expect(store.getState().dismissed).toBeNull();
      store.getState().dismiss();
      expect(store.getState().dismissed).toBe('2.0.0');
      expect(storage.values.get(DISMISSED_STORAGE_KEY)).toBe('2.0.0');
      expect(createUpdateNoticeStore(storage).getState().dismissed).toBe('2.0.0');
      expect(readDismissed(undefined)).toBeNull();
      expect(
        readDismissed({
          getItem: () => {
            throw new Error('blocked');
          },
          setItem: () => undefined,
        }),
      ).toBeNull();
      expect(readDismissed({ getItem: () => '<script>', setItem: () => undefined })).toBeNull();
      expect(() =>
        writeDismissed(
          {
            getItem: () => null,
            setItem: () => {
              throw new Error('full');
            },
          },
          '2.0.0',
        ),
      ).not.toThrow();
    },
  );

  it('keeps a dismissal when the same release is reported again, and ignores a dismissal when nothing newer was reported', () => {
    const store = createUpdateNoticeStore(memory());
    store.getState().report(available);
    store.getState().dismiss();
    store.getState().report(available);
    expect(updateNotice(store.getState().result, 'linux', store.getState().dismissed)).toBeNull();
    store.getState().report({ status: 'current', current: '2.0.0', latest: '2.0.0' });
    store.getState().dismiss();
    expect(store.getState().dismissed).toBe('2.0.0');
  });
});
