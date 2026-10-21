// A program is sent to the native simulation as one JSON line with the whole .zplc file in hex. The IDE security gate, the
// runtime's request buffer and its stdin reader used to stop it at about 4 KB; these tests pin the limit at what the VM takes
// (ZPLC_MEM_CODE_SIZE) and the message of the first byte over it. The runtime tests drive the real zplc_runtime binary.
import { describe, expect, it, mock } from 'bun:test';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { createZplcFile } from '@zplc/compiler';

import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { isAllowedNativeSimulationRequest, NATIVE_PROGRAM_MAX_BYTES } from '../../electron/security';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';
import { bytesToHex } from './debugAdapter';
import { NativeAdapter } from './nativeAdapter';

const OPI_BASE = 0x1000;
const WORK_BASE = 0x2000;
const OP_NOP = 0x00;
const OP_HALT = 0x01;
const OP_STORE32 = 0x86;
const OP_PUSH32 = 0xc0;

const tooLarge = (bytes: number) =>
  `the program is ${bytes} bytes, but the native simulation loads at most ${NATIVE_PROGRAM_MAX_BYTES} bytes`;

/** A .zplc file of exactly `totalSize` bytes whose first scan stores 7 in the first output byte, then idles to HALT. */
function programOfSize(totalSize: number): Uint8Array {
  // the header, the segment entries of CODE and BUILD, and the 4 bytes of the build identity (CMP-056)
  const headerSegmentTableAndBuild = 32 + 2 * 8 + 4;
  const code = new Uint8Array(totalSize - headerSegmentTableAndBuild).fill(OP_NOP);
  code.set([OP_PUSH32, 7, 0, 0, 0, OP_STORE32, OPI_BASE & 0xff, OPI_BASE >> 8]);
  code[code.length - 1] = OP_HALT;
  const file = createZplcFile(code, 0);
  expect(file.length).toBe(totalSize);
  return file;
}

/** About 12 KB of bytecode: X and Y change on every scan. */
function bigStructuredText(): string {
  const body: string[] = [];
  for (let step = 0; step < 700; step += 1) {
    body.push(`  X := X + ${(step % 7) + 1};`, `  Y := X - ${(step % 5) + 1};`);
  }
  return ['PROGRAM Big', 'VAR', '  X : DINT;', '  Y : DINT;', 'END_VAR', ...body, 'END_PROGRAM', ''].join('\n');
}

async function waitFor<T>(read: () => Promise<T | undefined> | T | undefined, what: string, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = mock(() => true);
}

