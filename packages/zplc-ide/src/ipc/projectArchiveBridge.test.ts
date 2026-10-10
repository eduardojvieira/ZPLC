import { describe, expect, it } from 'bun:test';

import type { ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { archiveFailureMessage, exportArchive, extractArchive, inspectArchive } from './projectArchiveBridge';

const SUMMARY = { archiveId: 'a1', fileName: 'motor.zip', fileCount: 2, folderCount: 1, bytes: 900, files: [{ path: 'zplc.json', size: 40 }], manifest: '{}' };
const bridge = (methods: Record<string, unknown>) => methods as unknown as ProjectFilesBridge;

describe('the renderer side of the project archives', () => {
  it('is unavailable where the host has no archive operations (a browser, an older preload)', async () => {
    expect(await exportArchive(undefined, 'r1')).toEqual({ status: 'unavailable' });
    expect(await inspectArchive(bridge({}))).toEqual({ status: 'unavailable' });
    expect(await extractArchive(bridge({ exportArchive: async () => ({ ok: true, value: null }) }), 'a1')).toEqual({ status: 'unavailable' });
  });

  it('passes the id of the folder, or of the archive, and nothing else', async () => {
    const seen: unknown[] = [];
    const host = bridge({
      exportArchive: async (request: unknown) => { seen.push(request); return { ok: true, value: { fileName: 'motor.zip', fileCount: 2, folderCount: 1, bytes: 900, skipped: 0 } }; },
      extractArchive: async (request: unknown) => { seen.push(request); return { ok: true, value: { name: 'motor', fileCount: 2 } }; },
    });
    expect(await exportArchive(host, 'r1')).toEqual({ status: 'done', value: { fileName: 'motor.zip', fileCount: 2, folderCount: 1, bytes: 900, skipped: 0 } });
    expect(await extractArchive(host, 'a1')).toEqual({ status: 'done', value: { name: 'motor', fileCount: 2 } });
    expect(seen).toEqual([{ rootId: 'r1' }, { archiveId: 'a1' }]);
  });

  it('reports a cancelled dialog as cancelled, not as a failure', async () => {
    const host = bridge({ inspectArchive: async () => ({ ok: true, value: null }) });
    expect(await inspectArchive(host)).toEqual({ status: 'cancelled' });
  });

  it('reads the summary of an archive and refuses an answer that is not one', async () => {
    expect(await inspectArchive(bridge({ inspectArchive: async () => ({ ok: true, value: SUMMARY }) }))).toEqual({ status: 'done', value: SUMMARY });
    const malformed = await inspectArchive(bridge({ inspectArchive: async () => ({ ok: true, value: { archiveId: 'a1' } }) }));
    expect(malformed.status).toBe('failed');
  });

  it('turns a refusal, and a call that rejects, into a message that names no path', async () => {
    const refused = await inspectArchive(bridge({ inspectArchive: async () => ({ ok: false, code: 'unsafe-path' }) }));
    expect(refused).toEqual({ status: 'failed', message: archiveFailureMessage('unsafe-path') });
    expect(archiveFailureMessage('unsafe-path')).toContain('outside');
    const rejected = await exportArchive(bridge({ exportArchive: async () => { throw new Error('/home/u/secret/path exploded'); } }), 'r1');
    expect(rejected.status).toBe('failed');
    expect(JSON.stringify(rejected)).not.toContain('/home/u');
  });

  it('has a sentence for every code a refusal can carry', () => {
    for (const code of ['invalid-request', 'no-folder', 'not-found', 'not-empty', 'invalid-path', 'not-a-zip', 'unsupported', 'unsafe-path', 'duplicate', 'corrupt', 'too-large', 'too-many', 'denied', 'failed'] as const) {
      expect(archiveFailureMessage(code).length).toBeGreaterThan(15);
    }
  });
});
