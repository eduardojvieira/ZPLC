import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { verifyReproducibleLinuxPayloads } from './verify-reproducible-linux-payload';

function writePayload(root: string, suffix: string, app = 'app', runtimeTail = 0): void {
  const resources = join(root, 'dist-electron', `zplc-ide-linux-x64-${suffix}-unpacked`, 'resources');
  const runtime = join(resources, 'native-runtime', 'zplc_runtime');
  mkdirSync(join(resources, 'native-runtime'), { recursive: true });
  writeFileSync(join(resources, 'app.asar'), app);
  const header = new Uint8Array(20);
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  new DataView(header.buffer).setUint16(18, 0x3e, true);
  writeFileSync(runtime, new Uint8Array([...header, runtimeTail]));
  chmodSync(runtime, 0o755);
}

function withPair(run: (first: string, second: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'zplc-repro-payload-'));
  return run(join(root, 'first'), join(root, 'second')).finally(() => rmSync(root, { recursive: true, force: true }));
}

test('accepts byte-identical Linux x64 packaged payloads', async () => {
  await withPair(async (first, second) => {
    writePayload(first, 'first');
    writePayload(second, 'second');
    await expect(verifyReproducibleLinuxPayloads(first, second)).resolves.toEqual({
      appAsarSha256: expect.any(String),
      runtimeSha256: expect.any(String),
    });
  });
});

test('rejects a mismatched payload and unsafe or ambiguous resources', async () => {
  await withPair(async (first, second) => {
    writePayload(first, 'first');
    writePayload(second, 'second', 'changed');
    await expect(verifyReproducibleLinuxPayloads(first, second)).rejects.toThrow('app.asar hash mismatch');

    writePayload(second, 'extra');
    await expect(verifyReproducibleLinuxPayloads(first, second)).rejects.toThrow('exactly one unpacked Linux payload');
  });

  await withPair(async (first, second) => {
    writePayload(first, 'first');
    writePayload(second, 'second');
    const appAsar = join(second, 'dist-electron', 'zplc-ide-linux-x64-second-unpacked', 'resources', 'app.asar');
    try {
      symlinkSync(appAsar, `${appAsar}.linked`);
      rmSync(appAsar);
      symlinkSync(`${appAsar}.linked`, appAsar);
    } catch {
      return;
    }
    await expect(verifyReproducibleLinuxPayloads(first, second)).rejects.toThrow('missing packaged app.asar');
  });
});
