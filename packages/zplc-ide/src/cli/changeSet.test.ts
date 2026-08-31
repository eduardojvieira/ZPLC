import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __changeSetTestHooks, createCandidateChangeSet } from './toolApi';

const motorStartStop = fileURLToPath(new URL('../../projects/motor_start_stop', import.meta.url));
const nativeRuntimeBinary = fileURLToPath(new URL('../../../../firmware/lib/zplc_core/build/zplc_runtime', import.meta.url));

async function copiedMotorWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-change-set-fixture-'));
  await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
  for (const path of ['zplc.json', 'src/Motor.st', 'tests/motor-start-stop.scenario.json']) await writeFile(join(root, path), await readFile(join(motorStartStop, path)));
  return root;
}

describe('isolated candidate change sets', () => {
  it.skipIf(!existsSync(nativeRuntimeBinary))('validates a source-only candidate without leaking or mutating its base', async () => {
    const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
    const candidateRoots: string[] = [];
    __changeSetTestHooks.afterMaterialize = (root) => { candidateRoots.push(root); };
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
    try {
      const first = await createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n(* candidate whitespace only *)\n` }]);
      const second = await createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n(* candidate whitespace only *)\n` }]);
      expect(first).toMatchObject({ accepted: true, evidenceScope: 'native-posix-host', evidence: { operation: 'test', outcome: 'passed', artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] }, savedTestInputIdentity: { schemaVersion: 1 } });
      expect(first.changeSet).toEqual(second.changeSet);
      expect(first.changeSet.changes).toEqual([{ path: 'src/Motor.st', kind: 'modify', before: expect.objectContaining({ byteLength: Buffer.byteLength(original) }), after: expect.objectContaining({ byteLength: Buffer.byteLength(`${original}\n(* candidate whitespace only *)\n`) }) }]);
      expect(await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8')).toBe(original);
      expect(candidateRoots).toHaveLength(2);
      expect(new Set(candidateRoots).size).toBe(2);
      for (const candidateRoot of candidateRoots) expect(existsSync(candidateRoot)).toBe(false);
      for (const serialized of [JSON.stringify(first), JSON.stringify(second)]) {
        for (const forbidden of [motorStartStop, ...candidateRoots, original, 'candidate whitespace only', tmpdir(), 'traceFile']) expect(serialized).not.toContain(forbidden);
      }
    } finally {
      __changeSetTestHooks.afterMaterialize = undefined;
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it('rejects invalid, hostile, no-op, or immutable-input edits before materializing', async () => {
    const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
    const oversized = 'x'.repeat(256 * 1024 + 1);
    const manifestOversized = 'x'.repeat(128 * 1024 + 1);
    const utf8ManifestOversized = 'é'.repeat(128 * 1024);
    const sparse = new Array(1);
    const extra = [{ path: 'src/Motor.st', content: 'x' }] as Array<{ path: string; content: string }> & { extra?: boolean }; extra.extra = true;
    const getter: unknown[] = []; Object.defineProperty(getter, '0', { enumerable: true, get: () => { throw new Error('must not run'); } }); getter.length = 1;
    const polluted = [Object.create({ path: 'src/Motor.st', content: 'x' })];
    const symbolic = [{ path: 'src/Motor.st', content: 'x' }]; Object.defineProperty(symbolic, Symbol('extra'), { value: true });
    const revoked = Proxy.revocable([], {}); revoked.revoke();
    for (const edits of [
      [{ path: '../src/Motor.st', content: 'x' }], [{ path: '/src/Motor.st', content: 'x' }], [{ path: 'src/Unknown.st', content: 'x' }],
      [{ path: 'tests/motor-start-stop.scenario.json', content: 'x' }], [{ path: 'src/Motor.st', content: oversized }], [{ path: 'zplc.json', content: manifestOversized }],
      [{ path: 'src/'.padEnd(513, 'x'), content: 'x' }], [{ path: 'zplc.json', content: utf8ManifestOversized }],
      [{ path: 'src/Motor.st\0', content: 'x' }], [{ path: 'src/Motor.st', content: 1 }], [], sparse, extra, getter, polluted, symbolic, revoked.proxy,
      [{ path: 'src/Motor.st', content: original }], [{ path: 'src/Motor.st', content: original }, { path: 'zplc.json', content: '{ }' }],
      [{ path: 'src/Motor.st', content: 'x' }, { path: 'src/Motor.st', content: 'y' }], [{ path: 'src/Motor.st', content: 'x' }, { path: 'src/motor.st', content: 'y' }],
    ]) await expect(createCandidateChangeSet(motorStartStop, edits)).resolves.toMatchObject({ accepted: false, diagnostics: [{ code: 'CHANGESET_INVALID' }] });
    const unavailableBase = await mkdtemp(join(tmpdir(), 'zplc-change-set-missing-'));
    await rm(unavailableBase, { recursive: true, force: true });
    await expect(createCandidateChangeSet(unavailableBase, [{ path: 'src/Motor.st', content: 'x' }])).resolves.toMatchObject({ accepted: false, diagnostics: [{ code: 'CHANGESET_BASE_INVALID' }] });
  });

  it('rejects a base that changes between bounded stable snapshots', async () => {
    const root = await copiedMotorWorkspace();
    __changeSetTestHooks.afterInitialSnapshot = async (base) => { await writeFile(join(base, 'src/Motor.st'), 'PROGRAM Motor\nEND_PROGRAM'); };
    try {
      await expect(createCandidateChangeSet(root, [{ path: 'src/Motor.st', content: 'PROGRAM Motor\nEND_PROGRAM\n(* changed *)' }])).resolves.toMatchObject({ accepted: false, diagnostics: [{ code: 'CHANGESET_BASE_INVALID' }] });
    } finally { __changeSetTestHooks.afterInitialSnapshot = undefined; await rm(root, { recursive: true, force: true }); }
  });

  it.skipIf(!existsSync(nativeRuntimeBinary))('cleans the owned temporary directory and fails closed when cleanup reports a fault', async () => {
    const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
    let candidateRoot = '';
    __changeSetTestHooks.afterMaterialize = (root) => { candidateRoot = root; throw new Error('test seam'); };
    try {
      await expect(createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }])).resolves.toMatchObject({ accepted: false, diagnostics: [{ code: 'CHANGESET_MATERIALIZATION_FAILED' }] });
      expect(existsSync(candidateRoot)).toBe(false);
    } finally { __changeSetTestHooks.afterMaterialize = undefined; }
    __changeSetTestHooks.afterMaterialize = (root) => { candidateRoot = root; };
    __changeSetTestHooks.afterCleanupAttempt = () => { throw new Error('test cleanup seam'); };
    try {
      await expect(createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }])).resolves.toMatchObject({ accepted: false, diagnostics: [{ code: 'CHANGESET_CLEANUP_FAILED' }] });
      expect(existsSync(candidateRoot)).toBe(false);
    } finally {
      __changeSetTestHooks.afterMaterialize = undefined; __changeSetTestHooks.afterCleanupAttempt = undefined;
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  });

  it.skipIf(!existsSync(nativeRuntimeBinary))('does not accept assertion failures, cancellation, or timeout as successful evidence', async () => {
    const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
    try {
      const breaking = await createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: original.replace('Forward := SealIn;', 'Forward := FALSE;') }]);
      expect(breaking).toMatchObject({ accepted: false, evidence: { outcome: 'failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED' }], artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] } });
      const controller = new AbortController(); controller.abort();
      await expect(createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }], { signal: controller.signal })).resolves.toMatchObject({ accepted: false, evidence: { diagnostics: [{ code: 'TEST_CANCELLED' }] } });
      await expect(createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }], { timeoutMs: 0 })).resolves.toMatchObject({ accepted: false, evidence: { diagnostics: [{ code: 'TEST_TIMEOUT' }] } });
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);
});