function lineReader(stream: PassThrough): () => Promise<string> {
  let buffered = '';
  const waiting: Array<() => void> = [];
  stream.on('data', (chunk: Buffer) => {
    buffered += chunk.toString();
    waiting.splice(0).forEach((wake) => wake());
  });
  return async () => {
    for (;;) {
      const end = buffered.indexOf('\n');
      if (end >= 0) {
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 1);
        return line;
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
  };
}

describe('NativeSimulationSupervisor with a program as large as the VM takes', () => {
  it('writes the whole request line to the runtime and reports its refusal in plain words', async () => {
    const child = new FakeChild();
    const readLine = lineReader(child.stdin);
    const supervisor = new NativeSimulationSupervisor({ clientName: 'test', clientVersion: '0', spawnProcess: () => child });
    const starting = supervisor.startSession();
    const hello = JSON.parse(await readLine()) as { id: string };
    child.stdout.write(
      `${JSON.stringify({
        id: hello.id,
        type: 'response',
        result: {
          protocol_version: '1.0',
          runtime_kind: 'native-posix',
          runtime_version: '2',
          capability_profile: { profile_id: 'p', features: [] },
        },
      })}\n`,
    );
    await starting;

    const request = {
      id: 'native-1',
      type: 'request' as const,
      method: 'program.load',
      params: { bytecode_hex: 'AB'.repeat(NATIVE_PROGRAM_MAX_BYTES) },
    };
    expect(isAllowedNativeSimulationRequest(request)).toBe(true);
    const pending = supervisor.request(request);
    const line = await readLine();
    expect(line).toBe(JSON.stringify(request));
    expect(line.length).toBeGreaterThan(NATIVE_PROGRAM_MAX_BYTES * 2);

    child.stdout.write(
      `${JSON.stringify({
        id: request.id,
        type: 'response',
        error: { code: 'PROGRAM_LOAD_FAILED', message: tooLarge(NATIVE_PROGRAM_MAX_BYTES + 1) },
      })}\n`,
    );
    await expect(pending).rejects.toThrow(tooLarge(NATIVE_PROGRAM_MAX_BYTES + 1));
    child.stdin.end();
    child.stdout.end();
    child.stderr.end();
  });
});

describe('native simulation of a large program', () => {
  async function withSession<T>(
    run: (session: { adapter: NativeAdapter; supervisor: NativeSimulationSupervisor }) => Promise<T>,
  ): Promise<T> {
    const persistRoot = await mkdtemp(join(tmpdir(), 'zplc-large-program-'));
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-large-program-test',
      clientVersion: '0',
      environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persistRoot },
    });
    // The Electron main process validates every request before it reaches the supervisor.
    const adapter = new NativeAdapter({
      startSession: () => supervisor.startSession(),
      stopSession: () => supervisor.stopSession(),
      request: async (request) => {
        if (!isAllowedNativeSimulationRequest(request)) throw new Error('Request denied');
        return supervisor.request(request) as never;
      },
    });
    try {
      await adapter.connect();
      return await run({ adapter, supervisor });
    } finally {
      await adapter.disconnect().catch(() => undefined);
      await supervisor.stopSession().catch(() => undefined);
      await rm(persistRoot, { recursive: true, force: true });
    }
  }

  itNative(
    'loads, starts and runs a compiled program of about 12 KB',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'zplc-large-project-'));
      try {
        await mkdir(join(root, 'src'));
        await writeFile(
          join(root, 'zplc.json'),
          JSON.stringify({
            schemaVersion: 2,
            name: 'Big',
            version: '1.0.0',
            target: { board: 'posix' },
            tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Big.st'] }],
          }),
        );
        await writeFile(join(root, 'src', 'Big.st'), bigStructuredText());
        const compiled = await compilerCompile(root);
        expect(compiled.ok).toBe(true);
        const artifact = (compiled as unknown as { zplcFile: Uint8Array }).zplcFile;
        // More than the 4 KB of bytecode the old 8 KiB request buffer could carry, well under the VM's limit.
        expect(artifact.length).toBeGreaterThan(10_000);
        expect(artifact.length).toBeLessThan(NATIVE_PROGRAM_MAX_BYTES);

        await withSession(async ({ adapter }) => {
          await adapter.loadProgram(artifact);
          const before = bytesToHex(await adapter.peek(WORK_BASE, 4));
          await adapter.start();
          await waitFor(async () => (bytesToHex(await adapter.peek(WORK_BASE, 4)) !== before ? true : undefined), 'X to change');
          expect((await adapter.getInfo()).cycles).toBeGreaterThan(0);
          await adapter.stop();
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    60_000,
  );

  itNative(
    'loads and runs the largest program, and refuses one byte more with its size and the limit',
    async () => {
      await withSession(async ({ adapter, supervisor }) => {
        const largest = programOfSize(NATIVE_PROGRAM_MAX_BYTES);
        await adapter.loadProgram(largest);
        await adapter.start();
        await waitFor(async () => ((await adapter.peek(OPI_BASE, 1))[0] === 7 ? true : undefined), 'the output to be set');
        await adapter.stop();

        // The IDE refuses it first, in plain words, and nothing is sent.
        const oneMore = programOfSize(NATIVE_PROGRAM_MAX_BYTES + 1);
        await expect(adapter.loadProgram(oneMore)).rejects.toThrow(tooLarge(NATIVE_PROGRAM_MAX_BYTES + 1));

        // The runtime refuses it too, in the same words, when a client skips the IDE (a script, a CLI).
        const direct = supervisor.request({
          id: 'direct-oversize',
          type: 'request',
          method: 'program.load',
          params: { bytecode_hex: bytesToHex(oneMore) },
        });
        await expect(direct).rejects.toThrow(tooLarge(NATIVE_PROGRAM_MAX_BYTES + 1));
        await expect(direct).rejects.not.toThrow('unable to parse request envelope');

        // The refusal left the session as it was: the largest program is still loaded and runs again.
        await adapter.start();
        await waitFor(async () => ((await adapter.peek(OPI_BASE, 1))[0] === 7 ? true : undefined), 'the output to be set again');
        await adapter.stop();
      });
    },
    60_000,
  );

  itNative(
    'answers a request line longer than the runtime reads once, then keeps serving',
    async () => {
      const child = spawn(nativeRuntimeBinary, [], {
        env: { ...process.env, ZPLC_PERSIST_ROOT: await mkdtemp(join(tmpdir(), 'zplc-long-line-')) },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const lines: string[] = [];
      let partial = '';
      child.stdout.on('data', (chunk: Buffer) => {
        partial += chunk.toString();
        for (let end = partial.indexOf('\n'); end >= 0; end = partial.indexOf('\n')) {
          lines.push(partial.slice(0, end));
          partial = partial.slice(end + 1);
        }
      });
      const send = (id: string, method: string, params: Record<string, unknown>) =>
        child.stdin.write(`${JSON.stringify({ id, type: 'request', method, params })}\n`);
      try {
        send('hello', 'session.hello', { client_name: 'test', client_version: '0', protocol_version: '1.0' });
        await waitFor(() => lines.find((line) => line.includes('"id":"hello"')), 'the hello response');
        send('too-long', 'program.load', { bytecode_hex: 'AB'.repeat(NATIVE_PROGRAM_MAX_BYTES * 3) });
        send('after', 'status.get', {});
        await waitFor(() => lines.find((line) => line.includes('"id":"after"')), 'the response after the long line');

        const answers = lines.filter(
          (line) => line.includes('"type":"response"') && !line.includes('"id":"hello"') && !line.includes('"id":"after"'),
        );
        expect(answers).toHaveLength(1);
        expect(answers[0]).toContain('request line is longer than');
        expect(answers[0]).not.toContain('unable to parse request envelope');
      } finally {
        child.kill();
      }
    },
    30_000,
  );
});
