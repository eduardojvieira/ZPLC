import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __changeSetTestHooks, createCandidateChangeSet } from './toolApi';
import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';

const motorStartStop = fileURLToPath(new URL('../../projects/motor_start_stop', import.meta.url));

async function copiedMotorWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-change-set-fixture-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  for (const path of ['zplc.json', 'src/Motor.st', 'tests/motor-start-stop.scenario.json'])
    await writeFile(join(root, path), await readFile(join(motorStartStop, path)));
  return root;
}

describe('isolated candidate change sets (IDE-030)', () => {
  itNative(
    'validates a source-only candidate without leaking or mutating its base',
    async () => {
      const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
      const candidateRoots: string[] = [];
      __changeSetTestHooks.afterMaterialize = (root) => {
        candidateRoots.push(root);
      };
      const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      try {
        const first = await createCandidateChangeSet(motorStartStop, [
          { path: 'src/Motor.st', content: `${original}\n(* candidate whitespace only *)\n` },
        ]);
        const second = await createCandidateChangeSet(motorStartStop, [
          { path: 'src/Motor.st', content: `${original}\n(* candidate whitespace only *)\n` },
        ]);
        expect(first).toMatchObject({
          accepted: true,
          evidenceScope: 'native-posix-host',
          evidence: { operation: 'test', outcome: 'passed', artifacts: [{ kind: 'zplc' }, { kind: 'trace' }] },
          savedTestInputIdentity: { schemaVersion: 1 },
        });
        expect(first.changeSet).toEqual(second.changeSet);
        expect(first.changeSet?.changes).toEqual([
          {
            path: 'src/Motor.st',
            kind: 'modify',
            before: expect.objectContaining({ byteLength: Buffer.byteLength(original) }),
            after: expect.objectContaining({ byteLength: Buffer.byteLength(`${original}\n(* candidate whitespace only *)\n`) }),
          },
        ]);
        expect(await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8')).toBe(original);
        expect(candidateRoots).toHaveLength(2);
        expect(new Set(candidateRoots).size).toBe(2);
        for (const candidateRoot of candidateRoots) expect(existsSync(candidateRoot)).toBe(false);
        for (const serialized of [JSON.stringify(first), JSON.stringify(second)]) {
          for (const forbidden of [motorStartStop, ...candidateRoots, original, 'candidate whitespace only', tmpdir(), 'traceFile'])
            expect(serialized).not.toContain(forbidden);
        }
      } finally {
        __changeSetTestHooks.afterMaterialize = undefined;
        if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      }
    },
    30_000,
  );

  it('rejects invalid, hostile, no-op, or immutable-input edits before materializing', async () => {
    const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
    const oversized = 'x'.repeat(256 * 1024 + 1);
    const manifestOversized = 'x'.repeat(128 * 1024 + 1);
    const utf8ManifestOversized = 'é'.repeat(128 * 1024);
    const sparse = new Array(1);
    const extra = [{ path: 'src/Motor.st', content: 'x' }] as Array<{ path: string; content: string }> & { extra?: boolean };
    extra.extra = true;
    const getter: unknown[] = [];
    Object.defineProperty(getter, '0', {
      enumerable: true,
      get: () => {
        throw new Error('must not run');
      },
    });
    getter.length = 1;
    const polluted = [Object.create({ path: 'src/Motor.st', content: 'x' })];
    const symbolic = [{ path: 'src/Motor.st', content: 'x' }];
    Object.defineProperty(symbolic, Symbol('extra'), { value: true });
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    for (const edits of [
      [{ path: '../src/Motor.st', content: 'x' }],
      [{ path: '/src/Motor.st', content: 'x' }],
      [{ path: 'lib/Unknown.st', content: 'x' }],
      [{ path: 'src/sub/Unknown.st', content: 'x' }],
      [{ path: 'src/Unknown.gvl', content: 'x' }],
      [{ path: 'src/MOTOR.ST', content: 'x' }],
      [{ path: 'tests/motor-start-stop.scenario.json', content: 'x' }],
      [{ path: 'src/Motor.st', content: oversized }],
      [{ path: 'zplc.json', content: manifestOversized }],
      [{ path: 'src/'.padEnd(513, 'x'), content: 'x' }],
      [{ path: 'zplc.json', content: utf8ManifestOversized }],
      [{ path: 'src/Motor.st\0', content: 'x' }],
      [{ path: 'src/Motor.st', content: 1 }],
      [],
      sparse,
      extra,
      getter,
      polluted,
      symbolic,
      revoked.proxy,
      [{ path: 'src/Motor.st', content: original }],
      [
        { path: 'src/Motor.st', content: original },
        { path: 'zplc.json', content: '{ }' },
      ],
      [
        { path: 'src/Motor.st', content: 'x' },
        { path: 'src/Motor.st', content: 'y' },
      ],
      [
        { path: 'src/Motor.st', content: 'x' },
        { path: 'src/motor.st', content: 'y' },
      ],
    ])
      await expect(createCandidateChangeSet(motorStartStop, edits)).resolves.toMatchObject({
        accepted: false,
        diagnostics: [{ code: 'CHANGESET_INVALID' }],
      });
    const unavailableBase = await mkdtemp(join(tmpdir(), 'zplc-change-set-missing-'));
    await rm(unavailableBase, { recursive: true, force: true });
    await expect(createCandidateChangeSet(unavailableBase, [{ path: 'src/Motor.st', content: 'x' }])).resolves.toMatchObject({
      accepted: false,
      diagnostics: [{ code: 'CHANGESET_BASE_INVALID' }],
    });
  });

  it('rejects a base that changes between bounded stable snapshots', async () => {
    const root = await copiedMotorWorkspace();
    __changeSetTestHooks.afterInitialSnapshot = async (base) => {
      await writeFile(join(base, 'src/Motor.st'), 'PROGRAM Motor\nEND_PROGRAM');
    };
    try {
      await expect(
        createCandidateChangeSet(root, [{ path: 'src/Motor.st', content: 'PROGRAM Motor\nEND_PROGRAM\n(* changed *)' }]),
      ).resolves.toMatchObject({ accepted: false, diagnostics: [{ code: 'CHANGESET_BASE_INVALID' }] });
    } finally {
      __changeSetTestHooks.afterInitialSnapshot = undefined;
      await rm(root, { recursive: true, force: true });
    }
  });

  itNative('cleans the owned temporary directory and fails closed when cleanup reports a fault', async () => {
    const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
    let candidateRoot = '';
    __changeSetTestHooks.afterMaterialize = (root) => {
      candidateRoot = root;
      throw new Error('test seam');
    };
    try {
      await expect(createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }])).resolves.toMatchObject({
        accepted: false,
        diagnostics: [{ code: 'CHANGESET_MATERIALIZATION_FAILED' }],
      });
      expect(existsSync(candidateRoot)).toBe(false);
    } finally {
      __changeSetTestHooks.afterMaterialize = undefined;
    }
    __changeSetTestHooks.afterMaterialize = (root) => {
      candidateRoot = root;
    };
    __changeSetTestHooks.afterCleanupAttempt = () => {
      throw new Error('test cleanup seam');
    };
    try {
      await expect(createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }])).resolves.toMatchObject({
        accepted: false,
        diagnostics: [{ code: 'CHANGESET_CLEANUP_FAILED' }],
      });
      expect(existsSync(candidateRoot)).toBe(false);
    } finally {
      __changeSetTestHooks.afterMaterialize = undefined;
      __changeSetTestHooks.afterCleanupAttempt = undefined;
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  });

  itNative(
    'does not accept assertion failures, cancellation, or timeout as successful evidence',
    async () => {
      const original = await readFile(join(motorStartStop, 'src/Motor.st'), 'utf8');
      const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      try {
        const breaking = await createCandidateChangeSet(motorStartStop, [
          { path: 'src/Motor.st', content: original.replace('Forward := SealIn;', 'Forward := FALSE;') },
        ]);
        expect(breaking).toMatchObject({
          accepted: false,
          evidence: {
            outcome: 'failed',
            diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED' }],
            artifacts: [{ kind: 'zplc' }, { kind: 'trace' }],
          },
        });
        const controller = new AbortController();
        controller.abort();
        await expect(
          createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }], { signal: controller.signal }),
        ).resolves.toMatchObject({ accepted: false, evidence: { diagnostics: [{ code: 'TEST_CANCELLED' }] } });
        await expect(
          createCandidateChangeSet(motorStartStop, [{ path: 'src/Motor.st', content: `${original}\n` }], { timeoutMs: 0 }),
        ).resolves.toMatchObject({ accepted: false, evidence: { diagnostics: [{ code: 'TEST_TIMEOUT' }] } });
      } finally {
        if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
      }
    },
    30_000,
  );

  describe('a program is created together with the project that names it, and the manifest never takes a credential (S5)', () => {
    const lamp = 'PROGRAM Lamp\nVAR_OUTPUT\n    Lit AT %Q0.4 : BOOL;\nEND_VAR\nLit := TRUE;\nEND_PROGRAM\n';
    // a task runs exactly one program, so a new program comes with a task of its own
    const withLamp = async (manifest: string) =>
      manifest.replace(
        '"programs": ["Motor.st"]\n    }',
        '"programs": ["Motor.st"]\n    },\n    { "name": "LampTask", "trigger": "cyclic", "interval_ms": 10, "priority": 2, "programs": ' +
          '["Lamp.st"] }',
      );

    itNative(
      'accepts a new program with its task entry, reports it as created, and writes nothing to the base',
      async () => {
        const root = await copiedMotorWorkspace();
        const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
        process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
        try {
          const manifest = await withLamp(await readFile(join(root, 'zplc.json'), 'utf8'));
          const result = await createCandidateChangeSet(root, [
            { path: 'src/Lamp.st', content: lamp },
            { path: 'zplc.json', content: manifest },
          ]);
          expect(result).toMatchObject({ accepted: true, evidenceScope: 'native-posix-host' });
          expect(result.changeSet?.changes).toEqual([
            {
              path: 'src/Lamp.st',
              kind: 'create',
              after: { sha256: expect.stringMatching(/^[0-9a-f]{64}$/), byteLength: Buffer.byteLength(lamp) },
            },
            {
              path: 'zplc.json',
              kind: 'modify',
              before: expect.objectContaining({ byteLength: expect.any(Number) }),
              after: expect.objectContaining({ byteLength: Buffer.byteLength(manifest) }),
            },
          ]);
          expect(existsSync(join(root, 'src/Lamp.st'))).toBe(false);
          expect(await readFile(join(root, 'zplc.json'), 'utf8')).not.toContain('Lamp.st');
        } finally {
          if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
          else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
          await rm(root, { recursive: true, force: true });
        }
      },
      30_000,
    );

    itNative(
      'does not accept a new program the build cannot compile, and still reports what it would create',
      async () => {
        const root = await copiedMotorWorkspace();
        const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
        process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
        try {
          const manifest = await withLamp(await readFile(join(root, 'zplc.json'), 'utf8'));
          const broken = await createCandidateChangeSet(root, [
            { path: 'src/Lamp.st', content: 'PROGRAM Lamp\nLit := ;\nEND_PROGRAM\n' },
            { path: 'zplc.json', content: manifest },
          ]);
          expect(broken.accepted).toBe(false);
          expect(broken.changeSet?.changes[0]).toMatchObject({ path: 'src/Lamp.st', kind: 'create' });
        } finally {
          if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
          else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
          await rm(root, { recursive: true, force: true });
        }
      },
      30_000,
    );

    it('refuses a creation that the build reads as an existing program, one too many, and a manifest that adds a credential', async () => {
      const root = await copiedMotorWorkspace();
      try {
        await writeFile(join(root, 'src/Pump.ld.json'), '{}');
        const manifest = await readFile(join(root, 'zplc.json'), 'utf8');
        const sensitive = manifest.replace('"tasks"', '"network": { "wifi": { "password": "hunter2" } }, "tasks"');
        const clientKey = manifest.replace('"tasks"', '"communication": { "mqtt": { "clientKeyPath": "/k" } }, "tasks"');
        for (const [edits, code] of [
          [[{ path: 'src/pump.ld.json', content: '{}' }], 'CHANGESET_INVALID'],
          [[{ path: 'src/Pump.ld', content: '{}' }], 'CHANGESET_INVALID'],
          [[{ path: 'src/MOTOR.st', content: 'x' }], 'CHANGESET_INVALID'],
          [['A', 'B', 'C', 'D', 'E'].map((name) => ({ path: `src/${name}.st`, content: lamp })), 'CHANGESET_INVALID'],
          [[{ path: 'zplc.json', content: sensitive }], 'CHANGESET_SENSITIVE_FIELD'],
          [[{ path: 'zplc.json', content: clientKey }], 'CHANGESET_SENSITIVE_FIELD'],
        ] as const) {
          const result = await createCandidateChangeSet(root, edits);
          expect(result, JSON.stringify(edits.map((edit) => edit.path))).toMatchObject({ accepted: false, diagnostics: [{ code }] });
          expect(JSON.stringify(result)).not.toContain('hunter2');
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});
