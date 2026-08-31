import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { lstat, mkdir, mkdtemp, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFirmwareBuild } from './firmwareBuildRunner';

class FakeChild extends EventEmitter {
  stdout = new PassThrough(); stderr = new PassThrough(); pid = undefined;
  kill(): boolean { return true; }
}

function validElf32(littleEndian = true): Buffer {
  const elf = Buffer.alloc(52); elf.set([0x7f, 0x45, 0x4c, 0x46, 1, littleEndian ? 1 : 2, 1]);
  const write16 = littleEndian ? Buffer.prototype.writeUInt16LE : Buffer.prototype.writeUInt16BE;
  const write32 = littleEndian ? Buffer.prototype.writeUInt32LE : Buffer.prototype.writeUInt32BE;
  write16.call(elf, 2, 16); write16.call(elf, 3, 18); write32.call(elf, 1, 20); write16.call(elf, 52, 40);
  return elf;
}
function validElf64BigEndian(): Buffer {
  const elf = Buffer.alloc(64); elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 2, 1]); elf.writeUInt16BE(3, 16); elf.writeUInt16BE(183, 18); elf.writeUInt32BE(1, 20); elf.writeUInt16BE(64, 52);
  return elf;
}

describe('runFirmwareBuild', () => {
  it('uses only fixed west argv, hashes the ELF, and never runs catalog text', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); let observed: unknown;
    try {
      const result = await runFirmwareBuild(root, 'safe/board', { spawnProcess: (_command, args, options) => {
        observed = { args, options }; const child = new FakeChild(); const out = args[args.indexOf('-d') + 1] as string;
        void (async () => { await mkdir(join(out, 'zephyr'), { recursive: true }); await writeFile(join(out, 'zephyr', 'zephyr.elf'), validElf32()); child.stdout.end('ok'); child.stderr.end(); child.emit('close', 0); })(); return child as never;
      } });
      expect(result).toMatchObject({ ok: true, artifact: { byteLength: 52, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }, output: { stdoutBytes: 2, stderrBytes: 0, truncated: false } });
      expect(observed).toMatchObject({ args: ['build', '-b', 'safe/board', 'firmware/app', '-d', expect.any(String), '--pristine'], options: { cwd: root, shell: false, detached: true, windowsHide: true } });
      expect(JSON.stringify(observed)).not.toContain('build_command');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('fails closed before spawn on unsupported hosts or cancelled admission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); let calls = 0; let temporaryDirectories = 0; const controller = new AbortController(); controller.abort();
    try {
      const options = { spawnProcess: (() => { calls += 1; throw new Error('spawn'); }) as never, makeTempDirectory: async () => { temporaryDirectories += 1; throw new Error('must not allocate'); } };
      await expect(runFirmwareBuild(root, 'board', { ...options, platform: 'win32' })).resolves.toMatchObject({ ok: false, failure: 'unavailable' });
      await expect(runFirmwareBuild(root, 'board', { ...options, signal: controller.signal })).resolves.toMatchObject({ ok: false, failure: 'cancelled' });
      expect(calls).toBe(0); expect(temporaryDirectories).toBe(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('accepts a complete big-endian ELF64 header', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-'));
    try {
      const result = await runFirmwareBuild(root, 'board', { spawnProcess: (_command, args) => {
        const child = new FakeChild(); const out = args[args.indexOf('-d') + 1] as string;
        void (async () => { await mkdir(join(out, 'zephyr'), { recursive: true }); await writeFile(join(out, 'zephyr', 'zephyr.elf'), validElf64BigEndian()); child.emit('close', 0); })(); return child as never;
      } });
      expect(result).toMatchObject({ ok: true, artifact: { byteLength: 64 } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('observes abort after creating its owned directory and before spawn', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); const owned = await mkdtemp(join(tmpdir(), 'zplc-runner-owned-')); const controller = new AbortController(); let calls = 0;
    try {
      const result = await runFirmwareBuild(root, 'board', { signal: controller.signal, makeTempDirectory: async () => { controller.abort(); return owned; }, spawnProcess: (() => { calls += 1; throw new Error('must not spawn'); }) as never });
      expect(result).toMatchObject({ ok: false, failure: 'cancelled' }); expect(calls).toBe(0); await expect(lstat(owned)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); await rm(owned, { recursive: true, force: true }); }
  });

  it('waits for close before cleanup and rejects linked artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); let directory = ''; let removeBeforeClose = false; let closed = false;
    try {
      const result = await runFirmwareBuild(root, 'board', { remove: (async (path, options) => { removeBeforeClose ||= !closed; return rm(path, options); }) as typeof rm, spawnProcess: (_command, args) => {
        const child = new FakeChild(); directory = args[args.indexOf('-d') + 1] as string;
        void (async () => { await mkdir(join(directory, 'zephyr'), { recursive: true }); await writeFile(join(directory, 'outside'), 'elf'); await symlink(join(directory, 'outside'), join(directory, 'zephyr', 'zephyr.elf')); closed = true; child.stdout.end(); child.stderr.end(); child.emit('close', 0); })(); return child as never;
      } });
      expect(result).toMatchObject({ ok: false, failure: 'artifact-invalid' }); expect(removeBeforeClose).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps ownership through abort, leader close, group termination, and cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); const controller = new AbortController(); const signals: string[] = []; let alive = true; let directory = ''; let removed = false;
    try {
      const pending = runFirmwareBuild(root, 'board', { signal: controller.signal, killGraceMs: 1, pollMs: 1, isGroupAlive: () => alive, sendGroupSignal: (_pid, signal) => signals.push(signal), remove: (async (path, options) => { removed = true; return rm(path, options); }) as typeof rm, spawnProcess: (_command, args) => {
        const child = new FakeChild(); directory = args[args.indexOf('-d') + 1] as string; controller.abort(); setTimeout(() => { child.stdout.write('late'); child.emit('close', 0); }, 1); return child as never;
      } });
      await new Promise((resolve) => setTimeout(resolve, 8)); expect(removed).toBe(false); expect((await lstat(directory)).isDirectory()).toBe(true); expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
      alive = false; await expect(pending).resolves.toMatchObject({ ok: false, failure: 'cancelled', output: { stdoutBytes: 4 } }); expect(removed).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('makes output limit first-wins while still draining until close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); const signals: string[] = [];
    try {
      const pending = runFirmwareBuild(root, 'board', { outputLimit: 1, killGraceMs: 1, sendGroupSignal: (_pid, signal) => signals.push(signal), isGroupAlive: () => false, spawnProcess: () => {
        const child = new FakeChild(); setTimeout(() => { child.stdout.write('ab'); child.stderr.write('cd'); child.emit('close', 1); }, 1); return child as never;
      } });
      await expect(pending).resolves.toMatchObject({ ok: false, failure: 'output-limit', output: { stdoutBytes: 2, stderrBytes: 2, truncated: true } }); expect(signals[0]).toBe('SIGTERM');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps timed-out groups and owned output until the group is gone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); const signals: string[] = []; let alive = true; let removed = false; let directory = '';
    try {
      const pending = runFirmwareBuild(root, 'board', { timeoutMs: 1, killGraceMs: 1, pollMs: 1, isGroupAlive: () => alive, sendGroupSignal: (_pid, signal) => signals.push(signal), remove: (async (path, options) => { removed = true; return rm(path, options); }) as typeof rm, spawnProcess: (_command, args) => {
        const child = new FakeChild(); directory = args[args.indexOf('-d') + 1] as string; setTimeout(() => child.emit('close', 0), 2); return child as never;
      } });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(signals).toEqual(['SIGTERM', 'SIGKILL']); expect(removed).toBe(false); expect((await lstat(directory)).isDirectory()).toBe(true);
      alive = false;
      await expect(pending).resolves.toMatchObject({ ok: false, failure: 'timeout' }); expect(removed).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('turns a successful leader close with remaining group members into a failed build', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); const signals: string[] = []; let alive = true; let removed = false; let directory = '';
    try {
      const pending = runFirmwareBuild(root, 'board', { killGraceMs: 1, pollMs: 1, isGroupAlive: () => alive, sendGroupSignal: (_pid, signal) => signals.push(signal), remove: (async (path, options) => { removed = true; return rm(path, options); }) as typeof rm, spawnProcess: (_command, args) => {
        const child = new FakeChild(); directory = args[args.indexOf('-d') + 1] as string; setTimeout(() => child.emit('close', 0), 1); return child as never;
      } });
      await new Promise((resolve) => setTimeout(resolve, 8));
      expect(signals).toEqual(['SIGTERM', 'SIGKILL']); expect(removed).toBe(false); expect((await lstat(directory)).isDirectory()).toBe(true);
      alive = false;
      await expect(pending).resolves.toMatchObject({ ok: false, failure: 'failed' }); expect(removed).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('maps spawn, error, and nonzero process failures without early cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-'));
    try {
      await expect(runFirmwareBuild(root, 'board', { spawnProcess: (() => { throw new Error('spawn'); }) as never })).resolves.toMatchObject({ ok: false, failure: 'unavailable' });
      let removed = false; let closed = false;
      const errorResult = await runFirmwareBuild(root, 'board', { isGroupAlive: () => false, remove: (async (path, options) => { removed ||= !closed; return rm(path, options); }) as typeof rm, spawnProcess: () => {
        const child = new FakeChild(); setTimeout(() => { child.emit('error', new Error('missing')); closed = true; child.emit('close', 1); }, 1); return child as never;
      } });
      expect(errorResult).toMatchObject({ ok: false, failure: 'unavailable' }); expect(removed).toBe(false);
      await expect(runFirmwareBuild(root, 'board', { isGroupAlive: () => false, spawnProcess: () => { const child = new FakeChild(); setTimeout(() => child.emit('close', 2), 1); return child as never; } })).resolves.toMatchObject({ ok: false, failure: 'failed' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not remove replaced output directories and reports cleanup failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); const orphan = await mkdtemp(join(tmpdir(), 'zplc-runner-orphan-')); let removed = 0; let replacement = '';
    try {
      const result = await runFirmwareBuild(root, 'board', { isGroupAlive: () => false, remove: (async () => { removed += 1; }) as typeof rm, spawnProcess: (_command, args) => {
        const child = new FakeChild(); const out = args[args.indexOf('-d') + 1] as string;
        void (async () => { await rename(out, join(orphan, 'original')); await mkdir(out); replacement = out; child.emit('close', 0); })(); return child as never;
      } });
      expect(result).toMatchObject({ ok: false, failure: 'cleanup-failed' }); expect(removed).toBe(0); expect((await lstat(replacement)).isDirectory()).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); await rm(orphan, { recursive: true, force: true }); if (replacement) await rm(replacement, { recursive: true, force: true }); }
  });

  it('reports an owned-directory removal failure after the process settles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-'));
    try {
      await expect(runFirmwareBuild(root, 'board', { isGroupAlive: () => false, remove: (async () => { throw new Error('no cleanup'); }) as typeof rm, spawnProcess: () => { const child = new FakeChild(); setTimeout(() => child.emit('close', 1), 1); return child as never; } })).resolves.toMatchObject({ ok: false, failure: 'cleanup-failed' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps stream errors owned until the leader and process group exit', async () => {
    for (const stream of ['stdout', 'stderr'] as const) {
      const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-')); const signals: string[] = []; let alive = true; let removed = false; let directory = '';
      try {
        const pending = runFirmwareBuild(root, 'board', { killGraceMs: 1, pollMs: 1, isGroupAlive: () => alive, sendGroupSignal: (_pid, signal) => signals.push(signal), remove: (async (path, options) => { removed = true; return rm(path, options); }) as typeof rm, spawnProcess: (_command, args) => {
          const child = new FakeChild(); directory = args[args.indexOf('-d') + 1] as string; setTimeout(() => { child[stream].emit('error', new Error(`${stream} failed`)); child.emit('close', 0); }, 1); return child as never;
        } });
        await new Promise((resolve) => setTimeout(resolve, 8));
        expect(signals).toEqual(['SIGTERM', 'SIGKILL']); expect(removed).toBe(false); expect((await lstat(directory)).isDirectory()).toBe(true);
        alive = false;
        await expect(pending).resolves.toMatchObject({ ok: false, failure: 'failed' }); expect(removed).toBe(true);
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  it('rejects malformed, linked, absent, empty, and oversized output artifacts', async () => {
    const cases = ['missing', 'empty', 'text', 'short', 'ident-only', 'truncated-header', 'magic', 'class', 'data', 'version', 'type', 'machine', 'header-version', 'ehsize', 'final-link', 'parent-link', 'oversized'] as const;
    for (const kind of cases) {
      const root = await mkdtemp(join(tmpdir(), 'zplc-runner-root-'));
      try {
        const result = await runFirmwareBuild(root, 'board', { isGroupAlive: () => false, sendGroupSignal: () => {}, spawnProcess: (_command, args) => {
          const child = new FakeChild(); const out = args[args.indexOf('-d') + 1] as string;
          void (async () => { await mkdir(join(out, 'zephyr'), { recursive: true }); const elf = join(out, 'zephyr', 'zephyr.elf'); const valid = validElf32();
            if (kind !== 'missing') await writeFile(elf, kind === 'empty' ? Buffer.alloc(0) : kind === 'text' ? 'not elf' : kind === 'short' ? valid.subarray(0, 7) : kind === 'ident-only' ? valid.subarray(0, 16) : kind === 'truncated-header' ? valid.subarray(0, 51) : valid);
            if (kind === 'magic') await writeFile(elf, Buffer.from([0, ...valid.subarray(1)])); if (kind === 'class') await writeFile(elf, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 3, 1, 1])); if (kind === 'data') { const bytes = validElf32(); bytes[5] = 3; await writeFile(elf, bytes); } if (kind === 'version') { const bytes = validElf32(); bytes[6] = 2; await writeFile(elf, bytes); }
            if (kind === 'type') { const bytes = validElf32(); bytes[16] = 1; await writeFile(elf, bytes); } if (kind === 'machine') { const bytes = validElf32(); bytes[18] = 0; await writeFile(elf, bytes); } if (kind === 'header-version') { const bytes = validElf32(); bytes[20] = 2; await writeFile(elf, bytes); } if (kind === 'ehsize') { const bytes = validElf32(); bytes[40] = 51; await writeFile(elf, bytes); }
            if (kind === 'final-link') { await rm(elf); await symlink(join(out, 'outside'), elf); } if (kind === 'parent-link') { await rm(join(out, 'zephyr'), { recursive: true }); await symlink(join(out, 'outside'), join(out, 'zephyr')); } if (kind === 'oversized') await truncate(elf, 64 * 1024 * 1024 + 1); child.emit('close', 0); })(); return child as never;
        } }); expect(result).toMatchObject({ ok: false, failure: 'artifact-invalid' });
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });
});
